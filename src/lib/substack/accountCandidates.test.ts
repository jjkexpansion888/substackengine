import { describe, expect, it, vi } from "vitest";
import { candidateProfiles, findAccountCandidates, nameSimilarity } from "./accountCandidates";
import { RateLimitedError, ProfileAccessRequiredError } from "./errors";

describe("public name candidate discovery", () => {
  it("normalizes accents, Unicode styles and token order without treating similarity as identity", () => {
    expect(nameSimilarity("Jose Smith", "Jos\u00e9 Smith")).toBe(1);
    expect(nameSimilarity("Jane Doe", "Doe Jane")).toBe(1);
    expect(nameSimilarity("Alice Smith", "Bob Jones")).toBeLessThan(0.55);
  });
  it("keeps duplicate names as separate candidates and ignores search-result counts and private fields", () => {
    const candidates = candidateProfiles({ results: [{ id: 1, handle: "one", name: "Jane Doe", email: "secret", subscriberCountNumber: 999999 }, { id: 2, handle: "two", name: "Jane Doe" }, { id: 3, handle: "other", name: "Unrelated" }, { id: 4, handle: "bad/handle", name: "Jane Doe" }] }, "Jane Doe");
    expect(candidates.map(p => p.id)).toEqual(["1", "2"]);
    expect(candidates[0]).toMatchObject({ verified: false, audience: null });
    expect(candidates[0].evidence).toContain("identity inferred");
    expect(JSON.stringify(candidates)).not.toContain("secret");
    expect(() => candidateProfiles({}, "Jane")).toThrow("format");
  });
  it("verifies each candidate account before displaying its public count", async () => {
    const getJson = vi.fn(async (url: string) => url.includes("profile/search") ? { results: [{ id: 42, name: "Jane Doe", handle: "janedoe" }] } : { id: 42, handle: "janedoe", subscriberCountNumber: 2300 });
    const candidates = await findAccountCandidates("Jane Doe", getJson, vi.fn());
    expect(candidates[0]).toMatchObject({ id: "42", audience: 2300, verified: true });
    expect(getJson.mock.calls[0][0]).toBe("https://substack.com/api/v1/profile/search?query=Jane%20Doe&page=0");
  });
  it("does not attach counts from another account or bypass rate limits", async () => {
    const search = { results: [{ id: 42, name: "Jane Doe", handle: "janedoe" }] };
    const candidates = await findAccountCandidates("Jane Doe", async url => url.includes("profile/search") ? search : { id: 43, handle: "other", subscriberCountNumber: 999999 }, vi.fn());
    expect(candidates[0]).toMatchObject({ audience: null, verified: false });
    const page = vi.fn();
    await expect(findAccountCandidates("Jane Doe", async url => { if (url.includes("profile/search")) return search; throw new RateLimitedError("limited"); }, page)).rejects.toBeInstanceOf(RateLimitedError);
    expect(page).not.toHaveBeenCalled();
  });
  it("retains name candidates when only an individual profile page is restricted", async () => {
    const candidates = await findAccountCandidates("Jane Doe", async url => {
      if (url.includes("profile/search")) return { results: [{ id: 42, name: "Jane Doe", handle: "janedoe" }] };
      throw new ProfileAccessRequiredError("profile restricted");
    }, vi.fn());
    expect(candidates[0]).toMatchObject({ id: "42", audience: null, verified: false });
  });
  it("searches identities without making audience or profile-page requests", async () => {
    const getJson = vi.fn(async () => ({ results: [{ id: 42, name: "Jane Doe", handle: "janedoe" }] }));
    const getPage = vi.fn();
    expect((await findAccountCandidates("Jane Doe", getJson, getPage, Date.now() + 1000, false))[0]).toMatchObject({ id: "42", score: 1, audience: null });
    expect(getJson).toHaveBeenCalledTimes(1);
    expect(getPage).not.toHaveBeenCalled();
  });
  it("can use only explicit public subscriber-count fields scoped to a validated search profile", () => {
    const profiles = candidateProfiles({ results: [
      { id: 42, name: "Jane Doe", handle: "janedoe", subscriberCountNumber: 1234, email: "private@example.test" },
      { id: 43, name: "Jane Doe", handle: "otherjane", followerCount: 99999, primaryPublication: { subscriberCountNumber: 99999 } },
      { id: "invalid", name: "Jane Doe", handle: "bad", subscriberCountNumber: 99999 },
    ] }, "Jane Doe", true);
    expect(profiles).toHaveLength(2);
    expect(profiles.find(p => p.id === "42")).toMatchObject({ audience: 1234, verified: false });
    expect(profiles.find(p => p.id === "43")?.audience).toBeNull();
    expect(JSON.stringify(profiles)).not.toContain("private@example.test");
  });
});
