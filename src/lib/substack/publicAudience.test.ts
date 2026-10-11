import { describe, expect, it, vi } from "vitest";
import { audienceFromProfile, lookupPublicAudience, profileFromPage } from "./publicAudience";
import { RateLimitedError, PublicAccessRequiredError, ProfileAccessRequiredError } from "./errors";
import { rankPublicSubscribers } from "./subscriberRanking";
import type { PublicPerson } from "./publicRadar";

const page = (profile: unknown) => `<script>window._preloads = JSON.parse(${JSON.stringify(JSON.stringify({ profile, recommendations: [{ subscriberCountNumber: 999999 }] }))})</script>`;
describe("public audience recovery", () => {
  it("does not accept an ID-less count for an imported numeric identity", async () => {
    const result = await lookupPublicAudience({ id: "123", handle: "reader" }, async () => ({ handle: "reader", subscriberCountNumber: 999999 }));
    expect(result.audience).toBeNull();
  });
  it("parses numeric and rounded count labels without confusing followers", () => {
    expect(audienceFromProfile({ subscriberCount: "1.2K+", followerCount: 99000 }).audience).toBe(1200);
    expect(audienceFromProfile({ subscriberCountString: "2,500 subscribers" }).audience).toBe(2500);
    expect(audienceFromProfile({ subscriberCountNumber: 0 }).audience).toBe(0);
    expect(audienceFromProfile({ subscriberCountNumber: 0, subscriberCount: "See subscribers" })).toEqual({ audience: null, audienceLabel: null });
    expect(audienceFromProfile({ subscriberCountNumber: 0, subscriberCount: "1.2K+" }).audience).toBe(1200);
    expect(audienceFromProfile({ followerCount: 99000 }).audience).toBeNull();
  });
  it("resolves IDs and uses only the matching profile owner's count", async () => {
    const getJson = vi.fn();
    const getPage = vi.fn(async () => page({ id: 12, handle: "actual", subscriberCountNumber: 2300 }));
    expect(await lookupPublicAudience({ id: "12" }, getJson, getPage)).toMatchObject({ handle: "actual", audience: 2300 });
    expect(getJson).not.toHaveBeenCalled();
    expect(() => profileFromPage(page({ id: 13, subscriberCountNumber: 100 }), { id: "12" })).toThrow("identity");
  });
  it("recovers missing API counts from a matching page", async () => {
    expect(await lookupPublicAudience({ handle: "actual" }, async () => ({}), async () => page({ handle: "actual", subscriberCount: "3.8K+" }))).toMatchObject({ audience: 3800, status: "public" });
    expect(() => profileFromPage(page({ handle: "other", subscriberCountNumber: 100 }), { handle: "actual" })).toThrow("identity");
  });
  it("requires an exact account identity before accepting a renamed handle or count", async () => {
    expect(await lookupPublicAudience({ id: "42", handle: "oldhandle" }, async () => ({ id: 42, handle: "newhandle" }), async () => page({ id: 42, handle: "newhandle", subscriberCountNumber: 589 }))).toMatchObject({ audience: 589, handle: "newhandle" });
    await expect(lookupPublicAudience({ handle: "oldhandle" }, async () => ({ id: 42, handle: "newhandle", subscriberCountNumber: 999999 }))).rejects.toThrow("identity");
    await expect(lookupPublicAudience({ handle: "oldhandle" }, async () => ({ id: 42 }), async () => page({ id: 43, handle: "different", subscriberCountNumber: 999999 }))).rejects.toThrow("identity");
  });
  it("distinguishes one blocked page from a blocked public profile API", async () => {
    const getPage = vi.fn(async () => { throw new PublicAccessRequiredError("page requires browser access"); });
    await expect(lookupPublicAudience({ handle: "actual" }, async () => ({ id: 12, handle: "actual" }), getPage)).rejects.toBeInstanceOf(ProfileAccessRequiredError);
    expect(getPage).toHaveBeenCalledTimes(1);
  });
  it("never bypasses rate limits or browser access checks with the page fallback", async () => {
    for (const error of [new RateLimitedError("limited"), new PublicAccessRequiredError("browser required")]) {
      const getPage = vi.fn();
      await expect(lookupPublicAudience({ handle: "actual" }, async () => { throw error; }, getPage)).rejects.toThrow();
      expect(getPage).not.toHaveBeenCalled();
    }
  });
  it("sorts recovered counts highest to lowest, including zero before unknown", () => {
    const person = (id: string, audience: number | null) => ({ id, audience, name: id, role: "Reader", membership: "Subscriber", handle: null, bestseller: false }) as PublicPerson;
    expect(rankPublicSubscribers([person("unknown", null), person("small", 46), person("large", 3800), person("zero", 0)]).map(p => p.id)).toEqual(["large", "small", "zero", "unknown"]);
  });
});
