import type { ProfileIdentity } from "./publicAudience";

export type PublicAudienceSnapshot = { id?: string; handle: string; publicAudience: { count: number | null; label: string | null; bestseller: boolean } };
type Entry = { snapshot: PublicAudienceSnapshot; expires: number };
const runtime = globalThis as typeof globalThis & { substackPublicAudienceCache?: Map<string, Entry> };
const entries = runtime.substackPublicAudienceCache ??= new Map<string, Entry>();

// Cache only public profile facts, never rosters, membership, names, emails or credentials.
export function rememberPublicAudience(value: unknown, now = Date.now()): void {
  if (!value || typeof value !== "object") return;
  const row = value as PublicAudienceSnapshot;
  if (typeof row.handle !== "string" || !/^[a-z0-9_-]{1,100}$/i.test(row.handle)) return;
  if (row.id !== undefined && (typeof row.id !== "string" || !/^\d{1,30}$/.test(row.id))) return;
  const audience = row.publicAudience;
  if (!audience || (audience.count !== null && (!Number.isSafeInteger(audience.count) || audience.count < 0)) || typeof audience.bestseller !== "boolean") return;
  if (audience.label !== null && (typeof audience.label !== "string" || audience.label.length > 80 || !/^[\d,.]+\s*[km]?\+?(?:\s+subscribers?)?$/i.test(audience.label))) return;
  const snapshot = { ...(row.id ? { id: row.id } : {}), handle: row.handle.toLowerCase(), publicAudience: { count: audience.count, label: audience.label, bestseller: audience.bestseller } };
  for (const [key, entry] of entries) if (entry.expires <= now) entries.delete(key);
  const existing = cachedPublicAudience(snapshot, now);
  if (existing && existing.publicAudience.count !== null && audience.count === null) return;
  const entry = { snapshot, expires: now + (audience.count === null ? 5 * 60_000 : 60 * 60_000) };
  entries.set(`handle:${snapshot.handle}`, entry);
  if (snapshot.id) entries.set(`id:${snapshot.id}`, entry);
  while (entries.size > 20_000) entries.delete(entries.keys().next().value!);
}

export function cachedPublicAudience(identity: ProfileIdentity, now = Date.now()): PublicAudienceSnapshot | null {
  const entry = (identity.id ? entries.get(`id:${identity.id}`) : undefined) ?? (identity.handle ? entries.get(`handle:${identity.handle.toLowerCase()}`) : undefined);
  if (!entry || entry.expires <= now || (identity.id && entry.snapshot.id && entry.snapshot.id !== identity.id)) return null;
  return entry.snapshot;
}
