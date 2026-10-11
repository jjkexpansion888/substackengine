import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverPublicRadar } from "./publicRadar";
import { loadRadar, parseSavedRadar, saveRadar } from "./savedRadar";
import { parseSubscriberCsv } from "./subscriberCsv";

const packet = { version: 2 as const, sourceUrl: "https://example.substack.com/publish/subscribers", capturedAt: "2026-10-11T12:00:00Z", totalCount: 638, rowsRead: 638, subscribers: [{ id: "12", handle: "reader", name: "Reader", publicAudience: { count: 849, label: "849", bestseller: false } }] };
const fixture = async () => ({ version: 1, radar: await discoverPublicRadar("example", async url => url.includes("archive") ? [] : {}, packet), subscriberImport: packet });

describe("persistent local radar snapshots", () => {
  it("replaces an old owner snapshot with a new CSV roster and restores unresolved rows", async () => {
    const root = await mkdtemp(join(tmpdir(), "saved-csv-"));
    try {
      await saveRadar(await fixture(), root);
      const csv = parseSubscriberCsv("Name,Email\nUnresolved,private@example.test", "example.substack.com").packet;
      const radar = await discoverPublicRadar("example", async url => url.includes("archive") ? [] : {}, csv);
      await saveRadar({ version: 1, radar, subscriberImport: csv }, root);
      const restored = await loadRadar("example.substack.com", root);
      expect(restored?.subscriberImport).toEqual(csv);
      expect(restored?.radar.subscriberCoverage.source).toBe("file_import");
      expect(restored?.radar.people).toHaveLength(1);
      expect(restored?.radar.people[0]).toMatchObject({ id: "csv:1", name: "Unresolved", audience: null, subscriberEvidence: "file_list" });
      expect(await readFile(join(root, "example.substack.com.json"), "utf8")).not.toContain("private@example.test");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("restores the owner roster, counts and metadata from disk after memory is gone", async () => {
    const root = await mkdtemp(join(tmpdir(), "saved-radar-"));
    try {
      const original = await fixture();
      await saveRadar(original, root);
      expect(await loadRadar("example.substack.com", root)).toEqual(original);
      expect((await stat(join(root, "example.substack.com.json"))).mode & 0o777).toBe(0o600);
      original.radar.people[0].audience = 950;
      await saveRadar(original, root);
      expect((await loadRadar("example.substack.com", root))?.radar.people[0].audience).toBe(950);
      expect(await loadRadar("missing.substack.com", root)).toBeNull();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("strips unrecognized private fields from both radar and owner packets", async () => {
    const original = await fixture();
    const dirty = { ...original, cookie: "secret", radar: { ...original.radar, emails: ["private@example.com"], people: original.radar.people.map(p => ({ ...p, email: "private@example.com", cookie: "secret" })) }, subscriberImport: { ...packet, cookie: "secret", subscribers: packet.subscribers.map(p => ({ ...p, email: "private@example.com" })) } };
    const serialized = JSON.stringify(parseSavedRadar(dirty));
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("private@example.com");
  });
  it("rejects path traversal, invalid URLs and mismatched owner domains", async () => {
    const original = await fixture();
    expect(() => parseSavedRadar({ ...original, radar: { ...original.radar, domain: "../../secret" } })).toThrow();
    expect(() => parseSavedRadar({ ...original, radar: { ...original.radar, logoUrl: "javascript:alert(1)" } })).toThrow();
    expect(() => parseSavedRadar({ ...original, subscriberImport: { ...packet, sourceUrl: "https://other.substack.com/publish/subscribers" } })).toThrow();
  });
  it("does not treat a damaged file as a valid saved scan", async () => {
    const root = await mkdtemp(join(tmpdir(), "saved-radar-"));
    try {
      await writeFile(join(root, "example.substack.com.json"), "broken");
      expect(await loadRadar("example.substack.com", root)).toBeNull();
      expect(await readFile(join(root, "example.substack.com.json"), "utf8")).toBe("broken");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("keeps the owner list when a different public-only tab saves", async () => {
    const root = await mkdtemp(join(tmpdir(), "saved-radar-"));
    try {
      const original = await fixture();
      await saveRadar(original, root);
      const publicScan = await discoverPublicRadar("example", async url => url.includes("archive") ? [] : {});
      await saveRadar({ version: 1, radar: publicScan }, root);
      const restored = await loadRadar("example.substack.com", root);
      expect(restored?.subscriberImport).toEqual(packet);
      expect(restored?.radar.people[0].audience).toBe(849);
      expect(restored?.radar.subscriberCoverage.source).toBe("owner_session");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
