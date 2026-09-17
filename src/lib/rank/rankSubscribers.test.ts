import { describe, expect, it } from "vitest";
import {
  bestsellerTierOrdinal,
  classifyAudienceSource,
  rankSubscribers,
  type SubscriberRow,
} from "./rankSubscribers";

function row(overrides: Partial<SubscriberRow> & { id: string }): SubscriberRow {
  return {
    displayName: `name-${overrides.id}`,
    handle: `handle-${overrides.id}`,
    subscribedAt: null,
    capturedAt: new Date("2026-09-17T00:00:00Z"),
    subscriberCount: null,
    bestsellerStatus: null,
    activityRating: null,
    ...overrides,
  };
}

const T0 = new Date("2026-01-01T00:00:00Z");
const T1 = new Date("2026-02-01T00:00:00Z");
const T2 = new Date("2026-03-01T00:00:00Z");

describe("classifyAudienceSource", () => {
  it("picks the count rung whenever a count is present, including a real zero", () => {
    expect(classifyAudienceSource(row({ id: "a", subscriberCount: 120 }))).toBe(
      "subscriber_count",
    );
    // Publication-less profiles report 0 — a measured zero, not a hidden count.
    expect(classifyAudienceSource(row({ id: "a", subscriberCount: 0 }))).toBe(
      "subscriber_count",
    );
  });

  it("demotes to bestseller when the count is missing but a badge exists", () => {
    expect(
      classifyAudienceSource(row({ id: "a", bestsellerStatus: "bestseller" })),
    ).toBe("bestseller");
  });

  it("demotes to activity_proxy when only the owner feed's activity_rating exists", () => {
    expect(classifyAudienceSource(row({ id: "a", activityRating: 3 }))).toBe(
      "activity_proxy",
    );
  });

  it("is unknown when no rung has data", () => {
    expect(classifyAudienceSource(row({ id: "a" }))).toBe("unknown");
  });
});

describe("bestsellerTierOrdinal", () => {
  it("extracts an embedded tier number", () => {
    expect(bestsellerTierOrdinal("tier 2")).toBe(2);
    expect(bestsellerTierOrdinal("#10")).toBe(10);
  });

  it("defaults any badge without a number to tier 1", () => {
    expect(bestsellerTierOrdinal("bestseller")).toBe(1);
    expect(bestsellerTierOrdinal("Bestseller")).toBe(1);
  });
});

describe("rankSubscribers", () => {
  it("orders rung 1 by exact count, largest first", () => {
    const ranked = rankSubscribers([
      row({ id: "small", subscriberCount: 4 }),
      row({ id: "large", subscriberCount: 291 }),
      row({ id: "mid", subscriberCount: 35 }),
    ]);
    expect(ranked.map((r) => r.subscriber.id)).toEqual(["large", "mid", "small"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(ranked.map((r) => r.audienceSize)).toEqual([291, 35, 4]);
    expect(ranked.every((r) => r.audienceSource === "subscriber_count")).toBe(true);
  });

  it("ranks a real zero above the fallback rungs but below every positive count", () => {
    const ranked = rankSubscribers([
      row({ id: "zero", subscriberCount: 0 }),
      row({ id: "one", subscriberCount: 1 }),
      row({ id: "badge", bestsellerStatus: "bestseller" }),
    ]);
    expect(ranked.map((r) => r.subscriber.id)).toEqual(["one", "zero", "badge"]);
    expect(ranked[1].audienceSize).toBe(0);
    expect(ranked[2].audienceSource).toBe("bestseller");
    expect(ranked[2].audienceSize).toBeNull();
  });

  it("orders the bestseller rung by tier ordinal, largest first", () => {
    const ranked = rankSubscribers([
      row({ id: "t1", bestsellerStatus: "bestseller" }),
      row({ id: "t10", bestsellerStatus: "tier 10" }),
      row({ id: "t2", bestsellerStatus: "tier 2" }),
    ]);
    expect(ranked.map((r) => r.subscriber.id)).toEqual(["t10", "t2", "t1"]);
    expect(ranked.every((r) => r.audienceSource === "bestseller")).toBe(true);
  });

  it("orders the activity rung by activity_rating, largest first", () => {
    const ranked = rankSubscribers([
      row({ id: "quiet", activityRating: 1 }),
      row({ id: "busy", activityRating: 7 }),
      row({ id: "idle", activityRating: 0 }),
    ]);
    expect(ranked.map((r) => r.subscriber.id)).toEqual(["busy", "quiet", "idle"]);
    expect(ranked.every((r) => r.audienceSource === "activity_proxy")).toBe(true);
  });

  it("ranks a measured zero activity above unknown", () => {
    const ranked = rankSubscribers([
      row({ id: "nobody" }),
      row({ id: "idle", activityRating: 0 }),
    ]);
    expect(ranked.map((r) => r.subscriber.id)).toEqual(["idle", "nobody"]);
    expect(ranked.map((r) => r.audienceSource)).toEqual([
      "activity_proxy",
      "unknown",
    ]);
  });

  it("demotes per rung: count > bestseller > activity > unknown", () => {
    const ranked = rankSubscribers([
      row({ id: "unknown" }),
      row({ id: "activity", activityRating: 3 }),
      row({ id: "badge", bestsellerStatus: "bestseller" }),
      row({ id: "count", subscriberCount: 12 }),
    ]);
    expect(ranked.map((r) => r.subscriber.id)).toEqual([
      "count",
      "badge",
      "activity",
      "unknown",
    ]);
    expect(ranked.map((r) => r.audienceSource)).toEqual([
      "subscriber_count",
      "bestseller",
      "activity_proxy",
      "unknown",
    ]);
  });

  it("never removes a subscriber, whatever the data", () => {
    const rows = [
      row({ id: "count", subscriberCount: 12 }),
      row({ id: "unknown" }),
      row({ id: "zero", subscriberCount: 0 }),
      row({ id: "badge", bestsellerStatus: "tier 3" }),
      row({ id: "activity", activityRating: 2 }),
    ];
    const ranked = rankSubscribers(rows);
    expect(ranked).toHaveLength(rows.length);
    expect(new Set(ranked.map((r) => r.subscriber.id))).toEqual(
      new Set(rows.map((r) => r.id)),
    );
  });

  it("breaks count ties by subscription date, earlier first", () => {
    const ranked = rankSubscribers([
      row({ id: "late", subscriberCount: 20, subscribedAt: T2 }),
      row({ id: "early", subscriberCount: 20, subscribedAt: T0 }),
      row({ id: "middle", subscriberCount: 20, subscribedAt: T1 }),
    ]);
    expect(ranked.map((r) => r.subscriber.id)).toEqual(["early", "middle", "late"]);
  });

  it("breaks ties at the unknown rung by subscription date too", () => {
    const ranked = rankSubscribers([
      row({ id: "late-unknown", subscribedAt: T2 }),
      row({ id: "early-unknown", subscribedAt: T0 }),
    ]);
    expect(ranked.map((r) => r.subscriber.id)).toEqual([
      "early-unknown",
      "late-unknown",
    ]);
  });

  it("sorts subscribers without a subscription date after dated peers", () => {
    const ranked = rankSubscribers([
      row({ id: "no-date", subscriberCount: 20, subscribedAt: null }),
      row({ id: "dated", subscriberCount: 20, subscribedAt: T1 }),
    ]);
    expect(ranked.map((r) => r.subscriber.id)).toEqual(["dated", "no-date"]);
  });

  it("falls back to the subscriber id for a fully deterministic order", () => {
    const ranked = rankSubscribers([
      row({ id: "b", subscriberCount: 5, subscribedAt: T0 }),
      row({ id: "a", subscriberCount: 5, subscribedAt: T0 }),
    ]);
    expect(ranked.map((r) => r.subscriber.id)).toEqual(["a", "b"]);
  });

  it("is order-independent: shuffled input produces the same ranked list", () => {
    const rankedA = rankSubscribers([
      row({ id: "count", subscriberCount: 12 }),
      row({ id: "badge", bestsellerStatus: "bestseller" }),
      row({ id: "activity", activityRating: 1 }),
      row({ id: "unknown" }),
    ]);
    const rankedB = rankSubscribers([
      row({ id: "unknown" }),
      row({ id: "activity", activityRating: 1 }),
      row({ id: "badge", bestsellerStatus: "bestseller" }),
      row({ id: "count", subscriberCount: 12 }),
    ]);
    expect(rankedB.map((r) => r.subscriber.id)).toEqual(
      rankedA.map((r) => r.subscriber.id),
    );
  });

  it("carries each row's own snapshot as-of time", () => {
    const early = new Date("2026-09-01T00:00:00Z");
    const late = new Date("2026-09-17T12:00:00Z");
    const ranked = rankSubscribers([
      row({ id: "old-snapshot", subscriberCount: 5, capturedAt: early }),
      row({ id: "new-snapshot", subscriberCount: 6, capturedAt: late }),
    ]);
    expect(ranked.find((r) => r.subscriber.id === "old-snapshot")?.asOf).toEqual(early);
    expect(ranked.find((r) => r.subscriber.id === "new-snapshot")?.asOf).toEqual(late);
  });

  it("keeps rows without a snapshot yet as unknown with a null as-of", () => {
    const ranked = rankSubscribers([
      row({ id: "no-snapshot", capturedAt: null }),
      row({ id: "count", subscriberCount: 3 }),
    ]);
    expect(ranked.map((r) => r.subscriber.id)).toEqual(["count", "no-snapshot"]);
    expect(ranked[1].audienceSource).toBe("unknown");
    expect(ranked[1].asOf).toBeNull();
  });
});
