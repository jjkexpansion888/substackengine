import { describe, expect, it, vi } from "vitest";
import { createSubstackClient } from "./httpSubstackClient";
import {
  RateLimitedError,
  SessionExpiredError,
  UpstreamChangeError,
  UpstreamTransientError,
} from "./errors";
import type { FetchLike } from "./types";

const DOMAIN = "whitetigercapital.substack.com";

type Call = { url: string; init: RequestInit | undefined };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function htmlResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
}

/** Mock fetch that records every call and answers from a queue of responders. */
function mockFetch(responders: Array<(call: Call) => Response>): {
  fetchImpl: FetchLike;
  calls: Call[];
} {
  const calls: Call[] = [];
  let i = 0;
  return {
    calls,
    fetchImpl: async (url, init) => {
      const call = { url, init };
      calls.push(call);
      const respond = responders[Math.min(i, responders.length - 1)];
      i += 1;
      return respond(call);
    },
  };
}

const subscriberRow = (id: number, name: string, email: string) => ({
  user_id: id,
  user_name: name,
  user_email_address: email,
  user_photo_url: null,
  subscription_created_at: "2026-09-17T12:19:52.599789000+00:00",
  subscription_interval: "free",
  activity_rating: 0,
  is_founding: false,
});

describe("validateSession", () => {
  it("sends the substack.sid cookie and parses the session", async () => {
    const { fetchImpl, calls } = mockFetch([
      () => jsonResponse({ id: "u-1", name: "Joon" }),
    ]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl });

    const session = await client.validateSession("cookie-value");

    expect(session).toEqual({
      userId: "u-1",
      subdomain: "whitetigercapital",
      displayName: "Joon",
    });
    expect(calls[0].url).toBe(`https://${DOMAIN}/api/v1/me`);
    expect((calls[0].init?.headers as Record<string, string>).cookie).toBe(
      "substack.sid=cookie-value",
    );
  });

  it("throws SessionExpiredError on 401/403", async () => {
    for (const status of [401, 403]) {
      const { fetchImpl } = mockFetch([() => jsonResponse({ error: "unauthorized" }, status)]);
      const client = createSubstackClient({ domain: DOMAIN, fetchImpl });
      await expect(client.validateSession("expired")).rejects.toBeInstanceOf(SessionExpiredError);
    }
  });

  it("treats a reshaped response as upstream drift", async () => {
    const { fetchImpl } = mockFetch([() => jsonResponse({ unexpected: true })]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl });
    await expect(client.validateSession("cookie")).rejects.toBeInstanceOf(UpstreamChangeError);
  });

  it("rejects an empty cookie without calling the network", async () => {
    const fetchImpl = vi.fn();
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl: fetchImpl as unknown as FetchLike });
    await expect(client.validateSession("  ")).rejects.toThrow(/empty/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("listSubscribers", () => {
  it("POSTs limit/offset to subscriber-stats and returns the count total", async () => {
    const { fetchImpl, calls } = mockFetch([
      () =>
        jsonResponse({
          subscribers: [subscriberRow(1679017, "Tom McAuley", "tom@example.com")],
          count: 561,
          lastSync: "2026-09-17T16:04:42Z",
        }),
    ]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl });

    const page = await client.listSubscribers("cookie", { limit: 50, offset: 0 });

    expect(page.total).toBe(561);
    expect(page.pageRowCount).toBe(1);
    expect(page.subscribers[0]).toMatchObject({
      substackUserId: "1679017",
      displayName: "Tom McAuley",
      email: "tom@example.com",
      subscriptionInterval: "free",
      activityRating: 0,
    });
    // Probe-verified contract: POST with { limit, offset } body and session cookie.
    expect(calls[0].url).toBe(`https://${DOMAIN}/api/v1/subscriber-stats`);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ limit: 50, offset: 0 });
    expect((calls[0].init?.headers as Record<string, string>).cookie).toBe("substack.sid=cookie");
  });

  it("parses the nanosecond-precision subscribed-at date from the probe sample", async () => {
    const { fetchImpl } = mockFetch([
      () =>
        jsonResponse({
          subscribers: [subscriberRow(1, "A", "a@example.com")],
          count: 1,
        }),
    ]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl });
    const page = await client.listSubscribers("cookie", { limit: 50, offset: 0 });
    expect(page.subscribers[0].subscribedAt?.toISOString()).toBe("2026-09-17T12:19:52.599Z");
  });

  it("skips rows without a user id instead of failing the page", async () => {
    const { fetchImpl } = mockFetch([
      () =>
        jsonResponse({
          subscribers: [{ user_name: "no id" }, subscriberRow(2, "B", "b@example.com")],
          count: 2,
        }),
    ]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl });
    const page = await client.listSubscribers("cookie", { limit: 50, offset: 0 });
    expect(page.subscribers).toHaveLength(1);
    expect(page.pageRowCount).toBe(2);
  });

  it("retries on 429 with backoff and then succeeds", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const { fetchImpl, calls } = mockFetch([
      () => jsonResponse({ error: "rate limited" }, 429),
      () => jsonResponse({ error: "rate limited" }, 429),
      () => jsonResponse({ subscribers: [subscriberRow(1, "A", "a@x.com")], count: 1 }),
    ]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl, sleep });

    const page = await client.listSubscribers("cookie", { limit: 50, offset: 0 });

    expect(page.total).toBe(1);
    expect(calls).toHaveLength(3); // 2 backoff retries then success
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000]);
  });

  it("surfaces sustained 429s as RateLimitedError", async () => {
    const { fetchImpl } = mockFetch([() => jsonResponse({ error: "rate limited" }, 429)]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl });
    await expect(client.listSubscribers("cookie", { limit: 50, offset: 0 })).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  it("treats a reshaped payload as UpstreamChangeError", async () => {
    const { fetchImpl } = mockFetch([() => jsonResponse({ rows: [], total_records: 0 })]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl });
    await expect(client.listSubscribers("cookie", { limit: 50, offset: 0 })).rejects.toBeInstanceOf(
      UpstreamChangeError,
    );
  });

  it("maps 5xx to a transient error", async () => {
    const { fetchImpl } = mockFetch([() => jsonResponse({}, 503)]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl });
    await expect(client.listSubscribers("cookie", { limit: 50, offset: 0 })).rejects.toBeInstanceOf(
      UpstreamTransientError,
    );
  });
});

describe("getPublicProfile", () => {
  it("uses the unauthenticated JSON endpoint and returns the exact count (probe v3)", async () => {
    const { fetchImpl, calls } = mockFetch([
      () =>
        jsonResponse({
          subscriberCountNumber: 20,
          subscriberCount: "20",
          followerCount: 5,
          bestseller_tier: null,
        }),
    ]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl });

    const profile = await client.getPublicProfile("tommcauley");

    expect(profile).toEqual({
      handle: "tommcauley",
      name: null,
      subscriberCount: 20,
      bestsellerStatus: null,
      profileUrl: "https://substack.com/@tommcauley",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://substack.com/api/v1/user/tommcauley/public_profile");
    // Public endpoint: the session cookie must NOT be attached.
    expect((calls[0].init?.headers as Record<string, string>).cookie).toBeUndefined();
  });

  it("falls back to the profile page when the JSON body carries no count", async () => {
    const { fetchImpl, calls } = mockFetch([
      () => jsonResponse({ unexpected: "shape" }),
      () =>
        htmlResponse(
          `<html><script>window._preloads = JSON.parse("{\\\"profile\\\":{\\\"handle\\\":\\\"tommcauley\\\",\\\"subscriberCountNumber\\\":37}}")</script></html>`,
        ),
    ]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl });

    const profile = await client.getPublicProfile("tommcauley");

    expect(profile.subscriberCount).toBe(37);
    expect(calls.map((c) => c.url)).toEqual([
      "https://substack.com/api/v1/user/tommcauley/public_profile",
      "https://substack.com/@tommcauley",
    ]);
  });

  it("falls back to the page after the JSON route fails transiently", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const { fetchImpl, calls } = mockFetch([
      () => jsonResponse({}, 500),
      () => jsonResponse({}, 500),
      () => jsonResponse({}, 500), // JSON retries exhausted
      () => htmlResponse('{\\"subscriberCountNumber\\":7}'), // single-shot fallback
    ]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl, sleep });

    const profile = await client.getPublicProfile("lucky");

    expect(profile.subscriberCount).toBe(7);
    expect(calls).toHaveLength(4); // 3 JSON attempts + 1 page attempt
    expect(sleep.mock.calls).toHaveLength(2); // only the JSON route retries
  });

  it("resolves a 404 JSON profile to nulls — never zero, no page fetch", async () => {
    const { fetchImpl, calls } = mockFetch([() => new Response("", { status: 404 })]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl });

    const profile = await client.getPublicProfile("ghost");

    expect(profile.subscriberCount).toBeNull();
    expect(profile.bestsellerStatus).toBeNull();
    expect(profile.profileUrl).toBe("https://substack.com/@ghost");
    expect(calls).toHaveLength(1);
  });

  it("resolves both routes missing data to null count (fallback, not zero)", async () => {
    const { fetchImpl } = mockFetch([
      () => jsonResponse({ unexpected: true }),
      () => htmlResponse("<html>profile without data</html>"),
    ]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl });
    const profile = await client.getPublicProfile("somebody");
    expect(profile.subscriberCount).toBeNull();
  });

  it("propagates rate limits instead of dodging them via the page", async () => {
    const { fetchImpl, calls } = mockFetch([() => jsonResponse({ error: "rate limited" }, 429)]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl });

    await expect(client.getPublicProfile("busy")).rejects.toBeInstanceOf(RateLimitedError);
    expect(calls.every((c) => c.url.includes("/public_profile"))).toBe(true); // never the page
  });

  it("gives up when both routes fail and throws for the caller to contain", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const { fetchImpl, calls } = mockFetch([() => jsonResponse({}, 500)]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl, sleep });

    await expect(client.getPublicProfile("down")).rejects.toBeInstanceOf(UpstreamTransientError);
    expect(calls).toHaveLength(4); // 3 JSON attempts (spec AC5) + 1 page attempt
  });
});

describe("request listener", () => {
  it("fires per HTTP attempt, retries included, with kinds", async () => {
    const onRequest = vi.fn();
    const { fetchImpl } = mockFetch([
      () => jsonResponse({ error: "rate limited" }, 429),
      () => jsonResponse({ subscribers: [], count: 0 }),
      () => new Response("", { status: 404 }),
    ]);
    const client = createSubstackClient({ domain: DOMAIN, fetchImpl, onRequest });

    await client.listSubscribers("cookie", { limit: 50, offset: 0 });
    await client.getPublicProfile("someone");

    const kinds = onRequest.mock.calls.map(([info]) => info.kind);
    expect(kinds).toEqual(["list", "list", "profile"]);
  });
});
