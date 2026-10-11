import { describe, expect, it } from "vitest";
import { readOpportunityCache } from "./cache";
describe("public opportunity research cache", () => {
  const p = { id: "1", title: "AI agents", subtitle: "Security", text: "Public text", url: "https://outside.substack.com/p/agents", comments: 0, reactions: 0, date: null };
  const scan = { domain: "writer.substack.com", posts: [p], external: [{ ...p, domain: "outside.substack.com", publication: "Outside" }], questions: [], scannedAt: "2026-10-11T12:00:00Z", commentsRead: 2, publicationsScanned: 1, warnings: [] };
  it("restores public research only for the matching publication", () => {
    expect(readOpportunityCache(scan, scan.domain)?.external).toHaveLength(1);
    expect(readOpportunityCache(scan, "other.substack.com")).toBeNull();
    expect(readOpportunityCache(null, scan.domain)).toBeNull();
  });
  it("strips unsafe links and bounds text and corpus size", () => {
    const parsed = readOpportunityCache({ ...scan, posts: [{ ...p, url: "javascript:alert(1)", text: "x".repeat(8000) }], external: Array.from({ length: 200 }, () => ({ ...p, domain: "outside.substack.com" })) }, scan.domain)!;
    expect(parsed.posts[0].url).toBeNull();
    expect(parsed.posts[0].text).toHaveLength(6000);
    expect(parsed.external).toHaveLength(192);
  });
});
