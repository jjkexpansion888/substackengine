import { describe, expect, it } from "vitest";
import { topicThemes, crossSubstackIdeas } from "./crossSubstack";
import { researchPlan } from "./researchPlans";
import type { ExternalArticle, OpportunityPost } from "./types";

const source: ExternalArticle = { id: "source", title: "Hugging Face permissions", subtitle: "A source lead", domain: "source.substack.com", publication: "Source", url: "https://source.substack.com/p/lead", date: null, comments: 0, reactions: 0 };
const own: OpportunityPost = { ...source, id: "own", title: "Earlier agent research", subtitle: "" };
describe("angle-specific research plans", () => {
  it("gives every library angle a unique contribution and four distinct steps", () => {
    const plans = topicThemes.flatMap(t => t.angles.map((_, i) => researchPlan(t.id + ":" + i, [], [])));
    expect(new Set(plans.map(p => p.contribution)).size).toBe(plans.length);
    expect(new Set(plans.map(p => p.steps.join("\n"))).size).toBe(plans.length);
    expect(new Set(plans.flatMap(p => p.steps)).size).toBe(plans.length * 4);
    for (const p of plans) expect(p.steps).toHaveLength(4);
  });
  it("grounds the starting point and archive connection without claiming unread source arguments", () => {
    const plan = researchPlan("quant:1", [source], [own]);
    expect(plan.contribution).toContain("holdout");
    expect(plan.steps[1]).toContain("look-ahead leakage");
    expect(plan.steps[0]).toContain(source.title);
    expect(plan.steps[0]).toContain("title/subtitle only");
    expect(plan.steps[3]).toContain(own.title);
    expect(researchPlan("quant:1", [{ ...source, text: "Public text" }], []).steps[0]).toContain("accessible public text");
  });
  it("specializes entity cases and preserves proper names", () => {
    const plans = topicThemes.map(t => researchPlan(t.id + ":case:hugging-face", [source], [own], "Hugging Face"));
    expect(new Set(plans.map(p => p.contribution)).size).toBe(5);
    for (const p of plans) {
      expect(p.contribution).toContain("Hugging Face");
      expect(p.steps[0]).toContain("Hugging Face");
      expect(p.contribution).not.toContain("{entity}");
    }
  });
  it("renders differentiated plans through the real discovery pipeline", () => {
    const result = crossSubstackIdeas({ domain: "own.substack.com", scannedAt: "2026-10-11", warnings: [], questions: [], commentsRead: 0, posts: [{ ...own, text: "AI agents security autonomous authorization markets capital financing investing liquidity" }], external: [{ ...source, text: "AI agents security autonomous permissions audit accountability markets capital financing investment liquidity" }] }, "");
    expect(result.opportunities.length).toBeGreaterThan(1);
    const sections = result.opportunities.map(o => o.brief.split("Original angle\n")[1].split("\n\nCoverage limit")[0]);
    expect(new Set(sections).size).toBe(sections.length);
    for (const o of result.opportunities) {
      expect(o.brief).not.toContain("Extract the strongest arguments and disagreements");
      expect(o.brief).toContain('Starting reference: "' + o.external![0].title);
    }
  });
});
