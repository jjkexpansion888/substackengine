import { randomBytes } from "node:crypto";
import { parseSubscriberImport, type SubscriberImport } from "./subscriberRanking";
import { rememberPublicAudience } from "./publicAudienceCache";

const lifetime = 5 * 60 * 1000;
type PendingHandoffs = Map<string, { packet: SubscriberImport; expires: number }>;
const runtime = globalThis as typeof globalThis & { substackBrowserHandoffs?: PendingHandoffs };
// Next's development compiler reloads route modules between staging and claiming.
const pending = runtime.substackBrowserHandoffs ??= new Map();

export function stageBrowserHandoff(value: unknown, now = Date.now()): string {
  const packet = parseSubscriberImport(value);
  if (packet.version !== 2) throw new Error("Direct sync requires an owner-session roster.");
  for (const row of packet.subscribers) if (row.publicAudience) rememberPublicAudience(row, now);
  for (const [token, entry] of pending) if (entry.expires <= now) pending.delete(token);
  if (pending.size >= 8) throw new Error("Too many pending syncs. Open an existing sync or wait five minutes.");
  const token = randomBytes(32).toString("hex");
  pending.set(token, { packet, expires: now + lifetime });
  setTimeout(() => { pending.delete(token); }, lifetime).unref();
  return token;
}

export function claimBrowserHandoff(token: string, now = Date.now()): SubscriberImport | null {
  const entry = pending.get(token);
  pending.delete(token);
  return entry && entry.expires > now ? entry.packet : null;
}
