import { describe, expect, it } from "vitest";
import { topicDiscoverySources } from "./topicDiscovery";

describe("semantic outside-publication discovery", () => {
  it("selects relevant outside sources from writing rather than subscriber identities", () => {
    const sources = topicDiscoverySources("culture philosophy literature university education institutions classics fiction");
    expect(sources).toContain("www.astralcodexten.com");
    expect(sources).not.toContain("biologicalsecurity.substack.com");
    expect(new Set(sources).size).toBe(sources.length);
    expect(sources.length).toBeLessThanOrEqual(10);
  });
  it("does not invent relevance when there is no writing context", () => {
    expect(topicDiscoverySources("")).toEqual([]);
    expect(topicDiscoverySources("newsletter subscribe latest post")).toEqual([]);
  });
});
