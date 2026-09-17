import { InvalidInputError } from "../substack/errors";
import {
  rankSubscribers,
  compareSubscribedAtAsc,
  type AudienceSource,
  type RankedSubscriber,
  type SubscriberRow,
} from "./rankSubscribers";

/**
 * Query contract for GET /api/publications/[id]/subscribers.
 *
 * Pagination is offset-based, matching Substack's limit/offset contract the
 * rest of the app speaks. Ranks are assigned over the full subscriber set
 * before paging, so a row's rank never changes between pages.
 */
export type SubscribersSortKey = "rank" | "audience" | "subscribedAt" | "name";
export type SortOrder = "asc" | "desc";

export type SubscribersQuery = {
  sort: SubscribersSortKey;
  order: SortOrder;
  offset: number;
  limit: number;
};

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

const SORT_KEYS: readonly SubscribersSortKey[] = [
  "rank",
  "audience",
  "subscribedAt",
  "name",
];

/** Natural direction per key when the caller does not pass an explicit order. */
export const DEFAULT_ORDER: Record<SubscribersSortKey, SortOrder> = {
  rank: "asc", // best first
  audience: "desc", // biggest first
  subscribedAt: "asc", // earlier first, matching the ladder tiebreak
  name: "asc",
};

export function parseSubscribersQuery(
  searchParams: URLSearchParams,
): SubscribersQuery {
  const sortParam = searchParams.get("sort") ?? "rank";
  if (!SORT_KEYS.includes(sortParam as SubscribersSortKey)) {
    throw new InvalidInputError(
      `unsupported sort "${sortParam}" — expected one of ${SORT_KEYS.join(", ")}`,
    );
  }
  const sort = sortParam as SubscribersSortKey;

  const orderParam = searchParams.get("order");
  if (orderParam !== null && orderParam !== "asc" && orderParam !== "desc") {
    throw new InvalidInputError(`unsupported order "${orderParam}" — expected asc or desc`);
  }
  const order = (orderParam as SortOrder | null) ?? DEFAULT_ORDER[sort];

  const limitParam = searchParams.get("limit");
  let limit = DEFAULT_PAGE_LIMIT;
  if (limitParam !== null) {
    limit = Number.parseInt(limitParam, 10);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
      throw new InvalidInputError(
        `limit must be an integer between 1 and ${MAX_PAGE_LIMIT}`,
      );
    }
  }

  const offsetParam = searchParams.get("offset");
  let offset = 0;
  if (offsetParam !== null) {
    offset = Number.parseInt(offsetParam, 10);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new InvalidInputError("offset must be a non-negative integer");
    }
  }

  return { sort, order, offset, limit };
}

export type RankedPage = {
  items: RankedSubscriber[];
  total: number;
};

/**
 * Rank the full input set, apply the requested view sort, and take one page.
 * Ranks come from the ladder over all rows; alternate sorts reorder the view
 * but never renumber.
 */
export function buildRankedPage(
  rows: SubscriberRow[],
  query: SubscribersQuery,
): RankedPage {
  const ranked = rankSubscribers(rows);
  const ordered = applyViewSort(ranked, query.sort, query.order);
  return {
    items: ordered.slice(query.offset, query.offset + query.limit),
    total: ranked.length,
  };
}

function applyViewSort(
  items: RankedSubscriber[],
  sort: SubscribersSortKey,
  order: SortOrder,
): RankedSubscriber[] {
  switch (sort) {
    case "rank":
      return order === "asc" ? items : [...items].reverse();
    case "audience":
      return [...items].sort(byAudience(order));
    case "subscribedAt":
      return [...items].sort(bySubscribedAt(order));
    case "name":
      return [...items].sort(byName(order));
  }
}

function tieBreak(a: RankedSubscriber, b: RankedSubscriber): number {
  const date = compareSubscribedAtAsc(a.subscriber.subscribedAt, b.subscriber.subscribedAt);
  if (date !== 0) return date;
  return compareIds(a.subscriber.id, b.subscriber.id);
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byAudience(order: SortOrder) {
  return (a: RankedSubscriber, b: RankedSubscriber): number => {
    // "No public data" stays last in both directions — missing data demotes.
    if ((a.audienceSize === null) !== (b.audienceSize === null)) {
      return a.audienceSize === null ? 1 : -1;
    }
    if (a.audienceSize !== null && b.audienceSize !== null) {
      if (a.audienceSize !== b.audienceSize) {
        const cmp = a.audienceSize - b.audienceSize;
        return order === "desc" ? -cmp : cmp;
      }
    }
    return tieBreak(a, b);
  };
}

function bySubscribedAt(order: SortOrder) {
  return (a: RankedSubscriber, b: RankedSubscriber): number => {
    if (a.subscriber.subscribedAt === null || b.subscriber.subscribedAt === null) {
      if (a.subscriber.subscribedAt === b.subscriber.subscribedAt) return tieBreak(a, b);
      return a.subscriber.subscribedAt === null ? 1 : -1; // nulls last in both directions
    }
    const cmp = compareSubscribedAtAsc(a.subscriber.subscribedAt, b.subscriber.subscribedAt);
    return order === "asc" ? cmp : -cmp;
  };
}

function byName(order: SortOrder) {
  return (a: RankedSubscriber, b: RankedSubscriber): number => {
    const aName = a.subscriber.displayName?.toLowerCase() ?? null;
    const bName = b.subscriber.displayName?.toLowerCase() ?? null;
    if (aName === null || bName === null) {
      if (aName === bName) return tieBreak(a, b);
      return aName === null ? 1 : -1; // nulls last in both directions
    }
    if (aName !== bName) {
      const cmp = aName < bName ? -1 : 1;
      return order === "asc" ? cmp : -cmp;
    }
    return tieBreak(a, b);
  };
}

/** Public profile URL for a handle; the seam's canonical substack.com/@ form. */
export function profileUrlFor(handle: string | null): string | null {
  return handle ? `https://substack.com/@${handle}` : null;
}

export type RankedSubscriberJson = {
  subscriberId: string;
  displayName: string | null;
  handle: string | null;
  profileUrl: string | null;
  subscribedAt: string | null;
  rank: number;
  audienceSize: number | null;
  audienceSource: AudienceSource;
  asOf: string | null;
};

export function toRankedJson(item: RankedSubscriber): RankedSubscriberJson {
  return {
    subscriberId: item.subscriber.id,
    displayName: item.subscriber.displayName,
    handle: item.subscriber.handle,
    profileUrl: profileUrlFor(item.subscriber.handle),
    subscribedAt: item.subscriber.subscribedAt?.toISOString() ?? null,
    rank: item.rank,
    audienceSize: item.audienceSize,
    audienceSource: item.audienceSource,
    asOf: item.asOf?.toISOString() ?? null,
  };
}
