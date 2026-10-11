import { describe, expect, it } from "vitest";
import { parseSubscriberCsv } from "./subscriberCsv";
import { parseSubscriberImport, rankPublicSubscribers } from "./subscriberRanking";
import { mergeAudienceResults, pendingAudienceProfiles } from "./audienceQueue";
import { readSubscriberImport, saveSubscriberImport } from "./browserImportStorage";
import type { PublicPerson } from "./publicRadar";

const domain = "whitetigercapital.substack.com";
describe("subscriber CSV imports", () => {
  it("parses BOM, quoted commas and multiline names, keeping long IDs exact", () => {
    const result = parseSubscriberCsv('\uFEFFName,Email,Substack User ID,Profile URL\r\n"Doe, Jane",private@example.com,12345678901234567890,https://substack.com/@Jane\r\n"Other\nReader",other@example.com,,https://substack.com/profile/234', domain);
    expect(result.identifiable).toBe(2);
    expect(result.packet.subscribers).toEqual([{ id: "12345678901234567890", handle: "jane", name: "Doe, Jane" }, { id: "234", handle: null, name: "Other\nReader" }]);
    expect(JSON.stringify(result.packet)).not.toContain("example.com");
  });
  it("preserves email-only rows without guessing handles and ignores CSV counts", () => {
    const result = parseSubscriberCsv("Email,Name,Subscriber Count\none@example.com,Alice,999999\ntwo@example.com,Bob,888888", domain);
    expect(result.unresolved).toBe(2);
    expect(result.identifiable).toBe(0);
    expect(result.packet.subscribers.map(row => row.handle)).toEqual([null, null]);
    expect(JSON.stringify(result.packet)).not.toContain("999999");
    expect(JSON.stringify(result.packet)).not.toContain("@");
  });
  it("deduplicates explicit IDs, case-insensitive handles and emails without merging names", () => {
    const result = parseSubscriberCsv("Name,Email,Handle,User ID\nSame,a@example.com,Alice,\nSame,A@example.com,alice,42\nSame,b@example.com,,", domain);
    expect(result.duplicates).toBe(1);
    expect(result.packet.subscribers).toEqual([{ id: "42", handle: "alice", name: "Same" }, { id: "csv:3", handle: null, name: "Same" }]);
  });
  it("rejects conflicting duplicate identities", () => {
    expect(() => parseSubscriberCsv("Name,Handle,User ID\nOne,reader,1\nTwo,reader,2", domain)).toThrow("Conflicting");
    expect(() => parseSubscriberCsv("Name,Handle,Profile URL\nOne,first,https://substack.com/@second", domain)).toThrow("Conflicting");
  });
  it("does not resolve unsafe URLs or email-shaped handles", () => {
    const result = parseSubscriberCsv("Email,Handle,Profile URL\none@example.com,,https://evil.example/@someone\ntwo@example.com,two@example.com,", domain);
    expect(result.unresolved).toBe(2);
    expect(result.invalidIdentities).toBe(2);
  });
  it("rejects malformed, unsupported and oversized CSV files", () => {
    expect(() => parseSubscriberCsv('Name,Email\n"Unclosed,a@example.com', domain)).toThrow("CSV could not be read");
    expect(() => parseSubscriberCsv("Thing\nvalue", domain)).toThrow("column");
    expect(() => parseSubscriberCsv("x".repeat(5_000_001), domain)).toThrow("5 MB");
    expect(() => parseSubscriberCsv("Email\n" + "a@example.com\n".repeat(10001), domain)).toThrow("10,000");
  });
  it("retains sanitized CSV imports in browser storage and discards extra fields", () => {
    let stored = "";
    const result = parseSubscriberCsv("Name,Email,Handle\nReader,private@example.com,reader", domain);
    saveSubscriberImport(domain, result.packet, { setItem: (_key, value) => { stored = value; } });
    expect(readSubscriberImport(domain, { getItem: () => stored })).toEqual(result.packet);
    expect(parseSubscriberImport({ ...result.packet, subscribers: result.packet.subscribers.map(row => ({ ...row, email: "secret", publicAudience: { count: 999999 } })) })).toEqual(result.packet);
  });
  it("queues explicit accounts only and ranks verified counts before badges and unresolved rows", () => {
    const packet = parseSubscriberCsv("Name,Handle\nLarge,large\nSmall,small\nBadge,badge\nZero,zero\nUnresolved,", domain).packet;
    const people = packet.subscribers.map(row => ({ ...row, id: row.id ?? `handle:${row.handle}`, role: "Reader", membership: "Subscriber", subscriberEvidence: "file_list", audience: null, audienceLabel: null, audienceStatus: "unavailable", bestseller: false })) as PublicPerson[];
    expect(pendingAudienceProfiles(people, new Set())).toHaveLength(4);
    const merged = mergeAudienceResults(people, [{ handle: "large", audience: 5000, status: "public" }, { handle: "small", audience: 500, status: "public" }, { handle: "badge", bestseller: true, status: "not_public" }, { handle: "zero", audience: 0, status: "public" }]);
    expect(rankPublicSubscribers(merged).map(row => row.name)).toEqual(["Large", "Small", "Zero", "Badge", "Unresolved"]);
    expect(merged[4].audience).toBeNull();
  });
});
