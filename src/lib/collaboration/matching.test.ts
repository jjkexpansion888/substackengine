import { describe, expect, it } from "vitest";
import { campaignLink, collaborationIdeas, outreachDraft, rankCollaborators, resolveOutreachDraft } from "./matching";
import type { CollaborationCandidate, CollaborationRecord } from "./types";

const candidate = (id: string, description: string, audience: number | null = 2000): CollaborationCandidate => ({
  id, domain: `${id}.substack.com`, name: id, publication: id, description, audience, audienceLabel: null,
  photoUrl: null, profileUrl: null, source: "seed", relationship: 0, posts: [], sharedParticipants: 0, sampledParticipants: 0, sourceParticipants: 0, evidence: [],
});
const options = { audience: 2000, goal: "balanced" as const, records: {}, diversity: false };
describe("collaboration ranking", () => {
  it("directs campaign links to the sender's publication", () => {
    const link = campaignLink("https://whitetigercapital.substack.com/", "lenny.substack.com", "Interview");
    expect(new URL(link!).hostname).toBe("whitetigercapital.substack.com");
    expect(new URL(link!).searchParams.get("utm_source")).toBe("lenny.substack.com");
    expect(campaignLink("javascript:alert(1)", "lenny.substack.com", "Interview")).toBeNull();
  });
  it("uses the sender identity instead of the research publication and repairs untouched legacy drafts", () => {
    const match = rankCollaborators("plants", [candidate("writer", "plants")], options).matches[0];
    const legacy = outreachDraft("Lenny's Newsletter", match, "Interview");
    const corrected = resolveOutreachDraft("Baekho Research", "Lenny's Newsletter", match, "Interview", legacy);
    expect(corrected).toContain("I write Baekho Research.");
    expect(corrected).not.toContain("I write Lenny's Newsletter.");
    expect(resolveOutreachDraft("Baekho Research", "Lenny's Newsletter", match, "Interview", "My custom draft")).toBe("My custom draft");
    expect(outreachDraft("", match, "Interview")).not.toContain("I write");
  });
  it("favors topic fit over raw audience size", () => {
    const result = rankCollaborators("gardening native plants biodiversity", [candidate("garden", "native plants gardening biodiversity"), candidate("finance", "banking finance investing", 100000)], options);
    expect(result.matches[0].id).toBe("garden");
    expect(result.matches[0].terms).toContain("gardening");
  });
  it("uses an SVD topic model on a sufficiently large corpus", () => {
    const candidates = [candidate("garden", "gardening native plants biodiversity"), candidate("urban", "urban gardening plants compost"), candidate("soil", "compost soil plants farming"), candidate("finance", "banking finance investing markets")];
    const result = rankCollaborators("gardening native plants biodiversity", candidates, options);
    expect(result.method).toContain("latent semantic analysis");
    expect(result.matches[0].id).toBe("garden");
    expect(result.matches.every(m => m.score >= 0 && m.score <= 100 && m.vector.every(Number.isFinite))).toBe(true);
  });
  it("does not invent audience or activity for missing data", () => {
    const result = rankCollaborators("plants", [candidate("unknown", "plants", null)], { ...options, audience: null });
    expect(result.matches[0].scale).toBeNull();
    expect(result.matches[0].activity).toBeNull();
    expect(result.matches[0].confidence).toBe("Low");
  });
  it("handles an empty vocabulary without NaN", () => {
    const result = rankCollaborators("", [candidate("empty", "")], options);
    expect(Number.isFinite(result.matches[0].score)).toBe(true);
  });
  it("only learns from enough mixed feedback and preserves every candidate under diversity reranking", () => {
    const candidates = Array.from({ length: 8 }, (_, i) => candidate(`writer${i}`, i < 4 ? "gardening native plants" : "finance investing markets"));
    const records = Object.fromEntries(candidates.map((c, i) => [c.id, { feedback: i < 4 ? "positive" : "negative" } as CollaborationRecord]));
    expect(rankCollaborators("native plants", candidates, { ...options, records, diversity: true }).personalized).toBe(true);
    const result = rankCollaborators("native plants", candidates, { ...options, records, diversity: true });
    expect(new Set(result.matches.map(m => m.id)).size).toBe(8);
    expect(rankCollaborators("native plants", candidates, { ...options, records: Object.fromEntries(candidates.slice(0, 4).map(c => [c.id, records[c.id]])) }).personalized).toBe(false);
  });
  it("creates all four formats and grounds drafts in actual post titles", () => {
    const c = candidate("garden", "native plants");
    c.posts = [{ title: "Native plants for cities", subtitle: "", date: null, url: null, reactions: 0, comments: 0 }];
    const match = rankCollaborators("native plants", [c], options).matches[0];
    expect(collaborationIdeas(match)).toHaveLength(4);
    expect(outreachDraft("My newsletter", match, "Interview")).toContain("Native plants for cities");
  });
});
