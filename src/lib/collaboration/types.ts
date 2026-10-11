export type CollaborationFormat = "Guest post" | "Interview" | "Joint live session" | "Recommendation";
export type CollaborationGoal = "balanced" | "reach" | "relationship";
export type CollaborationStage = "new" | "saved" | "contacted" | "replied" | "scheduled" | "completed" | "dismissed";
export type CollaborationPost = { title: string; subtitle: string; url: string | null; date: string | null; reactions: number; comments: number };
export type CollaborationCandidate = {
  id: string; name: string; domain: string; publication: string; description: string; photoUrl: string | null;
  profileUrl: string | null; audience: number | null; audienceLabel: string | null;
  source: "community" | "seed" | "extended"; relationship: number;
  posts: CollaborationPost[]; sharedParticipants: number; sampledParticipants: number; sourceParticipants: number;
  evidence: string[];
};
export type CollaborationRecord = {
  stage: CollaborationStage; notes: string; followUp: string; format: CollaborationFormat;
  subscribers: number; clicks: number; hours: number; feedback: "positive" | "negative" | null;
  drafts?: Partial<Record<CollaborationFormat, string>>;
  candidate: CollaborationCandidate; updatedAt: string;
};
export type CollaborationScan = { candidates: CollaborationCandidate[]; warnings: string[]; scannedAt: string; requests: number };
export type CollaborationMatch = CollaborationCandidate & {
  score: number; topic: number; relationshipScore: number; scale: number | null; activity: number | null;
  confidence: "Low" | "Medium" | "High"; terms: string[]; vector: number[]; features: number[];
};
