import { Matrix, SingularValueDecomposition, solve } from "ml-matrix";
import type { CollaborationCandidate, CollaborationGoal, CollaborationMatch, CollaborationRecord, CollaborationFormat } from "./types";

const stop = new Set("the and for with this that from your you our are was have has into about what how why when who will can more their they its new not but all out get one newsletter substack publication post read latest subscribe".split(" "));
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(t => !stop.has(t));
}
const normalize = (v: number[]) => { const norm = Math.hypot(...v); return v.map(x => norm ? x / norm : 0); };
const cosine = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0);
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const document = (c: CollaborationCandidate) => `${c.publication} ${c.description} ${c.posts.map(p => `${p.title} ${p.subtitle}`).join(" ")}`;

export function rankCollaborators(sourceText: string, candidates: CollaborationCandidate[], options: {
  audience: number | null; goal: CollaborationGoal; records: Record<string, CollaborationRecord>; diversity: boolean; now?: number;
}): { matches: CollaborationMatch[]; method: string; personalized: boolean } {
  if (!candidates.length) return { matches: [], method: "TF-IDF", personalized: false };
  const docs = [tokens(sourceText), ...candidates.map(c => tokens(document(c)))];
  const frequencies = new Map<string, number>();
  for (const doc of docs) for (const token of new Set(doc)) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  const vocabulary = [...frequencies.keys()].sort((a, b) => frequencies.get(b)! - frequencies.get(a)! || a.localeCompare(b)).slice(0, 2000);
  const rows = docs.map(doc => {
    const counts = new Map<string, number>();
    for (const token of doc) counts.set(token, (counts.get(token) ?? 0) + 1);
    return normalize(vocabulary.map(t => counts.has(t) ? (1 + Math.log(counts.get(t)!)) * (1 + Math.log((1 + docs.length) / (1 + frequencies.get(t)!))) : 0));
  });
  let vectors = rows;
  let method = "TF-IDF cosine";
  // Reduce the corpus into shared latent topics; keep lexical similarity to avoid small-corpus artifacts.
  if (docs.length >= 5 && docs.length <= 100 && vocabulary.length >= 8) {
    const svd = new SingularValueDecomposition(new Matrix(rows), { autoTranspose: true });
    const dimensions = Math.min(12, Math.max(2, Math.floor(docs.length / 2)), svd.diagonal.filter(s => s > 1e-8).length);
    if (dimensions >= 2) {
      vectors = rows.map((_, i) => normalize(Array.from({ length: dimensions }, (_, j) => svd.leftSingularVectors.get(i, j) * svd.diagonal[j])));
      method = `TF-IDF + latent semantic analysis (${dimensions} topics)`;
    }
  }
  const now = options.now ?? Date.now();
  let matches: CollaborationMatch[] = candidates.map((c, index) => {
    const lexical = clamp(cosine(rows[0], rows[index + 1]));
    const topic = method.startsWith("TF-IDF +") ? .65 * lexical + .35 * clamp(cosine(vectors[0], vectors[index + 1])) : lexical;
    const relation = clamp(Math.log1p(c.relationship) / Math.log(6));
    const scale = options.audience !== null && c.audience !== null ? Math.exp(-Math.abs(Math.log((c.audience + 1) / (options.audience + 1)))) : null;
    const dates = c.posts.flatMap(p => p.date && Number.isFinite(Date.parse(p.date)) ? [Date.parse(p.date)] : []);
    const activity = dates.length ? Math.exp(-Math.max(0, now - Math.max(...dates)) / (1000 * 86400 * 60)) : null;
    const reach = c.audience === null ? null : clamp(Math.log1p(c.audience) / Math.log(100001));
    const bridge = c.sampledParticipants ? clamp(c.sharedParticipants / c.sampledParticipants) : null;
    const weights = options.goal === "reach" ? [.44, .12, .10, .10, .20, .04] : options.goal === "relationship" ? [.36, .34, .12, .10, .02, .06] : [.48, .22, .12, .10, .04, .04];
    const values = [topic, relation, scale, activity, reach, bridge];
    const available = values.reduce<number>((sum, value, i) => sum + (value === null ? 0 : weights[i]), 0);
    const score = values.reduce<number>((sum, value, i) => sum + (value ?? 0) * weights[i], 0) / available;
    const terms = vocabulary.map((term, i) => ({ term, weight: rows[0][i] * rows[index + 1][i] })).filter(t => t.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, 5).map(t => t.term);
    return { ...c, score: Math.round(score * 100), topic: Math.round(topic * 100), relationshipScore: Math.round(relation * 100), scale: scale === null ? null : Math.round(scale * 100), activity: activity === null ? null : Math.round(activity * 100),
      confidence: c.posts.length >= 4 && c.description && c.audience !== null ? "High" : c.posts.length >= 2 ? "Medium" : "Low",
      terms, vector: vectors[index + 1], features: [1, ...values.map(v => v ?? 0), Number(scale === null), Number(reach === null)] };
  });
  const examples = matches.flatMap(m => options.records[m.id]?.feedback ? [{ x: m.features, y: options.records[m.id].feedback === "positive" ? 1 : 0 }] : []);
  const personalized = examples.length >= 6 && examples.some(e => e.y === 0) && examples.some(e => e.y === 1);
  if (personalized) {
    const x = new Matrix(examples.map(e => e.x));
    const xt = x.transpose();
    const gram = xt.mmul(x);
    for (let i = 0; i < gram.rows; i++) gram.set(i, i, gram.get(i, i) + 2);
    const coefficients = solve(gram, xt.mmul(Matrix.columnVector(examples.map(e => e.y)))).to1DArray();
    matches = matches.map(m => ({ ...m, score: Math.round(.8 * m.score + 20 * clamp(cosine(m.features, coefficients))) }));
  }
  matches.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (options.diversity) {
    const pool = matches.slice(0, 50), selected: CollaborationMatch[] = [];
    while (pool.length) {
      let best = 0, bestValue = -Infinity;
      pool.forEach((m, i) => {
        const similarity = selected.length ? Math.max(...selected.map(s => clamp(cosine(m.vector, s.vector)))) : 0;
        const value = .85 * m.score / 100 - .15 * similarity;
        if (value > bestValue) { bestValue = value; best = i; }
      });
      selected.push(...pool.splice(best, 1));
    }
    matches = [...selected, ...matches.slice(50)];
  }
  return { matches, method, personalized };
}

export function collaborationIdeas(match: CollaborationMatch): { format: CollaborationFormat; title: string; reason: string }[] {
  const topic = match.terms.slice(0, 2).join(" and ") || match.posts[0]?.title || "your shared interests";
  return [
    { format: "Guest post", title: `Two perspectives on ${topic}`, reason: `Pair your perspective with ${match.publication}'s recent coverage.` },
    { format: "Interview", title: `A conversation with ${match.name}`, reason: match.posts[0] ? `Start with "${match.posts[0].title}" and explore what your readers would ask next.` : "Explore their expertise and the questions your readers care about." },
    { format: "Joint live session", title: `Reader Q&A: ${topic}`, reason: "Invite both communities to a focused conversation with questions collected in advance." },
    { format: "Recommendation", title: `An editorial introduction to ${match.publication}`, reason: "Read their work and recommend it when it adds value for your readers." },
  ];
}

export function outreachDraft(senderName: string, match: CollaborationMatch, format: CollaborationFormat): string {
  const post = match.posts[0];
  const introduction = senderName.trim() ? `I write ${senderName.trim()}.` : "I'm reaching out about a collaboration.";
  return `Hi ${match.name},\n\n${introduction}${post ? ` Your post "${post.title}" caught my attention.` : ` I came across ${match.publication} while looking for writers to collaborate with.`}\n\nWould you be open to a ${format.toLowerCase()}${match.terms.length ? ` around ${match.terms.slice(0, 2).join(" and ")}` : " on a topic that interests both of our readers"}? I'd like to bring a complementary perspective and make something useful for both communities.\n\nHappy to send a short outline and agree on the format, timing, and how we'd share it.\n\nThanks!`;
}

export function resolveOutreachDraft(senderName: string, researchName: string, match: CollaborationMatch, format: CollaborationFormat, savedDraft?: string): string {
  // Replace untouched drafts generated with the old research-publication identity; retain authored edits.
  if (savedDraft === undefined || savedDraft === outreachDraft(researchName, match, format)) return outreachDraft(senderName, match, format);
  return savedDraft;
}

export function campaignLink(publicationUrl: string, partnerDomain: string, format: CollaborationFormat): string | null {
  try {
    const url = new URL(publicationUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.searchParams.set("utm_source", partnerDomain);
    url.searchParams.set("utm_medium", "collaboration");
    url.searchParams.set("utm_campaign", format.toLowerCase().replaceAll(" ", "-"));
    return url.href;
  } catch { return null; }
}
