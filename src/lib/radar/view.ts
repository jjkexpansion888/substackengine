import type { ApiErrorCode } from "@/lib/api/errorMapping";
import {
  DEFAULT_ORDER,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  parseSubscribersQuery,
  profileUrlFor,
  type SortOrder,
  type SubscribersQuery,
  type SubscribersSortKey,
} from "@/lib/rank/query";
import {
  rankSubscribers,
  type AudienceSource,
  type RankedSubscriber,
  type SubscriberRow,
} from "@/lib/rank/rankSubscribers";
import { InvalidInputError } from "@/lib/substack";

/**
 * Pure view-model for the radar UI: formatting, badges, hrefs, and failure
 * messages. No React, no I/O — the components render these values and the
 * tests assert on them.
 *
 * All dates render as UTC in ISO form: deterministic across server, tests,
 * and CI, and honest about the "as of" semantics the spec requires.
 */

/** ISO date (YYYY-MM-DD); null renders as explicit "unknown" upstream. */
export function formatDateLabel(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/** Minute-precision UTC timestamp for "last synced" — a stale-data honest label. */
export function formatTimestampLabel(date: Date | null): string | null {
  if (!date) return null;
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}

/**
 * Fallback badge per audience rung. The exact-count rung shows no badge —
 * every other rung names its best available signal; missing data never
 * renders as zero or blank, only as "unknown" plus its badge.
 */
const BADGE_LABELS: Record<AudienceSource, string | null> = {
  subscriber_count: null,
  bestseller: "bestseller",
  activity_proxy: "activity proxy",
  unknown: "no public data",
};

export function audienceBadgeLabel(source: AudienceSource): string | null {
  return BADGE_LABELS[source];
}

export type RadarRowView = {
  subscriberId: string;
  rank: number;
  displayName: string | null;
  handle: string | null;
  profileUrl: string | null;
  /** Formatted exact count, or the explicit word "unknown". */
  audienceLabel: string;
  /** Null only on the exact-count rung. */
  badgeLabel: string | null;
  subscribedLabel: string | null;
  asOfLabel: string | null;
};

export function toRadarRowView(item: RankedSubscriber): RadarRowView {
  return {
    subscriberId: item.subscriber.id,
    rank: item.rank,
    displayName: item.subscriber.displayName,
    handle: item.subscriber.handle,
    profileUrl: profileUrlFor(item.subscriber.handle),
    audienceLabel: item.audienceSize === null ? "unknown" : formatCount(item.audienceSize),
    badgeLabel: BADGE_LABELS[item.audienceSource],
    subscribedLabel: formatDateLabel(item.subscriber.subscribedAt),
    asOfLabel: formatDateLabel(item.asOf),
  };
}

/** How many of the ranked set carry an exact audience size (the "n of m" note). */
export function countExactAudience(rows: SubscriberRow[]): number {
  return rankSubscribers(rows).filter((r) => r.audienceSource === "subscriber_count").length;
}

// ---------- sort + pagination hrefs ----------

/**
 * Order the next header link applies: clicking the active key toggles its
 * direction, switching keys uses that key's natural default.
 */
export function nextSortOrder(key: SubscribersSortKey, current: SubscribersQuery): SortOrder {
  if (current.sort === key) return current.order === "asc" ? "desc" : "asc";
  return DEFAULT_ORDER[key];
}

/** Canonical radar URL for a query; sort changes reset to the first page. */
export function buildRadarHref(
  baseUrl: string,
  query: SubscribersQuery,
  overrides: Partial<SubscribersQuery>,
): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams({
    sort: merged.sort,
    order: merged.order,
    offset: String(merged.offset),
    limit: String(merged.limit),
  });
  return `${baseUrl}?${params.toString()}`;
}

export type RadarQueryResult = {
  query: SubscribersQuery;
  /** Set when the link's parameters were invalid and defaults applied. */
  notice: string | null;
};

/**
 * The radar page's controls only emit valid parameters, so an invalid
 * parameter means a hand-edited link: fall back to defaults instead of
 * erroring, and say so rather than silently ignoring it.
 */
export function parseRadarQueryOrFallback(searchParams: URLSearchParams): RadarQueryResult {
  try {
    return { query: parseSubscribersQuery(searchParams), notice: null };
  } catch (error) {
    if (!(error instanceof InvalidInputError)) throw error;
    return {
      query: { sort: "rank", order: "asc", offset: 0, limit: DEFAULT_PAGE_LIMIT },
      notice: `Ignoring the sort or pagination parameters in this link: ${error.message}`,
    };
  }
}

export const RADAR_PAGE_MAX_LIMIT = MAX_PAGE_LIMIT;

// ---------- last-synced header ----------

/** The slice of the latest SyncRun the radar header shows. */
export type LatestRunView = {
  finishedAt: Date;
  status: string;
  subscribersSeen: number;
  profilesEnriched: number;
  profileErrors: number;
} | null;

/**
 * "Last synced" prefers the operational run record and falls back to the
 * newest snapshot's as-of time; null only when nothing has synced yet.
 */
export function lastSyncedLabel(rows: SubscriberRow[], run: LatestRunView): string | null {
  if (run) return formatTimestampLabel(run.finishedAt);
  const latest = rows.reduce<Date | null>(
    (max, row) =>
      row.capturedAt !== null && (max === null || row.capturedAt > max) ? row.capturedAt : max,
    null,
  );
  return formatTimestampLabel(latest);
}

export function runSummaryLabel(run: NonNullable<LatestRunView>): string {
  const suffix = run.profileErrors > 0 ? `, ${run.profileErrors} lookups unavailable` : "";
  return `Last sync ${run.status} — ${run.subscribersSeen} subscribers seen, ${run.profilesEnriched} profiles enriched${suffix}`;
}

// ---------- API failure surfaces ----------

/** Every code the UI can surface, plus the fetch-level failure. */
export type SyncFailureCode = ApiErrorCode | "network";

/** True codes for apiErrorCode's validation — anything else reads as "internal". */
const API_ERROR_CODES: readonly ApiErrorCode[] = [
  "invalid_input",
  "session_expired",
  "rate_limited",
  "upstream_changed",
  "upstream_unavailable",
  "not_found",
  "internal",
];

export function apiErrorCode(body: unknown): ApiErrorCode {
  const code =
    typeof body === "object" && body !== null
      ? (body as { error?: { code?: unknown } }).error?.code
      : undefined;
  return typeof code === "string" && (API_ERROR_CODES as readonly string[]).includes(code)
    ? (code as ApiErrorCode)
    : "internal";
}

export function apiErrorMessage(body: unknown): string | null {
  const message =
    typeof body === "object" && body !== null
      ? (body as { error?: { message?: unknown } }).error?.message
      : undefined;
  return typeof message === "string" ? message : null;
}

/** User-facing message for a failed "Sync now", per API code. */
export function syncFailureMessage(code: SyncFailureCode, fallback: string | null): string {
  switch (code) {
    case "session_expired":
      return "Connection expired — reconnect the publication. Old snapshots stay readable.";
    case "rate_limited":
      return "Substack is rate limiting us. The client backs off automatically — wait a moment, then retry.";
    case "upstream_changed":
      return "Substack's response shape changed — the integration needs updating. The failing endpoint is logged server-side. You can retry.";
    case "upstream_unavailable":
      return "Substack is temporarily unreachable. Try again shortly.";
    case "not_found":
      return "This publication is no longer connected. Connect it again to continue.";
    case "network":
      return "Could not reach the server. Check your connection and try again.";
    case "invalid_input":
      return fallback ?? "The sync request was malformed — try reloading the page.";
    default:
      return fallback ?? "The sync failed unexpectedly. Try again.";
  }
}

/** User-facing message for a failed connect or first sync, per API code. */
export function connectFailureMessage(code: SyncFailureCode, fallback: string | null): string {
  switch (code) {
    case "session_expired":
      return "That cookie was rejected. It may be expired, belong to a different Substack account, or not be the substack.sid value — copy a fresh substack.sid and try again.";
    case "rate_limited":
      return "Substack is rate limiting us. Wait a moment and try again.";
    case "upstream_changed":
      return "Substack's site changed in a way this tool doesn't understand yet. Try again later.";
    case "upstream_unavailable":
      return "Substack is temporarily unreachable. Try again shortly.";
    case "network":
      return "Could not reach the server. Check your connection and try again.";
    case "invalid_input":
      return fallback ?? "Enter your publication's domain and the substack.sid cookie.";
    case "not_found":
      return fallback ?? "Unknown publication.";
    default:
      return fallback ?? "Something went wrong. Try again.";
  }
}

/** The sync result fields the completion banner shows. */
export type SyncResultView = { subscribersSeen: number; profilesEnriched: number };

export function syncResultSummary(result: SyncResultView): string {
  return `${result.subscribersSeen} subscribers seen, ${result.profilesEnriched} profiles enriched`;
}

/** Validate the { sync: SyncResult } 200 body down to the fields the banner shows. */
export function syncResultFromResponse(body: unknown): SyncResultView | null {
  if (typeof body !== "object" || body === null) return null;
  const sync = (body as { sync?: unknown }).sync;
  if (typeof sync !== "object" || sync === null) return null;
  const { subscribersSeen, profilesEnriched } = sync as Record<string, unknown>;
  if (typeof subscribersSeen !== "number" || typeof profilesEnriched !== "number") return null;
  return { subscribersSeen, profilesEnriched };
}
