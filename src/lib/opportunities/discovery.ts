import { publicationDomain, publicJson, publicPage } from "@/lib/substack/publicRadar";
import { InvalidInputError, RateLimitedError, UpstreamChangeError, UpstreamTransientError } from "@/lib/substack/errors";
import { pooledMap } from "@/lib/substack/concurrency";
import type { ExternalArticle, OpportunityPost, OpportunityScan, ReaderQuestion } from "./types";
import { articleText, suggestedSources } from "./crossSubstack";
import { tokens } from "@/lib/collaboration/matching";
import { topicDiscoverySources } from "@/lib/collaboration/topicDiscovery";
import { recommendedDomains } from "./recommendations";

const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" ? v : "";
const count = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
const identity = (v: unknown) => typeof v === "string" || typeof v === "number" ? String(v) : "";
const safeUrl = (v: unknown) => { try { const u = new URL(text(v)); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; } };
export function plainComment(value: unknown, limit = 2000): string {
  return text(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, entity => ({ "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" }[entity] ?? " ")).replace(/\s+/g, " ").trim().slice(0, limit);
}
export function isReaderQuestion(value: string): boolean {
  if (/\b(?:looking for guests|follow(?:ed)? (?:you )?back|follow for follow|subscribe to my|check out my|want to (?:collaborate|connect)|open to (?:a )?collaborat|where (?:can|do) i (?:subscribe|unsubscribe)|how (?:can|do) i unsubscribe)\b/i.test(value)) return false;
  return value.length >= 18 && (/\?/.test(value) || /\b(?:would love to (?:know|read)|could you (?:explain|cover)|please (?:explain|cover)|curious (?:about|whether|how)|wondering (?:if|how|whether)|what about)\b/i.test(value));
}
export async function discoverOpportunities(input: unknown, getJson = publicJson, getPage = getJson === publicJson ? publicPage : undefined): Promise<OpportunityScan> {
  const raw = obj(input);
  if (typeof raw.domain !== "string" || raw.domain.length > 300) throw new InvalidInputError("Choose a valid publication.");
  if (raw.sources !== undefined && (!Array.isArray(raw.sources) || raw.sources.length > 16 || raw.sources.some(s => typeof s !== "string" || s.length > 300))) throw new InvalidInputError("Choose up to 16 public source publications.");
  const suppliedSources = (raw.sources as string[] | undefined ?? []).map(publicationDomain);
  const focus = text(raw.focus).slice(0, 2000);
  let limited = false, requests = 0;
  const deadline = Date.now() + 75000;
  const read = async (url: string) => {
    if (limited || requests >= 96 || Date.now() > deadline) throw new UpstreamTransientError("Cross-Substack request budget reached.");
    requests++;
    try { return await getJson(url); } catch (e) { if (e instanceof RateLimitedError) limited = true; throw e; }
  };
  const domain = publicationDomain(raw.domain), origin = `https://${domain}`;
  const archive = await read(`${origin}/api/v1/archive?sort=new&limit=48`);
  if (!Array.isArray(archive)) throw new UpstreamChangeError("The public archive is unavailable.");
  const authors = new Map<string, Set<string>>();
  const posts: OpportunityPost[] = archive.slice(0, 48).flatMap(value => {
    const p = obj(value), id = identity(p.id);
    const bylines = Array.isArray(p.publishedBylines) ? p.publishedBylines : [];
    authors.set(id, new Set(bylines.map(v => identity(obj(v).id)).filter(Boolean)));
    return /^\d+$/.test(id) && text(p.title) ? [{ id, title: text(p.title).slice(0, 500), subtitle: text(p.subtitle).slice(0, 1000), text: plainComment(p.body_html, 6000), slug: /^[a-z0-9_-]+$/i.test(text(p.slug)) ? text(p.slug) : undefined, url: safeUrl(p.canonical_url), date: text(p.post_date) || null, comments: count(p.comment_count), reactions: count(p.reaction_count) }] : [];
  });
  const enrich = async (post: OpportunityPost, host: string) => {
    if (!post.slug || post.text) return;
    const body = obj(await read(`https://${host}/api/v1/posts/${encodeURIComponent(post.slug)}`));
    post.text = plainComment(body.body_html ?? body.truncated_body_text ?? body.description, 6000);
  };
  const ownResults = await pooledMap(posts.slice(0, 10), p => enrich(p, domain), { concurrency: 3 });
  const writing = `${posts.map(articleText).join(" ")} ${focus}`;
  const targets = [...new Set([...topicDiscoverySources(writing), ...suggestedSources(posts, focus), ...suppliedSources])].filter(s => s !== domain).slice(0, 16);
  let recommendationsUnavailable = 0;
  if (getPage) {
    const pages = await pooledMap([domain, ...targets.slice(0, 3)], async host => {
      if (limited || requests >= 96 || Date.now() > deadline) throw new UpstreamTransientError("Cross-Substack request budget reached.");
      requests++;
      try { return recommendedDomains(await getPage(`https://${host}/recommendations`), host); }
      catch (error) { if (error instanceof RateLimitedError) limited = true; throw error; }
    }, { concurrency: 2 });
    recommendationsUnavailable = pages.filter(result => result.status === "rejected").length;
    // Interleave recommendations from different writers instead of exhausting one writer's list.
    const lists = pages.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    for (let i = 0; i < 20 && targets.length < 24; i++) for (const list of lists) {
      const host = list[i];
      if (host && host !== domain && !targets.includes(host) && targets.length < 24) targets.push(host);
    }
  }
  const external: ExternalArticle[] = [];
  let publicationsScanned = 0;
  const sourceResults = await pooledMap(targets, async host => {
    const archive = await read(`https://${host}/api/v1/archive?sort=new&limit=8`);
    if (!Array.isArray(archive)) throw new UpstreamChangeError("Source archive unavailable.");
    publicationsScanned++;
    for (const value of archive.slice(0, 8)) {
      const p = obj(value), id = identity(p.id), url = safeUrl(p.canonical_url);
      if (!id || !text(p.title) || !url) continue;
      external.push({ id: `${host}:${id}`, domain: host, publication: host.replace(/^www\./, "").replace(/\.substack\.com$/, ""), title: text(p.title).slice(0, 500), subtitle: text(p.subtitle).slice(0, 1000), slug: /^[a-z0-9_-]+$/i.test(text(p.slug)) ? text(p.slug) : undefined, text: plainComment(p.body_html, 6000), url, date: text(p.post_date) || null, comments: count(p.comment_count), reactions: count(p.reaction_count) });
    }
  }, { concurrency: 3 });
  const ownTerms = new Set(tokens(`${posts.map(articleText).join(" ")} ${focus}`));
  const prioritized = external.map(p => ({ p, fit: [...new Set(tokens(articleText(p)))].filter(t => ownTerms.has(t)).length })).sort((a, b) => b.fit - a.fit);
  const perSource = new Map<string, number>();
  const selectedText = prioritized.filter(({ p }) => { const n = perSource.get(p.domain) ?? 0; if (n >= 2) return false; perSource.set(p.domain, n + 1); return true; }).slice(0, 24);
  const textResults = await pooledMap(selectedText, ({ p }) => enrich(p, p.domain), { concurrency: 3 });
  const questions: ReaderQuestion[] = [], seen = new Set<string>();
  let commentsRead = 0;
  const results = await pooledMap(posts.filter(p => p.comments > 0).slice(0, 8), async post => {
    if (limited || Date.now() > deadline) throw new Error("Public scan limit reached.");
    let body: Record<string, unknown>;
    try { body = obj(await read(`${origin}/api/v1/post/${post.id}/comments?all_comments=true&sort=best&limit=50`)); }
    catch (error) { if (error instanceof RateLimitedError) limited = true; throw error; }
    if (!Array.isArray(body.comments)) throw new UpstreamChangeError("Public comments are unavailable.");
    let visited = 0;
    const visit = (items: unknown[], depth = 0) => {
      if (depth > 10) return;
      for (const value of items) {
        if (visited++ >= 100) break;
        const c = obj(value), user = obj(c.user), id = identity(c.id);
        if (c.deleted || c.suppressed) continue;
        const content = plainComment(c.body ?? c.body_html ?? c.text);
        const author = c.is_author === true || c.author === true || user.is_author === true || authors.get(post.id)?.has(identity(c.user_id ?? user.id));
        if (!author && content) {
          commentsRead++;
          if (id && isReaderQuestion(content) && !seen.has(`${post.id}:${id}`)) {
            seen.add(`${post.id}:${id}`);
            questions.push({ id: `${post.id}:${id}`, text: content, readerId: identity(c.user_id ?? user.id) || null, postId: post.id, postTitle: post.title, url: post.url ? `${post.url.split("#")[0]}#comment-${encodeURIComponent(id)}` : null });
          }
        }
        if (Array.isArray(c.children)) visit(c.children, depth + 1);
      }
    };
    visit(body.comments.slice(0, 50));
  }, { concurrency: 2 });
  const failed = results.filter(r => r.status === "rejected").length;
  const unavailable = sourceResults.filter(r => r.status === "rejected").length;
  const missingText = [...ownResults, ...textResults].filter(r => r.status === "rejected").length;
  return { domain, posts, external: external.sort((a, b) => a.id.localeCompare(b.id)), publicationsScanned, questions: questions.sort((a, b) => a.id.localeCompare(b.id)), commentsRead, scannedAt: new Date().toISOString(), warnings: [ ...(recommendationsUnavailable ? [`${recommendationsUnavailable} public recommendation pages were unavailable; research continues with accessible sources.`] : []), ...(unavailable ? [`${unavailable} outside publications were unavailable; discovery covers accessible sources only.`] : []), ...(missingText ? [`Public article text was unavailable for ${missingText} articles; those comparisons use metadata.`] : []), ...(failed ? [`Discussions on ${failed} posts were unavailable or reached the request limit.`] : []), ...(requests >= 96 || Date.now() > deadline ? ["Research reached its request or time budget; results are partial."] : []), ...(limited ? ["Substack rate limited the scan. Wait before refreshing."] : []) ] };
}
