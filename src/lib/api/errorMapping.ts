import {
  InvalidInputError,
  RateLimitedError,
  SessionExpiredError,
  SubstackError,
  UpstreamChangeError,
  UpstreamTransientError,
} from "../substack/errors";

export type ApiErrorCode =
  | "invalid_input"
  | "session_expired"
  | "rate_limited"
  | "upstream_changed"
  | "upstream_unavailable"
  | "not_found"
  | "internal";

/** Pure SubstackError → HTTP mapping; routes stay thin. */
export function mapSubstackError(error: SubstackError): {
  status: number;
  code: ApiErrorCode;
  message: string;
} {
  if (error instanceof InvalidInputError) {
    return { status: 400, code: "invalid_input", message: error.message };
  }
  if (error instanceof SessionExpiredError) {
    return {
      status: 401,
      code: "session_expired",
      message: "The Substack session was rejected. Reconnect the publication.",
    };
  }
  if (error instanceof RateLimitedError) {
    return {
      status: 429,
      code: "rate_limited",
      message: "Substack is rate limiting us. Retry shortly.",
    };
  }
  if (error instanceof UpstreamChangeError) {
    return {
      status: 502,
      code: "upstream_changed",
      message: "Substack's response shape changed — the integration needs updating.",
    };
  }
  if (error instanceof UpstreamTransientError) {
    return {
      status: 503,
      code: "upstream_unavailable",
      message: "Substack is temporarily unavailable.",
    };
  }
  return { status: 500, code: "internal", message: "Unexpected integration failure." };
}

/** Unknown errors get a generic 500 — internals never leak into responses. */
export function mapUnknownError(error: unknown): {
  status: number;
  code: ApiErrorCode;
  message: string;
} {
  if (error instanceof SubstackError) return mapSubstackError(error);
  return { status: 500, code: "internal", message: "Unexpected server error." };
}

export function jsonError(error: unknown): Response {
  const mapped = mapUnknownError(error);
  return Response.json(
    { error: { code: mapped.code, message: mapped.message } },
    { status: mapped.status },
  );
}
