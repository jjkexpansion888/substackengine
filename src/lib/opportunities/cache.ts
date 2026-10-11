import type { ExternalArticle, OpportunityPost, OpportunityScan, ReaderQuestion } from "./types";
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown, max = 6000) => typeof v === "string" ? v.slice(0, max) : "";
const count = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
const url = (v: unknown) => { try { const u = new URL(text(v)); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; } };
function post(value: unknown): OpportunityPost | null {
  const p = object(value);
  if (!text(p.id) || !text(p.title)) return null;
  return { id: text(p.id, 500), title: text(p.title, 500), subtitle: text(p.subtitle, 1000), text: text(p.text), url: url(p.url), date: typeof p.date === "string" && Number.isFinite(Date.parse(p.date)) ? p.date : null, comments: count(p.comments), reactions: count(p.reactions) };
}
export function readOpportunityCache(value: unknown, expectedDomain: string): OpportunityScan | null {
  const s = object(value);
  if (s.domain !== expectedDomain || !Array.isArray(s.posts) || !Array.isArray(s.questions) || !Array.isArray(s.external) || typeof s.scannedAt !== "string" || !Number.isFinite(Date.parse(s.scannedAt))) return null;
  const posts = s.posts.slice(0, 48).flatMap(p => { const parsed = post(p); return parsed ? [parsed] : []; });
  const external: ExternalArticle[] = s.external.slice(0, 128).flatMap(value => {
    const p = post(value), e = object(value), domain = text(e.domain, 300);
    return p && p.url && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain) && domain !== expectedDomain ? [{ ...p, domain, publication: text(e.publication, 300) || domain }] : [];
  });
  const questions: ReaderQuestion[] = s.questions.slice(0, 800).flatMap(value => {
    const q = object(value);
    return text(q.id) && text(q.text) ? [{ id: text(q.id, 500), text: text(q.text, 2000), readerId: text(q.readerId, 200) || null, postId: text(q.postId, 200), postTitle: text(q.postTitle, 500), url: url(q.url) }] : [];
  });
  return { domain: expectedDomain, posts, external, questions, commentsRead: count(s.commentsRead), publicationsScanned: count(s.publicationsScanned), scannedAt: s.scannedAt, warnings: Array.isArray(s.warnings) ? s.warnings.slice(0, 20).map(w => text(w, 1000)) : [] };
}
