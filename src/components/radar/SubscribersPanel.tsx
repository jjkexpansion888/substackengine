"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUpRight, Download, LoaderCircle, Search, Upload, Users, X } from "lucide-react";
import type { PublicRadar, PublicPerson } from "@/lib/substack/publicRadar";
import { parseSubscriberImport, rankPublicSubscribers, type SubscriberImport } from "@/lib/substack/subscriberRanking";

type EnrichedProfile = { id?: string; handle?: string | null; status: PublicPerson["audienceStatus"]; audience?: number | null; audienceLabel?: string | null; bestseller?: boolean };

export function SubscribersPanel({ radar, busy, onImport, onRemoveImport, onUpdate }: {
  radar: PublicRadar;
  busy: boolean;
  onImport: (packet: SubscriberImport) => Promise<void>;
  onRemoveImport: () => void;
  onUpdate: (people: PublicPerson[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const ranked = useMemo(() => rankPublicSubscribers(radar.people), [radar.people]);
  const rows = ranked.filter(p => `${p.name} ${p.handle ?? ""} ${p.publicationName ?? ""}`.toLowerCase().includes(search.toLowerCase()) && (source === "all" || (source === "list" ? ["public_list", "browser_list", "owner_list"].includes(p.subscriberEvidence) : p.subscriberEvidence === "comment")));
  const pending = ranked.filter(p => (p.handle || /^\d{1,30}$/.test(p.id)) && (p.audienceStatus === "unavailable" || (!p.handle && p.audience === null)));
  const coverage = radar.subscriberCoverage;

  const enrich = async () => {
    setEnriching(true);
    setError(null);
    try {
      const response = await fetch("/api/subscribers/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identities: pending.slice(0, 50).map(p => ({ id: /^\d{1,30}$/.test(p.id) ? p.id : undefined, handle: p.handle })) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Audience lookup failed.");
      const results = new Map<string, EnrichedProfile>((body.profiles as EnrichedProfile[]).map(p => [p.id ?? `handle:${p.handle}`, p]));
      onUpdate(radar.people.map(p => {
        const result = results.get(p.id) ?? (p.handle ? results.get(`handle:${p.handle}`) : undefined);
        const handle = result?.handle ?? p.handle;
        return result ? { ...p, handle, profileUrl: handle ? `https://substack.com/@${encodeURIComponent(handle)}` : p.profileUrl, audienceStatus: result.status, audience: result.audience ?? p.audience, audienceLabel: result.audienceLabel ?? p.audienceLabel, bestseller: result.bestseller ?? p.bestseller } : p;
      }));
      if (body.stopped) setError("Substack requested browser access or rate limited these lookups. Remaining counts are unavailable; retry later.");
    } catch (err) { setError(err instanceof Error ? err.message : "Audience lookup failed."); }
    finally { setEnriching(false); }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    setImportError(null);
    try {
      if (file.size > 500000) throw new Error("Choose a subscriber export smaller than 500 KB.");
      await onImport(parseSubscriberImport(JSON.parse(await file.text())));
      dialog.current?.close();
    } catch (err) { setImportError(err instanceof Error ? err.message : "Could not read this subscriber export."); }
    finally { if (input.current) input.current.value = ""; }
  };

  const importText = async () => {
    setImportError(null);
    try {
      if (importJson.length > 500000) throw new Error("Choose an export smaller than 500 KB.");
      await onImport(parseSubscriberImport(JSON.parse(importJson)));
      dialog.current?.close();
      setImportJson("");
    } catch (err) { setImportError(err instanceof Error ? err.message : "Invalid subscriber export."); }
  };

  const exportCsv = () => {
    const cell = (v: unknown) => '"' + String(v ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
    const data = [["Rank", "Subscriber", "Handle", "Audience", "Audience label", "Ranking signal", "Membership source", "Captured at", "Profile"], ...rows.map(p => [p.rank, p.name, p.handle, p.audience, p.audienceLabel, p.audienceSource, p.subscriberEvidence, coverage.capturedAt, p.profileUrl])];
    const url = URL.createObjectURL(new Blob([data.map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `${radar.domain}-ranked-subscribers.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return <section aria-label="Ranked subscribers">
    <div className="subscriber-summary"><div><h2>Highest-ranked subscribers</h2><p>{ranked.length} profiles in ranking{coverage.totalLabel || coverage.totalCount !== null ? ` · ${coverage.totalLabel ?? coverage.totalCount?.toLocaleString()} reported subscribers` : ""} · {ranked.filter(p => p.audience !== null).length} public audience counts</p></div><span className="public-tag">{coverage.source === "owner_session" ? "Owner list" : "Partial coverage"}</span></div>
    <div className="subscriber-access"><div><strong>{coverage.source === "owner_session" ? "Owner subscriber list connected" : coverage.source === "browser_list" ? "Browser subscriber list imported" : coverage.source === "public_list" ? "Public subscriber list available" : coverage.status === "browser_required" ? "Only a comment sample is available" : "Public subscriber list unavailable"}</strong><p>{coverage.source === "owner_session" ? `Session snapshot captured ${new Date(coverage.capturedAt).toLocaleString()}. Cookies and email addresses were not transferred. Profiles without public audience data remain unknown.` : coverage.source === "browser_list" ? `Export captured ${new Date(coverage.capturedAt).toLocaleString()}. Only loaded public rows are included; private subscriptions are not.` : coverage.source === "public_list" ? "Rankings include visible subscribers from the creator's public list, not all subscribers." : "These rows do not represent your total subscriber list. The Chrome connector can read your owner list using your signed-in browser session."}</p></div><div className="subscriber-actions">
      <a href={`https://${radar.domain}/publish/subscribers`} target="_blank" rel="noreferrer" className="secondary-button">Owner dashboard<ArrowUpRight size={15} /></a>
      {coverage.profileUrl && <a href={coverage.profileUrl} target="_blank" rel="noreferrer" className="secondary-button">Subscribers page<ArrowUpRight size={15} /></a>}
      <a href="/substack-radar-helper.zip" download className="secondary-button" title="Download the Chrome helper as an unpacked extension"><Download size={15} />Chrome helper</a>
      <button className="secondary-button" disabled={busy || enriching} onClick={() => { setImportError(null); dialog.current?.showModal(); }}><Upload size={15} />Import list</button>
      {(coverage.source === "browser_list" || coverage.source === "owner_session") && <button className="icon-button" disabled={busy || enriching} title="Remove imported list" aria-label="Remove imported list" onClick={onRemoveImport}><X size={15} /></button>}
      <input ref={input} type="file" accept=".json,application/json" aria-label="Import subscriber export" className="sr-only" onChange={e => void importFile(e.target.files?.[0])} />
    </div></div>
    <dialog ref={dialog} className="subscriber-import-dialog" aria-labelledby="subscriber-import-title"><div className="import-dialog-heading"><h2 id="subscriber-import-title">Import subscribers</h2><button className="icon-button" aria-label="Close import" onClick={() => dialog.current?.close()}><X size={18} /></button></div><button className="secondary-button" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} />Choose JSON file</button><label htmlFor="subscriber-import-json">Subscriber JSON</label><textarea id="subscriber-import-json" value={importJson} onChange={e => setImportJson(e.target.value)} maxLength={500000} placeholder="Paste a subscriber export" spellCheck={false} />{importError && <p className="error-message" role="alert">{importError}</p>}<div className="import-dialog-footer"><button className="primary-button" disabled={busy || !importJson.trim()} onClick={() => void importText()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}{busy ? "Importing…" : "Import JSON"}</button></div></dialog>
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="table-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search ranked subscribers" placeholder="Search subscribers…" value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="Subscriber evidence" value={source} onChange={e => setSource(e.target.value)}><option value="all">All identified subscribers</option><option value="list">List entries only</option><option value="comment">Comment signal only</option></select>{pending.length > 0 && <button className="secondary-button" disabled={busy || enriching} onClick={() => void enrich()}>{enriching ? <LoaderCircle className="spin" size={15} /> : <Users size={15} />}{enriching ? "Looking up…" : `Look up next ${Math.min(pending.length, 50)}`}</button>}<button className="icon-button" title="Export ranked subscribers as CSV" aria-label="Export ranked subscribers" disabled={!rows.length} onClick={exportCsv}><Download size={17} /></button></div>
    <div className="table-scroll"><table className="people-table"><caption className="sr-only">Identified subscribers ranked by their public audience size</caption><thead><tr><th scope="col">Rank</th><th scope="col">Subscriber</th><th scope="col">Public audience</th><th scope="col">Rank signal</th><th scope="col">Subscription evidence</th><th scope="col"><span className="sr-only">Profile</span></th></tr></thead><tbody>{rows.map(p => <tr key={p.id}><td className="rank-cell">{p.rank}</td><td><div className="person-cell"><div><a href={p.profileUrl ?? undefined} target="_blank" rel="noreferrer">{p.name}</a><small>{p.publicationName ?? (p.handle ? `@${p.handle}` : "Profile not resolved")}</small></div></div></td><td><span className="audience-value">{p.audienceLabel ?? (p.audience !== null ? p.audience.toLocaleString() : !p.handle ? "Not looked up" : p.audienceStatus === "not_public" ? "Not published" : "Unavailable")}</span></td><td><span className={p.audienceSource === "bestseller" ? "bestseller" : "relationship"}>{p.audienceSource === "subscriber_count" ? "Audience count" : p.audienceSource === "bestseller" ? "Bestseller badge" : "Unknown"}</span></td><td><span className={p.subscriberEvidence === "comment" ? "relationship" : "relationship subscriber"}>{p.subscriberEvidence === "owner_list" ? "Owner list" : p.subscriberEvidence === "comment" ? "Comment signal" : "Public list"}</span></td><td>{p.profileUrl && <a href={p.profileUrl} target="_blank" rel="noreferrer" aria-label={`Open ${p.name}'s profile`}><ArrowUpRight size={17} /></a>}</td></tr>)}</tbody></table></div>
    {!rows.length && <div className="empty-results"><Users size={28} /><h3>{search ? "No matching subscribers" : "No subscribers identified yet"}</h3><p>{search ? "Try another name." : "A public-list export can add subscribers missing from the recent discussions."}</p></div>}
    <div className="table-footer"><span>{rows.length} subscribers shown{pending.length > 0 ? ` · ${pending.length} audience lookups pending` : ""}</span><span>Counts first, then bestseller badges; unknown audiences last.</span></div>
    <aside className="data-note"><div><strong>Ranking scope</strong><p>Ranks apply only to imported or identified profiles, not automatically to every reported subscriber. Public counts can be rounded. The profile total and public list can span multiple publications. Only owner access can include private subscriptions; audience sizes still require public profile data. Comment signals describe membership when the comment was posted.{coverage.hiddenCount !== null ? ` Substack reports ${coverage.hiddenCount.toLocaleString()} other subscribers not listed publicly.` : ""}</p></div></aside>
  </section>;
}
