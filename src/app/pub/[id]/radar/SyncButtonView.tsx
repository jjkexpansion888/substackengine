import type { SyncFailureCode } from "@/lib/radar/view";

/**
 * View for the manual-sync island — presentational, props only. The client
 * wrapper (SyncButton) owns the fetch and passes the resulting phase in.
 *
 * Transient sync feedback lives here; the radar table beside it is always
 * rendered (server-side), so a sync never blanks the page — the spec's
 * "stale data with a last-synced timestamp" requirement.
 */

export type SyncPhase =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "done"; summary: string }
  | { kind: "failed"; code: SyncFailureCode; message: string };

export type SyncButtonViewProps = {
  phase: SyncPhase;
  /** Subscribers the current (stale) data knows about — the syncing banner's total. */
  knownTotal: number;
  lastSyncedLabel: string | null;
  onSync: () => void;
};

export function SyncButtonView({ phase, knownTotal, lastSyncedLabel, onSync }: SyncButtonViewProps) {
  const syncing = phase.kind === "syncing";
  return (
    <div data-testid="sync-area">
      {phase.kind === "syncing" && (
        <p role="status" data-testid="syncing-banner" className="text-sm">
          Syncing now — {knownTotal} subscribers known so far. This list shows data as of{" "}
          {lastSyncedLabel ?? "never"} and refreshes when the sync finishes.
        </p>
      )}
      {phase.kind === "done" && (
        <p role="status" data-testid="sync-done" className="text-sm">
          Sync complete — {phase.summary}
        </p>
      )}
      {phase.kind === "failed" && phase.code === "session_expired" && (
        <section role="alert" data-testid="sync-reconnect" className="border-l-4 border-red-500 pl-3">
          <p className="text-sm font-medium">Connection expired — reconnect</p>
          <p className="text-sm">
            The stored session cookie was rejected. Old snapshots stay readable.{" "}
            <a href="/connect" className="underline underline-offset-2">Reconnect on the connect page</a>
          </p>
        </section>
      )}
      {phase.kind === "failed" && phase.code !== "session_expired" && (
        <p role="alert" data-testid="sync-error" className="text-sm">
          {phase.message}
        </p>
      )}
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        data-testid="sync-button"
        className="mt-2 rounded-md border border-foreground/20 px-3 py-1.5 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50"
      >
        {syncing ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
