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
 * - public profile: primary GET https://substack.com/api/v1/user/{handle}/
 *   public_profile — unauthenticated JSON with the exact subscriberCountNumber
 *   (probe v3 Corrections: 25/25 verified, ~KB payloads); fallback GET
 *   https://substack.com/@<handle> page-HTML extraction when the JSON route
 *   fails (count-less body or transient exhaustion). A JSON 404 means no
 *   profile — nulls, no fallback.
 * - session validation: POST https://<pub-domain>/api/v1/subscriber-stats
 *   with body { limit: 1, offset: 0 } — the same probe-verified endpoint as
 *   the subscriber list. The former session check, GET /api/v1/me, was
 *   retired by Substack (probe 2026-09-17: 404 HTML on the publication
 *   domain and on substack.com, with and without a session cookie), so
 *   validation now proves the session by reading a page of subscriber
 *   stats. subscriber-stats answers 403 "Not authorized" for missing or
 *   rejected cookies (route alive, auth refused), which the client maps to
 *   SessionExpiredError. The response envelope carries no owner identity,
 *   so SubstackSession holds only what is derivable honestly: the
 *   subdomain, and a displayName that stays null.
 */
export interface SubstackClient {
  /** Throws SessionExpiredError on 401/403. */
  validateSession(cookie: string): Promise<SubstackSession>;
  /** Owner-scoped subscriber list, paginated with Substack's limit/offset contract. */
  listSubscribers(cookie: string, page: SubscribersPageArgs): Promise<SubscribersPage>;
  /**
   * Public profile lookup for one handle: JSON endpoint first, profile-page
   * extraction as fallback. A missing profile (404) or a response without
   * parseable count data resolves to null fields — it never throws for
   * absence and never yields zero. Transport-level failures throw.
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
 * The Substack reader host is not a publication: a bare "substack.com" and a
 * profile URL ("https://substack.com/@handle") both normalize to it, and a
 * session check against it validates nothing. Reject both up front with the
 * fix in the message instead of letting the user hit the misleading
 * upstream-change banner.
 */
function isReaderHost(host: string): boolean {
  return host === "substack.com" || host === "www.substack.com";
}

/**
 * Normalize a user-supplied publication domain to a bare hostname
 * ("https://Example.Substack.com/about" -> "example.substack.com").
 * Profile and reader URLs are rejected — the publication's own domain is
 * required (e.g. "whitetigercapital.substack.com").
 */
export function normalizeDomain(input: string): string {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (isReaderHost(host)) {
    throw new InvalidInputError(
      `"${input.trim()}" is a Substack reader or profile URL, not a publication. Enter the publication's own domain instead, e.g. whitetigercapital.substack.com`,
    );
  }
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host)) {
    throw new InvalidInputError(`not a valid publication domain: ${input}`);
  }
  return host;
}
