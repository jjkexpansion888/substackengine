import type { AccountSearchResult } from "./accountCandidates";
import type { SubscriberImport } from "./subscriberRanking";

export function applyLikelyMatches(packet: SubscriberImport, results: Record<string, AccountSearchResult>): SubscriberImport {
  const occupiedIds = new Set(packet.subscribers.map(row => row.id));
  const occupiedHandles = new Set(packet.subscribers.map(row => row.handle?.toLowerCase()));
  const subscribers = packet.subscribers.map(row => {
    if (!row.id?.startsWith("csv:") || row.handle) return row;
    const result = results[row.id];
    if (result?.name !== row.name || result.status !== "found") return row;
    const candidates = [...result.candidates].filter(p => p.score === 1).sort((a, b) => Number(!!b.publication) - Number(!!a.publication) || Number(b.verified) - Number(a.verified) || a.handle.localeCompare(b.handle));
    // Avoid assigning one account to several CSV rows or forcing a weaker alternative.
    const candidate = candidates[0];
    if (!candidate || occupiedIds.has(candidate.id) || occupiedHandles.has(candidate.handle.toLowerCase())) return row;
    occupiedIds.add(candidate.id); occupiedHandles.add(candidate.handle.toLowerCase());
    return { id: candidate.id, handle: candidate.handle, name: row.name, nameMatch: { score: candidate.score } };
  });
  return { ...packet, subscribers };
}
