import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { parseSubscriberImport } from "./subscriberRanking";

const script = readFileSync(new URL("../../../chrome-extension/owner-collector.js", import.meta.url), "utf8");
const execute = (fetch: (...args: never[]) => unknown, href = "https://example.substack.com/publish/subscribers") => runInNewContext(script, { window: { location: { href } }, fetch, URL, AbortSignal });

describe("Chrome owner-session connector", () => {
  it("paginates all 638 rows with the browser session and exports no emails or cookie values", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const { offset, limit } = JSON.parse(String(init.body));
      return Response.json({ count: 638, subscribers: Array.from({ length: Math.min(limit, 638 - offset) }, (_, i) => ({ user_id: offset + i + 1, user_name: `Reader ${offset + i + 1}`, user_email_address: "private@example.com", user_handle: i === 0 ? `reader${offset + 1}` : undefined })) });
    });
    const packet = parseSubscriberImport(await execute(fetch));
    expect(packet).toMatchObject({ version: 2, totalCount: 638, rowsRead: 638 });
    expect(packet.subscribers).toHaveLength(638);
    expect(packet.subscribers[1]).toMatchObject({ id: "2", handle: null, name: "Reader 2" });
    expect(JSON.stringify(packet)).not.toContain("private@example.com");
    expect(fetch).toHaveBeenCalledTimes(13);
    expect(fetch.mock.calls.every(([url, init]) => url === "https://example.substack.com/api/v1/subscriber-stats" && init.credentials === "same-origin" && !(init.headers as Record<string, string>).cookie)).toBe(true);
  });
  it("does not guess handles from names and strips names that are email addresses", async () => {
    const packet = await execute(async () => Response.json({ count: 1, subscribers: [{ user_id: 1, user_name: "private@example.com" }] }));
    expect(packet.subscribers).toEqual([{ id: "1", handle: null, name: "Subscriber 1" }]);
  });
  it("stops on rejected sessions, rate limits, repeated pages, or unexpected shapes", async () => {
    for (const status of [401, 403, 429]) {
      const fetch = vi.fn(async () => new Response("", { status }));
      await expect(execute(fetch)).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    }
    await expect(execute(async () => Response.json({ subscribers: [] }))).rejects.toThrow("format changed");
    const fetch = vi.fn(async () => Response.json({ count: 100, subscribers: [{ user_id: 1, user_name: "A" }] }));
    await expect(execute(fetch)).rejects.toThrow("repeated");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects non-publication tabs before requesting anything", async () => {
    const fetch = vi.fn();
    await expect(execute(fetch, "https://evil.example/publish/subscribers")).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
