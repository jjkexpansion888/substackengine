import { Matrix, SingularValueDecomposition } from "ml-matrix";
import { tokens } from "@/lib/collaboration/matching";
import type { ContentOpportunity, OpportunityScan, ReaderQuestion } from "./types";
import { crossSubstackIdeas } from "./crossSubstack";

const filler = new Set("thanks thank great really very please could would should does did know think question article episode much also just like good any some there these those been explain tell interested wondering curious love today".split(" "));
const words = (s: string) => tokens(s).filter(t => !filler.has(t));
const normalize = (v: number[]) => { const n = Math.hypot(...v); return v.map(x => n ? x / n : 0); };
const cosine = (a: number[], b: number[]) => Math.max(0, Math.min(1, a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0)));
export function rankOpportunities(scan: OpportunityScan, interests = ""): { opportunities: ContentOpportunity[]; method: string } {
  const questions = scan.questions.slice(0, 160);
  const docs = [...questions.map(q => words(q.text)), ...scan.posts.map(p => words(`${p.title} ${p.subtitle}`)), words(interests)];
  const df = new Map<string, number>();
  for (const doc of docs) for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  const vocabulary = [...df.keys()].sort((a, b) => df.get(b)! - df.get(a)! || a.localeCompare(b)).slice(0, 1500);
  const rows = docs.map(doc => {
    const counts = new Map<string, number>();
    for (const t of doc) counts.set(t, (counts.get(t) ?? 0) + 1);
    return normalize(vocabulary.map(t => counts.has(t) ? (1 + Math.log(counts.get(t)!)) * (1 + Math.log((docs.length + 1) / (df.get(t)! + 1))) : 0));
  });
  let vectors = rows, method = "TF-IDF cosine";
  if (docs.length >= 5 && vocabulary.length >= 8) {
    const svd = new SingularValueDecomposition(new Matrix(rows), { autoTranspose: true });
    const dimensions = Math.min(12, Math.max(2, Math.floor(docs.length / 3)), svd.diagonal.filter(s => s > 1e-8).length);
    if (dimensions >= 2) {
      vectors = rows.map((_, i) => normalize(Array.from({ length: dimensions }, (_, j) => svd.leftSingularVectors.get(i, j) * svd.diagonal[j])));
      method = `TF-IDF + latent semantic analysis (${dimensions} topics)`;
    }
  }
  const similarity = (a: number, b: number) => .75 * cosine(rows[a], rows[b]) + .25 * cosine(vectors[a], vectors[b]);
  const groups: number[][] = [];
  questions.forEach((q, i) => {
    if (!words(q.text).length) return;
    const group = groups.find(g => similarity(g[0], i) >= .5);
    if (group) group.push(i); else groups.push([i]);
  });
  const questionIdeas: ContentOpportunity[] = groups.map(group => {
    const first = group[0], evidence = group.map(i => questions[i]);
    const matches = scan.posts.map((p, i) => ({ p, similarity: Math.max(...group.map(q => similarity(q, questions.length + i))) })).sort((a, b) => b.similarity - a.similarity);
    const coverage = matches[0]?.similarity ?? 0;
    const knownReaders = new Set(evidence.flatMap(q => q.readerId ? [q.readerId] : [])).size;
    const demand = Math.min(1, Math.log1p(knownReaders || 1) / Math.log(6));
    const fit = interests.trim() ? Math.max(...group.map(i => similarity(i, rows.length - 1))) : 0;
    const weights = vocabulary.map((term, i) => ({ term, weight: group.reduce((n, q) => n + rows[q][i], 0) })).sort((a, b) => b.weight - a.weight);
    const terms = weights.filter(t => t.weight > 0).slice(0, 4).map(t => t.term);
    const question = evidence[0].text.split(/(?<=[?.!])\s+/).find(s => s.includes("?")) ?? evidence[0].text;
    const title = question.length > 150 ? `${question.slice(0, 147)}...` : question;
    const related = matches.filter(m => m.similarity >= .12).slice(0, 3).map(m => m.p);
    return { id: `question:${evidence.map(e => e.id).sort()[0]}`, title, kind: "Reader question", score: Math.round(100 * (.50 * demand + .35 * (1 - coverage) + .15 * (interests.trim() ? fit : .5))), demand: Math.round(demand * 100), coverage: Math.round(coverage * 100), readers: knownReaders, terms, evidence, related,
      brief: `Working title: ${title}\n\nReader need\n${evidence[0].text}\n\nOutline\n1. Define the question and why it matters to your readers.\n2. Examine the evidence${terms.length ? ` around ${terms.slice(0, 2).join(" and ")}` : ""}, including counterarguments.\n3. Walk through a concrete example and its limitations.\n4. Close with the implications and a question for readers.\n\nResearch checks\nVerify claims with primary sources; distinguish evidence from interpretation. Review related posts before treating this as a gap.\n\nDiscussion evidence\n${evidence.slice(0, 6).map(e => `${e.text}\n${e.url ?? e.postTitle}`).join("\n\n")}` };
  });
  const cross = crossSubstackIdeas(scan, interests);
  return { opportunities: [...cross.opportunities, ...questionIdeas].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)), method: cross.opportunities.length ? cross.method : method };
}

export function manualQuestions(text: string): ReaderQuestion[] {
  return [...new Set(text.split("\n").map(s => s.trim()).filter(s => s.length >= 10))].slice(0, 30).map(s => ({ id: `manual:${s.slice(0, 200)}`, text: s.slice(0, 2000), readerId: null, postId: "manual", postTitle: "Writer-provided question", url: null }));
}
