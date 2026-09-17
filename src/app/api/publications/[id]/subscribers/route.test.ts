import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriberRow } from "@/lib/rank/rankSubscribers";

vi.mock("@/lib/store/radarStore", () => ({ loadSubscriberRows: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { GET } from "./route";
import { loadSubscriberRows } from "@/lib/store/radarStore";

const loadMock = vi.mocked(loadSubscriberRows);

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

function getUrl(query = ""): string {
  return `http://localhost/api/publications/pub-1/subscribers${query}`;
}

async function callGet(id: string, query = ""): Promise<Response> {
  return GET(new Request(getUrl(query)), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  loadMock.mockReset();
});

describe("GET /api/publications/[id]/subscribers", () => {
  it("returns the ranked page with pagination headers", async () => {
    loadMock.mockResolvedValue([
      row({ id: "s-big", subscriberCount: 291, subscribedAt: new Date("2026-02-01T00:00:00Z") }),
      row({ id: "s-small", subscriberCount: 4, subscribedAt: new Date("2026-03-01T00:00:00Z") }),
      row({ id: "s-unknown" }),
    ]);

    const response = await callGet("pub-1", "?limit=2");
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Total-Count")).toBe("3");
    expect(response.headers.get("Link")).toBe(
      `<${getUrl("?limit=2&offset=2")}>; rel="next"`,
    );

    const body = await response.json();
    expect(body).toMatchObject({
      publicationId: "pub-1",
      total: 3,
      offset: 0,
      limit: 2,
      sort: "rank",
      order: "asc",
    });
    expect(body.subscribers).toEqual([
      {
        subscriberId: "s-big",
        displayName: "name-s-big",
        handle: "handle-s-big",
        profileUrl: "https://substack.com/@handle-s-big",
        subscribedAt: "2026-02-01T00:00:00.000Z",
        rank: 1,
        audienceSize: 291,
        audienceSource: "subscriber_count",
        asOf: "2026-09-17T00:00:00.000Z",
      },
      {
        subscriberId: "s-small",
        displayName: "name-s-small",
        handle: "handle-s-small",
        profileUrl: "https://substack.com/@handle-s-small",
        subscribedAt: "2026-03-01T00:00:00.000Z",
        rank: 2,
        audienceSize: 4,
        audienceSource: "subscriber_count",
        asOf: "2026-09-17T00:00:00.000Z",
      },
    ]);
  });

  it("omits the next link on the last page", async () => {
    loadMock.mockResolvedValue([row({ id: "s-1", subscriberCount: 5 })]);

    const response = await callGet("pub-1", "?limit=50");
    expect(response.status).toBe(200);
    expect(response.headers.get("Link")).toBeNull();
    expect(response.headers.get("X-Total-Count")).toBe("1");
  });

  it("serves the requested page at the requested sort", async () => {
    loadMock.mockResolvedValue([
      row({ id: "s-a", subscriberCount: 1, subscribedAt: new Date("2026-01-01T00:00:00Z") }),
      row({ id: "s-b", subscriberCount: 2, subscribedAt: new Date("2026-02-01T00:00:00Z") }),
      row({ id: "s-c", subscriberCount: 3, subscribedAt: new Date("2026-03-01T00:00:00Z") }),
    ]);

    const response = await callGet("pub-1", "?sort=subscribedAt&order=desc&offset=1&limit=1");
    const body = await response.json();
    expect(body.subscribers.map((s: { subscriberId: string }) => s.subscriberId)).toEqual(["s-b"]);
    // Ranks still come from the ladder, not from the view sort position.
    expect(body.subscribers[0].rank).toBe(2);
    expect(body.offset).toBe(1);
  });

  it("answers an unknown publication with a structured 404", async () => {
    loadMock.mockResolvedValue(null);
    const response = await callGet("pub-404");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Unknown publication. Connect it first." },
    });
  });

  it("answers invalid query params with a structured 400", async () => {
    const response = await callGet("pub-1", "?limit=0");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_input");
    expect(body.error.message).toContain("limit");
  });

  it("answers malformed query values with a structured 400", async () => {
    const response = await callGet("pub-1", "?sort=nope");
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_input");
  });

  it("maps store failures through the structured error shape", async () => {
    loadMock.mockRejectedValue(new Error("database down"));
    const response = await callGet("pub-1");
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("internal");
  });
});
