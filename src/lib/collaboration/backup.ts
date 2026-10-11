import type { CollaborationCandidate, CollaborationFormat, CollaborationGoal, CollaborationRecord, CollaborationScan, CollaborationStage } from "./types";

type Obj = Record<string, unknown>;
const object = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const text = (value: unknown, limit = 4000) => typeof value === "string" ? value.slice(0, limit) : "";
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
const secureUrl = (value: unknown) => { try { const url = new URL(text(value)); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; } };
const formats: CollaborationFormat[] = ["Guest post", "Interview", "Joint live session", "Recommendation"];
const stages: CollaborationStage[] = ["new", "saved", "contacted", "replied", "scheduled", "completed", "dismissed"];
function candidate(value: unknown): CollaborationCandidate {
  const raw = object(value);
  const domain = text(raw.domain, 300).toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain) || !text(raw.name) || !Array.isArray(raw.posts) || raw.posts.length > 8) throw new Error("The backup contains an invalid partner record.");
  return {
    id: domain, domain, name: text(raw.name, 300), publication: text(raw.publication, 300) || domain, description: text(raw.description),
    photoUrl: secureUrl(raw.photoUrl), profileUrl: secureUrl(raw.profileUrl), audience: typeof raw.audience === "number" && Number.isFinite(raw.audience) && raw.audience >= 0 ? raw.audience : null,
    audienceLabel: text(raw.audienceLabel, 100) || null, source: raw.source === "community" || raw.source === "extended" ? raw.source : "seed",
    relationship: count(raw.relationship), sharedParticipants: count(raw.sharedParticipants), sampledParticipants: count(raw.sampledParticipants), sourceParticipants: count(raw.sourceParticipants),
    evidence: Array.isArray(raw.evidence) ? raw.evidence.slice(0, 20).map(e => text(e)) : [],
    posts: raw.posts.map(value => { const post = object(value); return { title: text(post.title) || "Untitled post", subtitle: text(post.subtitle), url: secureUrl(post.url), date: typeof post.date === "string" && Number.isFinite(Date.parse(post.date)) ? post.date : null, reactions: count(post.reactions), comments: count(post.comments) }; }),
  };
}

export function parseCollaborationBackup(value: unknown, expectedDomain: string, requireDomain = true): {
  records: Record<string, CollaborationRecord>; scan: CollaborationScan | null; context: string; audience: string; seeds: string; goal: CollaborationGoal; diversity: boolean; senderName: string | null; senderUrl: string | null;
} {
  const raw = object(value);
  if ((requireDomain || raw.domain !== undefined) && raw.domain !== expectedDomain) throw new Error("This backup belongs to a different publication.");
  if (!raw.records || typeof raw.records !== "object" || Array.isArray(raw.records) || Object.keys(raw.records).length > 1000) throw new Error("Choose a valid collaboration backup.");
  const records = Object.fromEntries(Object.values(object(raw.records)).map(value => {
    const r = object(value), c = candidate(r.candidate);
    const format = formats.includes(r.format as CollaborationFormat) ? r.format as CollaborationFormat : "Guest post";
    const drafts = Object.fromEntries(formats.flatMap(f => typeof object(r.drafts)[f] === "string" ? [[f, text(object(r.drafts)[f], 16000)]] : []));
    return [c.id, { candidate: c, stage: stages.includes(r.stage as CollaborationStage) ? r.stage as CollaborationStage : "new", notes: text(r.notes, 16000), followUp: /^\d{4}-\d{2}-\d{2}$/.test(text(r.followUp)) ? text(r.followUp) : "", format,
      subscribers: count(r.subscribers), clicks: count(r.clicks), hours: count(r.hours), feedback: r.feedback === "positive" || r.feedback === "negative" ? r.feedback : null, drafts, updatedAt: text(r.updatedAt) || new Date().toISOString(),
    } satisfies CollaborationRecord];
  }));
  let scan: CollaborationScan | null = null;
  if (raw.scan !== null && raw.scan !== undefined) {
    const s = object(raw.scan);
    if (!Array.isArray(s.candidates) || s.candidates.length > 500) throw new Error("The backup contains too many partners or an invalid scan.");
    scan = { candidates: s.candidates.map(candidate), requests: count(s.requests), warnings: Array.isArray(s.warnings) ? s.warnings.slice(0, 80).map(w => text(w)) : [], scannedAt: typeof s.scannedAt === "string" && Number.isFinite(Date.parse(s.scannedAt)) ? s.scannedAt : new Date().toISOString() };
  }
  return { records, scan, context: text(raw.context), audience: /^\d{1,12}$/.test(text(raw.audience)) ? text(raw.audience) : "", seeds: text(raw.seeds), goal: raw.goal === "reach" || raw.goal === "relationship" ? raw.goal : "balanced", diversity: raw.diversity !== false, senderName: typeof raw.senderName === "string" ? text(raw.senderName, 300) : null, senderUrl: secureUrl(raw.senderUrl) };
}
