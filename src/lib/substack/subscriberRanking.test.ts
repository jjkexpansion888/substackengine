import { describe, expect, it } from "vitest";
import { parseSubscriberImport, rankPublicSubscribers } from "./subscriberRanking";
import type { PublicPerson } from "./publicRadar";

const person = (id: string, overrides: Partial<PublicPerson> = {}): PublicPerson => ({
  id, name: id, handle: id, photoUrl: null, role: "Reader", membership: "Subscriber",
  subscriberEvidence: "public_list", comments: 0, audience: null, audienceLabel: null,
  audienceStatus: "not_public", profileUrl: null, publicationName: null, bestseller: false, ...overrides,
});
const packet = { version: 1, sourceUrl: "https://substack.com/@writer/subscribers", capturedAt: "2026-10-11T12:00:00Z", subscribers: [{ handle: "Reader", name: "Reader" }] };

describe("public subscriber ranking", () => {
  it("ranks counts descending, measured zero before badge fallback, and unknown last", () => {
    const ranked = rankPublicSubscribers([person("unknown", { comments: 999 }), person("badge", { bestseller: true }), person("zero", { audience: 0 }), person("small", { audience: 100 }), person("large", { audience: 10000 })]);
    expect(ranked.map(p => p.id)).toEqual(["large", "small", "zero", "badge", "unknown"]);
    expect(ranked.map(p => p.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(ranked.at(-1)?.audienceSource).toBe("unknown");
  });
  it("does not rank masked placeholder zero as a measured audience", () => {
    const ranked = rankPublicSubscribers([person("masked", { audience: 0, audienceLabel: "See subscribers" }), person("zero", { audience: 0 })]);
    expect(ranked.map(p => p.id)).toEqual(["zero", "masked"]);
    expect(ranked[1]).toMatchObject({ audience: null, audienceLabel: null, audienceSource: "unknown" });
  });
  it("excludes authors and unconfirmed participants, and breaks ties deterministically", () => {
    const ranked = rankPublicSubscribers([person("z", { audience: 20 }), person("a", { audience: 20 }), person("author", { role: "Author", audience: 9999 }), person("participant", { membership: "Public participant", audience: 9999 })]);
    expect(ranked.map(p => p.id)).toEqual(["a", "z"]);
  });
});

describe("subscriber export validation", () => {
  it("retains validated public counts and drops unrelated fields", () => {
    const owner = { ...packet, version: 2, sourceUrl: "https://example.substack.com/publish/subscribers", totalCount: 1, rowsRead: 1, subscribers: [{ id: "12", handle: "reader", name: "Reader", publicAudience: { count: 3200, label: "3.2K+", bestseller: true, email: "private" } }] };
    expect(parseSubscriberImport(owner).subscribers[0].publicAudience).toEqual({ count: 3200, label: "3.2K+", bestseller: true });
    for (const count of [-1, 1.2, "300", undefined]) expect(() => parseSubscriberImport({ ...owner, subscribers: [{ ...owner.subscribers[0], publicAudience: { count, label: null, bestseller: false } }] })).toThrow();
  });
  it("validates owner IDs and totals, accepts unknown handles, and discards private fields", () => {
    const owner = { ...packet, version: 2, sourceUrl: "https://example.substack.com/publish/subscribers", totalCount: 638, rowsRead: 1, cookie: "secret", subscribers: [{ id: "1", handle: null, name: "Reader", email: "private@example.com" }] };
    expect(parseSubscriberImport(owner).subscribers).toEqual([{ id: "1", handle: null, name: "Reader" }]);
    expect(JSON.stringify(parseSubscriberImport(owner))).not.toContain("secret");
    expect(() => parseSubscriberImport({ ...owner, rowsRead: 0 })).toThrow();
    expect(() => parseSubscriberImport({ ...owner, subscribers: [{ id: "../private", handle: null, name: "Reader" }] })).toThrow();
    expect(() => parseSubscriberImport({ ...owner, sourceUrl: "http://example.substack.com/publish/subscribers" })).toThrow();
  });
  it("normalizes and deduplicates handles, retaining only public identity fields", () => {
    const parsed = parseSubscriberImport({ ...packet, cookie: "secret", subscribers: [{ handle: "Reader", name: " Reader ", email: "private" }, { handle: "reader", name: "Reader again" }] });
    expect(parsed.subscribers).toEqual([{ handle: "reader", name: "Reader again" }]);
    expect(JSON.stringify(parsed)).not.toContain("secret");
    expect(JSON.stringify(parsed)).not.toContain("private");
  });
  it("rejects other origins, credentials, non-subscriber pages, and invalid rows", () => {
    for (const sourceUrl of ["http://substack.com/@writer/subscribers", "https://evil.com/@writer/subscribers", "https://user:pass@substack.com/@writer/subscribers", "https://substack.com/@writer/followers"]) expect(() => parseSubscriberImport({ ...packet, sourceUrl })).toThrow();
    for (const subscribers of [[], [{ handle: "../private", name: "A" }], [{ handle: "reader", name: "" }], Array.from({ length: 1001 }, () => ({ handle: "reader", name: "Reader" }))]) expect(() => parseSubscriberImport({ ...packet, subscribers })).toThrow();
    expect(() => parseSubscriberImport({ ...packet, capturedAt: "bad date" })).toThrow();
  });
});
