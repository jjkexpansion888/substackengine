/**
 * Error taxonomy for the Substack seam. Everything the client can throw is one
 * of these, so callers (sync pipeline, API routes) can map failures to states
 * without inspecting messages.
 */
export class SubstackError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** 401/403 from Substack — the session cookie is expired, invalid, or wrong account. */
export class SessionExpiredError extends SubstackError {}

/** 429 — callers should back off and retry (handled inside the client). */
export class RateLimitedError extends SubstackError {}

/** Network failure or 5xx — potentially transient, safe to retry. */
export class UpstreamTransientError extends SubstackError {}

/**
 * Substack's response no longer matches the contract this client was built
 * against (unexpected status or a reshaped payload). Not retryable — the
 * client must be updated. Per spec, surfaces as a stable 502 error state.
 */
export class UpstreamChangeError extends SubstackError {}

/** Bad caller input (malformed domain, empty cookie). Maps to a 400. */
export class InvalidInputError extends SubstackError {}
