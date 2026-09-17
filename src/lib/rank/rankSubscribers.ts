/**
 * The Influencer Radar rank ladder (spec art_OeaCU5nx).
 *
 * Sorted highest first. Missing data never removes a subscriber — it demotes
 * the rung:
 *   1. subscriber_count — exact public count from the public profile. A
 *      measured 0 is real data (publication-less profiles report 0 — probe
 *      art_k1eE1cvA), so it stays on this rung, at its bottom; owner-hidden
 *      counts parse to null instead and demote.
 *   2. bestseller       — Substack bestseller badge/tier as an ordinal.
 *   3. activity_proxy   — activity_rating from the owner feed, a weak signal.
 *   4. unknown          — ranked last, displayed as "no public data".
 *
 * Ties at the same rung sort by subscription date, earlier first (nulls
 * last), with the subscriber id as the final deterministic tiebreak so the
 * total order — and every page of it — is reproducible across requests.
 */

export type AudienceSource =
  | "subscriber_count"
  | "bestseller"
  | "activity_proxy"
  | "unknown";

/** One subscriber's rank inputs: identity fields plus its latest snapshot's inputs. */
export type SubscriberRow = {
  id: string;
  displayName: string | null;
  handle: string | null;
  subscribedAt: Date | null;
  /** Latest snapshot's as-of time; null only when no snapshot exists yet. */
  capturedAt: Date | null;
  /** Rank inputs, persisted on SubscriberSnapshot so every rank is reproducible. */
  subscriberCount: number | null;
  bestsellerStatus: string | null;
  activityRating: number | null;
};

export type RankedSubscriber = {
  subscriber: SubscriberRow;
  rank: number;
  /** Real audience size — the exact count rung only; null on every other rung. */
  audienceSize: number | null;
  audienceSource: AudienceSource;
  /** Snapshot as-of time; null only when the subscriber has no snapshot yet. */
  asOf: Date | null;
};

/**
 * Bestseller tiers as an ordinal (higher = stronger). The live probe observed
 * the field only as null (art_k1eE1cvA), so populated values are unobserved:
 * any badge without an embedded number maps to tier 1; "tier N" / "#N" style
 * values map to N. Higher ordinals rank higher — a flagged assumption to
 * revisit once real tier values are observed.
 */
export function bestsellerTierOrdinal(status: string): number {
  const match = /\d+/.exec(status);
  if (match) return Number.parseInt(match[0], 10);
  return 1;
}

/** Rung selection from the persisted inputs alone — missing data demotes a rung. */
export function classifyAudienceSource(row: SubscriberRow): AudienceSource {
  if (row.subscriberCount !== null) return "subscriber_count";
  if (row.bestsellerStatus !== null) return "bestseller";
  if (row.activityRating !== null) return "activity_proxy";
  return "unknown";
}

/** Earlier subscription date ranks higher (spec: earlier = bigger); nulls last. */
export function compareSubscribedAtAsc(a: Date | null, b: Date | null): number {
  if (a === null || b === null) {
    if (a === b) return 0;
    return a === null ? 1 : -1;
  }
  return a.getTime() - b.getTime();
}

const RUNG_ORDER: Record<AudienceSource, number> = {
  subscriber_count: 1,
  bestseller: 2,
  activity_proxy: 3,
  unknown: 4,
};

/** The rung's primary metric, larger first. Fields are non-null on their own rung. */
function primaryMetric(row: SubscriberRow, source: AudienceSource): number {
  switch (source) {
    case "subscriber_count":
      return row.subscriberCount ?? 0;
    case "bestseller":
      return row.bestsellerStatus === null
        ? 0
        : bestsellerTierOrdinal(row.bestsellerStatus);
    case "activity_proxy":
      return row.activityRating ?? 0;
    case "unknown":
      return 0;
  }
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareSubscribers(a: SubscriberRow, b: SubscriberRow): number {
  const rung = compareAsc(
    RUNG_ORDER[classifyAudienceSource(a)],
    RUNG_ORDER[classifyAudienceSource(b)],
  );
  if (rung !== 0) return rung;

  const source = classifyAudienceSource(a);
  const metric = compareAsc(primaryMetric(b, source), primaryMetric(a, source));
  if (metric !== 0) return metric;

  const date = compareSubscribedAtAsc(a.subscribedAt, b.subscribedAt);
  if (date !== 0) return date;

  return compareIds(a.id, b.id);
}

function compareAsc(a: number, b: number): number {
  return a - b;
}

/**
 * Rank every row in one total order. Ranks are assigned over the full input
 * set (1..N), before any paging, so they are stable across pages.
 */
export function rankSubscribers(rows: SubscriberRow[]): RankedSubscriber[] {
  return [...rows].sort(compareSubscribers).map((subscriber, index) => ({
    subscriber,
    rank: index + 1,
    audienceSize: subscriber.subscriberCount,
    audienceSource: classifyAudienceSource(subscriber),
    asOf: subscriber.capturedAt,
  }));
}
