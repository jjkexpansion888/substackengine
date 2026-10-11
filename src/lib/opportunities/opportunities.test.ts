import { describe, expect, it } from "vitest";
import { discoverOpportunities, isReaderQuestion, plainComment } from "./discovery";
import { manualQuestions, rankOpportunities } from "./ranking";
import { calendarCsv, readCalendar, validDate } from "./calendar";
import type { OpportunityScan } from "./types";
import { RateLimitedError } from "@/lib/substack/errors";

const scan: OpportunityScan = { domain: "research.substack.com", scannedAt: "2026-10-11", warnings: [], commentsRead: 5, posts: [
  { id: "1", title: "Portfolio risk and hedging", subtitle: "Hedge a portfolio", url: "https://research.substack.com/p/risk", comments: 5, reactions: 10, date: null },
  { id: "2", title: "Market overview", subtitle: "Weekly news", url: null, comments: 0, reactions: 1, date: null },
], questions: [
  { id: "1:1", text: "How can investors measure portfolio risk and hedging?", readerId: "1", postId: "1", postTitle: "Risk", url: null },
  { id: "1:2", text: "How can investors measure portfolio risk and hedging?", readerId: "2", postId: "1", postTitle: "Risk", url: null },
  { id: "1:3", text: "Could you explain semiconductor supply chains and export controls?", readerId: "3", postId: "1", postTitle: "Risk", url: null },
] };
describe("content opportunity ranking", () => {
  it("groups related questions and reports identified readers without inventing counts", () => {
    const result = rankOpportunities(scan);
    expect(result.method).toContain("latent semantic analysis");
    const portfolio = result.opportunities.find(o => o.title.includes("portfolio"))!;
    expect(portfolio.evidence).toHaveLength(2);
    expect(portfolio.readers).toBe(2);
    expect(portfolio.coverage).toBeGreaterThan(result.opportunities.find(o => o.title.includes("semiconductor"))!.coverage);
    expect(result.opportunities.every(o => Number.isFinite(o.score) && o.score >= 0 && o.score <= 100)).toBe(true);
  });
  it("does not recycle engagement-based follow-ups when no external corpus is available", () => {
    const result = rankOpportunities({ ...scan, questions: [] });
    expect(result.opportunities).toEqual([]);
    expect(rankOpportunities({ ...scan, posts: [], questions: [] }).opportunities).toEqual([]);
  });
  it("deduplicates manual questions and leaves reader identity unknown", () => {
    const questions = manualQuestions("How do export controls affect chip stocks?\nHow do export controls affect chip stocks?");
    expect(questions).toHaveLength(1);
    expect(questions[0].readerId).toBeNull();
    expect(rankOpportunities({ ...scan, questions }).opportunities.find(o => o.kind === "Reader question")!.readers).toBe(0);
  });
});
describe("public discussion discovery", () => {
  it("extracts questions, skips deleted and author comments, and rejects unsafe links", async () => {
    const getJson = async (url: string) => url.includes("archive") ? [{ id: 1, title: "Risk", comment_count: 10, publishedBylines: [{ id: 55 }], canonical_url: "javascript:alert(1)" }] : { comments: [
      { id: 1, user_id: 8, body: "<p>How do hedges affect <b>returns</b>?</p>", children: [{ id: 2, user_id: 9, body: "Could you explain option pricing?" }] },
      { id: 3, body: "How does this work for readers?", deleted: true },
      { id: 4, body: "How does this work for readers?", is_author: true },
      { id: 5, body: "Thanks for sharing this great article." },
      { id: 6, user_id: 55, body: "How do readers measure risk?" },
    ] };
    const result = await discoverOpportunities({ domain: "research.substack.com" }, getJson);
    expect(result.questions).toHaveLength(2);
    expect(result.commentsRead).toBe(3);
    expect(result.questions[0].text).not.toContain("<");
    expect(result.questions[0].url).toBeNull();
  });
  it("preserves partial results on blocked discussions and stops scheduling after rate limits", async () => {
    let calls = 0;
    const result = await discoverOpportunities({ domain: "research.substack.com" }, async url => {
      calls++;
      if (url.includes("archive")) return Array.from({ length: 24 }, (_, i) => ({ id: i + 1, title: "Risk", comment_count: 1 }));
      throw new RateLimitedError("Limited");
    });
    expect(calls).toBeLessThanOrEqual(3);
    expect(result.warnings.join(" ")).toContain("rate limited");
    expect(result.posts).toHaveLength(24);
  });
  it("validates domain and question patterns", async () => {
    await expect(discoverOpportunities({ domain: "127.0.0.1" }, async () => [])).rejects.toThrow();
    expect(isReaderQuestion("I would love to read about portfolio sizing.")).toBe(true);
    expect(isReaderQuestion("Thanks for this article.")).toBe(false);
    expect(isReaderQuestion("Hey thanks for following have followed back you looking for guests?")).toBe(false);
    expect(plainComment("<script>bad()</script><p>Risk &amp; returns</p>")).toBe("Risk & returns");
  });
});
describe("editorial calendar", () => {
  it("restores bounded valid entries, removes duplicate IDs, and validates dates", () => {
    const e = { id: "a", title: "Idea", brief: "Outline", date: "2026-02-30", status: "Bad" };
    expect(readCalendar([e, e, null, {}])).toEqual([{ ...e, date: "", status: "Idea" }]);
    expect(validDate("2026-02-28")).toBe(true);
    expect(validDate("2026-02-30")).toBe(false);
  });
  it("escapes spreadsheet formulas and includes the complete brief in export", () => {
    const csv = calendarCsv([{ id: "a", title: "=SUM(1)", date: "", status: "Idea", brief: 'An "outline"' }]);
    expect(csv).toContain("'=SUM(1)");
    expect(csv).toContain('An ""outline""');
  });
});
