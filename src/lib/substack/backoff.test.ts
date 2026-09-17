import { describe, expect, it, vi } from "vitest";
import { backoffDelayMs, withBackoff } from "./backoff";
import { RateLimitedError, UpstreamTransientError } from "./errors";

const rateLimited = () => new RateLimitedError("429");

describe("backoffDelayMs", () => {
  it("doubles per attempt and caps", () => {
    expect(backoffDelayMs(0, 500, 30_000)).toBe(500);
    expect(backoffDelayMs(1, 500, 30_000)).toBe(1000);
    expect(backoffDelayMs(2, 500, 30_000)).toBe(2000);
    expect(backoffDelayMs(10, 500, 30_000)).toBe(30_000);
  });
});

describe("withBackoff", () => {
  it("returns the first success without sleeping", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await withBackoff(async () => "ok", { sleep });
    expect(result).toBe("ok");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries rate limits twice by default, then gives up", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn(async () => {
      throw rateLimited();
    });

    await expect(withBackoff(fn, { sleep })).rejects.toBeInstanceOf(RateLimitedError);
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000]);
  });

  it("succeeds after rate-limit retries", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    let calls = 0;
    const result = await withBackoff(async () => {
      calls += 1;
      if (calls < 3) throw rateLimited();
      return "recovered";
    }, { sleep });
    expect(result).toBe("recovered");
    expect(calls).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn(async () => {
      throw new UpstreamTransientError("nope");
    });

    await expect(withBackoff(fn, { sleep, retryOn: () => false })).rejects.toBeInstanceOf(
      UpstreamTransientError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("honors a custom retryOn policy (transport failures)", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    let calls = 0;
    const result = await withBackoff(async () => {
      calls += 1;
      if (calls === 1) throw new UpstreamTransientError("flaky");
      return "ok";
    }, { sleep, retryOn: (e) => e instanceof UpstreamTransientError });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("reports each retry through onRetry", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();
    const fn = vi.fn(async () => {
      throw rateLimited();
    });

    await expect(withBackoff(fn, { sleep, onRetry })).rejects.toBeInstanceOf(RateLimitedError);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][0]).toMatchObject({ attempt: 1, delayMs: 500 });
    expect(onRetry.mock.calls[1][0]).toMatchObject({ attempt: 2, delayMs: 1000 });
  });
});
