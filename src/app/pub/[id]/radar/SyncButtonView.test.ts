import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyncButtonView, type SyncPhase } from "./SyncButtonView";
import { syncFailureMessage, syncResultSummary } from "@/lib/radar/view";

/**
 * Sync-button states — the syncing, success, and failure feedback surfaces of
 * the manual-sync trigger. The view renders the phase the client wrapper
 * builds (summary/message precomputed from the API's structured errors), so
 * the tests compute them the same way SyncButton does.
 */

const BASE = {
  knownTotal: 25,
  lastSyncedLabel: "2026-09-17 00:00 UTC",
};

function failedPhase(code: Parameters<typeof syncFailureMessage>[0]): SyncPhase {
  return { kind: "failed", code, message: syncFailureMessage(code, null) };
}

function renderSync(phase: SyncPhase): string {
  return renderToStaticMarkup(
    createElement(SyncButtonView, { ...BASE, phase, onSync: () => {} }),
  );
}

describe("SyncButtonView", () => {
  it("state: idle — enabled Sync now trigger, no banners", () => {
    const markup = renderSync({ kind: "idle" });
    expect(markup).toContain("Sync now");
    // No disabled ATTRIBUTE (the disabled:opacity-50 utility class is always present).
    expect(markup).not.toMatch(/disabled(?!:)/);
    expect(markup).not.toContain("syncing-banner");
    expect(markup).not.toContain("sync-error");
    expect(markup).not.toContain("sync-reconnect");
  });

  it("state: syncing — progress banner with known-so-far count and stale-data note", () => {
    const markup = renderSync({ kind: "syncing" });
    expect(markup).toContain("data-testid=\"syncing-banner\"");
    expect(markup).toContain("Syncing now — 25 subscribers known so far.");
    expect(markup).toContain("This list shows data as of 2026-09-17 00:00 UTC");
    expect(markup).toContain("Syncing…");
    expect(markup).toContain("disabled");
  });

  it("state: success — completion summary with counts", () => {
    const markup = renderSync({
      kind: "done",
      summary: syncResultSummary({ subscribersSeen: 25, profilesEnriched: 23 }),
    });
    expect(markup).toContain("data-testid=\"sync-done\"");
    expect(markup).toContain("Sync complete — 25 subscribers seen, 23 profiles enriched");
    expect(markup).toContain("Sync now");
  });

  it("state: cookie expired — reconnect guidance beside the trigger", () => {
    const markup = renderSync(failedPhase("session_expired"));
    expect(markup).toContain("data-testid=\"sync-reconnect\"");
    expect(markup).toContain("Connection expired — reconnect");
    expect(markup).toContain('href="/connect"');
    expect(markup).toContain("Old snapshots stay readable");
    // Retry stays possible after a failure.
    expect(markup).toContain("Sync now");
    expect(markup).not.toMatch(/disabled(?!:)/);
  });

  it("state: upstream change — says what broke without retry loops", () => {
    const markup = renderSync(failedPhase("upstream_changed"));
    expect(markup).toContain("data-testid=\"sync-error\"");
    expect(markup).toContain("response shape changed");
  });

  it("state: rate limited — names the limiter and suggests waiting", () => {
    const markup = renderSync(failedPhase("rate_limited"));
    expect(markup).toContain("data-testid=\"sync-error\"");
    expect(markup).toContain("rate limiting");
    expect(markup).toContain("wait a moment, then retry");
  });

  it("state: network failure — surfaces a reachability message", () => {
    const markup = renderSync(failedPhase("network"));
    expect(markup).toContain("data-testid=\"sync-error\"");
    expect(markup).toContain("Could not reach the server");
  });
});
