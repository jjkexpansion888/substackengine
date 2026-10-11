import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const script = readFileSync(new URL("../../../chrome-extension/profile-collector.js", import.meta.url), "utf8");
const page = (profile: unknown) => `<script>window._preloads = JSON.parse(${JSON.stringify(JSON.stringify({ profile, recommendations: [{ subscriberCountNumber: 999999 }] }))})</script>`;
const packet = () => ({ subscribers: [{ id: "12", name: "Reader", handle: null }] });
const run = async (profile: unknown) => {
  const fetch = vi.fn(async () => ({ ok: true, status: 200, url: "https://substack.com/@reader", text: async () => page(profile) }));
  const context = { fetch, URL, AbortSignal, setTimeout: (fn: () => void) => fn(), packet: packet() };
  runInNewContext(script, context);
  const result = await runInNewContext("enrichOwnerProfiles(packet, () => {})", context);
  return { result, fetch };
};
describe("Chrome public audience collection", () => {
  it("resolves numeric IDs, transfers public counts, and omits credentials", async () => {
    const { result, fetch } = await run({ id: 12, handle: "Reader", subscriberCountNumber: 3200, subscriberCount: "3.2K+", email: "private", followerCount: 90000 });
    expect(result.subscribers[0]).toEqual({ id: "12", name: "Reader", handle: "reader", publicAudience: { count: 3200, label: "3.2K+", bestseller: false } });
    expect(fetch).toHaveBeenCalledWith("https://substack.com/profile/12", expect.objectContaining({ credentials: "omit" }));
  });
  it("parses rounded labels and preserves measured zero", async () => {
    expect((await run({ id: 12, handle: "reader", subscriberCountString: "2.5K+ subscribers" })).result.subscribers[0].publicAudience.count).toBe(2500);
    expect((await run({ id: 12, handle: "reader", subscriberCountNumber: 0 })).result.subscribers[0].publicAudience.count).toBe(0);
  });
  it("does not infer counts from followers or other users", async () => {
    expect((await run({ id: 12, handle: "reader", subscriberCountNumber: 0, subscriberCount: "See subscribers" })).result.subscribers[0].publicAudience).toEqual({ count: null, label: null, bestseller: false });
    expect((await run({ id: 12, handle: "reader", followerCount: 99000 })).result.subscribers[0].publicAudience.count).toBeNull();
    expect((await run({ id: 13, handle: "other", subscriberCountNumber: 99999 })).result.subscribers[0]).toEqual(packet().subscribers[0]);
  });
  it.each([401, 403, 429])("stops on %s without requesting another profile", async status => {
    const fetch = vi.fn(async () => ({ ok: false, status }));
    const context = { fetch, URL, AbortSignal, setTimeout: (fn: () => void) => fn(), packet: { subscribers: [...packet().subscribers, { id: "13", handle: null, name: "Other" }] } };
    runInNewContext(script, context);
    await runInNewContext("enrichOwnerProfiles(packet, () => {})", context);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("resumes after cached profiles and checkpoints only public facts", async () => {
    const fetch = vi.fn(async (url: string, options?: { body?: string }) => {
      if (url.startsWith("http://localhost")) {
        const body = JSON.parse(options!.body!);
        return { ok: true, json: async () => ({ profiles: body.identities.length ? [{ id: "12", handle: "reader", publicAudience: { count: 849, label: null, bestseller: false } }] : [] }) };
      }
      return { ok: true, status: 200, url: "https://substack.com/@other", text: async () => page({ id: 13, handle: "other", subscriberCountNumber: 142, email: "secret@example.com" }) };
    });
    const context = { fetch, chrome: { runtime: { id: "a".repeat(32) } }, URL, AbortSignal, setTimeout: (fn: () => void) => fn(), packet: { subscribers: [...packet().subscribers, { id: "13", handle: null, name: "Other" }] } };
    runInNewContext(script, context);
    const result = await runInNewContext("enrichOwnerProfiles(packet, () => {})", context);
    expect(result.subscribers.map((r: { publicAudience: { count: number } }) => r.publicAudience.count)).toEqual([849, 142]);
    expect(fetch.mock.calls.filter(([url]) => url.startsWith("https://"))).toEqual([["https://substack.com/profile/13", expect.objectContaining({ credentials: "omit" })]]);
    const checkpoint = JSON.parse(fetch.mock.calls.at(-1)![1]!.body!);
    expect(checkpoint.profiles).toEqual([{ id: "13", handle: "other", publicAudience: { count: 142, label: null, bestseller: false } }]);
    expect(JSON.stringify(checkpoint)).not.toContain("secret@example.com");
    expect(JSON.stringify(checkpoint)).not.toContain("Other");
  });
});
