"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  apiErrorCode,
  apiErrorMessage,
  syncFailureMessage,
  syncResultFromResponse,
  syncResultSummary,
} from "@/lib/radar/view";
import { SyncButtonView, type SyncPhase } from "./SyncButtonView";

/**
 * Client island for the manual-sync trigger ("Sync now"). Posts to
 * /api/sync, reports progress against the subscribers the stale view already
 * knows, and refreshes the server-rendered table when the run finishes.
 * The session cookie never passes through here — the sync route reads it
 * server-side from the encrypted store.
 */
export function SyncButton({
  publicationId,
  knownTotal,
  lastSyncedLabel,
}: {
  publicationId: string;
  knownTotal: number;
  lastSyncedLabel: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<SyncPhase>({ kind: "idle" });

  const sync = useCallback(async () => {
    setPhase({ kind: "syncing" });
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicationId }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.ok) {
        const result = syncResultFromResponse(body);
        setPhase({
          kind: "done",
          summary: result ? syncResultSummary(result) : "finished",
        });
      } else {
        const code = apiErrorCode(body);
        setPhase({
          kind: "failed",
          code,
          message: syncFailureMessage(code, apiErrorMessage(body)),
        });
      }
      // Re-render the server table either way — a failed run may have flipped
      // cookieValid server-side, and a successful one changed every snapshot.
      router.refresh();
    } catch {
      setPhase({
        kind: "failed",
        code: "network",
        message: syncFailureMessage("network", null),
      });
    }
  }, [publicationId, router]);

  return (
    <SyncButtonView
      phase={phase}
      knownTotal={knownTotal}
      lastSyncedLabel={lastSyncedLabel}
      onSync={() => void sync()}
    />
  );
}
