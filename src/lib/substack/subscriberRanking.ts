import { InvalidInputError } from "./errors";
import { rankSubscribers, type AudienceSource } from "../rank/rankSubscribers";
import type { PublicPerson } from "./publicRadar";

export type SubscriberEvidence = "public_list" | "browser_list" | "owner_list" | "file_list" | "comment" | "none";
export type SubscriberImport = {
  version: 1 | 2 | 3;
  sourceUrl: string;
  capturedAt: string;
  subscribers: { id?: string; handle: string | null; name: string; nameMatch?: { score: number }; publicAudience?: { count: number | null; label: string | null; bestseller: boolean } }[];
  totalCount?: number;
  rowsRead?: number;
};
export type SubscriberCoverage = {
  status: "available" | "browser_required" | "unavailable";
  source: "public_list" | "browser_list" | "owner_session" | "file_import" | "comments";
  profileUrl: string | null;
  hiddenCount: number | null;
  totalCount: number | null;
  totalLabel: string | null;
  discovered: number;
  enriched: number;
  capturedAt: string;
};
export type RankedPublicSubscriber = PublicPerson & { rank: number; audienceSource: AudienceSource };

export function subscriberProfileHandle(sourceUrl: string): string {
  let url: URL;
  try { url = new URL(sourceUrl); } catch { throw new InvalidInputError("The import needs a valid Substack subscriber-page URL."); }
  const match = /^\/@([a-z0-9_-]+)\/subscribers\/?$/i.exec(url.pathname);
  if (url.protocol !== "https:" || url.hostname !== "substack.com" || url.port || url.username || url.password || !match) throw new InvalidInputError("Only exports from a Substack profile's Subscribers page are supported.");
  return match[1].toLowerCase();
}

export function parseSubscriberImport(value: unknown): SubscriberImport {
  if (!value || typeof value !== "object") throw new InvalidInputError("Choose a valid subscriber export.");
  const packet = value as Record<string, unknown>;
  const owner = packet.version === 2;
  const file = packet.version === 3;
  if ((!owner && !file && packet.version !== 1) || typeof packet.sourceUrl !== "string" || typeof packet.capturedAt !== "string" || Number.isNaN(Date.parse(packet.capturedAt)) || !Array.isArray(packet.subscribers) || packet.subscribers.length > (owner || file ? 10000 : 1000)) throw new InvalidInputError("Invalid subscriber export or too many rows.");
  if (owner || file) {
    let url: URL;
    try { url = new URL(packet.sourceUrl); } catch { throw new InvalidInputError("Invalid owner subscriber export URL."); }
    if (url.protocol !== "https:" || url.port || url.username || url.password || !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(url.hostname) || !/^\/publish\/subscribers\/?$/.test(url.pathname) || !Number.isSafeInteger(packet.totalCount) || Number(packet.totalCount) < 0 || !Number.isSafeInteger(packet.rowsRead) || Number(packet.rowsRead) < packet.subscribers.length || Number(packet.rowsRead) > 10000) throw new InvalidInputError("Invalid owner subscriber export.");
  } else subscriberProfileHandle(packet.sourceUrl);
  const subscribers = new Map<string, SubscriberImport["subscribers"][number]>();
  for (const raw of packet.subscribers) {
    if (!raw || typeof raw !== "object") throw new InvalidInputError("Invalid subscriber row.");
    const row = raw as Record<string, unknown>;
    if ((owner && (typeof row.id !== "string" || !/^\d{1,30}$/.test(row.id))) || (file && row.id !== undefined && (typeof row.id !== "string" || !/^(?:\d{1,30}|csv:\d{1,5})$/.test(row.id))) || (!((owner || file) && row.handle === null) && (typeof row.handle !== "string" || !/^[a-z0-9_-]{1,100}$/i.test(row.handle))) || (file && !row.id && !row.handle) || typeof row.name !== "string" || !row.name.trim() || row.name.length > 300 || (file && row.name.includes("@"))) throw new InvalidInputError("Subscriber rows need a valid identity and name.");
    const handle = typeof row.handle === "string" ? row.handle.toLowerCase() : null;
    let nameMatch: { score: number } | undefined;
    if (file && row.nameMatch !== undefined) {
      const match = row.nameMatch as { score?: unknown } | null;
      if (!match || typeof match.score !== "number" || !Number.isFinite(match.score) || match.score < 0.55 || match.score > 1 || !handle || typeof row.id !== "string" || !/^\d{1,30}$/.test(row.id)) throw new InvalidInputError("Invalid inferred account match.");
      nameMatch = { score: match.score };
    }
    let publicAudience: SubscriberImport["subscribers"][number]["publicAudience"];
    if (owner && row.publicAudience !== undefined) {
      const audience = row.publicAudience as Record<string, unknown> | null;
      if (!handle || !audience || typeof audience !== "object" || (audience.count !== null && (!Number.isSafeInteger(audience.count) || Number(audience.count) < 0)) || (audience.label !== null && (typeof audience.label !== "string" || audience.label.length > 80 || !/^[\d,.]+\s*[KM]?\+?(?:\s+subscribers?)?$/i.test(audience.label))) || typeof audience.bestseller !== "boolean") throw new InvalidInputError("Invalid public audience snapshot.");
      publicAudience = { count: audience.count as number | null, label: audience.label as string | null, bestseller: audience.bestseller };
    }
    subscribers.set(owner || file ? row.id ? String(row.id) : handle! : handle!, { ...(owner || file && row.id ? { id: String(row.id) } : {}), handle, name: row.name.trim(), ...(publicAudience ? { publicAudience } : {}), ...(nameMatch ? { nameMatch } : {}) });
  }
  if (!subscribers.size) throw new InvalidInputError("The export contains no loaded subscribers.");
  return { version: file ? 3 : owner ? 2 : 1, sourceUrl: packet.sourceUrl, capturedAt: packet.capturedAt, subscribers: [...subscribers.values()], ...(owner || file ? { totalCount: Number(packet.totalCount), rowsRead: Number(packet.rowsRead) } : {}) };
}

export function rankPublicSubscribers(people: PublicPerson[]): RankedPublicSubscriber[] {
  const subscribers = people.filter(p => p.role === "Reader" && p.membership === "Subscriber").map(p => p.audience === 0 && p.audienceLabel && !/^[\d,.]+\s*[KM]?\+?(?:\s+subscribers?)?$/i.test(p.audienceLabel) ? { ...p, audience: null, audienceLabel: null, audienceStatus: "not_public" as const } : p);
  const byId = new Map(subscribers.map(p => [p.id, p]));
  return rankSubscribers(subscribers.map(p => ({
    id: p.id, displayName: p.name, handle: p.handle, subscribedAt: null, capturedAt: null,
    subscriberCount: p.audience, bestsellerStatus: p.bestseller ? "bestseller" : null, activityRating: null,
  }))).map(row => ({ ...byId.get(row.subscriber.id)!, rank: row.rank, audienceSource: row.audienceSource }));
}
