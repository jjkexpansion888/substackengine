"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, LoaderCircle, Upload, X } from "lucide-react";
import { parseSubscriberCsv } from "@/lib/substack/subscriberCsv";
import { parseSubscriberImport, type SubscriberImport } from "@/lib/substack/subscriberRanking";

export function SubscriberImportDialog({ domain, busy, onImport }: { domain: string; busy: boolean; onImport: (packet: SubscriberImport) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ packet: SubscriberImport; duplicates: number; invalidIdentities: number; identifiable: number; unresolved: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const readFile = async (file?: File) => {
    if (!file) return;
    setError(null); setPreview(null);
    try {
      if (file.size > 5_000_000) throw new Error("Choose a file smaller than 5 MB.");
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".json")) {
        const packet = parseSubscriberImport(JSON.parse(text));
        const identifiable = packet.subscribers.filter(row => row.handle || /^\d+$/.test(row.id ?? "")).length;
        setPreview({ packet, identifiable, unresolved: packet.subscribers.length - identifiable, duplicates: 0, invalidIdentities: 0 });
      } else setPreview(parseSubscriberCsv(text, domain));
      setFilename(file.name);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not read this file."); }
    finally { if (input.current) input.current.value = ""; }
  };
  const submit = async () => {
    if (!preview) return;
    try { await onImport(preview.packet); dialog.current?.close(); }
    catch (err) { setError(err instanceof Error ? err.message : "Import failed."); }
  };
  return <>
    <button className="secondary-button" disabled={busy} onClick={() => { setError(null); setPreview(null); dialog.current?.showModal(); }}><Upload size={15} />Import subscribers</button>
    <dialog ref={dialog} className="subscriber-import-dialog" aria-labelledby="subscriber-import-title">
      <div className="import-dialog-heading"><h2 id="subscriber-import-title">Import subscribers</h2><button className="icon-button" disabled={busy} aria-label="Close import" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      <button className="secondary-button" disabled={busy} onClick={() => input.current?.click()}><FileSpreadsheet size={17} />Choose CSV file</button>
      <input ref={input} type="file" accept=".csv,text/csv,.json,application/json" aria-label="Subscriber CSV file" className="sr-only" onChange={e => void readFile(e.target.files?.[0])} />
      <p className="import-privacy">Email addresses are removed on this device before upload. Public account IDs, handles, and profile URLs enable matching; email-only rows remain unresolved.</p>
      {preview && <div className="csv-preview"><strong>{filename}</strong><div className="csv-import-stats"><div><b>{preview.packet.subscribers.length.toLocaleString()}</b><span>Subscribers</span></div><div><b>{preview.identifiable.toLocaleString()}</b><span>Ready for lookup</span></div><div><b>{preview.unresolved.toLocaleString()}</b><span>Unresolved accounts</span></div></div>
        {!!preview.duplicates && <p>{preview.duplicates} duplicate rows removed.</p>}{!!preview.invalidIdentities && <p>{preview.invalidIdentities} invalid account identifiers left unresolved.</p>}
        <p>Audience counts are fetched from matched public profiles, not taken from CSV columns. Unpublished counts stay unknown.</p></div>}
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="import-dialog-footer"><button className="primary-button" disabled={busy || !preview} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{busy ? "Importing..." : "Import and rank"}</button></div>
    </dialog>
  </>;
}
