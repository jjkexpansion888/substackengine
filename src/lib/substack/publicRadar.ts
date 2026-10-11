import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { get } from "node:https";
import { InvalidInputError, PublicAccessRequiredError, RateLimitedError, UpstreamChangeError, UpstreamTransientError } from "./errors";
import { pooledMap } from "./concurrency";
import { parseSubscriberImport, subscriberProfileHandle, type SubscriberCoverage, type SubscriberEvidence, type SubscriberImport } from "./subscriberRanking";
import { lookupPublicAudience } from "./publicAudience";
import { cachedPublicAudience, rememberPublicAudience } from "./publicAudienceCache";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const str = (v: unknown): string | null => typeof v === "string" && v.trim() ? v : null;
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const safeUrl = (v: unknown): string | null => { try { const u = new URL(String(v)); return u.protocol === "https:" ? u.href : null; } catch { return null; } };

export type PublicPerson = { id: string; name: string; handle: string | null; photoUrl: string | null; role: "Author" | "Reader"; membership: "Subscriber" | "Public participant"; subscriberEvidence: SubscriberEvidence; comments: number; audience: number | null; audienceLabel: string | null; audienceStatus: "unavailable" | "public" | "not_public"; profileUrl: string | null; publicationName: string | null; bestseller: boolean; publicationDomain?: string | null; publicationDescription?: string | null };
export type PublicRadar = { domain: string; name: string; description: string | null; logoUrl: string | null; scannedAt: string; postsScanned: number; warnings: string[]; subscriberCoverage: SubscriberCoverage; people: PublicPerson[]; posts: { id: string; title: string; url: string | null; date: string | null; comments: number; reactions: number; image: string | null }[] };

export function publicationDomain(input: string): string {
  const text = input.trim().toLowerCase();
  const candidate = /^[a-z0-9][a-z0-9-]*$/.test(text) ? `${text}.substack.com` : text;
  let url: URL;
  try { url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`); } catch { throw new InvalidInputError("Enter a Substack domain or publication URL."); }
  if (!['https:', 'http:'].includes(url.protocol) || url.port || url.username || url.password || isIP(url.hostname) || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(url.hostname)) throw new InvalidInputError("Enter a public publication domain, such as lenny.substack.com.");
  return url.hostname;
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address);
}

async function publicResponse(url: string, accept: string): Promise<Response> {
  for (let redirects = 0; redirects < 4; redirects++) {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.port || target.username || target.password) throw new InvalidInputError("Publication must use a public HTTPS address.");
    const addresses = await lookup(target.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new InvalidInputError("Publication must use a public internet address.");
    // Pin the validated address so a DNS change cannot redirect a scan into the local network.
    const response = await new Promise<Response>((resolve, reject) => {
      const request = get(url, {
        headers: { "user-agent": "Mozilla/5.0", accept },
        signal: AbortSignal.timeout(12000),
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        },
      }, incoming => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        incoming.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 5 * 1024 * 1024) request.destroy(new UpstreamChangeError("Public response exceeded the scan limit."));
          else chunks.push(chunk);
        });
        incoming.on("error", reject);
        incoming.on("end", () => {
          const status = incoming.statusCode ?? 502;
          resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks).toString("utf8"), { status, headers: incoming.headers.location ? { location: incoming.headers.location } : {} }));
        });
      });
      request.on("error", reject);
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new UpstreamChangeError("Missing redirect location.");
      url = new URL(location, url).href;
      continue;
    }
    if (response.status === 429) throw new RateLimitedError("Substack is rate limiting requests. Try again shortly.");
    if (response.status === 401 || response.status === 403) throw new PublicAccessRequiredError("Substack requires browser access to this public list.");
    if (!response.ok) throw new UpstreamTransientError("Public data is unavailable for this publication.");
    return response;
  }
  throw new UpstreamChangeError("Too many publication redirects.");
}

export async function publicJson(url: string): Promise<unknown> {
  try { return await (await publicResponse(url, "application/json")).json(); }
  catch (error) { if (error instanceof SyntaxError) throw new UpstreamChangeError("This domain did not return a Substack archive."); throw error; }
}

export async function publicPage(url: string): Promise<string> {
  return (await publicResponse(url, "text/html")).text();
}

export async function discoverPublicRadar(input: string, getJson = publicJson, browserImport?: SubscriberImport, getPage = getJson === publicJson ? publicPage : undefined): Promise<PublicRadar> {
  const deadline = Date.now() + 75000;
  let rateLimited = false;
  const read = async (url: string): Promise<unknown> => {
    if (rateLimited || Date.now() >= deadline) throw new UpstreamTransientError("Scan request budget reached.");
    try { return await getJson(url); } catch (error) { if (error instanceof RateLimitedError) rateLimited = true; throw error; }
  };
  const text = input.trim();
  let domain: string;
  let profilePublication: Obj = {};
  let resolvedProfile: Obj = {};
  let handle: string | null = null;
  if (text.startsWith("@")) {
    handle = text.slice(1);
  } else {
    domain = publicationDomain(text);
    if (domain === "substack.com" || domain === "www.substack.com") {
      const url = new URL(text.includes("://") ? text : `https://${text}`);
      const match = /^\/@([a-z0-9_-]+)\/?$/i.exec(url.pathname);
      if (!match) throw new InvalidInputError("Enter a publication domain or a Substack profile URL such as substack.com/@yourhandle.");
      handle = match[1];
    }
  }
  if (handle !== null) {
    if (!/^[a-z0-9_-]+$/i.test(handle)) throw new InvalidInputError("Enter a valid Substack profile handle.");
    const profile = obj(await read(`https://substack.com/api/v1/user/${encodeURIComponent(handle.toLowerCase())}/public_profile`));
    resolvedProfile = profile;
    profilePublication = obj(profile.primaryPublication);
    if (!str(profilePublication.subdomain) && !str(profilePublication.custom_domain)) {
      const primary = arr(profile.publicationUsers).map(obj).find(user => user.is_primary === true);
      profilePublication = obj(primary?.publication);
    }
    const customDomain = str(profilePublication.custom_domain);
    const subdomain = str(profilePublication.subdomain);
    if (!customDomain && !subdomain) throw new InvalidInputError("This profile has no primary publication. Enter the publication's own domain instead.");
    domain = publicationDomain(customDomain ?? `${subdomain}.substack.com`);
  } else {
    domain = publicationDomain(text);
  }
  const origin = `https://${domain}`;
  const warnings: string[] = [];
  const posts: Obj[] = [];
  const postIds = new Set<number>();
  const postLimit = 50;
  const pageSize = 25;
  for (let offset = 0; posts.length < postLimit; offset += pageSize) {
    try {
      const raw = await read(`${origin}/api/v1/archive?sort=new&limit=${pageSize}&offset=${offset}`);
      if (!Array.isArray(raw)) throw new UpstreamChangeError("This domain did not return a Substack archive.");
      const before = posts.length;
      for (const post of raw.map(obj)) {
        const id = num(post.id);
        if (id === null || postIds.has(id)) continue;
        postIds.add(id);
        posts.push(post);
        if (posts.length === postLimit) break;
      }
      // Also stop when an upstream server ignores offsets and repeats a page.
      if (raw.length < pageSize || posts.length === before) break;
    } catch (error) {
      if (!posts.length) throw error;
      warnings.push(`The archive scan stopped after ${posts.length} posts. Earlier results were retained.`);
      break;
    }
  }
  const people = new Map<string, PublicPerson>();
  let publication: Obj = profilePublication;
  const addPerson = (raw: Obj, role: PublicPerson['role'], evidence: SubscriberEvidence = "none") => {
    const metadata = obj(raw.metadata);
    const handle = str(raw.handle) ?? str(raw.user_slug);
    const rawId = str(raw.id) ?? (num(raw.id) !== null ? String(raw.id) : null);
    const id = rawId ?? (handle ? `handle:${handle.toLowerCase()}` : null);
    if (!id) return;
    const member = str(metadata.membership_state);
    const isSubscriber = evidence === "public_list" || evidence === "browser_list" || evidence === "owner_list" || member === "subscribed" || member === "free_signup";
    const source = evidence !== "none" ? evidence : isSubscriber ? "comment" : "none";
    const existing = people.get(id) ?? [...people.values()].find(p => handle && p.handle?.toLowerCase() === handle.toLowerCase());
    if (existing) {
      if (role === "Reader" && evidence === "none") existing.comments++;
      if (role === "Author") existing.role = role;
      if (isSubscriber) existing.membership = "Subscriber";
      if (source === "owner_list" || ((source === "public_list" || source === "browser_list") && existing.subscriberEvidence !== "owner_list") || existing.subscriberEvidence === "none") existing.subscriberEvidence = source;
      if (!existing.handle && handle) { existing.handle = handle; existing.audienceStatus = "unavailable"; }
      if (handle) existing.profileUrl ??= `https://substack.com/@${encodeURIComponent(handle)}`;
      return;
    }
    people.set(id, { id, name: str(raw.name) ?? "Unnamed reader", handle, photoUrl: safeUrl(raw.photo_url), role,
      membership: isSubscriber ? "Subscriber" : "Public participant", subscriberEvidence: source,
      comments: role === "Reader" && evidence === "none" ? 1 : 0, audience: null, audienceLabel: null, audienceStatus: "unavailable",
      profileUrl: handle ? `https://substack.com/@${encodeURIComponent(handle)}` : null,
      publicationName: str(obj(metadata.author_on_other_pub).name) ?? str(raw.primaryPublicationName),
      bestseller: (num(raw.bestseller_tier ?? raw.user_bestseller_tier) ?? 0) > 0 });
  };
  for (const post of posts) for (const byline of arr(post.publishedBylines).map(obj)) {
    for (const user of arr(byline.publicationUsers).map(obj)) { const pub = obj(user.publication); if (pub.id === post.publication_id) publication = pub; }
    addPerson(byline, "Author");
  }
  const subscriberCoverage: SubscriberCoverage = {
    status: "unavailable", source: "comments", profileUrl: null, hiddenCount: null, totalCount: null, totalLabel: null,
    discovered: 0, enriched: 0, capturedAt: new Date().toISOString(),
  };
  const authorId = publication.primary_user_id ?? publication.author_id ?? resolvedProfile.id;
  let authorProfile = resolvedProfile;
  if (!str(authorProfile.handle) && authorId !== undefined) {
    const byline = posts.flatMap(post => arr(post.publishedBylines).map(obj)).find(user => String(user.id) === String(authorId));
    if (byline && str(byline.handle)) authorProfile = byline;
  }
  if (!str(authorProfile.handle) && (typeof authorId === "number" || typeof authorId === "string")) {
    try { authorProfile = obj(await read(`https://substack.com/api/v1/user/${encodeURIComponent(String(authorId))}/public_profile`)); } catch { /* Public discussions remain usable when an author profile is unavailable. */ }
  }
  if (str(authorProfile.handle) && authorProfile !== resolvedProfile) {
    try { authorProfile = { ...authorProfile, ...obj(await read(`https://substack.com/api/v1/user/${encodeURIComponent(String(authorProfile.handle))}/public_profile`)) }; } catch { /* Known byline identity still supports browser imports. */ }
  }
  subscriberCoverage.totalCount = num(authorProfile.subscriberCountNumber);
  subscriberCoverage.totalLabel = str(authorProfile.subscriberCount);
  const authorHandle = str(authorProfile.handle);
  if (authorHandle) subscriberCoverage.profileUrl = `https://substack.com/@${encodeURIComponent(authorHandle)}/subscribers`;
  if (browserImport) {
    const imported = parseSubscriberImport(browserImport);
    if (imported.version === 2 ? new URL(imported.sourceUrl).hostname !== domain : !authorHandle || subscriberProfileHandle(imported.sourceUrl) !== authorHandle.toLowerCase()) throw new InvalidInputError("This subscriber export belongs to a different creator. Open the matching publication first.");
    for (const subscriber of imported.subscribers) {
      addPerson(subscriber, "Reader", imported.version === 2 ? "owner_list" : "browser_list");
      const person = subscriber.id ? people.get(subscriber.id) : undefined;
      if (person && subscriber.publicAudience) {
        person.audience = subscriber.publicAudience.count;
        person.audienceLabel = subscriber.publicAudience.label;
        person.bestseller = subscriber.publicAudience.bestseller;
        person.audienceStatus = person.audience === null ? "not_public" : "public";
      }
    }
    subscriberCoverage.status = "available";
    subscriberCoverage.source = imported.version === 2 ? "owner_session" : "browser_list";
    if (imported.version === 2) {
      subscriberCoverage.totalCount = imported.totalCount ?? null;
      subscriberCoverage.totalLabel = imported.totalCount?.toLocaleString("en-US") ?? null;
      if ((imported.rowsRead ?? 0) < (imported.totalCount ?? 0)) warnings.push(`The owner export read ${imported.rowsRead} of ${imported.totalCount} subscriber rows. It is incomplete.`);
      if ((imported.rowsRead ?? 0) > imported.subscribers.length) warnings.push("Some owner rows had no usable Substack user ID and could not be ranked.");
    }
    subscriberCoverage.capturedAt = imported.capturedAt;
  } else if (num(authorProfile.id) !== null) {
    try {
      const body = obj(await read(`https://substack.com/api/v1/user/${authorProfile.id}/subscriber-lists?lists=subscribers`));
      if (!Array.isArray(body.subscriberLists)) throw new UpstreamChangeError("Substack's subscriber-list response changed.");
      let loaded = 0;
      for (const list of body.subscriberLists.map(obj)) for (const group of arr(list.groups).map(obj)) for (const value of arr(group.users)) {
        if (loaded >= 1000) break;
        const person = obj(value);
        addPerson(person.user ? obj(person.user) : person, "Reader", "public_list");
        loaded++;
      }
      subscriberCoverage.status = "available";
      subscriberCoverage.source = "public_list";
      subscriberCoverage.hiddenCount = num(body.hiddenSubscriberCount);
      if (loaded >= 1000) warnings.push("The subscriber scan is limited to 1,000 public profiles.");
    } catch (error) {
      subscriberCoverage.status = error instanceof PublicAccessRequiredError ? "browser_required" : "unavailable";
    }
  }
  const commentResults = await pooledMap(posts, async post => {
    if (!num(post.comment_count)) return;
    const body = obj(await read(`${origin}/api/v1/post/${post.id}/comments?all_comments=true&sort=best&limit=50`));
    if (!Array.isArray(body.comments)) throw new UpstreamChangeError("Comments unavailable.");
    const visit = (items: unknown[], depth = 0) => {
      if (depth > 20) return;
      for (const value of items) { const comment = obj(value); if (!comment.deleted && !comment.suppressed) addPerson({ ...comment, id: comment.user_id }, "Reader"); visit(arr(comment.children), depth + 1); }
    };
    visit(body.comments.slice(0, 50));
  }, { concurrency: 2 });
  const failed = commentResults.filter(r => r.status === "rejected").length;
  if (failed) warnings.push(`Comments on ${failed} posts were unavailable. Results cover the accessible discussions.`);
  if (browserImport?.version === 2 && (browserImport.rowsRead ?? 0) >= (browserImport.totalCount ?? Infinity) && browserImport.subscribers.length === browserImport.rowsRead) {
    for (const person of people.values()) {
      if (person.role === "Reader" && person.subscriberEvidence !== "owner_list") { person.membership = "Public participant"; person.subscriberEvidence = "none"; }
    }
  }
  if (getJson === publicJson) for (const person of people.values()) {
    const cached = cachedPublicAudience({ id: /^\d{1,30}$/.test(person.id) ? person.id : undefined, handle: person.handle });
    if (!cached || person.audience !== null) continue;
    person.handle = cached.handle;
    person.profileUrl = `https://substack.com/@${cached.handle}`;
    person.audience = cached.publicAudience.count;
    person.audienceLabel = cached.publicAudience.label;
    person.bestseller ||= cached.publicAudience.bestseller;
    person.audienceStatus = person.audience === null ? "not_public" : "public";
  }
  const candidates = [...people.values()].filter(p => p.audienceStatus === "unavailable" && (p.handle || (getPage && /^\d{1,30}$/.test(p.id)))).sort((a, b) => Number(b.membership === "Subscriber" && b.role === "Reader") - Number(a.membership === "Subscriber" && a.role === "Reader"));
  const profiles = await pooledMap(candidates.slice(0, 100), async person => {
    const result = await lookupPublicAudience({ id: /^\d{1,30}$/.test(person.id) ? person.id : undefined, handle: person.handle }, read, getPage ? async url => {
      if (rateLimited || Date.now() >= deadline) throw new UpstreamTransientError("Scan request budget reached.");
      try { return await getPage(url); } catch (error) { if (error instanceof RateLimitedError) rateLimited = true; throw error; }
    } : undefined);
    const profile = result.profile;
    person.handle = result.handle ?? person.handle;
    if (person.handle) person.profileUrl = `https://substack.com/@${encodeURIComponent(person.handle)}`;
    person.audience = result.audience;
    person.audienceLabel = result.audienceLabel;
    person.audienceStatus = result.status;
    person.bestseller ||= (num(profile.bestseller_tier) ?? 0) > 0;
    if (getJson === publicJson) rememberPublicAudience({ id: /^\d{1,30}$/.test(person.id) ? person.id : undefined, handle: person.handle, publicAudience: { count: person.audience, label: person.audienceLabel, bestseller: person.bestseller } });
    person.publicationName ??= str(obj(profile.primaryPublication).name);
    let primary = obj(profile.primaryPublication);
    if (!str(primary.subdomain) && !str(primary.custom_domain)) primary = obj(arr(profile.publicationUsers).map(obj).find(p => p.is_primary === true)?.publication);
    const primaryAddress = str(primary.custom_domain) ?? (str(primary.subdomain) ? `${primary.subdomain}.substack.com` : null);
    person.publicationDomain = null;
    if (primaryAddress) { try { person.publicationDomain = publicationDomain(primaryAddress); } catch { /* Ignore unusable publication metadata. */ } }
    person.publicationDescription = str(primary.hero_text) ?? str(profile.bio);
  }, { concurrency: 2 });
  if (profiles.some(r => r.status === "rejected")) warnings.push("Some public audience sizes could not be retrieved.");
  if (rateLimited) warnings.push("Substack rate limited this scan. Further requests were stopped; try refreshing later.");
  if (candidates.length > 100) warnings.push("Additional subscriber audience lookups are available in the ranking view.");
  const subscribers = [...people.values()].filter(p => p.role === "Reader" && p.membership === "Subscriber");
  subscriberCoverage.discovered = subscribers.length;
  subscriberCoverage.enriched = subscribers.filter(p => p.handle && p.audienceStatus !== "unavailable").length;
  return { domain, name: str(publication.name) ?? domain, description: str(publication.hero_text), logoUrl: safeUrl(publication.logo_url) ?? safeUrl(authorProfile.photo_url), scannedAt: new Date().toISOString(), postsScanned: posts.length, warnings, subscriberCoverage,
    people: [...people.values()].sort((a, b) => (b.audience ?? -1) - (a.audience ?? -1) || b.comments - a.comments || a.name.localeCompare(b.name)),
    posts: posts.map(p => ({ id: String(p.id), title: str(p.title) ?? "Untitled post", url: safeUrl(p.canonical_url), date: str(p.post_date), comments: num(p.comment_count) ?? 0, reactions: num(p.reaction_count) ?? 0, image: safeUrl(p.cover_image) })) };
}
