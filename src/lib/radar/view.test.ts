import { describe, expect, it } from "vitest";
import {
  apiErrorCode,
  apiErrorMessage,
  audienceBadgeLabel,
  buildRadarHref,
  connectFailureMessage,
  countExactAudience,
  formatDateLabel,
  formatCount,
  formatTimestampLabel,
  lastSyncedLabel,
  nextSortOrder,
  parseRadarQueryOrFallback,
  runSummaryLabel,
  syncFailureMessage,
  syncResultFromResponse,
  syncResultSummary,
  toRadarRowView,
} from "./view";
import type { SubscriberRow } from "@/lib/rank/rankSubscribers";

const CAPTURED_AT = new Date("2026-09-17T00:00:00Z");

function row(overrides: Partial<SubscriberRow> & { id: string }): SubscriberRow {
  return {
    displayName: `name-${overrides.id}`,
    handle: `handle-${overrides.id}`,
    subscribedAt: null,
    capturedAt: CAPTURED_AT,
    subscriberCount: null,
    bestsellerStatus: null,
    activityRating: null,
    ...overrides,
  };
}

describe("radar view formatting", () => {
  it("formats dates as UTC ISO dates and nulls as null", () => {
    expect(formatDateLabel(new Date("2026-02-01T00:00:00Z"))).toBe("2026-02-01");
    expect(formatDateLabel(null)).toBe(null);
    expect(formatTimestampLabel(new Date("2026-09-17T14:03:00Z"))).toBe("2026-09-17 14:03 UTC");
    expect(formatTimestampLabel(null)).toBe(null);
  });

  it("formats counts with an explicit locale", () => {
    expect(formatCount(291)).toBe("291");
    expect(formatCount(1234)).toBe("1,234");
  });

  it("names the fallback badge per rung and none for exact counts", () => {
    expect(audienceBadgeLabel("subscriber_count")).toBe(null);
    expect(audienceBadgeLabel("bestseller")).toBe("bestseller");
    expect(audienceBadgeLabel("activity_proxy")).toBe("activity proxy");
    expect(audienceBadgeLabel("unknown")).toBe("no public data");
  });
});

describe("radar row view", () => {
  it("renders exact counts with no badge", () => {
    const view = toRadarRowView({
      subscriber: row({ id: "s-1", subscriberCount: 1234, subscribedAt: new Date("2026-02-01T00:00:00Z") }),
      rank: 4,
      audienceSize: 1234,
      audienceSource: "subscriber_count",
      asOf: CAPTURED_AT,
    });
    expect(view).toEqual({
      subscriberId: "s-1",
      rank: 4,
      displayName: "name-s-1",
      handle: "handle-s-1",
      profileUrl: "https://substack.com/@handle-s-1",
      audienceLabel: "1,234",
      badgeLabel: null,
      subscribedLabel: "2026-02-01",
      asOfLabel: "2026-09-17",
    });
  });

  it("renders unknown audience as the explicit word unknown, never zero or blank", () => {
    const view = toRadarRowView({
      subscriber: row({ id: "s-1" }),
      rank: 9,
      audienceSize: null,
      audienceSource: "unknown",
      asOf: null,
    });
    expect(view.audienceLabel).toBe("unknown");
    expect(view.badgeLabel).toBe("no public data");
    expect(view.subscribedLabel).toBe(null);
    expect(view.asOfLabel).toBe(null);
  });
});

describe("countExactAudience", () => {
  it("counts only the exact-count rung over the full set", () => {
    const rows = [
      row({ id: "a", subscriberCount: 100 }),
      row({ id: "b", bestsellerStatus: "tier 3" }),
      row({ id: "c", activityRating: 7 }),
      row({ id: "d" }),
      row({ id: "e", subscriberCount: 0 }),
    ];
    expect(countExactAudience(rows)).toBe(2);
  });
});

describe("sort hrefs", () => {
  const query = { sort: "rank" as const, order: "asc" as const, offset: 0, limit: 50 };

  it("toggles the active key's order and resets to the first page", () => {
    expect(nextSortOrder("rank", query)).toBe("desc");
    expect(buildRadarHref("/pub/p/radar", query, { sort: "rank", order: "desc", offset: 0 })).toBe(
      "/pub/p/radar?sort=rank&order=desc&offset=0&limit=50",
    );
  });

  it("applies the natural default when switching keys", () => {
    expect(nextSortOrder("audience", query)).toBe("desc");
    expect(nextSortOrder("name", query)).toBe("asc");
    expect(nextSortOrder("subscribedAt", { ...query, sort: "name", order: "desc" })).toBe("asc");
  });

  it("keeps sort and limit while paging", () => {
    expect(
      buildRadarHref(
        "/pub/p/radar",
        { sort: "audience", order: "desc", offset: 0, limit: 2 },
        { offset: 2 },
      ),
    ).toBe("/pub/p/radar?sort=audience&order=desc&offset=2&limit=2");
  });
});

describe("parseRadarQueryOrFallback", () => {
  it("passes valid parameters through", () => {
    const result = parseRadarQueryOrFallback(new URLSearchParams("sort=name&order=desc&offset=5&limit=10"));
    expect(result).toEqual({
      query: { sort: "name", order: "desc", offset: 5, limit: 10 },
      notice: null,
    });
  });

  it("falls back to defaults with a notice on an invalid sort", () => {
    const result = parseRadarQueryOrFallback(new URLSearchParams("sort=bogus"));
    expect(result.query).toEqual({ sort: "rank", order: "asc", offset: 0, limit: 50 });
    expect(result.notice).toContain("bogus");
  });

  it("falls back to defaults with a notice on an invalid limit", () => {
    const result = parseRadarQueryOrFallback(new URLSearchParams("limit=500"));
    expect(result.query).toEqual({ sort: "rank", order: "asc", offset: 0, limit: 50 });
    expect(result.notice).toContain("between 1 and 200");
  });
});

describe("last-synced header", () => {
  it("prefers the operational run record", () => {
    const label = lastSyncedLabel([row({ id: "a", capturedAt: CAPTURED_AT })], {
      finishedAt: new Date("2026-09-18T08:30:00Z"),
      status: "completed",
      subscribersSeen: 10,
      profilesEnriched: 9,
      profileErrors: 1,
    });
    expect(label).toBe("2026-09-18 08:30 UTC");
  });

  it("falls back to the newest snapshot and stays null without one", () => {
    const rows = [
      row({ id: "a", capturedAt: new Date("2026-09-16T00:00:00Z") }),
      row({ id: "b", capturedAt: new Date("2026-09-17T00:00:00Z") }),
      row({ id: "c", capturedAt: null }),
    ];
    expect(lastSyncedLabel(rows, null)).toBe("2026-09-17 00:00 UTC");
    expect(lastSyncedLabel([], null)).toBe(null);
  });

  it("summarizes the run, flagging unavailable lookups", () => {
    expect(
      runSummaryLabel({
        finishedAt: CAPTURED_AT,
        status: "completed",
        subscribersSeen: 25,
        profilesEnriched: 23,
        profileErrors: 2,
      }),
    ).toBe("Last sync completed — 25 subscribers seen, 23 profiles enriched, 2 lookups unavailable");
  });
});

describe("failure surfaces", () => {
  it("maps sync failures to state-specific messages", () => {
    expect(syncFailureMessage("session_expired", null)).toContain("Connection expired — reconnect");
    expect(syncFailureMessage("rate_limited", null)).toContain("rate limiting");
    expect(syncFailureMessage("upstream_changed", null)).toContain("response shape changed");
    expect(syncFailureMessage("network", null)).toContain("Could not reach the server");
    expect(syncFailureMessage("invalid_input", "bad body")).toBe("bad body");
    expect(syncFailureMessage("internal", null)).toContain("failed unexpectedly");
  });

  it("names the rejected-cookie causes on connect", () => {
    const message = connectFailureMessage("session_expired", null);
    expect(message).toContain("expired");
    expect(message).toContain("different Substack account");
    expect(message).toContain("substack.sid");
  });

  it("reads error codes and messages defensively", () => {
    expect(apiErrorCode({ error: { code: "rate_limited", message: "slow down" } })).toBe("rate_limited");
    expect(apiErrorCode({ error: { code: "made_up" } })).toBe("internal");
    expect(apiErrorCode(null)).toBe("internal");
    expect(apiErrorMessage({ error: { message: "slow down" } })).toBe("slow down");
    expect(apiErrorMessage(null)).toBe(null);
    expect(apiErrorMessage({ error: { code: "x" } })).toBe(null);
  });

  it("validates the sync 200 body down to banner fields", () => {
    expect(
      syncResultFromResponse({ sync: { subscribersSeen: 25, profilesEnriched: 23 } }),
    ).toEqual({ subscribersSeen: 25, profilesEnriched: 23 });
    expect(syncResultFromResponse({ sync: null })).toBe(null);
    expect(syncResultFromResponse(null)).toBe(null);
    expect(syncResultFromResponse({ sync: { subscribersSeen: "25" } })).toBe(null);
    expect(syncResultSummary({ subscribersSeen: 25, profilesEnriched: 23 })).toBe(
      "25 subscribers seen, 23 profiles enriched",
    );
  });
});
