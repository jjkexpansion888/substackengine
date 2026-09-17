import type { SubscribersQuery } from "@/lib/rank/query";
import type { RadarRowView } from "@/lib/radar/view";
import { RadarTable } from "./RadarTable";

/**
 * The radar page view — presentational, props only (spec convention). All
 * data fetching lives in the page; every consequential state the spec lists
 * renders here with real content:
 *
 *   publication === null        → missing connection (link to /connect)
 *   rows empty                  → connected but nothing synced yet
 *   cookieValid === false       → expired-cookie banner, old rows stay readable
 *   partial data                → per-row badges + the "n of m" header note
 *   syncing / failed syncs      → the client syncSlot banner; the stale table
 *                                 (with its last-synced timestamp) never blanks
 */

export type RadarPublicationView = {
  displayName: string;
  subdomain: string;
  cookieValid: boolean;
};

export type RadarViewConnectedProps = {
  publication: RadarPublicationView;
  lastSyncedLabel: string | null;
  runSummary: string | null;
  rows: RadarRowView[];
  /** Full ranked-set size — pagination and the "n of m" note use it, not the page length. */
  total: number;
  /** Rows of the full ranked set carrying an exact count (the note's "n"). */
  exactCount: number;
  query: SubscribersQuery;
  baseUrl: string;
  /** Client island for the manual-sync trigger and its transient feedback. */
  syncSlot?: React.ReactNode;
  /** Non-null when the page had to ignore invalid sort/pagination parameters. */
  queryNotice?: string | null;
};

export type RadarViewProps =
  | { publication: null }
  | ({ publication: RadarPublicationView } & RadarViewConnectedProps);

function MissingConnection() {
  return (
    <section aria-labelledby="no-connection" data-testid="missing-connection" className="mt-6 rounded border border-foreground/20 p-4">
      <h2 id="no-connection" className="font-medium">No publication connected</h2>
      <p className="mt-1 text-sm">
        The radar reads a publication&apos;s subscriber list once a connection exists — connect one first.
      </p>
      <p className="mt-3 text-sm">
        <a href="/connect" data-testid="missing-connection-link" className="underline underline-offset-2">
          Go to the connect page
        </a>
      </p>
    </section>
  );
}

function ReconnectBanner() {
  return (
    <section role="alert" data-testid="reconnect-banner" className="mt-3 border-l-4 border-red-500 pl-3">
      <p className="text-sm font-medium">Connection expired — reconnect</p>
      <p className="text-sm">
        The stored session cookie was rejected by Substack. Old snapshots stay readable.{" "}
        <a href="/connect" className="underline underline-offset-2">Reconnect on the connect page</a>
      </p>
    </section>
  );
}

export function RadarView(props: RadarViewProps) {
  if (props.publication === null) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Influencer Radar</h1>
        <MissingConnection />
      </main>
    );
  }

  const {
    publication,
    lastSyncedLabel,
    runSummary,
    rows,
    total,
    exactCount,
    query,
    baseUrl,
    syncSlot,
    queryNotice,
  } = props;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header>
        <h1 className="text-xl font-semibold">Influencer Radar — {publication.displayName}</h1>
        <p className="text-sm opacity-70">{publication.subdomain}</p>
        <div className="mt-2 text-sm" data-testid="radar-meta">
          <p data-testid="last-synced">Last synced: {lastSyncedLabel ?? "never"}</p>
          {total > 0 && (
            <p data-testid="exact-count-note">
              {exactCount} of {total} subscribers show exact audience size
            </p>
          )}
          {runSummary !== null && <p className="opacity-70">{runSummary}</p>}
        </div>
        {!publication.cookieValid && <ReconnectBanner />}
      </header>

      {syncSlot !== undefined && <div className="mt-4">{syncSlot}</div>}

      {queryNotice !== undefined && queryNotice !== null && (
        <p role="note" data-testid="query-notice" className="mt-3 text-sm opacity-70">
          {queryNotice}
        </p>
      )}

      {total === 0 ? (
        <section data-testid="empty-state" className="mt-6 rounded border border-foreground/20 p-4 text-sm">
          <p>
            No subscribers yet. Run a sync to pull the subscriber list and rank it — this page
            will fill in as the data lands.
          </p>
        </section>
      ) : (
        <section className="mt-6">
          <RadarTable rows={rows} query={query} baseUrl={baseUrl} total={total} />
        </section>
      )}
    </main>
  );
}
