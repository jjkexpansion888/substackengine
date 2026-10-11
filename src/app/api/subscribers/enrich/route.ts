import { pooledMap } from "@/lib/substack/concurrency";
import { ProfileAccessRequiredError, PublicAccessRequiredError, RateLimitedError } from "@/lib/substack/errors";
import { publicJson, publicPage } from "@/lib/substack/publicRadar";
import { lookupPublicAudience, type ProfileIdentity } from "@/lib/substack/publicAudience";
import { cachedPublicAudience, rememberPublicAudience } from "@/lib/substack/publicAudienceCache";

export const maxDuration = 90;

export async function POST(request: Request): Promise<Response> {
  let body: { handles?: unknown; identities?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: { message: "Choose a valid batch of subscriber handles." } }, { status: 400 }); }
  const input = body?.identities ?? (Array.isArray(body?.handles) ? body.handles.map(handle => ({ handle })) : null);
  const valid = (value: unknown): value is ProfileIdentity => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const identity = value as ProfileIdentity;
    return (identity.id === undefined || typeof identity.id === "string" && /^\d{1,30}$/.test(identity.id)) && (identity.handle === undefined || identity.handle === null || typeof identity.handle === "string" && /^[a-z0-9_-]{1,100}$/i.test(identity.handle)) && Boolean(identity.id || identity.handle);
  };
  if (!Array.isArray(input) || !input.length || input.length > 50 || !input.every(valid)) return Response.json({ error: { message: "Each batch supports 1 to 50 valid Substack identities." } }, { status: 400 });
  const identities = [...new Map(input.map(identity => [identity.id ?? identity.handle!.toLowerCase(), identity])).values()];
  const deadline = Date.now() + 60000;
  let stopped = false;
  let accessFailures = 0;
  let stopReason: "rate_limited" | "browser_required" | null = null;
  const guarded = async <T,>(operation: () => Promise<T>): Promise<T> => {
    if (stopped || Date.now() > deadline) throw new Error("Lookup budget reached");
    try { return await operation(); } catch (error) { if (error instanceof RateLimitedError) { stopped = true; stopReason = "rate_limited"; } throw error; }
  };
  const results = await pooledMap(identities, async identity => {
    const cached = cachedPublicAudience(identity);
    if (cached) return { id: identity.id, handle: cached.handle, status: cached.publicAudience.count === null ? "not_public" as const : "public" as const, audience: cached.publicAudience.count, audienceLabel: cached.publicAudience.label, bestseller: cached.publicAudience.bestseller };
    if (stopped || Date.now() > deadline) return { ...identity, status: "unavailable" as const, attempted: false };
    try {
      const result = await lookupPublicAudience(identity, url => guarded(() => publicJson(url)), url => guarded(() => publicPage(url)));
      rememberPublicAudience({ id: identity.id, handle: result.handle, publicAudience: { count: result.audience, label: result.audienceLabel, bestseller: Number(result.profile.bestseller_tier) > 0 } });
      accessFailures = 0;
      return { id: identity.id, handle: result.handle, status: result.status, audience: result.audience, audienceLabel: result.audienceLabel, bestseller: typeof result.profile.bestseller_tier === "number" && result.profile.bestseller_tier > 0, attempted: true };
    } catch (error) {
      if (error instanceof RateLimitedError) { stopped = true; stopReason = "rate_limited"; }
      // One restricted profile is not evidence that every other profile is restricted.
      // Repeated access checks still stop the scan; never retry via another transport.
      if (error instanceof PublicAccessRequiredError && !(error instanceof ProfileAccessRequiredError) && ++accessFailures >= 3) { stopped = true; stopReason = "browser_required"; }
      return { ...identity, status: "unavailable" as const, attempted: true };
    }
  }, { concurrency: 2 });
  return Response.json({ profiles: results.flatMap(r => r.status === "fulfilled" ? [r.value] : []), stopped, stopReason });
}
