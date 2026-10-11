import { publicJson, publicationDomain } from "@/lib/substack/publicRadar";
import { InvalidInputError, RateLimitedError, UpstreamTransientError } from "@/lib/substack/errors";
import { pooledMap } from "@/lib/substack/concurrency";
import type { CollaborationCandidate, CollaborationPost, CollaborationScan } from "./types";

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => x && typeof x === "object" && !Array.isArray(x) ? x as Obj : {};
const list = (x: unknown) => Array.isArray(x) ? x : [];
const text = (x: unknown) => typeof x === "string" ? x.slice(0, 4000) : "";
const count = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
const url = (x: unknown) => { try { const u = new URL(text(x)); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; } };
const handlePattern = /^[a-z0-9_-]{1,100}$/i;
export type DiscoveryPerson = { handle: string; comments: number; author: boolean; domain?: string | null; name?: string; publication?: string; description?: string; audience?: number | null; audienceLabel?: string; photoUrl?: string | null };
export type DiscoveryInput = { domain: string; people: DiscoveryPerson[]; seeds: string[] };

export function parseDiscoveryInput(raw: unknown): DiscoveryInput {
  const body = obj(raw);
  if (typeof body.domain !== "string" || body.domain.length > 300 || !Array.isArray(body.people) || body.people.length > 1000 || !Array.isArray(body.seeds) || body.seeds.length > 6) throw new InvalidInputError("Choose a publication, up to 1,000 public profiles, and up to six additional publications.");
  const domain = publicationDomain(body.domain);
  const people = body.people.map(value => {
    const person = obj(value);
    if (!handlePattern.test(text(person.handle)) || count(person.comments) === null || (count(person.comments) ?? 0) > 10000 || typeof person.author !== "boolean") throw new InvalidInputError("Invalid public profile signal.");
    const knownDomain = person.domain === null ? null : person.domain === undefined ? undefined : publicationDomain(text(person.domain));
    if (person.audience !== undefined && person.audience !== null && count(person.audience) === null) throw new InvalidInputError("Invalid audience count.");
    return { handle: text(person.handle).toLowerCase(), comments: count(person.comments)!, author: person.author, domain: knownDomain,
      name: text(person.name), publication: text(person.publication), description: text(person.description), audience: count(person.audience), audienceLabel: text(person.audienceLabel), photoUrl: url(person.photoUrl) };
  });
  const seeds = body.seeds.map(value => {
    if (typeof value !== "string" || value.length > 300) throw new InvalidInputError("Enter valid publication domains.");
    return publicationDomain(value);
  });
  return { domain, people: [...new Map(people.map(p => [p.handle, p])).values()], seeds: [...new Set(seeds)].filter(s => s !== domain) };
}

export async function discoverCollaborators(input: DiscoveryInput, getJson = publicJson): Promise<CollaborationScan> {
  const deadline = Date.now() + 65000;
  let stopped = false, requests = 0;
  const warnings: string[] = [];
  const read = async (target: string) => {
    if (stopped || Date.now() > deadline || requests >= 90) throw new UpstreamTransientError("Collaboration scan budget reached.");
    requests++;
    try { return await getJson(target); } catch (error) { if (error instanceof RateLimitedError) stopped = true; throw error; }
  };
  const participants = new Set(input.people.filter(p => !p.author).map(p => p.handle));
  const candidates = new Map<string, CollaborationCandidate>();
  const pending = new Map<string, Promise<void>>();
  const expansion = new Set<string>();
  const loadPublication = async (domain: string, profile: Obj, source: CollaborationCandidate["source"], relationship: number) => {
    if (domain === input.domain || candidates.has(domain)) return;
    const raw = await read(`https://${domain}/api/v1/archive?sort=new&limit=8`);
    if (!Array.isArray(raw)) throw new Error("Archive unavailable");
    const archive = raw.map(obj).slice(0, 8);
    const byline = obj(list(archive[0]?.publishedBylines)[0]);
    const pub = obj(profile.primaryPublication);
    const handle = text(profile.handle) || text(byline.handle);
    const posts: CollaborationPost[] = archive.map(p => ({ title: text(p.title) || "Untitled post", subtitle: text(p.subtitle) || text(p.description), url: url(p.canonical_url), date: text(p.post_date) || null, comments: count(p.comment_count) ?? 0, reactions: count(p.reaction_count) ?? 0 }));
    const candidate: CollaborationCandidate = {
      id: domain, domain, name: text(profile.name) || text(byline.name) || domain,
      publication: text(pub.name) || domain, description: text(pub.hero_text) || text(profile.bio),
      photoUrl: url(profile.photo_url) || url(byline.photo_url), profileUrl: handlePattern.test(handle) ? `https://substack.com/@${encodeURIComponent(handle)}` : null,
      audience: count(profile.subscriberCountNumber), audienceLabel: text(profile.subscriberCount) || null,
      source, relationship, posts, sharedParticipants: 0, sampledParticipants: 0, sourceParticipants: participants.size,
      evidence: [source === "community" ? "Visible in your publication's public community" : source === "seed" ? "Added for comparison" : "Discovered in another writer's public discussion"],
    };
    candidates.set(domain, candidate);
    const observed = new Set<string>();
    for (const p of archive.filter(p => (count(p.comment_count) ?? 0) > 0 && /^\d+$/.test(String(p.id))).slice(0, 2)) {
      try {
        const comments = obj(await read(`https://${domain}/api/v1/post/${p.id}/comments?all_comments=true&sort=best&limit=50`));
        if (!Array.isArray(comments.comments)) throw new Error("Comments unavailable");
        const visit = (items: unknown[], depth = 0) => {
          if (depth > 10) return;
          for (const value of items.slice(0, 50)) {
            const c = obj(value), h = text(c.handle) || text(c.user_slug);
            if (!c.deleted && !c.suppressed && handlePattern.test(h)) { observed.add(h.toLowerCase()); if (expansion.size < 100) expansion.add(h.toLowerCase()); }
            visit(list(c.children), depth + 1);
          }
        };
        visit(comments.comments);
      } catch { candidate.evidence.push("A public discussion sample was unavailable"); }
    }
    candidate.sampledParticipants = observed.size;
    candidate.sharedParticipants = [...observed].filter(h => participants.has(h)).length;
    if (candidate.sharedParticipants) candidate.evidence.push(`${candidate.sharedParticipants} shared public participants observed`);
  };
  const scanPublication = async (domain: string, profile: Obj, source: CollaborationCandidate["source"], relationship: number) => {
    let task = pending.get(domain);
    if (!task) { task = loadPublication(domain, profile, source, relationship); pending.set(domain, task); }
    await task;
    const candidate = candidates.get(domain);
    if (candidate) {
      candidate.relationship = Math.max(candidate.relationship, relationship);
      if (source === "community" && candidate.source !== "community") {
        candidate.source = source;
        candidate.evidence.push("Visible in your publication's public community");
      }
    }
  };
  const scanProfile = async (handle: string, source: CollaborationCandidate["source"], relationship: number) => {
    const profile = obj(await read(`https://substack.com/api/v1/user/${encodeURIComponent(handle)}/public_profile`));
    let pub = obj(profile.primaryPublication);
    if (!text(pub.subdomain) && !text(pub.custom_domain)) pub = obj(obj(list(profile.publicationUsers).find(u => obj(u).is_primary === true)).publication);
    if (!text(pub.subdomain) && !text(pub.custom_domain)) return;
    const domain = publicationDomain(text(pub.custom_domain) || `${text(pub.subdomain)}.substack.com`);
    await scanPublication(domain, { ...profile, primaryPublication: pub }, source, relationship);
  };
  const community = input.people.filter(p => !p.author && p.domain !== null && p.domain !== input.domain).sort((a, b) => Number(!!b.domain) - Number(!!a.domain) || b.comments - a.comments).slice(0, 18);
  const tasks = [
    ...input.seeds.map(domain => async () => {
      const raw = await read(`https://${domain}/api/v1/archive?sort=new&limit=1`);
      const byline = obj(list(obj(list(raw)[0]).publishedBylines)[0]);
      const handle = text(byline.handle);
      let profile = byline;
      if (handlePattern.test(handle)) { try { profile = obj(await read(`https://substack.com/api/v1/user/${encodeURIComponent(handle)}/public_profile`)); } catch { /* The archive can still provide evidence. */ } }
      await scanPublication(domain, profile, "seed", 0);
    }),
    ...community.map(person => () => person.domain ? scanPublication(person.domain, {
      name: person.name, handle: person.handle, photo_url: person.photoUrl, subscriberCountNumber: person.audience, subscriberCount: person.audienceLabel,
      primaryPublication: { name: person.publication, hero_text: person.description },
    }, "community", person.comments) : scanProfile(person.handle, "community", person.comments)),
  ];
  const results = await pooledMap(tasks, task => task(), { concurrency: 3 });
  const failed = results.filter(r => r.status === "rejected").length;
  if (failed) warnings.push(`${failed} profile or publication scans were unavailable.`);
  const checked = new Set([...input.people.map(p => p.handle), ...candidates.values()].flatMap(v => typeof v === "string" ? [v] : v.profileUrl ? [v.profileUrl.split("@")[1]] : []));
  const extended = [...expansion].filter(h => !checked.has(h)).slice(0, 6);
  const extendedResults = await pooledMap(extended, handle => scanProfile(handle, "extended", 0), { concurrency: 2 });
  if (extendedResults.some(r => r.status === "rejected")) warnings.push("Some extended-network profiles could not be checked.");
  if (stopped) warnings.push("Substack rate limited this scan. Further requests were stopped.");
  if (Date.now() > deadline || requests >= 90) warnings.push("The scan reached its request budget; results are partial.");
  if (input.people.length > 18) warnings.push("Community discovery sampled the 18 most active eligible profiles; add publications to explore further.");
  return { candidates: [...candidates.values()], warnings, requests, scannedAt: new Date().toISOString() };
}
