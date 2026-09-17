import { transportRetryOn, withBackoff } from "./backoff";
import type { BackoffOptions } from "./backoff";
import {
  InvalidInputError,
  RateLimitedError,
  SessionExpiredError,
  UpstreamChangeError,
  UpstreamTransientError,
} from "./errors";
import { parseProfileHtml } from "./profileParse";
import type {
  FetchLike,
  PublicProfile,
  RequestKind,
  RequestListener,
  SubscribersPage,
  SubstackClient,
  SubstackSession,
} from "./types";

// Browsers reject non-browser user agents quickly; the probe used a browser UA.
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const DEFAULT_PAGE_LIMIT = 50; // probe-verified page size
const PROFILE_LOOKUP_RETRIES = 2; // spec AC5: failed lookups retry twice

export type SubstackClientOptions = {
  /** Publication domain, e.g. "whitetigercapital.substack.com". */
  domain: string;
  fetchImpl?: FetchLike;
  userAgent?: string;
  /** Injectable clock for backoff sleeps — tests pass an immediate resolve. */
  sleep?: BackoffOptions["sleep"];
  /** Fires per HTTP attempt (retries included) — used for request budgeting. */
  onRequest?: RequestListener;
};

function subdomainFromDomain(domain: string): string {
  const parts = domain.split(".");
  const secondToLast = parts[parts.length - 2];
  if (parts.length >= 3 && secondToLast !== "substack") {
    // Custom domain — the whole host is the subdomain identifier.
    return domain;
  }
  return parts.length >= 3 ? parts[parts.length - 3] : domain;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function pickString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Rows without a user id cannot be identified or upserted — skipped. */
function mapSubscriberRow(raw: unknown) {
  const record = asRecord(raw);
  if (!record) return null;
  const rawUserId = record.user_id;
  if (typeof rawUserId !== "number" && typeof rawUserId !== "string") return null;
  return {
    substackUserId: String(rawUserId),
    displayName: pickString(record, "user_name"),
    email: pickString(record, "user_email_address"),
    photoUrl: pickString(record, "user_photo_url"),
    subscribedAt: parseIsoDate(record.subscription_created_at),
    subscriptionInterval: pickString(record, "subscription_interval"),
    activityRating: typeof record.activity_rating === "number" ? record.activity_rating : null,
  };
}

/**
 * The default SubstackClient — real HTTP via an injectable fetch.
 *
 * Cookie handling, request shaping, backoff, and response parsing all live
 * here so endpoint drift is a one-file fix (spec art_OeaCU5nx).
 */
export function createSubstackClient(options: SubstackClientOptions): SubstackClient {
  const host = options.domain.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host)) {
    throw new InvalidInputError(`not a valid publication domain: ${options.domain}`);
  }
  const base = `https://${host}`;
  const profileOrigin = "https://substack.com";
  const fetchImpl: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const sleep = options.sleep;
  const backoff: BackoffOptions = { retryOn: transportRetryOn, ...(sleep ? { sleep } : {}) };
  const onRequest = options.onRequest;

  const cookieHeader = (cookie: string): string => `substack.sid=${cookie}`;

  /**
   * Transport with the shared status mapping. Fires the request listener once
   * per HTTP attempt, so retries count against the run's request ceiling.
   * A 404 resolves to null — callers decide whether that is data (profiles)
   * or drift (authenticated JSON endpoints).
   */
  async function request(
    url: string,
    init: RequestInit,
    kind: RequestKind,
  ): Promise<Response | null> {
    onRequest?.({ kind, url });
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch (cause) {
      throw new UpstreamTransientError(`network error calling ${url}`, { cause });
    }
    if (response.status === 401 || response.status === 403) {
      throw new SessionExpiredError(`session rejected (${response.status}) by ${url}`);
    }
    if (response.status === 429) {
      throw new RateLimitedError(`rate limited by ${url}`);
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      throw response.status >= 500
        ? new UpstreamTransientError(`upstream error ${response.status} from ${url}`)
        : new UpstreamChangeError(`unexpected status ${response.status} from ${url}`);
    }
    return response;
  }

  return {
    async validateSession(cookie: string): Promise<SubstackSession> {
      if (cookie.trim().length === 0) {
        throw new InvalidInputError("session cookie is empty");
      }
      const response = await request(
        `${base}/api/v1/me`,
        { headers: { cookie: cookieHeader(cookie), "user-agent": userAgent } },
        "session",
      );
      if (!response) {
        throw new UpstreamChangeError("/api/v1/me returned 404 — endpoint moved?");
      }
      const body = asRecord(await response.json());
      const userId = body ? (pickString(body, "id") ?? pickString(body, "user_id")) : null;
      if (!userId) {
        throw new UpstreamChangeError("/api/v1/me response carries no user id");
      }
      return {
        userId,
        subdomain: subdomainFromDomain(host),
        displayName: body ? pickString(body, "name") : null,
      };
    },

    async listSubscribers(cookie, page): Promise<SubscribersPage> {
      const response = await withBackoff(
        () =>
          request(
            `${base}/api/v1/subscriber-stats`,
            {
              method: "POST",
              headers: {
                cookie: cookieHeader(cookie),
                "content-type": "application/json",
                "user-agent": userAgent,
              },
              body: JSON.stringify({ limit: page.limit, offset: page.offset }),
            },
            "list",
          ),
        backoff,
      );
      if (!response) {
        throw new UpstreamChangeError("subscriber-stats returned 404 — endpoint moved?");
      }
      const body = asRecord(await response.json());
      const rawRows = body?.subscribers;
      const total = body?.count;
      if (!Array.isArray(rawRows) || typeof total !== "number") {
        throw new UpstreamChangeError("subscriber-stats response shape changed");
      }
      const subscribers = rawRows
        .map(mapSubscriberRow)
        .filter((row): row is NonNullable<ReturnType<typeof mapSubscriberRow>> => row !== null);
      return { subscribers, total, pageRowCount: rawRows.length };
    },

    async getPublicProfile(handle): Promise<PublicProfile> {
      const profileUrl = `${profileOrigin}/@${encodeURIComponent(handle)}`;
      // Public page: the owner cookie is deliberately NOT sent (least
      // privilege). Retries live inside the client so the pipeline sees one
      // logical operation per profile.
      return withBackoff(async () => {
        const response = await request(
          profileUrl,
          { headers: { "user-agent": userAgent, accept: "text/html" } },
          "profile",
        );
        if (!response) {
          // No profile at that handle: public data absent, not an error.
          return { handle, name: null, subscriberCount: null, bestsellerStatus: null, profileUrl };
        }
        return { handle, ...parseProfileHtml(await response.text()), profileUrl };
      }, { ...backoff, maxRetries: PROFILE_LOOKUP_RETRIES });
    },
  };
}
