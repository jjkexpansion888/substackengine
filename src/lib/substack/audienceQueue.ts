import type { PublicPerson } from "./publicRadar";

export type EnrichedAudience = { id?: string; handle?: string | null; status: PublicPerson["audienceStatus"]; audience?: number | null; audienceLabel?: string | null; bestseller?: boolean; attempted?: boolean };

export function pendingAudienceProfiles(people: PublicPerson[], attempted: ReadonlySet<string>): PublicPerson[] {
  return people.filter(p => p.role === "Reader" && p.membership === "Subscriber" && p.audience === null && !attempted.has(p.id) && (p.handle || /^\d{1,30}$/.test(p.id)) && (p.audienceStatus === "unavailable" || !p.handle));
}

export function mergeAudienceResults(people: PublicPerson[], results: EnrichedAudience[]): PublicPerson[] {
  const byId = new Map(results.filter(p => p.id).map(p => [p.id, p]));
  const byHandle = new Map(results.filter(p => p.handle).map(p => [p.handle!.toLowerCase(), p]));
  return people.map(person => {
    const result = byId.get(person.id) ?? (person.handle ? byHandle.get(person.handle.toLowerCase()) : undefined);
    if (!result) return person;
    if (/^\d+$/.test(person.id) && result.id !== person.id) return person;
    if (person.audience !== null && result.audience == null) return person;
    const handle = result.handle ?? person.handle;
    return { ...person, handle, profileUrl: handle ? `https://substack.com/@${encodeURIComponent(handle)}` : person.profileUrl,
      audienceStatus: result.status, audience: result.audience ?? person.audience, audienceLabel: result.audienceLabel ?? person.audienceLabel, bestseller: result.bestseller ?? person.bestseller };
  });
}
