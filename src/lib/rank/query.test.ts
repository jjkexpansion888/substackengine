import { describe, expect, it } from "vitest";
import {
  buildRankedPage,
  parseSubscribersQuery,
  profileUrlFor,
  toRankedJson,
} from "./query";
import { InvalidInputError } from "../substack/errors";
import type { SubscriberRow } from "./rankSubscribers";

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

/** One row per rung plus two extra count rows, ids chosen to be order-independent. */
function mixedRows(): SubscriberRow[] {
  return [
    row({ id: "s-activity", activityRating: 3, subscribedAt: T2 }),
    row({ id: "s-unknown", subscribedAt: T1 }),
    row({ id: "s-count-200", subscriberCount: 200, subscribedAt: T1 }),
    row({ id: "s-badge", bestsellerStatus: "tier 2", subscribedAt: T0 }),
    row({ id: "s-count-50", subscriberCount: 50, subscribedAt: T0 }),
    row({ id: "s-count-zero", subscriberCount: 0, subscribedAt: T2 }),
  ];
}

describe("parseSubscribersQuery", () => {
  it("defaults to rank asc with offset pagination at the default page size", () => {
    expect(parseSubscribersQuery(new URLSearchParams())).toEqual({
      sort: "rank",
      order: "asc",
      offset: 0,
      limit: 50,
    });
  });

  it("parses explicit params", () => {
    expect(
      parseSubscribersQuery(new URLSearchParams("sort=audience&order=asc&offset=10&limit=25")),
    ).toEqual({ sort: "audience", order: "asc", offset: 10, limit: 25 });
  });

  it("applies the per-key default order", () => {
    expect(parseSubscribersQuery(new URLSearchParams("sort=audience")).order).toBe("desc");
    expect(parseSubscribersQuery(new URLSearchParams("sort=name")).order).toBe("asc");
  });

  it.each(["audience_size", "RANK", ""])("rejects unsupported sort %s", (sort) => {
    expect(() => parseSubscribersQuery(new URLSearchParams(`sort=${sort}`))).toThrow(
      InvalidInputError,
    );
  });

  it("rejects an order that is not asc or desc", () => {
    expect(() =>
      parseSubscribersQuery(new URLSearchParams("order=descending")),
    ).toThrow(InvalidInputError);
  });

  it("rejects a limit outside 1..200 and non-numeric limits", () => {
    expect(() => parseSubscribersQuery(new URLSearchParams("limit=0"))).toThrow(InvalidInputError);
    expect(() => parseSubscribersQuery(new URLSearchParams("limit=201"))).toThrow(InvalidInputError);
    expect(() => parseSubscribersQuery(new URLSearchParams("limit=abc"))).toThrow(InvalidInputError);
  });

  it("rejects a negative or non-numeric offset", () => {
    expect(() => parseSubscribersQuery(new URLSearchParams("offset=-1"))).toThrow(InvalidInputError);
    expect(() => parseSubscribersQuery(new URLSearchParams("offset=x"))).toThrow(InvalidInputError);
  });
});

describe("buildRankedPage", () => {
  it("ranks over the full set before paging, so ranks are stable across pages", () => {
    const rows = mixedRows();
    const page1 = buildRankedPage(rows, parseSubscribersQuery(new URLSearchParams("limit=2")));
    const page2 = buildRankedPage(
      rows,
      parseSubscribersQuery(new URLSearchParams("limit=2&offset=2")),
    );
    expect(page1.total).toBe(rows.length);
    expect(page1.items.map((r) => [r.rank, r.subscriber.id])).toEqual([
      [1, "s-count-200"],
      [2, "s-count-50"],
    ]);
    expect(page2.items.map((r) => [r.rank, r.subscriber.id])).toEqual([
      [3, "s-count-zero"],
      [4, "s-badge"],
    ]);
  });

  it("returns an empty page with the true total once offset passes the end", () => {
    const page = buildRankedPage(
      mixedRows(),
      parseSubscribersQuery(new URLSearchParams("offset=100")),
    );
    expect(page.items).toEqual([]);
    expect(page.total).toBe(6);
  });

  it("sorts by audience descending by default with unknowns last", () => {
    const page = buildRankedPage(
      mixedRows(),
      parseSubscribersQuery(new URLSearchParams("sort=audience")),
    );
    expect(page.items.map((r) => r.subscriber.id)).toEqual([
      "s-count-200",
      "s-count-50",
      "s-count-zero",
      // Fallback rows tie on a null audience size and break by subscription date.
      "s-badge",
      "s-unknown",
      "s-activity",
    ]);
  });

  it("keeps unknowns last even when the audience sort is ascending", () => {
    const page = buildRankedPage(
      mixedRows(),
      parseSubscribersQuery(new URLSearchParams("sort=audience&order=asc")),
    );
    expect(page.items.map((r) => r.subscriber.id)).toEqual([
      "s-count-zero",
      "s-count-50",
      "s-count-200",
      "s-badge",
      "s-unknown",
      "s-activity",
    ]);
  });

  it("sorts by subscription date, nulls last in both directions, ranks unchanged", () => {
    const rows = [
      row({ id: "dated", subscribedAt: T1, subscriberCount: 5 }),
      row({ id: "undated", subscribedAt: null, subscriberCount: 9 }),
      row({ id: "oldest", subscribedAt: T0, subscriberCount: 7 }),
    ];
    const asc = buildRankedPage(
      rows,
      parseSubscribersQuery(new URLSearchParams("sort=subscribedAt")),
    );
    expect(asc.items.map((r) => r.subscriber.id)).toEqual(["oldest", "dated", "undated"]);

    const desc = buildRankedPage(
      rows,
      parseSubscribersQuery(new URLSearchParams("sort=subscribedAt&order=desc")),
    );
    expect(desc.items.map((r) => r.subscriber.id)).toEqual(["dated", "oldest", "undated"]);

    // A view sort reorders, never renumbers: ranks are still the ladder's —
    // count 9 ranks 1st, count 7 2nd, count 5 3rd, whatever the view order.
    expect(desc.items.map((r) => [r.rank, r.subscriber.id])).toEqual([
      [3, "dated"],
      [2, "oldest"],
      [1, "undated"],
    ]);
  });

  it("sorts by name case-insensitively with nulls last", () => {
    const rows = [
      row({ id: "lower", displayName: "ada", subscriberCount: 1 }),
      row({ id: "upper", displayName: "Boris", subscriberCount: 2 }),
      row({ id: "nameless", displayName: null, subscriberCount: 3 }),
    ];
    const asc = buildRankedPage(
      rows,
      parseSubscribersQuery(new URLSearchParams("sort=name")),
    );
    expect(asc.items.map((r) => r.subscriber.id)).toEqual(["lower", "upper", "nameless"]);

    const desc = buildRankedPage(
      rows,
      parseSubscribersQuery(new URLSearchParams("sort=name&order=desc")),
    );
    expect(desc.items.map((r) => r.subscriber.id)).toEqual(["upper", "lower", "nameless"]);
  });

  it("reverses the ladder for sort=rank&order=desc", () => {
    const page = buildRankedPage(
      mixedRows(),
      parseSubscribersQuery(new URLSearchParams("sort=rank&order=desc&limit=3")),
    );
    expect(page.items.map((r) => [r.rank, r.subscriber.id])).toEqual([
      [6, "s-unknown"],
      [5, "s-activity"],
      [4, "s-badge"],
    ]);
  });
});

describe("toRankedJson", () => {
  it("serializes dates to ISO strings and derives the profile URL from the handle", () => {
    const json = toRankedJson({
      subscriber: row({
        id: "sub-1",
        handle: "tom",
        displayName: "Tom",
        subscribedAt: T0,
        subscriberCount: 20,
        capturedAt: T2,
      }),
      rank: 1,
      audienceSize: 20,
      audienceSource: "subscriber_count",
      asOf: T2,
    });
    expect(json).toEqual({
      subscriberId: "sub-1",
      displayName: "Tom",
      handle: "tom",
      profileUrl: "https://substack.com/@tom",
      subscribedAt: T0.toISOString(),
      rank: 1,
      audienceSize: 20,
      audienceSource: "subscriber_count",
      asOf: T2.toISOString(),
    });
  });

  it("leaves the profile URL null when there is no handle", () => {
    expect(profileUrlFor(null)).toBeNull();
    expect(
      toRankedJson({
        subscriber: row({ id: "s", handle: null }),
        rank: 1,
        audienceSize: null,
        audienceSource: "unknown",
        asOf: null,
      }).profileUrl,
    ).toBeNull();
  });
});
