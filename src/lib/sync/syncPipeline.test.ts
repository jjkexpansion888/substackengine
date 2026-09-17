import { describe, expect, it } from "vitest";
import { runSync } from "./syncPipeline";
import type {
  SnapshotInput,
  SyncClient,
  SyncStore,
  UpsertSubscriberInput,
} from "./types";
import type { PublicProfile, SubscriberRecord } from "../substack";

// ---------- in-memory store ----------

type SubscriberRow = UpsertSubscriberInput & { id: string };

function memoryStore() {
  const subscribers = new Map<string, SubscriberRow>();
  const snapshots: Omit<SnapshotInput, "id">[] = [];
  const runs: unknown[] = [];
  let nextId = 1;

  const store: SyncStore = {
    async findPublicationByDomain() {
      return null;
    },
    async upsertSubscriber(input) {
      for (const row of subscribers.values()) {
        if (
          row.publicationId === input.publicationId &&
          row.substackUserId === input.substackUserId
        ) {
          Object.assign(row, { ...input, id: row.id });
          return row.id;
        }
      }
      const id = `sub-${nextId++}`;
      subscribers.set(id, { ...input, id });
      return id;
    },
    async appendSnapshot(input) {
      snapshots.push(input);
    },
    async appendRun(input) {
      runs.push(input);
    },
  };
  return { store, subscribers, snapshots, runs };
}

// ---------- mock client ----------

function row(id: number, name: string, email: string | null): SubscriberRecord {
  return {
    substackUserId: String(id),
    displayName: name,
    email,
    photoUrl: null,
    subscribedAt: new Date("2026-09-17T12:19:52.599Z"),
    subscriptionInterval: "free",
    activityRating: id % 3,
  };
}

const profile = (handle: string, count: number | null): PublicProfile => ({
  handle,
  name: handle,
  subscriberCount: count,
  bestsellerStatus: null,
  profileUrl: `https://substack.com/@${handle}`,
});

type ClientOptions = {
  total: number;
  pageSize: number;
  /** Per-handle answers keyed by the handle slug (e.g. "reader1"). */
  profiles?: Record<string, PublicProfile | Error>;
};

/**
 * Factory matching SyncClientFactory: the pipeline wires its ceiling listener
 * in at creation, exactly like the real createSubstackClient.
 */
function mockClient(options: ClientOptions): {
  createClient: (onRequest?: (info: { kind: string; url: string }) => void) => SyncClient;
  listCalls: Array<{ limit: number; offset: number }>;
  profileCalls: string[];
} {
  const listCalls: Array<{ limit: number; offset: number }> = [];
  const profileCalls: string[] = [];
  const all = Array.from({ length: options.total }, (_, i) =>
    row(i + 1, `Reader ${i + 1}`, `reader${i + 1}@example.com`),
  );
  const noData = (handle: string): PublicProfile => ({
    handle,
    name: null,
    subscriberCount: null,
    bestsellerStatus: null,
    profileUrl: `https://substack.com/@${handle}`,
  });
  return {
    listCalls,
    profileCalls,
    createClient: (onRequest) => ({
      async validateSession() {
        throw new Error("not used in pipeline tests");
      },
      async listSubscribers(_cookie, page) {
        onRequest?.({ kind: "list", url: "subscriber-stats" });
        listCalls.push({ limit: page.limit, offset: page.offset });
        const rows = all.slice(page.offset, page.offset + page.limit);
        return { subscribers: rows, total: options.total, pageRowCount: rows.length };
      },
      async getPublicProfile(handle) {
        onRequest?.({ kind: "profile", url: handle });
        profileCalls.push(handle);
        const answer = options.profiles?.[handle];
        if (answer instanceof Error) throw answer;
        return answer ?? noData(handle);
      },
    }),
  };
}

const fixedNow = () => new Date("2026-09-17T18:00:00Z");

describe("runSync", () => {
  it("paginates the full feed, upserts identities, and reports the count total", async () => {
    const { store, subscribers, snapshots, runs } = memoryStore();
    const mock = mockClient({ total: 120, pageSize: 50 });

    const result = await runSync(
      { createClient: mock.createClient, store, now: fixedNow },
      { publicationId: "pub-1", cookie: "cookie" },
    );

    expect(result.status).toBe("completed");
    expect(result.totalFromApi).toBe(120);
    expect(result.pagesFetched).toBe(3); // 50 + 50 + 20
    expect(result.subscribersSeen).toBe(120);
    expect(result.subscribersMatched).toBe(120);
    expect(subscribers.size).toBe(120);
    expect(snapshots).toHaveLength(120);
    expect(runs).toHaveLength(1);
  });

  it("sends limit/offset pages in order", async () => {
    const { store } = memoryStore();
    const mock = mockClient({ total: 75, pageSize: 50 });
    await runSync(
      { createClient: mock.createClient, store, now: fixedNow },
      { publicationId: "pub-1", cookie: "c" },
    );
    expect(mock.listCalls.map((c) => c.offset)).toEqual([0, 50]);
  });

  it("is idempotent on re-sync: no duplicate subscribers, snapshots append", async () => {
    const { store, subscribers, snapshots } = memoryStore();
    const mock = mockClient({ total: 60, pageSize: 50 });
    const deps = { createClient: mock.createClient, store, now: fixedNow };

    await runSync(deps, { publicationId: "pub-1", cookie: "c" });
    await runSync(deps, { publicationId: "pub-1", cookie: "c" });

    expect(subscribers.size).toBe(60); // second run upserted, not duplicated
    expect(snapshots).toHaveLength(120); // append-only: two runs, one batch each
  });

  it("stops softly at the request ceiling, keeping collected data (status partial)", async () => {
    const { store, subscribers, snapshots, runs } = memoryStore();
    const mock = mockClient({ total: 500, pageSize: 50 });

    const result = await runSync(
      { createClient: mock.createClient, store, now: fixedNow, limits: { maxRequests: 2 } },
      { publicationId: "pub-1", cookie: "c" },
    );

    expect(result.ceilingHit).toBe(true);
    expect(result.status).toBe("partial");
    expect(result.pagesFetched).toBe(2);
    expect(result.subscribersSeen).toBe(100);
    expect(subscribers.size).toBe(100); // what was collected persists
    expect(snapshots).toHaveLength(100);
    expect(runs[0]).toMatchObject({ status: "partial", ceilingHit: true });
  });

  it("enriches profiles and upgrades snapshots with public counts", async () => {
    const { store, snapshots } = memoryStore();
    const mock = mockClient({
      total: 2,
      pageSize: 50,
      profiles: { reader1: profile("reader1", 20) }, // handleFromUserName("Reader 1") = "reader1"
    });

    const result = await runSync(
      { createClient: mock.createClient, store, now: fixedNow },
      { publicationId: "pub-1", cookie: "c" },
    );

    expect(result.profilesEnriched).toBe(2); // both consulted (null-count profile for #2)
    const enriched = snapshots.find((s) => s.subscriberCount === 20);
    expect(enriched).toMatchObject({ source: "public_profile", subscriberCount: 20 });
  });

  it("treats a failed profile lookup as contained: row keeps unavailable, run stays partial", async () => {
    const { store, snapshots } = memoryStore();
    const mock = mockClient({
      total: 2,
      pageSize: 50,
      profiles: { reader1: new Error("lookup down") },
    });

    const result = await runSync(
      { createClient: mock.createClient, store, now: fixedNow },
      { publicationId: "pub-1", cookie: "c" },
    );

    expect(result.status).toBe("partial");
    expect(result.profileErrors).toBe(1);
    expect(result.profilesEnriched).toBe(1);
    const failedRow = snapshots.find(
      (s) => s.source === "unavailable" && s.subscriberCount === null,
    );
    expect(failedRow).toBeDefined();
  });

  it("caps profile lookups at maxProfileLookups", async () => {
    const { store } = memoryStore();
    const mock = mockClient({ total: 10, pageSize: 50 });

    const result = await runSync(
      {
        createClient: mock.createClient,
        store,
        now: fixedNow,
        limits: { maxProfileLookups: 3 },
      },
      { publicationId: "pub-1", cookie: "c" },
    );

    expect(result.profilesEnriched).toBe(3); // 10 rows, only 3 lookups
    expect(mock.profileCalls).toHaveLength(3);
  });

  it("records a failed run and rethrows when pagination explodes", async () => {
    const { store, runs } = memoryStore();
    const mock = mockClient({ total: 10, pageSize: 50 });
    const broken: typeof mock.createClient = (onRequest) => {
      const client = mock.createClient(onRequest);
      client.listSubscribers = async () => {
        throw new Error("boom");
      };
      return client;
    };

    await expect(
      runSync({ createClient: broken, store, now: fixedNow }, { publicationId: "pub-1", cookie: "c" }),
    ).rejects.toThrow("boom");

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "failed", errorName: "Error" });
  });

  it("skips enrichment entirely once the ceiling is spent during pagination", async () => {
    const { store, snapshots } = memoryStore();
    const mock = mockClient({ total: 200, pageSize: 50 });

    const result = await runSync(
      { createClient: mock.createClient, store, now: fixedNow, limits: { maxRequests: 2 } },
      { publicationId: "pub-1", cookie: "c" },
    );

    expect(result.profilesEnriched).toBe(0);
    expect(snapshots.every((s) => s.source === "unavailable")).toBe(true);
  });
});
