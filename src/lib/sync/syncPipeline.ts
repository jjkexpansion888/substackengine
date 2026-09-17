import { pooledMap } from "../substack";
import { handleFromUserName } from "../substack/types";
import type { PublicProfile } from "../substack";
import type {
  SnapshotInput,
  SyncClientFactory,
  SyncInput,
  SyncLimits,
  SyncResult,
  SyncStore,
  UpsertSubscriberInput,
} from "./types";
import { DEFAULT_SYNC_LIMITS } from "./types";

export type SyncDeps = {
  /** Factory wires the pipeline's ceiling listener into the client at creation. */
  createClient: SyncClientFactory;
  store: SyncStore;
  limits?: Partial<SyncLimits>;
  /** Clock, injectable for deterministic tests. */
  now?: () => Date;
  /** Profile-lookup pool size; spec fixes bounded concurrency at 2. */
  profileConcurrency?: number;
};

/**
 * One sync run: page the owner feed, upsert identities idempotently, enrich
 * with public profiles under a bounded pool, append one batch of append-only
 * snapshots sharing a single as-of timestamp, and record the run.
 *
 * Pure orchestration — HTTP lives in the client, persistence in the store —
 * so tests run it against a mock client and an in-memory store.
 *
 * Ceiling semantics are soft-stop: once the request budget is spent, the run
 * finishes the page in flight, skips remaining work, and reports `partial`
 * rather than discarding collected data.
 */
export async function runSync(deps: SyncDeps, input: SyncInput): Promise<SyncResult> {
  const limits: SyncLimits = { ...DEFAULT_SYNC_LIMITS, ...deps.limits };
  const now = deps.now ?? (() => new Date());
  const { store } = deps;

  const startedAt = now();
  const capturedAt = startedAt; // one as-of time for the whole run

  // The listener fires per HTTP attempt (retries included), so backoff
  // retries spend the same budget as first attempts.
  let requestsMade = 0;
  let ceilingHit = false;
  const client = deps.createClient(() => {
    requestsMade += 1;
    if (requestsMade >= limits.maxRequests) ceilingHit = true;
  });

  let totalFromApi: number | null = null;
  let pagesFetched = 0;
  let subscribersSeen = 0;
  let subscribersMatched = 0;
  let profilesEnriched = 0;
  let profileErrors = 0;

  type PendingRow = {
    subscriberId: string;
    handle: string | null;
    activityRating: number | null;
    snapshot: Omit<SnapshotInput, "id">;
  };
  const pending: PendingRow[] = [];

  try {
    // 1. Paginate the owner feed.
    let offset = 0;
    while (!ceilingHit) {
      const page = await client.listSubscribers(input.cookie, {
        limit: limits.pageLimit,
        offset,
      });
      pagesFetched += 1;
      totalFromApi = page.total;
      subscribersSeen += page.pageRowCount;
      offset += page.pageRowCount;

      for (const row of page.subscribers) {
        // Emails pass through plaintext here; the store encrypts at the
        // persistence boundary (the pipeline never sees key material).
        const upsert: UpsertSubscriberInput = {
          publicationId: input.publicationId,
          substackUserId: row.substackUserId,
          handle: handleFromUserName(row.displayName),
          displayName: row.displayName,
          email: row.email,
          subscribedAt: row.subscribedAt,
        };
        const subscriberId = await store.upsertSubscriber(upsert);
        subscribersMatched += 1;
        pending.push({
          subscriberId,
          handle: upsert.handle,
          activityRating: row.activityRating,
          snapshot: {
            subscriberId,
            capturedAt,
            subscriberCount: null,
            bestsellerStatus: null,
            activityRating: row.activityRating,
            source: "unavailable", // upgraded below when a lookup is consulted
          },
        });
      }

      // EOF: short page, or the reported total has been consumed.
      if (page.pageRowCount < limits.pageLimit) break;
      if (totalFromApi !== null && offset >= totalFromApi) break;
    }

    // 2. Enrich with public profiles: bounded pool of 2, per-row containment,
    // capped per run. Skipped entirely once the ceiling is spent.
    const candidates = pending
      .slice(0, limits.maxProfileLookups)
      .filter((row): row is PendingRow & { handle: string } => row.handle !== null);

    if (!ceilingHit && candidates.length > 0) {
      const results = await pooledMap(
        candidates,
        async (candidate): Promise<{ candidate: typeof candidate; profile: PublicProfile | null }> => {
          try {
            return { candidate, profile: await client.getPublicProfile(candidate.handle) };
          } catch {
            // A failed lookup costs that row its profile data, not the run.
            return { candidate, profile: null };
          }
        },
        { concurrency: deps.profileConcurrency ?? 2 },
      );

      for (const result of results) {
        if (result.status === "rejected") {
          profileErrors += 1; // defensive: containment should prevent this
          continue;
        }
        const { candidate, profile } = result.value;
        if (profile === null) {
          profileErrors += 1;
          continue;
        }
        profilesEnriched += 1;
        candidate.snapshot.source = "public_profile";
        // Parse failure resolves to null — no public data, never zero.
        candidate.snapshot.subscriberCount = profile.subscriberCount;
        candidate.snapshot.bestsellerStatus = profile.bestsellerStatus;
      }
    } else if (ceilingHit && candidates.length > 0) {
      profileErrors += candidates.length; // enrichment never ran for these
    }

    // 3. Append-only snapshots + the run record.
    for (const row of pending) {
      await store.appendSnapshot(row.snapshot);
    }

    const status: SyncResult["status"] =
      ceilingHit || profileErrors > 0 ? "partial" : "completed";

    await store.appendRun({
      publicationId: input.publicationId,
      startedAt,
      finishedAt: now(),
      status,
      totalFromApi,
      requestsMade,
      pagesFetched,
      subscribersSeen,
      subscribersMatched,
      profilesEnriched,
      profileErrors,
      ceilingHit,
      errorName: null,
    });

    return {
      publicationId: input.publicationId,
      capturedAt,
      totalFromApi,
      requestsMade,
      pagesFetched,
      subscribersSeen,
      subscribersMatched,
      profilesEnriched,
      profileErrors,
      ceilingHit,
      status,
    };
  } catch (error) {
    // Record the failed run, then rethrow — the route maps the error type.
    try {
      await store.appendRun({
        publicationId: input.publicationId,
        startedAt,
        finishedAt: now(),
        status: "failed",
        totalFromApi,
        requestsMade,
        pagesFetched,
        subscribersSeen,
        subscribersMatched,
        profilesEnriched,
        profileErrors,
        ceilingHit,
        errorName: error instanceof Error ? error.name : String(error),
      });
    } catch {
      // The original failure is the one that matters; never mask it.
    }
    throw error;
  }
}
