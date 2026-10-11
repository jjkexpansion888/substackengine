import type { SubscriberCoverage } from "../substack/subscriberRanking";

export function radarFeatures(source?: SubscriberCoverage["source"]): string[] {
  return source ? ["Radar", "Collaboration finder", "Content opportunities"] : ["Radar"];
}
