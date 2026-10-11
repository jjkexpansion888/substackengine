import { describe, expect, it } from "vitest";
import { crossSubstackIdeas, suggestedSources } from "./crossSubstack";
import type { OpportunityScan } from "./types";

const scan: OpportunityScan = { domain: "writer.substack.com", scannedAt: "2026-10-11", warnings: [], commentsRead: 0, questions: [], posts: [
  { id: "1", title: "Episode 15", subtitle: "AI agents have a security problem", text: "Autonomous agents access enterprise files. Runtime authorization and prompt injection expose security vulnerabilities. Artificial intelligence changes business applications.", url: "https://writer.substack.com/p/agents", date: null, comments: 0, reactions: 0 },
  { id: "2", title: "Market discussion", subtitle: "Quantitative trader on higher interest rates", text: "Macro markets and yields affect business capital financing and investing.", url: "https://writer.substack.com/p/markets", date: null, comments: 0, reactions: 0 },
], external: [
  { id: "other:1", domain: "security.substack.com", publication: "Security", title: "Runtime permissions for autonomous agents", subtitle: "Authorization and accountability for AI systems", text: "Agents need security permissions, audit trails, oversight and clear accountability when operating business applications.", url: "https://security.substack.com/p/permissions", date: null, comments: 0, reactions: 0 },
  { id: "other:2", domain: "economics.substack.com", publication: "Economics", title: "AI productivity meets higher rates", subtitle: "Capital and financing costs", text: "AI automation changes labor productivity. Interest rates affect capital financing and the business cycle.", url: "https://economics.substack.com/p/productivity", date: null, comments: 0, reactions: 0 },
] };
describe("cross-Substack topic discovery", () => {
  it("uses substantive writing to choose outside sources rather than generic episode titles", () => {
    expect(suggestedSources(scan.posts, "")).toContain("secureagentics.substack.com");
    expect(suggestedSources(scan.posts, "")).toContain("www.noahpinion.blog");
    expect(suggestedSources([], "")).toEqual([]);
  });
  it("produces supported new hypotheses with external citations and personal writing connections", () => {
    const result = crossSubstackIdeas(scan, "");
    expect(result.method).toContain("latent semantic analysis");
    expect(result.opportunities.length).toBeGreaterThan(0);
    for (const idea of result.opportunities) {
      expect(idea.kind).toBe("Cross-Substack angle");
      expect(idea.title).not.toContain("Follow-up:");
      expect(idea.related.length).toBeGreaterThan(0);
      expect(idea.external!.length).toBeGreaterThan(0);
      expect(idea.external!.every(p => p.domain !== scan.domain)).toBe(true);
      expect(idea.brief).toContain(idea.external![0].url);
      expect(idea.brief).toContain("editorial hypotheses");
      expect(idea.score).toBeGreaterThanOrEqual(0);
      expect(idea.score).toBeLessThanOrEqual(100);
    }
    expect(result.opportunities.map(o => o.score)).toEqual(result.opportunities.map(o => o.score).sort((a, b) => b - a));
  });
  it("abstains with no external evidence or no prior writing", () => {
    expect(crossSubstackIdeas({ ...scan, external: [] }, "").opportunities).toEqual([]);
    expect(crossSubstackIdeas({ ...scan, posts: [] }, "").opportunities).toEqual([]);
    expect(crossSubstackIdeas({ ...scan, external: scan.external!.map(p => ({ ...p, domain: scan.domain })) }, "").opportunities).toEqual([]);
  });
  it("excludes angle dimensions already covered in the sampled archive", () => {
    const text = "agents security liability insurance contracts operational risk accountability authorization permissions identity access infrastructure business economics autonomous approval human oversight productivity labor audit compliance finance stress testing";
    const result = crossSubstackIdeas({ ...scan, posts: [{ ...scan.posts[0], text }] }, "");
    expect(result.opportunities.some(o => o.title === "Who should insure an AI agent's mistakes?")).toBe(false);
  });
  it("discovers source-specific case studies rather than only fixed headlines", () => {
    const external = { ...scan.external![1], id: "cerebras", title: "Cerebras and the AI capital cycle", subtitle: "Financing infrastructure and scarce capacity", text: "Cerebras changes capital allocation, AI financing, business economics and infrastructure capacity." };
    const ideas = crossSubstackIdeas({ ...scan, external: [external] }, "AI capital allocation and financing").opportunities;
    const specific = ideas.find(o => o.title.includes("Cerebras"));
    expect(specific).toBeDefined();
    expect(specific!.external![0].id).toBe("cerebras");
    expect(crossSubstackIdeas({ ...scan, posts: [{ ...scan.posts[0], text: "Cerebras AI capital financing infrastructure capacity" }], external: [external] }, "").opportunities.some(o => o.title.includes("Cerebras"))).toBe(false);
  });
});
