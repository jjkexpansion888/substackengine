import { audienceFromProfile, lookupPublicAudience } from "./publicAudience";
import { rememberPublicAudience } from "./publicAudienceCache";
import { publicJson, publicPage } from "./publicRadar";
import { RateLimitedError, PublicAccessRequiredError, ProfileAccessRequiredError, UpstreamChangeError } from "./errors";

export type AccountCandidate = { id: string; handle: string; name: string; bio: string; publication: string | null; score: number; evidence: string; audience: number | null; audienceLabel: string | null; verified: boolean };
export type AccountSearchResult = { id: string; name: string; status: "found" | "no_matches" | "unavailable" | "unattempted"; candidates: AccountCandidate[] };
const normalized = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function nameSimilarity(a: string, b: string): number {
  const left = normalized(a), right = normalized(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const x = new Set(left.split(" ")), y = new Set(right.split(" "));
  const common = [...x].filter(token => y.has(token)).length;
  const overlap = 2 * common / (x.size + y.size);
  const pairs = (text: string) => new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, i) => text.slice(i, i + 2)));
  const p = pairs(left), q = pairs(right);
  const dice = p.size + q.size ? 2 * [...p].filter(token => q.has(token)).length / (p.size + q.size) : 0;
  return Math.max(overlap, dice * 0.85);
}
export function candidateProfiles(value: unknown, name: string, withAudience = false): AccountCandidate[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { results?: unknown }).results)) throw new UpstreamChangeError("Substack profile search format changed.");
  const results = (value as { results: unknown[] }).results;
  const candidates = new Map<string, AccountCandidate>();
  for (const raw of results.slice(0, 100)) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const id = typeof p.id === "string" ? p.id : typeof p.id === "number" && Number.isSafeInteger(p.id) ? String(p.id) : "";
    if (!/^\d{1,30}$/.test(id) || typeof p.handle !== "string" || !/^[a-z0-9_-]{1,100}$/i.test(p.handle) || typeof p.name !== "string" || p.profile_disabled === true) continue;
    const score = nameSimilarity(name, p.name);
    if (score < 0.55) continue;
    const pub = p.primaryPublication as { name?: unknown } | undefined;
    const audience = withAudience ? audienceFromProfile(p) : { audience: null, audienceLabel: null };
    candidates.set(id, { id, handle: p.handle.toLowerCase(), name: p.name.slice(0, 300), bio: typeof p.bio === "string" ? p.bio.slice(0, 500) : "", publication: typeof pub?.name === "string" ? pub.name.slice(0, 300) : null, score, evidence: score === 1 ? "Exact name; subscriber identity inferred" : "Similar name; subscriber identity inferred", ...audience, verified: false });
  }
  return [...candidates.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 3);
}

const cache = new Map<string, { at: number; candidates: AccountCandidate[] }>();
export async function findAccountCandidates(name: string, getJson = publicJson, getPage = publicPage, deadline = Date.now() + 60000, enrich = true): Promise<AccountCandidate[]> {
  const key = `${enrich ? "audience" : "search"}:${normalized(name)}`;
  const cached = getJson === publicJson ? cache.get(key) : undefined;
  if (cached && Date.now() - cached.at < 15 * 60000) return cached.candidates;
  const guard = () => { if (Date.now() > deadline) throw new Error("Name lookup time limit reached."); };
  guard();
  const candidates = candidateProfiles(await getJson(`https://substack.com/api/v1/profile/search?query=${encodeURIComponent(name)}&page=0`), name, !enrich);
  // Search fields are scoped to each validated public profile ID, not the CSV identity.
  if (!enrich && getJson === publicJson) for (const candidate of candidates) {
    if (candidate.audience !== null && candidate.audience > 0) rememberPublicAudience({ id: candidate.id, handle: candidate.handle, publicAudience: { count: candidate.audience, label: candidate.audienceLabel, bestseller: false } });
  }
  for (const candidate of enrich ? candidates : []) {
    guard();
    try {
      const profile = await lookupPublicAudience({ id: candidate.id, handle: candidate.handle }, async url => { guard(); return getJson(url); }, async url => { guard(); return getPage(url); });
      candidate.handle = profile.handle ?? candidate.handle;
      candidate.audience = profile.audience;
      candidate.audienceLabel = profile.audienceLabel;
      candidate.verified = true;
    } catch (error) {
      if (error instanceof RateLimitedError || error instanceof PublicAccessRequiredError && !(error instanceof ProfileAccessRequiredError)) throw error;
    }
  }
  if (getJson === publicJson) {
    if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), candidates });
  }
  return candidates;
}
