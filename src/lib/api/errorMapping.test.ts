import { describe, expect, it } from "vitest";
import { mapSubstackError, mapUnknownError } from "./errorMapping";
import {
  InvalidInputError,
  RateLimitedError,
  SessionExpiredError,
  UpstreamChangeError,
  UpstreamTransientError,
} from "../substack/errors";

describe("mapSubstackError", () => {
  it("maps each typed failure to its HTTP status and code", () => {
    expect(mapSubstackError(new InvalidInputError("bad"))).toMatchObject({ status: 400, code: "invalid_input" });
    expect(mapSubstackError(new SessionExpiredError("expired"))).toMatchObject({ status: 401, code: "session_expired" });
    expect(mapSubstackError(new RateLimitedError("429"))).toMatchObject({ status: 429, code: "rate_limited" });
    expect(mapSubstackError(new UpstreamChangeError("moved"))).toMatchObject({ status: 502, code: "upstream_changed" });
    expect(mapSubstackError(new UpstreamTransientError("5xx"))).toMatchObject({ status: 503, code: "upstream_unavailable" });
  });
});

describe("mapUnknownError", () => {
  it("passes SubstackErrors through", () => {
    expect(mapUnknownError(new RateLimitedError("429")).status).toBe(429);
  });

  it("hides internals behind a generic 500 for unknown errors", () => {
    const mapped = mapUnknownError(new Error("db password is hunter2"));
    expect(mapped.status).toBe(500);
    expect(mapped.message).not.toContain("db password");
  });
});
