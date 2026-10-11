"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Download, LoaderCircle, Search, Users, X } from "lucide-react";
import type { PublicRadar, PublicPerson } from "@/lib/substack/publicRadar";
import { rankPublicSubscribers, type SubscriberImport } from "@/lib/substack/subscriberRanking";

import { mergeAudienceResults, type EnrichedAudience } from "@/lib/substack/audienceQueue";
import { SubscriberImportDialog } from "./SubscriberImportDialog";
import { SubscriberAccountMatch } from "./SubscriberAccountMatch";
import { SubscriberNameDiscovery } from "./SubscriberNameDiscovery";

export function SubscribersPanel({ radar, busy, onImport, onRemoveImport, onUpdate, importedPacket, onMatchingStateChange }: {
  radar: PublicRadar;
  busy: boolean;
  importedPacket?: SubscriberImport;
  onMatchingStateChange?: (running: boolean) => void;
  onImport: (packet: SubscriberImport) => Promise<void>;
  onRemoveImport: () => void;
  onUpdate: (people: PublicPerson[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const ranked = useMemo(() => rankPublicSubscribers(radar.people), [radar.people]);
  const inferredIds = new Set(importedPacket?.subscribers.filter(row => row.nameMatch).map(row => row.id));
  const rows = ranked.filter(p => `${p.name} ${p.handle ?? ""} ${p.publicationName ?? ""}`.toLowerCase().includes(search.toLowerCase()) && (source === "all" || (source === "list" ? ["public_list", "browser_list", "owner_list", "file_list"].includes(p.subscriberEvidence) : p.subscriberEvidence === "comment"))).map(p => inferredIds.has(p.id) ? { ...p, publicationName: `${p.publicationName ?? `@${p.handle}`} · Inferred match` } : p);
  const pending = ranked.filter(p => (p.handle || /^\d{1,30}$/.test(p.id)) && (p.audienceStatus === "unavailable" || (!p.handle && p.audience === null)));
  const coverage = radar.subscriberCoverage;
  const unresolved = ranked.filter(p => !p.handle && !/^\d+$/.test(p.id)).length;

  const enrich = async () => {
    setEnriching(true);
    setError(null);
    try {
      const response = await fetch("/api/subscribers/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identities: pending.slice(0, 50).map(p => ({ id: /^\d{1,30}$/.test(p.id) ? p.id : undefined, handle: p.handle })) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Audience lookup failed.");
      onUpdate(mergeAudienceResults(radar.people, body.profiles as EnrichedAudience[]));
      if (body.stopped) setError("Substack requested browser access or rate limited these lookups. Remaining counts are unavailable; retry later.");
    } catch (err) { setError(err instanceof Error ? err.message : "Audience lookup failed."); }
    finally { setEnriching(false); }
  };

  const exportCsv = () => {
    const cell = (v: unknown) => '"' + String(v ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
    const data = [["Rank", "Subscriber", "Handle", "Audience", "Audience label", "Ranking signal", "Membership source", "Captured at", "Profile", "Account match"], ...rows.map(p => [p.rank, p.name, p.handle, p.audience, p.audienceLabel, p.audienceSource, p.subscriberEvidence, coverage.capturedAt, p.profileUrl, inferredIds.has(p.id) ? "Inferred from name" : "Explicit identity"])];
    const url = URL.createObjectURL(new Blob([data.map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `${radar.domain}-ranked-subscribers.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return <section aria-label="Ranked subscribers">
    <div className="subscriber-summary"><div><h2>Highest-ranked subscribers</h2><p>{ranked.length} profiles in ranking{coverage.totalLabel || coverage.totalCount !== null ? ` · ${coverage.totalLabel ?? coverage.totalCount?.toLocaleString()} ${coverage.source === "file_import" ? "imported subscribers" : "reported subscribers"}` : ""} · {ranked.filter(p => p.audience !== null).length} public audience counts · {unresolved} unresolved accounts</p></div><span className="public-tag">{coverage.source === "file_import" ? "CSV roster" : coverage.source === "owner_session" ? "Saved roster" : "Partial coverage"}</span></div>
    <div className="subscriber-access"><div><strong>{coverage.source === "file_import" ? "Subscriber CSV imported" : coverage.source === "owner_session" ? "Saved subscriber roster" : coverage.source === "browser_list" ? "Browser subscriber list imported" : coverage.source === "public_list" ? "Public subscriber list available" : coverage.status === "browser_required" ? "Only a comment sample is available" : "Public subscriber list unavailable"}</strong><p>{coverage.source === "file_import" ? "Membership comes from your file; counts come from matched public accounts. Email-only subscribers remain unresolved." : coverage.source === "owner_session" ? `Session snapshot captured ${new Date(coverage.capturedAt).toLocaleString()}. Cookies and email addresses were not transferred. Profiles without public audience data remain unknown.` : coverage.source === "browser_list" ? `Export captured ${new Date(coverage.capturedAt).toLocaleString()}. Only loaded public rows are included; private subscriptions are not.` : coverage.source === "public_list" ? "Rankings include visible subscribers from the creator's public list, not all subscribers." : "These rows do not represent your total subscriber list. Import a CSV exported from your publisher dashboard to add your own roster."}</p></div><div className="subscriber-actions">
      <a href={`https://${radar.domain}/publish/subscribers`} target="_blank" rel="noreferrer" className="secondary-button">Owner dashboard<ArrowUpRight size={15} /></a>
      {coverage.profileUrl && <a href={coverage.profileUrl} target="_blank" rel="noreferrer" className="secondary-button">Subscribers page<ArrowUpRight size={15} /></a>}
      <SubscriberImportDialog domain={radar.domain} busy={busy || enriching} onImport={onImport} />
      {(coverage.source === "browser_list" || coverage.source === "owner_session" || coverage.source === "file_import") && <button className="icon-button" disabled={busy || enriching} title="Remove imported list" aria-label="Remove imported list" onClick={onRemoveImport}><X size={15} /></button>}
    </div></div>
    {importedPacket?.version === 3 && <SubscriberNameDiscovery packet={importedPacket} busy={busy || enriching} onImport={onImport} onMatchingStateChange={onMatchingStateChange} />}
    {error && <p role="alert" className="error-message">{error}</p>}
    <div className="table-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search ranked subscribers" placeholder="Search subscribers…" value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="Subscriber evidence" value={source} onChange={e => setSource(e.target.value)}><option value="all">All identified subscribers</option><option value="list">List entries only</option><option value="comment">Comment signal only</option></select>{pending.length > 0 && <button className="secondary-button" disabled={busy || enriching} onClick={() => void enrich()}>{enriching ? <LoaderCircle className="spin" size={15} /> : <Users size={15} />}{enriching ? "Looking up…" : `Look up next ${Math.min(pending.length, 50)}`}</button>}<button className="icon-button" title="Export ranked subscribers as CSV" aria-label="Export ranked subscribers" disabled={!rows.length} onClick={exportCsv}><Download size={17} /></button></div>
    <div className="table-scroll"><table className="people-table"><caption className="sr-only">Identified subscribers ranked by their public audience size</caption><thead><tr><th scope="col">Rank</th><th scope="col">Subscriber</th><th scope="col">Public audience</th><th scope="col">Rank signal</th><th scope="col">Subscription evidence</th><th scope="col"><span className="sr-only">Profile</span></th></tr></thead><tbody>{rows.map(p => <tr key={p.id}><td className="rank-cell">{p.rank}</td><td><div className="person-cell"><div><a href={p.profileUrl ?? undefined} target="_blank" rel="noreferrer">{p.name}</a><small>{p.publicationName ?? (p.handle ? `@${p.handle}` : "Profile not resolved")}</small></div></div></td><td><span className="audience-value">{p.audienceLabel ?? (p.audience !== null ? p.audience.toLocaleString() : !p.handle && !/^\d+$/.test(p.id) ? "Unresolved account" : p.audienceStatus === "not_public" ? "Not published" : "Unavailable")}</span></td><td><span className={p.audienceSource === "bestseller" ? "bestseller" : "relationship"}>{p.audienceSource === "subscriber_count" ? "Audience count" : p.audienceSource === "bestseller" ? "Bestseller badge" : "Unknown"}</span></td><td><span className={p.subscriberEvidence === "comment" ? "relationship" : "relationship subscriber"}>{p.subscriberEvidence === "file_list" ? "Imported CSV" : p.subscriberEvidence === "owner_list" ? "Saved owner list" : p.subscriberEvidence === "comment" ? "Comment signal" : "Public list"}</span></td><td>{p.id.startsWith("csv:") && !p.handle && importedPacket?.version === 3 && <SubscriberAccountMatch id={p.id} name={p.name} packet={importedPacket} busy={busy || enriching} onImport={onImport} />}{p.profileUrl && <a href={p.profileUrl} target="_blank" rel="noreferrer" aria-label={`Open ${p.name}'s profile`}><ArrowUpRight size={17} /></a>}</td></tr>)}</tbody></table></div>
    {!rows.length && <div className="empty-results"><Users size={28} /><h3>{search ? "No matching subscribers" : "No subscribers identified yet"}</h3><p>{search ? "Try another name." : "A public-list export can add subscribers missing from the recent discussions."}</p></div>}
    <div className="table-footer"><span>{rows.length} subscribers shown{pending.length > 0 ? ` · ${pending.length} audience lookups pending` : ""}</span><span>Counts first, then bestseller badges; unknown audiences last.</span></div>
    <aside className="data-note"><div><strong>Ranking scope</strong><p>Ranks apply only to imported or identified profiles, not automatically to every reported subscriber. Public counts can be rounded. The profile total and public list can span multiple publications. Imported membership comes from your CSV. Inferred matches are name-based guesses, not verified subscriber identities; their counts belong to the selected public accounts. Emails are never used to guess accounts. Comment signals describe membership when the comment was posted.{coverage.hiddenCount !== null ? ` Substack reports ${coverage.hiddenCount.toLocaleString()} other subscribers not listed publicly.` : ""}</p></div></aside>
  </section>;
}
