import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RadarView, type RadarViewConnectedProps, type RadarViewProps } from "./RadarView";
import { buildRankedPage, type SubscribersQuery } from "@/lib/rank/query";
import { countExactAudience, toRadarRowView } from "@/lib/radar/view";
import type { SubscriberRow } from "@/lib/rank/rankSubscribers";

/**
 * Radar view tests — every consequential state from the spec plus sort and
 * pagination rendering. The view is props-only, so tests render it with
 * react-dom/server and assert on markup; the rows come from the real
 * ranker/query pipeline, so the ranks shown are the API's ranks.
 */

const CAPTURED_AT = new Date("2026-09-17T00:00:00Z");

function row(overrides: Partial<SubscriberRow> & { id: string }): SubscriberRow {
  return {
    displayName: `name-${overrides.id}`,
    handle: `handle-${overrides.id}`,
    subscribedAt: new Date("2026-02-01T00:00:00Z"),
    capturedAt: CAPTURED_AT,
    subscriberCount: null,
    bestsellerStatus: null,
    activityRating: null,
    ...overrides,
  };
}

type ViewOverrides = Partial<Omit<RadarViewConnectedProps, "rows">> & {
  rowsSource?: SubscriberRow[];
};

function connectProps(overrides: ViewOverrides = {}): RadarViewProps {
  const { rowsSource, ...rest } = overrides;
  const query: SubscribersQuery =
    rest.query ?? { sort: "rank", order: "asc", offset: 0, limit: 50 };
  const source = rowsSource ?? [];
  const ranked = buildRankedPage(source, query);
  return {
    publication: { displayName: "Test Pub", subdomain: "testpub", cookieValid: true },
    lastSyncedLabel: "2026-09-17 00:00 UTC",
    runSummary: null,
    rows: ranked.items.map(toRadarRowView),
    total: ranked.total,
    exactCount: countExactAudience(source),
    query,
    baseUrl: "/pub/pub-1/radar",
    syncSlot: null,
    queryNotice: null,
    ...rest,
  };
}

function renderRadar(props: RadarViewProps): string {
  return renderToStaticMarkup(createElement(RadarView, props));
}

function cellsFor(markup: string, testId: string): string[] {
  return [
    ...markup.matchAll(new RegExp(`<td data-testid="${testId}"[^>]*>([\\s\\S]*?)</td>`, "g")),
  ].map((match) => match[1]);
}

describe("RadarView", () => {
  it("renders the ranked table: rank, linked name, audience, subscribed, as-of", () => {
    const markup = renderRadar(
      connectProps({
        rowsSource: [
          row({ id: "big", subscriberCount: 1234 }),
          row({ id: "small", subscriberCount: 5, subscribedAt: new Date("2026-03-01T00:00:00Z") }),
        ],
      }),
    );

    expect(markup).toContain("Influencer Radar — Test Pub");
    expect(markup).toContain("data-testid=\"radar-table\"");
    expect(markup).toContain("https://substack.com/@handle-big");
    const ranks = cellsFor(markup, "cell-rank").map((cell) => cell.trim());
    expect(ranks).toEqual(["1", "2"]);
    const audiences = cellsFor(markup, "cell-audience").map((cell) => cell.trim());
    expect(audiences).toEqual(["1,234", "5"]);
    expect(cellsFor(markup, "cell-subscribed")).toEqual(["2026-02-01", "2026-03-01"]);
    expect(markup).toContain("2026-09-17"); // as-of column
  });

  it("state: missing connection — links to /connect instead of a table", () => {
    const markup = renderRadar({ publication: null });
    expect(markup).toContain("No publication connected");
    expect(markup).toContain('href="/connect"');
    expect(markup).not.toContain("radar-table");
  });

  it("state: partial data — fallback badges plus the n-of-m header note", () => {
    const markup = renderRadar(
      connectProps({
        rowsSource: [
          row({ id: "exact", subscriberCount: 42 }),
          row({ id: "tier", bestsellerStatus: "tier 3" }),
          row({ id: "ghost", activityRating: 6 }),
          row({ id: "unknown" }),
        ],
      }),
    );
    expect(markup).toContain("1 of 4 subscribers show exact audience size");
    const badges = [...markup.matchAll(/data-testid="audience-badge"[^>]*>([^<]*)</g)].map(
      (m) => m[1],
    );
    expect(badges).toEqual(["bestseller", "activity proxy", "no public data"]);
    // The unknown rung shows the explicit word, never a zero or an empty cell.
    const ghostAudience = cellsFor(markup, "cell-audience")[2];
    expect(ghostAudience).toContain("unknown");
    expect(ghostAudience).not.toMatch(/^0/);
  });

  it("state: cookie expired — reconnect banner with old rows still readable", () => {
    const markup = renderRadar(
      connectProps({
        publication: { displayName: "Test Pub", subdomain: "testpub", cookieValid: false },
        rowsSource: [row({ id: "big", subscriberCount: 1234 })],
      }),
    );
    expect(markup).toContain("data-testid=\"reconnect-banner\"");
    expect(markup).toContain("Connection expired — reconnect");
    expect(markup).toContain('href="/connect"');
    expect(markup).toContain("Old snapshots stay readable");
    // Stale data stays visible beside the banner.
    expect(cellsFor(markup, "cell-rank")).toEqual(["1"]);
  });

  it("renders the empty state (connected, nothing synced) with a never last-synced", () => {
    const markup = renderRadar(connectProps({ lastSyncedLabel: null }));
    expect(markup).toContain("data-testid=\"empty-state\"");
    expect(markup).toContain("No subscribers yet");
    expect(markup).toContain("Last synced: never");
  });

  it("renders sort controls: active key marked, toggles order, resets to page one", () => {
    const markup = renderRadar(
      connectProps({
        query: { sort: "audience", order: "desc", offset: 0, limit: 50 },
        rowsSource: [row({ id: "a", subscriberCount: 3 })],
      }),
    );
    expect(markup).toContain("data-testid=\"sort-indicator-audience\"");
    expect(markup).not.toContain("sort-indicator-rank");
    // The active column's link offers the toggle (desc → asc), from page one.
    expect(markup).toMatch(
      /href="\/pub\/pub-1\/radar\?sort=audience&amp;order=asc&amp;offset=0&amp;limit=50"[^>]*aria-label="Sort by audience, ascending"/,
    );
    // An inactive column uses its natural default.
    expect(markup).toContain("sort=rank&amp;order=asc");
    expect(markup).toContain("aria-sort=\"descending\"");
  });

  it("keeps ladder ranks stable under a non-rank view sort", () => {
    const markup = renderRadar(
      connectProps({
        query: { sort: "name", order: "desc", offset: 0, limit: 50 },
        rowsSource: [
          row({ id: "aaa", displayName: "aaa", subscriberCount: 301 }),
          row({ id: "bbb", displayName: "bbb", subscriberCount: 201 }),
          row({ id: "ccc", displayName: "ccc", subscriberCount: 101 }),
        ],
      }),
    );
    // Name-desc puts ccc first, but its rank column still shows the ladder's 3.
    const position = (needle: string) => markup.indexOf(needle);
    expect(position("ccc")).toBeLessThan(position("bbb"));
    expect(position("bbb")).toBeLessThan(position("aaa"));
    expect(cellsFor(markup, "cell-rank").map((cell) => cell.trim())).toEqual(["3", "2", "1"]);
  });

  it("renders pagination with bounds preserved across pages", () => {
    const rows = [1, 2, 3].map((n) => row({ id: `s-${n}`, subscriberCount: 100 - n }));
    const navOf = (markup: string): string => {
      const match = markup.match(/<nav aria-label="Pagination"[\s\S]*?<\/nav>/);
      expect(match).not.toBeNull();
      return match?.[0] ?? "";
    };

    const firstPage = renderRadar(
      connectProps({
        query: { sort: "rank", order: "asc", offset: 0, limit: 2 },
        rowsSource: rows,
      }),
    );
    // Total is the full ranked set (3), not the page (2 rows).
    expect(firstPage).toContain("Subscribers 1–2 of 3");
    const firstNav = navOf(firstPage);
    expect(firstNav).toContain("pagination-prev");
    expect(firstNav).toContain("aria-disabled=\"true\""); // page 1: no previous
    expect(firstNav).toContain(
      'href="/pub/pub-1/radar?sort=rank&amp;order=asc&amp;offset=2&amp;limit=2"',
    );
    expect(firstNav).toContain("pagination-next");

    const secondPage = renderRadar(
      connectProps({
        query: { sort: "rank", order: "asc", offset: 2, limit: 2 },
        rowsSource: rows,
      }),
    );
    expect(secondPage).toContain("Subscribers 3–3 of 3");
    const secondNav = navOf(secondPage);
    expect(secondNav).toContain(
      'href="/pub/pub-1/radar?sort=rank&amp;order=asc&amp;offset=0&amp;limit=2"',
    );
    expect(secondNav).toContain("pagination-prev");
    expect(secondNav).toContain("aria-disabled=\"true\""); // last page: no next
    expect(secondNav).toContain("pagination-next");
  });
});
