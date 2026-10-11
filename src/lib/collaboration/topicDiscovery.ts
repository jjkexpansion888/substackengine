import { topicThemes } from "@/lib/opportunities/crossSubstack";
import { rankCollaborators, tokens } from "./matching";
import type { CollaborationCandidate } from "./types";

export function topicDiscoverySources(writing: string): string[] {
  const words = new Set(tokens(writing));
  const themes: CollaborationCandidate[] = topicThemes.map(theme => ({
    id: theme.id, domain: theme.sources[0], name: theme.label, publication: theme.label,
    description: theme.keywords, posts: [], photoUrl: null, profileUrl: null,
    audience: null, audienceLabel: null, source: "extended", relationship: 0,
    sharedParticipants: 0, sampledParticipants: 0, sourceParticipants: 0, evidence: [],
  }));
  const ranked = rankCollaborators(writing, themes, { audience: null, goal: "balanced", records: {}, diversity: true });
  return [...new Set(ranked.matches.filter(match => {
    const theme = topicThemes.find(theme => theme.id === match.id)!;
    return match.topic > 0 && tokens(theme.keywords).filter(word => words.has(word)).length >= 2;
  }).slice(0, 4).flatMap(match => topicThemes.find(theme => theme.id === match.id)!.sources))].slice(0, 10);
}
