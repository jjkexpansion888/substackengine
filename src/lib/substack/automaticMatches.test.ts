import { describe, expect, it } from "vitest";
import { applyLikelyMatches } from "./automaticMatches";
import { parseSubscriberCsv } from "./subscriberCsv";
import { parseSubscriberImport } from "./subscriberRanking";
import type { AccountCandidate, AccountSearchResult } from "./accountCandidates";

const candidate = (id: string, score: number, publication: string | null = null, audience = 10): AccountCandidate => ({ id, score, publication, audience, handle: `reader${id}`, name: "Reader", bio: "", audienceLabel: null, verified: true, evidence: "Similar name" });
const result = (candidates: AccountCandidate[]): AccountSearchResult => ({ id: "csv:1", name: "Reader", status: "found", candidates });
const packet = () => parseSubscriberCsv("Name,Email\nReader,private@example.com", "example.substack.com").packet;
describe("automatic inferred matches", () => {
  it("chooses identity similarity before audience size and preserves the guess marker", () => {
    const updated = applyLikelyMatches(packet(), { "csv:1": result([candidate("1", 0.7, "Large", 1000000), candidate("2", 1)]) });
    expect(updated.subscribers[0]).toMatchObject({ id: "2", nameMatch: { score: 1 } });
    expect(parseSubscriberImport(updated).subscribers[0].nameMatch).toEqual({ score: 1 });
  });
  it("prefers a publication for identical name matches without requiring confirmation", () => {
    expect(applyLikelyMatches(packet(), { "csv:1": result([candidate("1", 1), candidate("2", 1, "Research")]) }).subscribers[0].id).toBe("2");
  });
  it("skips duplicate assignments, stale names and weak matches", () => {
    const roster = packet();
    roster.subscribers.push({ id: "csv:2", name: "Reader", handle: null });
    const updated = applyLikelyMatches(roster, { "csv:1": result([candidate("1", 1)]), "csv:2": { ...result([candidate("1", 1)]), id: "csv:2" } });
    expect(updated.subscribers.map(row => row.id)).toEqual(["1", "csv:2"]);
    expect(applyLikelyMatches(packet(), { "csv:1": { ...result([candidate("1", 1)]), name: "Other" } }).subscribers[0].id).toBe("csv:1");
    expect(applyLikelyMatches(packet(), { "csv:1": result([candidate("1", 0.1)]) }).subscribers[0].id).toBe("csv:1");
    expect(applyLikelyMatches(packet(), { "csv:1": result([candidate("1", 0.85)]) }).subscribers[0].id).toBe("csv:1");
    expect(() => parseSubscriberImport({ ...updated, subscribers: [{ ...updated.subscribers[0], nameMatch: { score: 2 } }] })).toThrow("Invalid inferred");
  });
});
