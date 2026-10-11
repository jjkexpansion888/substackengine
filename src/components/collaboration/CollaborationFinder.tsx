"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Bookmark, Check, Copy, Download, Handshake, LoaderCircle, Search, ThumbsDown, ThumbsUp, Trash2, Undo2, Upload, X } from "lucide-react";
import type { PublicRadar } from "@/lib/substack/publicRadar";
import { campaignLink, collaborationIdeas, resolveOutreachDraft, rankCollaborators } from "@/lib/collaboration/matching";
import type { CollaborationCandidate, CollaborationFormat, CollaborationRecord, CollaborationScan, CollaborationStage } from "@/lib/collaboration/types";
import styles from "./CollaborationFinder.module.css";
import { parseCollaborationBackup } from "@/lib/collaboration/backup";

const stages: CollaborationStage[] = ["new", "saved", "contacted", "replied", "scheduled", "completed", "dismissed"];
const formats: CollaborationFormat[] = ["Guest post", "Interview", "Joint live session", "Recommendation"];
const number = (value: number | null) => value === null ? "Not public" : value.toLocaleString();
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
function recordFor(candidate: CollaborationCandidate): CollaborationRecord {
  return { candidate, stage: "new", notes: "", followUp: "", format: "Guest post", subscribers: 0, clicks: 0, hours: 0, feedback: null, updatedAt: new Date().toISOString() };
}

export function CollaborationFinder({ radar }: { radar: PublicRadar }) {
  const key = `substack-collaborations:v1:${radar.domain}`;
  const [records, setRecords] = useState<Record<string, CollaborationRecord>>({});
  const [scan, setScan] = useState<CollaborationScan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const senderName = radar.name;
  const senderUrl = `https://${radar.domain}/`;
  const audience = radar.subscriberCoverage.totalCount?.toString() ?? "";
  const context = "";
  const seeds = "";
  const goal = "balanced" as const;
  const diversity = true;
  const [view, setView] = useState("Discover");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [stage, setStage] = useState("all");
  const [minAudience, setMinAudience] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const [removed, setRemoved] = useState<{ candidate: CollaborationCandidate; record?: CollaborationRecord } | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const detail = useRef<HTMLElement>(null);
  useEffect(() => { if (selected) detail.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [selected]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const data = parseCollaborationBackup(JSON.parse(saved), radar.domain, false);
        setRecords(data.records); setScan(data.scan);
      }
    } catch { setError("Saved collaboration data could not be loaded. New changes will be kept in this session."); }
    setLoaded(true);
  }, [key, radar.domain]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, domain: radar.domain, records, scan, context, audience, seeds, goal, diversity, senderName, senderUrl }));
    }
    catch { setError("Browser storage is unavailable or full. Export your pipeline to retain these changes."); }
  }, [key, radar.domain, loaded, records, scan, context, audience, seeds, goal, diversity, senderName, senderUrl]);

  const candidates = useMemo(() => [...new Map([
    ...Object.values(records).filter(r => r.stage !== "new" || r.feedback || r.notes || r.followUp || Object.keys(r.drafts ?? {}).length).map(r => [r.candidate.id, r.candidate] as const),
    ...(scan?.candidates ?? []).map(c => [c.id, c] as const),
  ]).values()], [scan, records]);
  const ranking = useMemo(() => rankCollaborators(`${radar.name} ${radar.description ?? ""} ${radar.posts.map(p => p.title).join(" ")} ${context}`, candidates, {
    audience: audience.trim() ? Number(audience) : null, goal, records, diversity,
  }), [radar, candidates, context, audience, goal, records, diversity]);
  const matches = ranking.matches.filter(m => {
    const record = records[m.id];
    return (view === "Discover" ? record?.stage !== "dismissed" : view === "Shortlist" ? record && !["new", "dismissed"].includes(record.stage) : true)
      && `${m.name} ${m.publication} ${m.domain} ${m.description}`.toLowerCase().includes(query.toLowerCase())
      && (source === "all" || m.source === source) && (stage === "all" || (record?.stage ?? "new") === stage)
      && (!minAudience || (m.audience !== null && m.audience >= Number(minAudience)));
  });
  const active = ranking.matches.find(m => m.id === selected);
  const activeRecord = active ? records[active.id] ?? recordFor(active) : null;
  const visibleDraft = active && activeRecord ? resolveOutreachDraft(senderName, radar.name, active, activeRecord.format, activeRecord.drafts?.[activeRecord.format]) : "";
  const trackingLink = active && activeRecord ? campaignLink(senderUrl, active.domain, activeRecord.format) : null;
  const pipeline = Object.values(records).filter(r => !["new", "dismissed"].includes(r.stage));
  const completed = pipeline.filter(r => r.stage === "completed");
  const subscribers = completed.reduce((n, r) => n + r.subscribers, 0);
  const hours = completed.reduce((n, r) => n + r.hours, 0);
  const feedbackCount = ranking.matches.filter(m => records[m.id]?.feedback).length;

  const update = (candidate: CollaborationCandidate, patch: Partial<CollaborationRecord>) => setRecords(current => ({
    ...current, [candidate.id]: { ...(current[candidate.id] ?? recordFor(candidate)), ...patch, candidate, updatedAt: new Date().toISOString() },
  }));
  const remove = (candidate: CollaborationCandidate) => {
    setRemoved({ candidate, record: records[candidate.id] });
    setRecords(current => { const next = { ...current }; delete next[candidate.id]; return next; });
    setScan(current => current ? { ...current, candidates: current.candidates.filter(c => c.id !== candidate.id) } : current);
    setSelected(null);
  };
  const undoRemoval = () => {
    if (!removed) return;
    if (removed.record) setRecords(current => ({ ...current, [removed.candidate.id]: removed.record! }));
    setScan(current => ({ ...(current ?? { candidates: [], warnings: [], requests: 0, scannedAt: new Date().toISOString() }), candidates: [...(current?.candidates ?? []).filter(c => c.id !== removed.candidate.id), removed.candidate] }));
    setRemoved(null);
  };
  const discover = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/collaborations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        domain: radar.domain, seeds: [], writing: `${radar.description ?? ""} ${radar.posts.map(post => post.title).join(" ")}`.slice(0, 30000), excludeDomains: candidates.map(candidate => candidate.domain).slice(0, 500),
        people: radar.people.filter(p => p.handle).slice(0, 1000).map(p => ({ handle: p.handle, comments: p.comments, author: p.role === "Author", domain: p.publicationDomain, name: p.name, publication: p.publicationName, description: p.publicationDescription, audience: p.audience, audienceLabel: p.audienceLabel, photoUrl: p.photoUrl })),
      }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Collaboration discovery failed.");
      setScan(current => ({ ...body, candidates: [...new Map([...(current?.candidates ?? []), ...body.candidates].map((candidate: CollaborationCandidate) => [candidate.id, candidate])).values()].slice(0, 500) }));
      setView("Discover");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not discover collaborators."); }
    finally { setBusy(false); }
  };
  const copy = async (content: string, label: string) => {
    try { await navigator.clipboard.writeText(content); setCopied(label); }
    catch { setError("Clipboard access is unavailable. The draft remains editable below."); }
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a backup smaller than 5 MB.");
      const data = parseCollaborationBackup(JSON.parse(await file.text()), radar.domain);
      setRecords(current => ({ ...data.records, ...current }));
      if (data.scan) setScan(data.scan);
      setSelected(null); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not restore this backup."); }
    finally { if (backupInput.current) backupInput.current.value = ""; }
  };
  const exportCsv = () => {
    const cell = (x: unknown) => `"${String(x ?? "").replace(/^\s*[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const rows = [["Writer", "Publication", "Domain", "Fit", "Evidence confidence", "Public audience", "Shared public participants", "Stage", "Format", "Follow up", "Subscribers", "Clicks", "Hours", "Notes"], ...matches.map(m => {
      const r = records[m.id] ?? recordFor(m);
      return [m.name, m.publication, m.domain, m.score, m.confidence, m.audience, m.sharedParticipants, r.stage, r.format, r.followUp, r.subscribers, r.clicks, r.hours, r.notes];
    })];
    download(`${radar.domain}-collaborations.csv`, rows.map(row => row.map(cell).join(",")).join("\r\n"), "text/csv");
  };

  return <section className={styles.finder} aria-label="Collaboration finder">
    <div className={styles.heading}><div><h2>Collaboration finder</h2><p>{senderName}{scan ? ` · ${scan.candidates.length} writers · ${pipeline.length} in your pipeline` : ""}</p></div><div className={styles.actions}><button className="primary-button" disabled={busy || !loaded} onClick={() => void discover()}>{busy ? <LoaderCircle size={16} className="spin" /> : <Handshake size={16} />}{busy ? "Discovering..." : scan ? "Find more collaborators" : "Find collaborators"}</button></div></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {removed && <div className={styles.modelLine} role="status"><span>{removed.candidate.name} removed from research.</span><button className="secondary-button" onClick={undoRemoval}><Undo2 size={15} />Undo</button></div>}
    {busy && <p className="form-feedback" role="status">Checking writer profiles, recent posts, and shared public discussions. This may take about a minute.</p>}
    <div className={styles.subnav}><div role="tablist" aria-label="Collaboration views">{["Discover", "Shortlist", "Outcomes"].map(v => <button role="tab" key={v} aria-selected={view === v} onClick={() => { setView(v); setSelected(null); }}>{v}{v === "Shortlist" && <span>{pipeline.length}</span>}</button>)}</div><button className="icon-button" title="Export visible collaborations as CSV" aria-label="Export collaborations" disabled={!matches.length} onClick={exportCsv}><Download size={16} /></button></div>
    {view === "Outcomes" ? <>
      <div className={styles.outcomeMetrics}><div><span>Completed partnerships</span><strong>{completed.length}</strong></div><div><span>Reported new subscribers</span><strong>{subscribers.toLocaleString()}</strong></div><div><span>Reported link clicks</span><strong>{completed.reduce((n, r) => n + r.clicks, 0).toLocaleString()}</strong></div><div><span>Subscribers / hour</span><strong>{hours ? (subscribers / hours).toFixed(1) : "--"}</strong></div></div>
      <div className="table-scroll"><table className="people-table"><thead><tr><th>Partner</th><th>Format</th><th>Stage</th><th>Subscribers</th><th>Clicks</th><th>Hours</th></tr></thead><tbody>{pipeline.map(r => <tr key={r.candidate.id}><td><button className={styles.textButton} onClick={() => setSelected(r.candidate.id)}>{r.candidate.publication}</button></td><td>{r.format}</td><td>{r.stage}</td><td>{r.subscribers}</td><td>{r.clicks}</td><td>{r.hours}</td></tr>)}</tbody></table></div>
      {!pipeline.length && <p className={styles.empty}>No partnerships tracked yet.</p>}
      <p className={styles.note}>Results are manually reported. Tracking links identify campaigns; clicks and subscriptions must be confirmed in your analytics.</p>
    </> : <>
      <div className={styles.filters}><div className="search-field"><Search size={16} /><input aria-label="Search collaboration matches" placeholder="Search writers or publications" value={query} onChange={e => setQuery(e.target.value)} /></div><select aria-label="Discovery source" value={source} onChange={e => setSource(e.target.value)}><option value="all">All sources</option><option value="community">Your community</option><option value="extended">Extended network</option><option value="seed">Added publications</option></select><select aria-label="Pipeline stage" value={stage} onChange={e => setStage(e.target.value)}><option value="all">All stages</option>{stages.map(s => <option key={s} value={s}>{s}</option>)}</select><input className={styles.minimum} aria-label="Minimum public audience" type="number" min="0" placeholder="Min. audience" value={minAudience} onChange={e => setMinAudience(e.target.value)} /></div>
      <div className={styles.results}><div className="table-scroll"><table className={`people-table ${styles.matches}`}><caption className="sr-only">Potential collaborators ranked by fit</caption><thead><tr><th>Writer / publication</th><th>Fit</th><th>Public audience</th><th>Shared participants</th><th>Stage</th><th><span className="sr-only">Save</span></th></tr></thead><tbody>{matches.map(m => <tr key={m.id} className={m.id === selected ? styles.selected : ""}><td><div className="person-cell"><span className="avatar">{m.photoUrl ?
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.photoUrl} alt="" onError={e => { e.currentTarget.style.display = "none"; }} /> : m.name.slice(0, 2).toUpperCase()}</span><div><button className={styles.textButton} onClick={() => { setSelected(m.id); setCopied(""); }}>{m.name}</button><small>{m.publication}</small></div></div></td><td><strong className={styles.score}>{m.score}</strong><small className={styles.confidence}>{m.confidence} evidence</small></td><td>{m.audienceLabel ?? number(m.audience)}</td><td>{m.sampledParticipants ? `${m.sharedParticipants} / ${m.sampledParticipants}` : "No sample"}</td><td><span className="relationship">{records[m.id]?.stage ?? "new"}</span>{records[m.id]?.followUp && records[m.id].followUp <= new Date().toLocaleDateString("en-CA") && !["completed", "dismissed"].includes(records[m.id].stage) && <small className={styles.due}>Follow-up due</small>}</td><td><button className="icon-button" title={`Save ${m.name}`} aria-label={`Save ${m.name}`} disabled={!!records[m.id] && !["new", "dismissed"].includes(records[m.id].stage)} onClick={() => update(m, { stage: "saved", feedback: "positive" })}><Bookmark size={16} /></button></td></tr>)}</tbody></table></div></div>
      {!matches.length && <div className="empty-results"><Handshake size={28} /><h3>{busy ? "Looking for potential partners" : scan ? "No matches in this view" : "Ready to meet your next collaborator"}</h3>{scan && <p>No writers match the current filters.</p>}</div>}
      <div className={styles.modelLine}><span>{ranking.method}{diversity ? " · diversity reranking" : ""}</span><span>{ranking.personalized ? "Preference model active" : `${feedbackCount} preference ratings · learns after 6 mixed ratings`}</span></div>
    </>}
    {active && activeRecord && <section ref={detail} className={styles.detail} aria-label={`Collaboration with ${active.name}`}>
      <div className={styles.detailHeading}><div><h3>{active.name}</h3><a href={`https://${active.domain}`} target="_blank" rel="noreferrer">{active.publication}<ArrowUpRight size={14} /></a></div><div className={styles.actions}><button className="icon-button" title="Remove partner from research" aria-label="Remove partner from research" onClick={() => remove(active)}><Trash2 size={17} /></button><button className="icon-button" title="Close partner details" aria-label="Close partner details" onClick={() => setSelected(null)}><X size={17} /></button></div></div>
      <p>{active.description}</p>
      <div className={styles.detailGrid}><div>
        <h4>Why this match</h4><div className={styles.signals}>{[["Topic similarity", active.topic], ["Warm relationship", active.relationshipScore], ["Audience scale fit", active.scale], ["Recent activity", active.activity]].map(([label, value]) => <div key={String(label)}><span>{label}</span><meter min="0" max="100" value={typeof value === "number" ? value : 0} aria-label={String(label)} /><strong>{value === null ? "Unknown" : `${value}/100`}</strong></div>)}</div>
        {active.terms.length > 0 && <p className={styles.note}>Shared terms: {active.terms.join(", ")}</p>}
        <ul className={styles.evidence}>{active.evidence.map(e => <li key={e}>{e}</li>)}</ul>
        <p className={styles.note}>Overlap sample: {active.sharedParticipants} shared people among {active.sampledParticipants} observed public participants; your source sample includes {active.sourceParticipants}. This is not subscriber-list overlap.</p>
        <div className={styles.actions}><button className="icon-button" aria-label={`Good match: ${active.name}`} title="Good match" aria-pressed={activeRecord.feedback === "positive"} onClick={() => update(active, { feedback: activeRecord.feedback === "positive" ? null : "positive" })}><ThumbsUp size={16} /></button><button className="icon-button" aria-label={`Poor match: ${active.name}`} title="Poor match" aria-pressed={activeRecord.feedback === "negative"} onClick={() => update(active, { feedback: activeRecord.feedback === "negative" ? null : "negative" })}><ThumbsDown size={16} /></button>{active.profileUrl && <a className="secondary-button" href={active.profileUrl} target="_blank" rel="noreferrer">Profile<ArrowUpRight size={14} /></a>}</div>
        <h4>Collaboration ideas</h4><div className={styles.ideas}>{collaborationIdeas(active).map(idea => <button key={idea.format} aria-pressed={activeRecord.format === idea.format} onClick={() => update(active, { format: idea.format })}><strong>{idea.title}</strong><span>{idea.format}</span><p>{idea.reason}</p></button>)}</div>
        <h4>Recent work</h4>{active.posts.slice(0, 4).map(p => <div key={p.url ?? p.title} className={styles.recent}>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title}<ArrowUpRight size={13} /></a> : <span>{p.title}</span>}<small>{p.date ? new Date(p.date).toLocaleDateString() : "Undated"} · {p.reactions} reactions · {p.comments} comments</small></div>)}
      </div><div className={styles.editor}>
        <h4>Partnership</h4><div className={styles.fieldPair}><label>Stage<select value={activeRecord.stage} onChange={e => update(active, { stage: e.target.value as CollaborationStage, ...(e.target.value === "dismissed" ? { feedback: "negative" as const } : {}) })}>{stages.map(s => <option key={s}>{s}</option>)}</select></label><label>Follow-up date<input type="date" value={activeRecord.followUp} onChange={e => update(active, { followUp: e.target.value })} /></label></div>
        <label>Format<select value={activeRecord.format} onChange={e => update(active, { format: e.target.value as CollaborationFormat })}>{formats.map(f => <option key={f}>{f}</option>)}</select></label>
        <label>Notes<textarea rows={3} value={activeRecord.notes} onChange={e => update(active, { notes: e.target.value })} /></label>
        <div className={styles.labelAction}><h4>Outreach draft</h4><div className={styles.actions}><button className="icon-button" aria-label="Regenerate outreach draft" title="Regenerate outreach draft with your publication name" onClick={() => { update(active, { drafts: { ...activeRecord.drafts, [activeRecord.format]: undefined } }); setCopied(""); }}><Undo2 size={16} /></button><button className="icon-button" aria-label="Copy outreach draft" title="Copy outreach draft" onClick={() => void copy(visibleDraft, "draft")}>{copied === "draft" ? <Check size={16} /> : <Copy size={16} />}</button></div></div><p className={styles.note}>Outreach from {senderName || "an unnamed publication"}</p><textarea aria-label="Outreach draft" rows={11} value={visibleDraft} onChange={e => { update(active, { drafts: { ...activeRecord.drafts, [activeRecord.format]: e.target.value } }); setCopied(""); }} />
        <h4>Campaign link</h4><div className={styles.tracking}><input aria-label="Campaign tracking link" readOnly value={trackingLink ?? ""} /><button className="icon-button" aria-label="Copy campaign link" title="Copy campaign link" disabled={!trackingLink} onClick={() => trackingLink && void copy(trackingLink, "link")}>{copied === "link" ? <Check size={16} /> : <Copy size={16} />}</button></div>{!trackingLink && <p className={styles.note}>A valid HTTPS publication URL is required for campaign links.</p>}
        <h4>Reported results</h4><div className={styles.resultInputs}>{(["subscribers", "clicks", "hours"] as const).map(field => <label key={field}>{field}<input type="number" min="0" step={field === "hours" ? "0.25" : "1"} value={activeRecord[field]} onChange={e => update(active, { [field]: Math.max(0, Number(e.target.value) || 0) })} /></label>)}</div>
      </div></div>
    </section>}
    <div className={styles.bottom}><p className={styles.note}>Fit scores are relative indicators, not probabilities of growth. Evidence confidence reflects data coverage. Matching learns only from the current candidate corpus. Public samples may be incomplete; saved partnerships and results stay in this browser.</p><div className={styles.actions}><button className="icon-button" disabled={!loaded || busy} title="Restore collaboration backup" aria-label="Restore collaboration backup" onClick={() => backupInput.current?.click()}><Upload size={16} /></button><input className="sr-only" type="file" accept=".json,application/json" aria-label="Collaboration backup file" ref={backupInput} onChange={e => void importBackup(e.target.files?.[0])} /><button className="secondary-button" disabled={!loaded} onClick={() => download(`${radar.domain}-collaboration-backup.json`, JSON.stringify({ version: 1, domain: radar.domain, records, scan, context, audience, seeds, goal, diversity, senderName, senderUrl }, null, 2), "application/json")}><Download size={15} />Export backup</button></div></div>
    {scan?.warnings.map(w => <p key={w} className={styles.warning}>{w}</p>)}
  </section>;
}
