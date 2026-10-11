import { describe, expect, it } from "vitest";
import { mergeAudienceResults, pendingAudienceProfiles } from "./audienceQueue";
import type { PublicPerson } from "./publicRadar";

const person = (id: string, overrides: Partial<PublicPerson> = {}): PublicPerson => ({ id, name: id, handle: id, photoUrl: null, role: "Reader", membership: "Subscriber", subscriberEvidence: "browser_list", comments: 0, audience: null, audienceLabel: null, audienceStatus: "unavailable", profileUrl: null, publicationName: null, bestseller: false, ...overrides });

describe("automatic audience lookup queue", () => {
  it("continues past the first batch and does not starve later unknown profiles", () => {
    const people = Array.from({ length: 143 }, (_, i) => person(`reader${i}`));
    const attempted = new Set<string>();
    let batches = 0;
    while (pendingAudienceProfiles(people, attempted).length) {
      const batch = pendingAudienceProfiles(people, attempted).slice(0, 20);
      for (const row of batch) attempted.add(row.id);
      batches++;
    }
    expect(attempted.size).toBe(143);
    expect(batches).toBe(8);
    expect(attempted.has("reader142")).toBe(true);
  });
  it("skips measured counts, checked unpublished profiles and non-subscribers", () => {
    expect(pendingAudienceProfiles([person("known", { audience: 77, audienceStatus: "public" }), person("recovered", { audience: 849, audienceStatus: "unavailable" }), person("hidden", { audienceStatus: "not_public" }), person("author", { role: "Author" }), person("visitor", { membership: "Public participant" }), person("pending")], new Set()).map(p => p.id)).toEqual(["pending"]);
  });
  it("merges into the latest list without losing other counts or changing membership", () => {
    const merged = mergeAudienceResults([person("handle:reader", { handle: "reader" }), person("other", { audience: 589, audienceStatus: "public" })], [{ handle: "reader", status: "public", audience: 849, audienceLabel: "849", bestseller: false }]);
    expect(merged[0]).toMatchObject({ audience: 849, audienceStatus: "public", subscriberEvidence: "browser_list", profileUrl: "https://substack.com/@reader" });
    expect(merged[1].audience).toBe(589);
    expect(mergeAudienceResults(merged, [{ handle: "reader", status: "unavailable" }])[0]).toEqual(merged[0]);
  });
});
