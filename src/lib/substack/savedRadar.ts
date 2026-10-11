import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { PublicRadar } from "./publicRadar";
import { parseSubscriberImport, type SubscriberImport } from "./subscriberRanking";
import { rememberPublicAudience } from "./publicAudienceCache";

const directory = join(process.env.SUBSTACK_DATA_DIR || join(process.cwd(), ".local-data"), "radar");
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

export async function saveRadar(value: unknown, root = directory): Promise<SavedRadar> {
  let snapshot = parseSavedRadar(value);
  const previous = await loadRadar(snapshot.radar.domain, root).catch(() => null);
  // A public-only tab must not replace a fuller signed-in owner snapshot.
  if (previous) {
    const keepPrevious = ["owner_session", "file_import"].includes(previous.radar.subscriberCoverage.source) && !["owner_session", "file_import"].includes(snapshot.radar.subscriberCoverage.source);
    const preferred = keepPrevious ? previous : snapshot;
    const other = keepPrevious ? snapshot : previous;
    const byId = new Map(other.radar.people.map(p => [p.id, p]));
    const byHandle = new Map(other.radar.people.filter(p => p.handle).map(p => [p.handle, p]));
    snapshot = { ...preferred, radar: { ...preferred.radar, people: preferred.radar.people.map(p => {
      const known = byId.get(p.id) ?? (p.handle ? byHandle.get(p.handle) : undefined);
      if (known && /^\d+$/.test(p.id) && p.id !== known.id) return p;
      if (p.audience !== null || !known || known.audience === null) return p;
      return { ...p, audience: known.audience, audienceLabel: known.audienceLabel, audienceStatus: "public", bestseller: p.bestseller || known.bestseller };
    }) } };
    snapshot.radar.subscriberCoverage.enriched = snapshot.radar.people.filter(p => p.role === "Reader" && p.membership === "Subscriber" && p.handle && p.audienceStatus !== "unavailable").length;
  }
  await mkdir(root, { recursive: true, mode: 0o700 });
  const path = join(root, `${snapshot.radar.domain}.json`);
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
  await rename(temporary, path);
  return snapshot;
}

export async function loadRadar(domain: string, root = directory): Promise<SavedRadar | null> {
  const valid = savedRadarDomain(domain);
  try {
    const snapshot = parseSavedRadar(JSON.parse(await readFile(join(root, `${valid}.json`), "utf8")));
    if (snapshot.radar.domain !== valid) return null;
    for (const p of snapshot.radar.people) if (p.handle && p.audience !== null) rememberPublicAudience({ id: /^\d{1,30}$/.test(p.id) ? p.id : undefined, handle: p.handle, publicAudience: { count: p.audience, label: p.audienceLabel, bestseller: p.bestseller } });
    return snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function removeSavedRadar(domain: string, root = directory): Promise<void> {
  try { await unlink(join(root, `${savedRadarDomain(domain)}.json`)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
