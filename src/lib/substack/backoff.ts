import { RateLimitedError, UpstreamTransientError } from "./errors";

export type BackoffOptions = {
  /** Retries after the initial attempt (default 2 — spec: "retry twice"). */
  maxRetries?: number;
  /** Delay before the first retry (default 500ms). */
  baseDelayMs?: number;
  /** Upper bound on any single delay (default 30s). */
  maxDelayMs?: number;
  /** Injectable sleep — tests assert schedules without fake timers. */
  sleep?: (ms: number) => Promise<void>;
  /** Errors worth retrying; default: rate limits only. */
  retryOn?: (error: unknown) => boolean;
  /** Observability hook for tests/logs. */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
};

export const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential with attempt, capped at maxDelayMs: 500, 1000, 2000, ... */
export function backoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}

const defaultRetryOn = (error: unknown): boolean => error instanceof RateLimitedError;

/**
 * Retry `fn` while it throws a retryable error, waiting exponentially between
 * attempts. Non-retryable errors and exhausted retries propagate unchanged.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  options: BackoffOptions = {},
): Promise<T> {
  const {
    maxRetries = 2,
    baseDelayMs = 500,
    maxDelayMs = 30_000,
    sleep = defaultSleep,
    retryOn = defaultRetryOn,
    onRetry,
  } = options;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries || !retryOn(error)) throw error;
      const delayMs = backoffDelayMs(attempt, baseDelayMs, maxDelayMs);
      onRetry?.({ attempt: attempt + 1, delayMs, error });
      await sleep(delayMs);
    }
  }
}

/** Retry policy used by the client for transport-level failures on Substack. */
export const transportRetryOn = (error: unknown): boolean =>
  error instanceof RateLimitedError || error instanceof UpstreamTransientError;
