import { describe, expect, it } from "vitest";
import { parseCollaborationBackup } from "./backup";

const partner = { id: "other.substack.com", domain: "other.substack.com", name: "Writer", publication: "Other", posts: [], photoUrl: "javascript:alert(1)", profileUrl: "https://substack.com/@writer", audience: null };
describe("collaboration backups", () => {
  it("restores records and strips unsafe links and invalid numbers", () => {
    const parsed = parseCollaborationBackup({ domain: "source.substack.com", records: { other: { candidate: partner, stage: "saved", notes: "Keep this", clicks: -2, subscribers: 3, hours: 1.5, drafts: { Interview: "Custom draft" } } }, scan: null }, "source.substack.com");
    const r = parsed.records["other.substack.com"];
    expect(r.notes).toBe("Keep this");
    expect(r.clicks).toBe(0);
    expect(r.candidate.audience).toBeNull();
    expect(r.candidate.photoUrl).toBeNull();
    expect(r.drafts?.Interview).toBe("Custom draft");
  });
  it("rejects backups from another publication and malformed candidates", () => {
    expect(() => parseCollaborationBackup({ domain: "other.substack.com", records: {} }, "source.substack.com")).toThrow("different publication");
    expect(() => parseCollaborationBackup({ domain: "source.substack.com", records: { bad: { candidate: { ...partner, domain: "../../admin" } } } }, "source.substack.com")).toThrow();
  });
  it("restores sender identity independently of the research publication", () => {
    const parsed = parseCollaborationBackup({ domain: "source.substack.com", records: {}, senderName: "Baekho Research", senderUrl: "https://whitetigercapital.substack.com" }, "source.substack.com");
    expect(parsed.senderName).toBe("Baekho Research");
    expect(parsed.senderUrl).toBe("https://whitetigercapital.substack.com/");
    expect(parseCollaborationBackup({ records: {}, senderUrl: "javascript:alert(1)" }, "source.substack.com", false).senderUrl).toBeNull();
    expect(parseCollaborationBackup({ records: {} }, "source.substack.com", false).senderName).toBeNull();
  });
});
