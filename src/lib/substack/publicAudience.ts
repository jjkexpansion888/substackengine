import { ProfileAccessRequiredError, PublicAccessRequiredError, UpstreamChangeError, UpstreamTransientError } from "./errors";

type Profile = Record<string, unknown>;
export type ProfileIdentity = { id?: string; handle?: string | null };
const record = (value: unknown): Profile => value && typeof value === "object" && !Array.isArray(value) ? value as Profile : {};
const handleOf = (value: unknown): string | null => typeof value === "string" && /^[a-z0-9_-]{1,100}$/i.test(value) ? value.toLowerCase() : null;

export function audienceFromProfile(profile: Profile) {
  const label = [profile.subscriberCount, profile.subscriberCountString].find(value => typeof value === "string" && value.trim());
  let count = typeof profile.subscriberCountNumber === "number" && Number.isSafeInteger(profile.subscriberCountNumber) && profile.subscriberCountNumber >= 0 ? profile.subscriberCountNumber : null;
  const match = typeof label === "string" ? /^([\d,]+(?:\.\d+)?)\s*([km])?\+?(?:\s+subscribers?)?$/i.exec(label.trim()) : null;
  if (count === 0 && typeof label === "string") count = null;
  if (count === null) {
    if (match) {
      const value = Number(match[1].replaceAll(",", "")) * (match[2]?.toLowerCase() === "k" ? 1000 : match[2]?.toLowerCase() === "m" ? 1000000 : 1);
      if (Number.isSafeInteger(value) && value >= 0) count = value;
    }
  }
  return { audience: count, audienceLabel: match && typeof label === "string" ? label : null };
}

export function profileFromPage(html: string, identity: ProfileIdentity): Profile {
  // Parse only the profile owner's preload, never another user or recommendation's count.
  const match = /window\._preloads\s*=\s*JSON\.parse\(\s*("(?:\\.|[^"\\])*")\s*\)/.exec(html);
  if (!match) throw new UpstreamChangeError("Public profile page format changed.");
  let profile: Profile;
  try { profile = record(record(JSON.parse(JSON.parse(match[1]))).profile); }
  catch { throw new UpstreamChangeError("Public profile data could not be read."); }
  if (identity.id ? String(profile.id) !== identity.id : handleOf(profile.handle) !== handleOf(identity.handle)) throw new UpstreamChangeError("Public profile identity did not match this subscriber.");
  return profile;
}

export async function lookupPublicAudience(identity: ProfileIdentity, getJson: (url: string) => Promise<unknown>, getPage?: (url: string) => Promise<string>) {
  let profile: Profile = {};
  const handle = handleOf(identity.handle);
  if (handle) {
    try { profile = record(await getJson(`https://substack.com/api/v1/user/${encodeURIComponent(handle)}/public_profile`)); }
    catch (error) { if (!(error instanceof UpstreamTransientError) || !getPage) throw error; }
    if (profile.id !== undefined && identity.id && String(profile.id) !== identity.id) throw new UpstreamChangeError("Public profile identity did not match this subscriber.");
  }
  if (getPage && (!handle || audienceFromProfile(profile).audience === null)) {
    const path = handle ? `@${encodeURIComponent(handle)}` : /^\d{1,30}$/.test(identity.id ?? "") ? `profile/${identity.id}` : null;
    if (!path) throw new UpstreamChangeError("No usable public profile identity.");
    try {
      const apiId = /^\d{1,30}$/.test(String(profile.id)) ? String(profile.id) : undefined;
      const pageProfile = profileFromPage(await getPage(`https://substack.com/${path}`), { ...identity, id: identity.id ?? apiId });
      profile = { ...profile, ...pageProfile };
    } catch (error) {
      if (error instanceof PublicAccessRequiredError && (profile.id !== undefined || handleOf(profile.handle) === handle && handle)) throw new ProfileAccessRequiredError("This profile's count requires browser access.", { cause: error });
      throw error;
    }
  }
  const audience = audienceFromProfile(profile);
  return { ...audience, profile, handle: handleOf(profile.handle) ?? handle, status: audience.audience !== null || audience.audienceLabel ? "public" as const : "not_public" as const };
}
