import type { SubscriberCoverage } from "../substack/subscriberRanking";

export function radarFeatures(source?: SubscriberCoverage["source"]): string[] {
  return source === "owner_session" ? ["Radar", "Collaboration finder", "Content opportunities"] : ["Radar"];
}
