"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { apiErrorCode, apiErrorMessage, connectFailureMessage } from "@/lib/radar/view";
import { ConnectFormView, type ConnectPhase } from "./ConnectFormView";

/**
 * Client wrapper for the connect flow (spec: connect → validate server-side →
 * first sync → land on the radar with progress shown). The cookie lives only
 * in this component's state and the two POST bodies — the radar never sees it.
 */
export function ConnectForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [cookie, setCookie] = useState("");
  const [phase, setPhase] = useState<ConnectPhase>({ kind: "idle" });

  const submit = useCallback(async () => {
    if (phase.kind === "connecting" || phase.kind === "syncing") return;
    setPhase({ kind: "connecting" });
    try {
      const connectResponse = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, cookie }),
      });
      const connectBody: unknown = await connectResponse.json().catch(() => null);

      if (!connectResponse.ok) {
        const code = apiErrorCode(connectBody);
        setPhase({
          kind: "error",
          code,
          message: connectFailureMessage(code, apiErrorMessage(connectBody)),
        });
        return;
      }

      const publicationId = extractPublicationId(connectBody);
      if (publicationId === null) {
        setPhase({
          kind: "error",
          code: "internal",
          message: connectFailureMessage("internal", null),
        });
        return;
      }

      setPhase({ kind: "syncing" });
      const syncResponse = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicationId }),
      });
      if (syncResponse.ok) {
        router.push(`/pub/${publicationId}/radar`);
        return;
      }
      const syncBody: unknown = await syncResponse.json().catch(() => null);
      const code = apiErrorCode(syncBody);
      setPhase({
        kind: "error",
        code,
        message: `${connectFailureMessage(code, apiErrorMessage(syncBody))} The publication is connected — open the radar to retry the sync there.`,
      });
    } catch {
      setPhase({
        kind: "error",
        code: "network",
        message: connectFailureMessage("network", null),
      });
    }
  }, [cookie, domain, phase, router]);

  return (
    <ConnectFormView
      domain={domain}
      cookie={cookie}
      phase={phase}
      onDomainChange={setDomain}
      onCookieChange={setCookie}
      onSubmit={() => void submit()}
    />
  );
}

function extractPublicationId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const publication = (body as { publication?: unknown }).publication;
  if (typeof publication !== "object" || publication === null) return null;
  const id = (publication as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}
