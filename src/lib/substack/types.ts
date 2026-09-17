import { InvalidInputError } from "./errors";

/** Injectable fetch — tests mock HTTP without a mocking library. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Fires once per actual HTTP request the client makes (retries included), so
 * the sync pipeline can enforce its per-run request ceiling against real traffic.
 */
export type RequestKind = "session" | "list" | "profile";

export type RequestListener = (info: { kind: RequestKind; url: string }) => void;

export type SubstackSession = {
  userId: string;
  subdomain: string;
  displayName: string | null;
};

export type SubscribersPageArgs = {
  limit: number;
  offset: number;
};

export type SubscriberRecord = {
  substackUserId: string;
  displayName: string | null;
  email: string | null;
  photoUrl: string | null;
  subscribedAt: Date | null;
  subscriptionInterval: string | null;
  activityRating: number | null;
};

export type SubscribersPage = {
  subscribers: SubscriberRecord[];
  /** Declared total from the response's `count` field. */
  total: number;
  /** Raw rows in this page — the offset advances by this even if some rows were unmappable. */
  pageRowCount: number;
};

export type PublicProfile = {
  handle: string;
  name: string | null;
  /**
   * Exact public subscriber count extracted from the profile page. Null means
   * no public data — never zero (spec: parse failure is absence, not zero).
   */
  subscriberCount: number | null;
  bestsellerStatus: string | null;
  profileUrl: string;
};

/**
 * The one interface through which this app talks to Substack. Substack's web
 * endpoints are unofficial and drift without notice; every endpoint call is a
 * named method here so drift is a one-file fix (spec art_OeaCU5nx).
 *
 * Endpoint notes (probe report art_k1eE1cvA, 2026-09-17):
 * - subscriber list: POST https://<pub-domain>/api/v1/subscriber-stats,
 *   body { limit, offset }, total from the `count` field — probe-verified.
 * - public profile: GET https://substack.com/@<handle> HTML page; the JSON
 *   API /api/v1/user/{id}/public_profile 404s and is deliberately not used.
 * - session validation: GET https://<pub-domain>/api/v1/me — NOT
 *   probe-verified; the endpoint is isolated here so drift is contained.
 */
export interface SubstackClient {
  /** Throws SessionExpiredError on 401/403. */
  validateSession(cookie: string): Promise<SubstackSession>;
  /** Owner-scoped subscriber list, paginated with Substack's limit/offset contract. */
  listSubscribers(cookie: string, page: SubscribersPageArgs): Promise<SubscribersPage>;
  /**
   * Public profile lookup for one handle. A missing profile (404) or a page
   * without parseable count data resolves to null fields — it never throws
   * and never yields zero. Transport-level failures throw.
   */
  getPublicProfile(handle: string): Promise<PublicProfile>;
}

/**
 * Derive the profile handle candidate from the feed's `user_name` display
 * name ("Tom McAuley" -> "tommcauley"). This is the method the live probe
 * used and it resolved 25/25 sampled profiles; it stays a *candidate* — a
 * 404 means no public data, never an invented handle.
 */
export function handleFromUserName(userName: string | null): string | null {
  if (!userName) return null;
  const slug = userName.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return slug.length > 0 ? slug : null;
}

/**
 * Normalize a user-supplied publication domain to a bare hostname
 * ("https://Example.Substack.com/about" -> "example.substack.com").
 */
export function normalizeDomain(input: string): string {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host)) {
    throw new InvalidInputError(`not a valid publication domain: ${input}`);
  }
  return host;
}
