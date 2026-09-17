import type { PublicProfile, SubstackSession, SubscriberRecord } from "../substack";

/** What a sync run needs to persist. Prisma implements this in production; tests use an in-memory store. */
export type SyncStore = {
  findPublicationByDomain(subdomain: string): Promise<StoredPublication | null>;
  /** Idempotent identity upsert: matches on substackUserId, then emailHash, then handle. */
  upsertSubscriber(input: UpsertSubscriberInput): Promise<string>;
  /** Append-only: implementations must never update or delete snapshot rows. */
  appendSnapshot(input: Omit<SnapshotInput, "id">): Promise<void>;
  appendRun(input: SyncRunInput): Promise<void>;
};

export type StoredPublication = {
  id: string;
  subdomain: string;
  displayName: string;
  /** Prisma Bytes maps to Uint8Array; decrypt tolerates both it and Buffer. */
  cookieCiphertext: Uint8Array;
  cookieValid: boolean;
};

export type UpsertSubscriberInput = {
  publicationId: string;
  substackUserId: string | null;
  handle: string | null;
  displayName: string | null;
  /** Plaintext; the store encrypts at the persistence boundary. Never logged, never stored raw. */
  email: string | null;
  subscribedAt: Date | null;
};

export type SnapshotInput = {
  id: string;
  subscriberId: string;
  capturedAt: Date;
  subscriberCount: number | null;
  bestsellerStatus: string | null;
  activityRating: number | null;
  source: "public_profile" | "unavailable";
};

export type SyncRunInput = {
  publicationId: string;
  startedAt: Date;
  finishedAt: Date;
  status: "completed" | "partial" | "failed";
  totalFromApi: number | null;
  requestsMade: number;
  pagesFetched: number;
  subscribersSeen: number;
  subscribersMatched: number;
  profilesEnriched: number;
  profileErrors: number;
  ceilingHit: boolean;
  errorName: string | null;
};

/** Interesting-people feed row, already mapped by the seam client. */
export type FeedRow = SubscriberRecord & { profile: PublicProfile | null };

export type SyncInput = {
  /** Decrypted session cookie for the publication's owner account. */
  cookie: string;
  publicationId: string;
};

export type SyncResult = {
  publicationId: string;
  capturedAt: Date;
  totalFromApi: number | null;
  requestsMade: number;
  pagesFetched: number;
  subscribersSeen: number;
  subscribersMatched: number;
  profilesEnriched: number;
  profileErrors: number;
  ceilingHit: boolean;
  status: SyncRunInput["status"];
};

export type SyncLimits = {
  /** Hard cap on real HTTP requests for the whole run (pages + profiles + retries). */
  maxRequests: number;
  /** Page size for subscriber-stats; probe-verified page size is 50. */
  pageLimit: number;
  /** Max rows enriched with public profiles per run (cost control). */
  maxProfileLookups: number;
};

export const DEFAULT_SYNC_LIMITS: SyncLimits = {
  maxRequests: 300,
  pageLimit: 50,
  maxProfileLookups: 200,
};

export type SyncClient = {
  validateSession(cookie: string): Promise<SubstackSession>;
  listSubscribers(cookie: string, page: { limit: number; offset: number }): Promise<{
    subscribers: SubscriberRecord[];
    total: number;
    pageRowCount: number;
  }>;
  getPublicProfile(handle: string): Promise<PublicProfile>;
  onRequest?: ((info: { kind: string; url: string }) => void) | undefined;
};

/**
 * Clients capture their request listener at creation, so the pipeline receives
 * a factory instead of an instance: it wires its own ceiling-accounting
 * listener in, guaranteeing every HTTP attempt (retries included) is counted.
 */
export type SyncClientFactory = (
  onRequest?: (info: { kind: string; url: string }) => void,
) => SyncClient;
