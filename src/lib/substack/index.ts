/**
 * Public surface of the Substack seam. Everything upstream lives behind these
 * exports — callers outside lib/substack must not import the http client or
 * parser directly.
 */
export type {
  FetchLike,
  PublicProfile,
  RequestKind,
  RequestListener,
  SubscriberRecord,
  SubscribersPage,
  SubscribersPageArgs,
  SubstackClient,
  SubstackSession,
} from "./types";
export { handleFromUserName, normalizeDomain } from "./types";
export {
  InvalidInputError,
  RateLimitedError,
  SessionExpiredError,
  SubstackError,
  UpstreamChangeError,
  UpstreamTransientError,
} from "./errors";
export { createSubstackClient, DEFAULT_PAGE_LIMIT } from "./httpSubstackClient";
export type { SubstackClientOptions } from "./httpSubstackClient";
export { parseProfileHtml, parseSubscriberCount } from "./profileParse";
export { withBackoff, backoffDelayMs } from "./backoff";
export type { BackoffOptions } from "./backoff";
export { pooledMap } from "./concurrency";
export type { PoolItemResult } from "./concurrency";
