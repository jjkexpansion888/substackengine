import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { parseSavedRadar, savedRadarDomain, type SavedRadar } from "./savedRadarSchema";
export { parseSavedRadar, savedRadarDomain } from "./savedRadarSchema";
export type { SavedRadar } from "./savedRadarSchema";
import { rememberPublicAudience } from "./publicAudienceCache";

const directory = join(process.env.SUBSTACK_DATA_DIR || join(process.cwd(), ".local-data"), "radar");
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
