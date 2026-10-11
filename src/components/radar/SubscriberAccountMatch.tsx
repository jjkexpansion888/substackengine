"use client";

import { useRef, useState } from "react";
import { Link, LoaderCircle, X } from "lucide-react";
import { parseSubscriberCsv } from "@/lib/substack/subscriberCsv";
import type { SubscriberImport } from "@/lib/substack/subscriberRanking";

export function SubscriberAccountMatch({ id, name, packet, busy, onImport }: {
  id: string; name: string; packet: SubscriberImport; busy: boolean; onImport: (packet: SubscriberImport) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [identity, setIdentity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const match = async () => {
    setMatching(true); setError(null);
    try {
      const value = identity.trim();
      const column = /^https:\/\//i.test(value) ? "Profile URL" : /^\d+$/.test(value) ? "User ID" : "Handle";
      const parsed = parseSubscriberCsv(`${column},Name\n"${value.replaceAll('"', '""')}",Reader`, new URL(packet.sourceUrl).hostname);
      const account = parsed.packet.subscribers[0];
      if (!parsed.identifiable) throw new Error("Enter a Substack profile URL, @handle, or numeric user ID.");
      if (packet.subscribers.some(row => row.id !== id && (account.id && row.id === account.id || account.handle && row.handle === account.handle))) throw new Error("This account is already assigned to another subscriber.");
      const response = await fetch("/api/subscribers/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identities: [{ id: account.id, handle: account.handle }] }) });
      const result = await response.json();
      if (!response.ok || !result.profiles?.[0] || result.profiles[0].status === "unavailable") throw new Error("This account could not be verified publicly. Check the identity or retry later.");
      await onImport({ ...packet, subscribers: packet.subscribers.map(row => row.id === id ? { name: row.name, id: account.id, handle: result.profiles[0].handle ?? account.handle } : row) });
      dialog.current?.close();
    } catch (err) { setError(err instanceof Error ? err.message : "Account matching failed."); }
    finally { setMatching(false); }
  };
  return <>
    <button className="icon-button" disabled={busy} title={`Match ${name} to a public account`} aria-label={`Match account for ${name}`} onClick={() => { setIdentity(""); setError(null); dialog.current?.showModal(); }}><Link size={16} /></button>
    <dialog ref={dialog} className="subscriber-import-dialog" aria-label={`Match account for ${name}`}>
      <div className="import-dialog-heading"><h2>Match {name}</h2><button className="icon-button" disabled={matching || busy} aria-label="Close account match" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      <label>Substack account<input className="account-match-input" value={identity} onChange={e => setIdentity(e.target.value)} placeholder="https://substack.com/@handle" autoComplete="off" /></label>
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="import-dialog-footer"><button className="primary-button" disabled={busy || matching || !identity.trim()} onClick={() => void match()}>{matching ? <LoaderCircle className="spin" size={16} /> : <Link size={16} />}{matching ? "Verifying account..." : "Verify and match"}</button></div>
    </dialog>
  </>;
}
