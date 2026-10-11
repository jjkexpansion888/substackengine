import type { PublicRadar } from "./publicRadar";
import { parseSubscriberImport, type SubscriberImport } from "./subscriberRanking";

const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid saved scan.");
  return value as Record<string, unknown>;
};
const text = (value: unknown, nullable = false): string | null => {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length > 10000) throw new Error("Invalid saved text.");
  return value;
};
const number = (value: unknown, nullable = false): number | null => {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid saved count.");
  return value;
};
const choice = <T extends string>(value: unknown, choices: readonly T[]): T => {
  if (!choices.includes(value as T)) throw new Error("Invalid saved status.");
  return value as T;
};
const url = (value: unknown): string | null => {
  const result = text(value, true);
  if (result !== null && (new URL(result).protocol !== "https:" || new URL(result).username || new URL(result).password)) throw new Error("Invalid saved URL.");
  return result;
};
export function savedRadarDomain(value: unknown): string {
  if (typeof value !== "string" || value.length > 253 || !domainPattern.test(value)) throw new Error("Invalid publication domain.");
  return value;
}
export type SavedRadar = { version: 1; radar: PublicRadar; subscriberImport?: SubscriberImport };

export function parseSavedRadar(value: unknown): SavedRadar {
  const data = object(value);
  const source = object(data.radar);
  const coverage = object(source.subscriberCoverage);
  if (!Array.isArray(source.people) || source.people.length > 20000 || !Array.isArray(source.posts) || source.posts.length > 100 || !Array.isArray(source.warnings) || source.warnings.length > 100) throw new Error("Invalid saved scan size.");
  const radar: PublicRadar = {
    domain: savedRadarDomain(source.domain), name: text(source.name)!, description: text(source.description, true), logoUrl: url(source.logoUrl), scannedAt: text(source.scannedAt)!, postsScanned: number(source.postsScanned)!, warnings: source.warnings.map(w => text(w)!),
    subscriberCoverage: { status: choice(coverage.status, ["available", "browser_required", "unavailable"]), source: choice(coverage.source, ["public_list", "browser_list", "owner_session", "file_import", "comments"]), profileUrl: url(coverage.profileUrl), hiddenCount: number(coverage.hiddenCount, true), totalCount: number(coverage.totalCount, true), totalLabel: text(coverage.totalLabel, true), discovered: number(coverage.discovered)!, enriched: number(coverage.enriched)!, capturedAt: text(coverage.capturedAt)! },
    people: source.people.map(value => {
      const p = object(value);
      if (typeof p.bestseller !== "boolean") throw new Error("Invalid saved badge.");
      return { id: text(p.id)!, name: text(p.name)!, handle: text(p.handle, true), photoUrl: url(p.photoUrl), role: choice(p.role, ["Author", "Reader"]), membership: choice(p.membership, ["Subscriber", "Public participant"]), subscriberEvidence: choice(p.subscriberEvidence, ["public_list", "browser_list", "owner_list", "file_list", "comment", "none"]), comments: number(p.comments)!, audience: number(p.audience, true), audienceLabel: text(p.audienceLabel, true), audienceStatus: choice(p.audienceStatus, ["unavailable", "public", "not_public"]), profileUrl: url(p.profileUrl), publicationName: text(p.publicationName, true), bestseller: p.bestseller, ...(p.publicationDomain !== undefined ? { publicationDomain: text(p.publicationDomain, true) } : {}), ...(p.publicationDescription !== undefined ? { publicationDescription: text(p.publicationDescription, true) } : {}) };
    }),
    posts: source.posts.map(value => { const p = object(value); return { id: text(p.id)!, title: text(p.title)!, url: url(p.url), date: text(p.date, true), comments: number(p.comments)!, reactions: number(p.reactions)!, image: url(p.image) }; }),
  };
  if (Number.isNaN(Date.parse(radar.scannedAt))) throw new Error("Invalid saved scan date.");
  const subscriberImport = data.subscriberImport === undefined ? undefined : parseSubscriberImport(data.subscriberImport);
  if (subscriberImport && subscriberImport.version !== 1 && new URL(subscriberImport.sourceUrl).hostname !== radar.domain) throw new Error("Saved roster belongs to another publication.");
  return { version: 1, radar, ...(subscriberImport ? { subscriberImport } : {}) };
}
