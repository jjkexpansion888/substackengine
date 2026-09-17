import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/store/radarStore", () => ({ loadRadarViewData: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import RadarPage from "./page";
import { loadRadarViewData, type RadarViewData } from "@/lib/store/radarStore";
import type { SubscriberRow } from "@/lib/rank/rankSubscribers";

/**
 * Radar page tests — route glue with a mocked store (no HTTP, no DB): missing
 * connection, table + sync island, and query-parameter handling.
 */

vi.mocked(loadRadarViewData).mockImplementation(async () => null);

function row(overrides: Partial<SubscriberRow> & { id: string }): SubscriberRow {
  return {
    displayName: `name-${overrides.id}`,
    handle: `handle-${overrides.id}`,
    subscribedAt: new Date("2026-02-01T00:00:00Z"),
    capturedAt: new Date("2026-09-17T00:00:00Z"),
    subscriberCount: null,
    bestsellerStatus: null,
    activityRating: null,
    ...overrides,
  };
}

function viewData(overrides: Partial<RadarViewData> = {}): RadarViewData {
  return {
    publication: { id: "pub-1", subdomain: "testpub", displayName: "Test Pub", cookieValid: true },
    latestRun: null,
    rows: [],
    ...overrides,
  };
}

async function renderPage(searchParams: Record<string, string> = {}): Promise<string> {
  const element = await RadarPage({
    params: Promise.resolve({ id: "pub-1" }),
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(element);
}

describe("radar page", () => {
  it("state: missing connection — unknown publication links to /connect", async () => {
    vi.mocked(loadRadarViewData).mockResolvedValueOnce(null);
    const markup = await renderPage();
    expect(markup).toContain("No publication connected");
    expect(markup).toContain('href="/connect"');
    expect(markup).not.toContain("radar-table");
  });

  it("renders the table and the sync island for a connected publication", async () => {
    vi.mocked(loadRadarViewData).mockResolvedValueOnce(
      viewData({ rows: [row({ id: "s-1", subscriberCount: 42 })] }),
    );
    const markup = await renderPage();
    expect(markup).toContain("Influencer Radar — Test Pub");
    expect(markup).toContain("data-testid=\"radar-table\"");
    expect(markup).toContain("Sync now");
    expect(markup).toContain("https://substack.com/@handle-s-1");
  });

  it("passes invalid sort params through as a notice with default rendering", async () => {
    vi.mocked(loadRadarViewData).mockResolvedValueOnce(
      viewData({ rows: [row({ id: "s-1", subscriberCount: 42 })] }),
    );
    const markup = await renderPage({ sort: "bogus" });
    expect(markup).toContain("data-testid=\"query-notice\"");
    expect(markup).toContain("bogus");
    expect(markup).toContain("data-testid=\"sort-indicator-rank\"");
  });

  it("honors a valid sort param in the rendered controls", async () => {
    vi.mocked(loadRadarViewData).mockResolvedValueOnce(
      viewData({ rows: [row({ id: "s-1", subscriberCount: 42 })] }),
    );
    const markup = await renderPage({ sort: "audience" });
    expect(markup).toContain("data-testid=\"sort-indicator-audience\"");
    expect(markup).not.toContain("sort-indicator-rank");
  });

  it("keeps the ranked table visible when the cookie has expired", async () => {
    vi.mocked(loadRadarViewData).mockResolvedValueOnce(
      viewData({
        publication: { id: "pub-1", subdomain: "testpub", displayName: "Test Pub", cookieValid: false },
        rows: [row({ id: "s-1", subscriberCount: 42 })],
      }),
    );
    const markup = await renderPage();
    expect(markup).toContain("data-testid=\"reconnect-banner\"");
    expect(markup).toContain("data-testid=\"radar-table\"");
  });
});
