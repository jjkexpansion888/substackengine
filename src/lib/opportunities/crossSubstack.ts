import { Matrix, SingularValueDecomposition } from "ml-matrix";
import { tokens } from "@/lib/collaboration/matching";
import type { ContentOpportunity, ExternalArticle, OpportunityPost, OpportunityScan } from "./types";
import { researchPlan } from "./researchPlans";

type Theme = { id: string; label: string; keywords: string; sources: string[]; angles: [string, string, string][] };
export const topicThemes: Theme[] = [
  { id: "agents", label: "AI agents and security", keywords: "agents agent autonomous prompt injection cybersecurity security authorization permissions runtime ai artificial intelligence", sources: ["secureagentics.substack.com", "agenticsecurity.substack.com", "www.oneusefulthing.org"], angles: [
    ["Who should insure an AI agent's mistakes?", "agents security liability insurance contracts operational risk accountability", "Map responsibility across the model vendor, application developer, and enterprise. Examine whether insurance and contractual liability could change agent adoption."],
    ["Will permission infrastructure capture more value than AI models?", "agents security authorization permissions identity access infrastructure business economics", "Compare the economics of authorization, identity, and monitoring with model inference. Test where durable pricing power could emerge."],
    ["The human approval bottleneck in an autonomous economy", "agents autonomous approval human oversight productivity labor economics", "Investigate whether human approvals become the scarce resource as agents become cheaper, and how businesses might price or reorganize that work."],
    ["Can autonomous agents be audited like financial institutions?", "agents security audit compliance finance risk stress testing", "Design a hypothetical agent stress test, then compare technical logging with the audit and accountability practices used in finance."],
  ] },
  { id: "macro", label: "Macro markets and capital allocation", keywords: "macro yields yield bonds rates interest inflation monetary fiscal treasury economy economics capital market debt crisis liquidity quantitative trader", sources: ["www.noahpinion.blog", "www.apricitas.io", "www.construction-physics.com"], angles: [
    ["Can higher interest rates change which AI businesses survive?", "interest rates yields ai infrastructure capital financing cash flow business", "Contrast capital-heavy AI infrastructure with asset-light services. Separate the effects of financing costs, customer demand, and market valuations."],
    ["The liquidity mismatch between instant AI decisions and slow capital", "liquidity markets finance capital agents automated trading risk settlement", "Explore what happens when automated decisions accelerate but settlement, financing, and redemption mechanisms do not."],
    ["Is automation changing the meaning of a defensive business?", "automation productivity labor macro investing defensive business resilience", "Compare conventional defensive characteristics with exposure to automation, implementation costs, and technology-driven competition."],
    ["What would a stress test for the AI capital cycle look like?", "ai capital cycle macro debt financing rates infrastructure stress risk", "Build scenarios around financing costs, utilization, energy constraints, and customer concentration rather than a single headline valuation."],
  ] },
  { id: "quant", label: "Quantitative research and markets", keywords: "quant quantitative trading trader strategy strategies bitcoin crypto portfolio markets forecasting risk investing investment hedge alpha prediction", sources: ["rudajev.substack.com", "www.noahpinion.blog"], angles: [
    ["Does cheaper AI research make profitable trades more crowded?", "ai research quantitative trading alpha crowding markets strategies", "Trace the path from lower research costs to strategy adoption and capacity. Distinguish generating a signal from executing it profitably."],
    ["The model-risk problem hiding inside AI investment research", "ai investment research quant model risk validation evidence forecasting", "Compare AI-generated explanations with traditional backtest failure modes, including leakage, overfitting, and changing market regimes."],
    ["When every investor has an agent, who provides market liquidity?", "agents investing markets liquidity trading risk market maker", "Develop competing scenarios for liquidity and correlated execution when many investors delegate decisions to similar systems."],
  ] },
  { id: "bio", label: "Biotechnology and biological risk", keywords: "biotech biotechnology biology biological clinical drug medicine laboratory labs biosafety biosecurity pharmaceutical therapies science", sources: ["biologicalsecurity.substack.com", "mattsbiodefense.substack.com"], angles: [
    ["The cybersecurity blind spot in automated laboratories", "biotechnology laboratory automation agents cybersecurity permissions biological risk", "Follow the chain from digital instructions to physical experiments. Identify where access controls and biological safeguards may need to meet."],
    ["Could biosecurity become a competitive advantage for AI drug discovery?", "biosecurity ai drug discovery biotechnology business compliance trust", "Investigate whether safeguards are merely a cost or can affect procurement, partnerships, and the credibility of a discovery platform."],
    ["Why faster drug discovery may not mean faster biotech returns", "ai biotech drug discovery clinical trials capital financing investment bottleneck", "Compare computational progress with trial design, manufacturing, regulation, and financing. Identify which bottlenecks move and which remain."],
  ] },
  { id: "culture", label: "Culture, philosophy, and institutions", keywords: "philosophy philosophical culture fiction classics comedy university education institutions literature plato neoplatonist human meaning", sources: ["www.astralcodexten.com", "www.theintrinsicperspective.com"], angles: [
    ["What does an AI-generated culture lose when it optimizes for agreement?", "ai culture philosophy agreement incentives criticism meaning literature", "Contrast consensus-seeking outputs with the productive disagreement found in criticism, comedy, and philosophy."],
    ["Can small universities compete by teaching judgment rather than information?", "university education ai judgment institutions culture learning", "Examine whether cheap access to information changes the value of seminar discussion, mentorship, and intellectual independence."],
    ["The economics of human taste after content becomes nearly free", "ai culture content taste curation economics scarcity attention literature", "Explore whether editorial judgment and trusted curation become more valuable as production costs fall. Treat this as a hypothesis to investigate."],
  ] },
];
const extraStop = new Set("episode episodes talks baekho watcher wednesdays weekly newsletter update updates post posts thank thanks really very would could should today week read new part using use says said make makes things thing".split(" "));
const coreTerms: Record<string, string> = {
  agents: "agents agent autonomous security cybersecurity authorization permissions injection oversight",
  macro: "rates interest financing capital yields yield macro inflation monetary productivity labor liquidity economy economics",
  quant: "quant quantitative trading trader investing investment portfolio markets market liquidity forecasting prediction",
  bio: "biotech biotechnology biology biological clinical medicine laboratory labs biosafety biosecurity drug pharmaceutical",
  culture: "culture cultural philosophy philosophical fiction classics comedy education university institutions literature human taste art creativity creative criticism meaning content",
};
const words = (s: string) => tokens(s).filter(t => !extraStop.has(t));
export const articleText = (p: OpportunityPost) => `${p.title} ${p.subtitle} ${p.text ?? ""}`;
export function suggestedSources(posts: OpportunityPost[], focus: string): string[] {
  const corpus = new Set(words(`${posts.map(articleText).join(" ")} ${focus}`));
  return [...new Set(topicThemes.map(t => ({ t, score: words(t.keywords).filter(w => corpus.has(w)).length })).filter(t => t.score >= 2).sort((a, b) => b.score - a.score).slice(0, 4).flatMap(({ t }) => t.sources))].slice(0, 10);
}
const norm = (v: number[]) => { const n = Math.hypot(...v); return v.map(x => n ? x / n : 0); };
const cosine = (a: number[], b: number[]) => Math.max(0, Math.min(1, a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0)));
export function crossSubstackIdeas(scan: OpportunityScan, focus: string): { opportunities: ContentOpportunity[]; method: string } {
  const external = (scan.external ?? []).filter(p => p.domain !== scan.domain && p.url).slice(0, 192);
  if (!external.length || !scan.posts.length) return { opportunities: [], method: "Cross-publication scan pending" };
  type Angle = { title: string; keywords: string; premise: string; theme: Theme; anchor?: ExternalArticle; entity?: string; key: string };
  const angles: Angle[] = topicThemes.flatMap(t => t.angles.map(([title, keywords, premise], i) => ({ title, keywords, premise, theme: t, key: `${t.id}:${i}` })));
  const seenCases = new Set<string>();
  const caseFrames: Record<string, [string, string]> = {
    agents: ["Who controls the permissions around {entity}?", "authorization permissions accountability security operational governance"],
    macro: ["{entity}: what could go wrong with the capital-allocation story?", "capital financing allocation capacity economics infrastructure opportunity cost"],
    quant: ["What would falsify the investment case for {entity}?", "investing markets valuation evidence expectations scenarios business returns"],
    bio: ["{entity}: faster discovery, or a new clinical bottleneck?", "biotech clinical discovery validation manufacturing regulatory bottlenecks"],
    culture: ["What {entity} reveals about the economics of attention", "culture attention incentives curation human taste creativity economics"],
  };
  // Source-specific case studies expand beyond the reusable hypothesis library.
  for (const source of external) {
    const entities = [...new Set(`${source.title} ${source.subtitle}`.match(/\b(?:Cerebras|Oura|DeepSeek|OpenAI|Anthropic|Nvidia|NVIDIA|Google|Meta|Microsoft|Amazon|Apple|SpaceX|Tesla|Palantir|Claude|ChatGPT|Adrian|Hugging Face|Novo Nordisk|Eli Lilly|Moderna|BioNTech|CRISPR|AlphaFold|Figure AI|Waymo|Anduril|CoreWeave)\b/g) ?? [])].slice(0, 2);
    for (const entity of entities) for (const theme of topicThemes) {
      if (scan.posts.some(p => articleText(p).toLowerCase().includes(entity.toLowerCase()))) continue;
      const key = `${theme.id}:case:${entity.toLowerCase().replace(/\s+/g, "-")}`;
      if (seenCases.has(key) || !words(articleText(source)).some(t => words(coreTerms[theme.id]).includes(t))) continue;
      seenCases.add(key);
      const [frame, dimensions] = caseFrames[theme.id];
      angles.push({ title: frame.replace("{entity}", entity), keywords: `${entity} ${dimensions}`, premise: `Use "${source.title}" as a starting point for a distinct case study of ${entity}. Test the ${theme.label.toLowerCase()} implications with primary evidence and counterarguments, rather than repeating the source's thesis.`, theme, anchor: source, entity, key });
    }
    if (angles.length >= 45) break;
  }
  const docs = [...scan.posts.map(articleText), ...external.map(articleText), ...angles.map(a => `${a.keywords} ${a.theme.keywords}`), focus].map(words);
  const df = new Map<string, number>();
  for (const doc of docs) for (const word of new Set(doc)) df.set(word, (df.get(word) ?? 0) + 1);
  const vocabulary = [...df.keys()].sort((a, b) => df.get(b)! - df.get(a)! || a.localeCompare(b)).slice(0, 1800);
  const rows = docs.map(doc => { const counts = new Map<string, number>(); for (const w of doc) counts.set(w, (counts.get(w) ?? 0) + 1); return norm(vocabulary.map(w => counts.has(w) ? (1 + Math.log(counts.get(w)!)) * (1 + Math.log((docs.length + 1) / (df.get(w)! + 1))) : 0)); });
  let latent = rows, method = "Cross-publication TF-IDF";
  if (rows.length >= 5 && vocabulary.length >= 8) {
    const svd = new SingularValueDecomposition(new Matrix(rows), { autoTranspose: true });
    const k = Math.min(16, svd.diagonal.filter(s => s > 1e-8).length);
    if (k >= 2) { latent = rows.map((_, i) => norm(Array.from({ length: k }, (_, j) => svd.leftSingularVectors.get(i, j) * svd.diagonal[j]))); method = `Cross-publication TF-IDF + latent semantic analysis (${k} topics)`; }
  }
  const sim = (a: number, b: number) => .7 * cosine(rows[a], rows[b]) + .3 * cosine(latent[a], latent[b]);
  const ownWords = new Set(scan.posts.flatMap(p => words(articleText(p))));
  const candidates = angles.flatMap((angle, ai) => {
    const index = scan.posts.length + external.length + ai;
    const own = scan.posts.map((p, i) => ({ p, fit: sim(index, i) })).sort((a, b) => b.fit - a.fit);
    const core = new Set(words(coreTerms[angle.theme.id]));
    const sources = external.map((p, i) => ({ p, fit: sim(index, scan.posts.length + i) })).filter(e => e.fit >= .12 && words(articleText(e.p)).some(t => core.has(t)) && (!angle.anchor || e.p.id === angle.anchor.id)).sort((a, b) => b.fit - a.fit);
    const fit = own[0]?.fit ?? 0;
    if (fit < .10 || !sources.length) return [];
    const newTerms = words(angle.keywords).filter(w => !ownWords.has(w));
    if (newTerms.length < (angle.anchor ? 1 : 2)) return [];
    const coverage = Math.max(...scan.posts.map((_, i) => cosine(rows[index], rows[i])));
    if (coverage > .75) return [];
    const evidence: ExternalArticle[] = [];
    for (const source of sources.filter(s => s.fit >= Math.max(.14, sources[0].fit * .65))) if (!evidence.some(e => e.domain === source.p.domain)) { evidence.push(source.p); if (evidence.length === 3) break; }
    if (!evidence.length) return [];
    const novelty = Math.min(.95, .6 * (1 - coverage) + .4 * Math.min(1, newTerms.length / 5));
    const editorialFit = focus.trim() ? .75 * fit + .25 * sim(index, rows.length - 1) : fit;
    const sourceStrength = Math.min(1, sources[0].fit * 2.5);
    const score = Math.round(100 * (.4 * Math.min(1, editorialFit * 2) + .35 * novelty + .25 * sourceStrength));
    const related = own.filter(p => p.fit >= .10).slice(0, 2).map(e => e.p);
    const plan = researchPlan(angle.key, evidence, related, angle.entity);
    const rationale = `Connects your ${angle.theme.label.toLowerCase()} coverage with ${evidence.length} outside publication${evidence.length === 1 ? "" : "s"}. Possible new dimensions: ${newTerms.slice(0, 4).join(", ")}.`;
    return [{ id: `cross:${angle.key}`, title: angle.title, kind: "Cross-Substack angle" as const, score, demand: null, coverage: Math.round(coverage * 100), readers: 0, terms: newTerms.slice(0, 4), evidence: [], related, external: evidence, rationale, fit: Math.round(Math.min(1, fit * 2) * 100), novelty: Math.round(novelty * 100),
      brief: `Working title: ${angle.title}\n\nResearch hypothesis\n${angle.premise}\n\nWhy it fits your writing\n${rationale}\n${related.map(p => `${p.subtitle || p.title}\n${p.url ?? ""}`).join("\n\n")}\n\nAcross Substack\n${evidence.map(p => `${p.title}\n${p.subtitle}\n${p.url}`).join("\n\n")}\n\nOriginal angle\n${plan.contribution}\n\nResearch plan\n${plan.steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}\n\nCoverage limit\nThese connections are editorial hypotheses, not claims made by the cited writers. Novelty is relative to the sampled public archive, not a guarantee that nobody has written this topic.` }];
  }).sort((a, b) => b.score - a.score);
  const selected: ContentOpportunity[] = [], perTheme = new Map<string, number>();
  for (const idea of candidates) {
    const theme = idea.id.split(":")[1];
    if ((perTheme.get(theme) ?? 0) >= 2) continue;
    selected.push(idea); perTheme.set(theme, (perTheme.get(theme) ?? 0) + 1);
    if (selected.length === 10) break;
  }
  return { opportunities: selected, method };
}
