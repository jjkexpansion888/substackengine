import type { PublicPerson, PublicRadar } from "./publicRadar";
import { parseSubscriberImport, type SubscriberImport } from "./subscriberRanking";

export function applyCsvRoster(radar: PublicRadar, value: SubscriberImport): PublicRadar {
  const packet = parseSubscriberImport(value);
  if (packet.version !== 3 || new URL(packet.sourceUrl).hostname !== radar.domain) throw new Error("This CSV belongs to another publication.");
  const people = radar.people.filter(p => p.subscriberEvidence !== "file_list" || p.role === "Author");
  for (const row of packet.subscribers) {
    const identity = row.id ?? `handle:${row.handle}`;
    const known = radar.people.find(p => p.id === identity || row.handle && p.handle?.toLowerCase() === row.handle && (!row.id || p.id === row.id));
    const person: PublicPerson = known ? { ...known, id: row.id ?? known.id, name: row.name, handle: row.handle ?? known.handle, membership: "Subscriber", subscriberEvidence: "file_list" } : {
      id: identity, name: row.name, handle: row.handle, role: "Reader", membership: "Subscriber", subscriberEvidence: "file_list", photoUrl: null,
      comments: 0, audience: null, audienceLabel: null, audienceStatus: "unavailable", profileUrl: row.handle ? `https://substack.com/@${row.handle}` : null, publicationName: null, bestseller: false,
    };
    const existing = people.findIndex(p => p.id === identity || row.handle && p.handle?.toLowerCase() === row.handle && (!row.id || p.id === row.id));
    if (existing >= 0) people[existing] = person; else people.push(person);
  }
  const ranked = people.filter(p => p.role === "Reader" && p.membership === "Subscriber");
  return { ...radar, people, subscriberCoverage: { ...radar.subscriberCoverage, source: "file_import", status: "available", capturedAt: packet.capturedAt, totalCount: packet.subscribers.length, totalLabel: null, discovered: ranked.length, enriched: ranked.filter(p => p.audienceStatus !== "unavailable").length }, warnings: radar.warnings.filter(w => !w.includes("imported subscribers have no explicit public account identifier")) };
}
