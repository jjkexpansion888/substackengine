import type { SyncFailureCode } from "@/lib/radar/view";

/**
 * Connect form view — presentational, props only. The client wrapper
 * (ConnectForm) owns fetch/state and passes the phase in; because both
 * inputs stay controlled here, a rejected cookie's paste survives the round
 * trip (spec: the retry field keeps what the user typed).
 */

export type ConnectPhase =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "syncing" }
  | { kind: "error"; code: SyncFailureCode; message: string };

export type ConnectFormViewProps = {
  domain: string;
  cookie: string;
  phase: ConnectPhase;
  onDomainChange: (value: string) => void;
  onCookieChange: (value: string) => void;
  onSubmit: () => void;
};

export function ConnectFormView({
  domain,
  cookie,
  phase,
  onDomainChange,
  onCookieChange,
  onSubmit,
}: ConnectFormViewProps) {
  const busy = phase.kind === "connecting" || phase.kind === "syncing";
  return (
    <form
      data-testid="connect-form"
      className="mt-6 max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {phase.kind === "connecting" && (
        <p role="status" data-testid="connecting-note" className="text-sm">
          Validating the cookie with Substack…
        </p>
      )}
      {phase.kind === "syncing" && (
        <p role="status" data-testid="first-sync-note" className="text-sm">
          Connected — running the first sync. Large lists take a minute; the radar opens when it
          finishes.
        </p>
      )}
      {phase.kind === "error" && (
        <p
          role="alert"
          data-testid="connect-error"
          className="border-l-4 border-red-500 pl-3 text-sm"
        >
          {phase.message}
        </p>
      )}

      <label htmlFor="connect-domain" className="mt-4 block text-sm font-medium">
        Publication domain
      </label>
      <input
        id="connect-domain"
        name="domain"
        value={domain}
        onChange={(event) => onDomainChange(event.target.value)}
        placeholder="example.substack.com"
        autoComplete="off"
        spellCheck={false}
        data-testid="connect-domain"
        className="mt-1 w-full rounded border border-foreground/20 bg-transparent px-2 py-1.5 text-sm"
      />

      <label htmlFor="connect-cookie" className="mt-4 block text-sm font-medium">
        substack.sid cookie
      </label>
      <textarea
        id="connect-cookie"
        name="cookie"
        rows={3}
        value={cookie}
        onChange={(event) => onCookieChange(event.target.value)}
        placeholder="Paste the substack.sid value"
        autoComplete="off"
        spellCheck={false}
        data-testid="connect-cookie"
        className="mt-1 w-full rounded border border-foreground/20 bg-transparent px-2 py-1.5 font-mono text-xs"
      />

      <button
        type="submit"
        disabled={busy}
        data-testid="connect-submit"
        className="mt-4 rounded-md border border-foreground/20 px-4 py-1.5 text-sm font-medium hover:bg-foreground/5 disabled:opacity-50"
      >
        {busy ? "Working…" : "Connect"}
      </button>
    </form>
  );
}
