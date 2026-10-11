"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, CalendarDays, Check, Download, Lightbulb, RefreshCw, Search, Trash2, X } from "lucide-react";
import { EditorialBrief } from "./EditorialBrief";
import type { PublicRadar } from "@/lib/substack/publicRadar";
import { manualQuestions, rankOpportunities } from "@/lib/opportunities/ranking";
import { calendarCsv, readCalendar } from "@/lib/opportunities/calendar";
import { readOpportunityCache } from "@/lib/opportunities/cache";
import type { ContentOpportunity, EditorialEntry, OpportunityScan } from "@/lib/opportunities/types";
import styles from "./ContentOpportunities.module.css";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
export function ContentOpportunities({ radar }: { radar: PublicRadar }) {
  const key = `substack-opportunities:v1:${radar.domain}`;
  const [scan, setScan] = useState<OpportunityScan | null>(null);
  const [entries, setEntries] = useState<EditorialEntry[]>([]);
  const [interests, setInterests] = useState("");
  const [questions, setQuestions] = useState("");
  const [sources, setSources] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("Discover");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("All opportunities");
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [removed, setRemoved] = useState<EditorialEntry | null>(null);
  const detail = useRef<HTMLElement>(null);
  useEffect(() => { if (selected) detail.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [selected]);
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(key) ?? "{}");
      setEntries(readCalendar(data.entries));
      setScan(readOpportunityCache(data.scan, radar.domain));
      if (typeof data.interests === "string") setInterests(data.interests.slice(0, 2000));
      if (typeof data.questions === "string") setQuestions(data.questions.slice(0, 20000));
      if (typeof data.sources === "string") setSources(data.sources.slice(0, 2000));
    } catch { setError("Saved planning data could not be loaded."); }
    setLoaded(true);
  }, [key, radar.domain]);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(key, JSON.stringify({ entries, interests, questions, sources, scan })); }
    catch { setError("Browser storage is unavailable. Export your calendar to retain your briefs."); }
  }, [key, loaded, entries, interests, questions, sources, scan]);
  const corpus = useMemo<OpportunityScan>(() => ({ ...(scan ?? { domain: radar.domain, posts: radar.posts.map(p => ({ ...p, subtitle: "" })), questions: [], commentsRead: 0, warnings: [], scannedAt: radar.scannedAt }), questions: [...(scan?.questions ?? []), ...manualQuestions(questions)] }), [scan, radar, questions]);
  const ranking = useMemo(() => rankOpportunities(corpus, interests), [corpus, interests]);
  const visible = ranking.opportunities.filter(o => (kind === "All opportunities" || o.kind === kind) && `${o.title} ${o.terms.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const active = ranking.opportunities.find(o => o.id === selected);
  const saved = entries.find(e => e.id === selected);
  const current = saved ?? (active ? { id: active.id, title: active.title, brief: active.brief, date: "", status: "Idea" as const } : null);
  const save = (o: ContentOpportunity) => setEntries(old => old.some(e => e.id === o.id) ? old : [...old, { id: o.id, title: o.title, brief: o.brief, date: "", status: "Idea" }]);
  const analyze = async () => {
    setBusy(true); setError(""); setRemoved(null);
    try {
      const extraSources = sources.split(/[\s,]+/).filter(Boolean).slice(0, 6);
      const response = await fetch("/api/opportunities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: radar.domain, focus: interests, sources: [...new Set(extraSources)] }), signal: AbortSignal.timeout(90000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "The public scan could not be completed.");
      setScan(body); setSelected(null);
    } catch (e) { setError(e instanceof Error ? e.message : "The scan could not be completed."); }
    finally { setBusy(false); }
  };
  const open = (id: string) => { setSelected(id); setCopied(false); };
  return <section aria-label="Content opportunities" className={styles.root}>
    <div className={styles.heading}><div><h2>Content opportunities</h2><p>{scan ? `${scan.posts.length} of your posts · ${scan.publicationsScanned ?? 0} outside publications · ${scan.external?.length ?? 0} source articles` : "Cross-Substack research"}</p></div><button className="primary-button" onClick={() => void analyze()} disabled={busy}>{busy ? <RefreshCw size={16} className="spin" /> : <Search size={16} />}{busy ? "Researching..." : scan ? "Refresh research" : "Explore Substack"}</button></div>
    {busy && <p role="status" className={styles.note}>Comparing your public writing with related Substacks and reading accessible article text...</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {scan?.warnings.map(w => <p key={w} className={styles.note}>{w}</p>)}
    <div className={styles.preferences}><label>Editorial focus<textarea rows={2} maxLength={2000} placeholder="Optional focus for this research" value={interests} onChange={e => setInterests(e.target.value)} /></label><label>Additional Substacks<textarea rows={2} maxLength={2000} placeholder="Publication domains, up to six" value={sources} onChange={e => setSources(e.target.value)} /></label><label>Reader questions<textarea rows={2} maxLength={20000} placeholder="Optional questions from your readers" value={questions} onChange={e => setQuestions(e.target.value)} /></label></div>
    <div className={styles.tabs} role="tablist" aria-label="Opportunity views">{["Discover", "Editorial calendar"].map(v => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}>{v === "Discover" ? <Lightbulb size={16} /> : <CalendarDays size={16} />}{v}{v === "Editorial calendar" && <span>{entries.length}</span>}</button>)}<button className="icon-button" disabled={!entries.length} aria-label="Export editorial calendar" title="Export calendar and briefs as CSV" onClick={() => download(`${radar.domain}-editorial-calendar.csv`, calendarCsv(entries), "text/csv")}><Download size={17} /></button></div>
    {removed && <div role="status" className={styles.notice}><span>Removed from calendar.</span><button onClick={() => { setEntries(old => [...old.filter(e => e.id !== removed.id), removed]); setRemoved(null); }}>Undo</button><button className="icon-button" aria-label="Dismiss calendar notification" title="Dismiss notification" onClick={() => setRemoved(null)}><X size={14} /></button></div>}
    {view === "Discover" ? <>
      <div className={styles.toolbar}><div className="search-field"><Search size={16} /><input aria-label="Search content opportunities" placeholder="Search topics or questions" value={query} onChange={e => setQuery(e.target.value)} /></div><select aria-label="Opportunity type" value={kind} onChange={e => setKind(e.target.value)}>{["All opportunities", "Cross-Substack angle", "Reader question"].map(k => <option key={k}>{k}</option>)}</select></div>
      <div className="table-scroll"><table className={styles.table}><caption className="sr-only">Ranked content opportunities</caption><thead><tr><th>Original angle</th><th>Priority</th><th>Source evidence</th><th>Newness</th><th><span className="sr-only">Save</span></th></tr></thead><tbody>{visible.map(o => <tr key={o.id}><td><button className={styles.ideaTitle} onClick={() => open(o.id)}>{o.title}</button><small>{o.kind}{o.fit !== undefined ? ` · ${o.fit}% alignment` : ""}</small></td><td className={styles.score}>{o.score}</td><td>{o.external?.length ? `${o.external.length} outside publication${o.external.length === 1 ? "" : "s"}` : `${o.evidence.length} reader question${o.evidence.length === 1 ? "" : "s"}`}<small>{o.external?.map(p => p.publication).join(" · ") ?? (o.readers ? `${o.readers} identified reader${o.readers === 1 ? "" : "s"}` : "Reader identity unknown")}</small></td><td>{o.novelty ?? 100 - o.coverage}%</td><td><button className="icon-button" title={entries.some(e => e.id === o.id) ? "Saved to calendar" : "Save to calendar"} aria-label={`Save ${o.title}`} disabled={!loaded || entries.some(e => e.id === o.id)} onClick={() => save(o)}>{entries.some(e => e.id === o.id) ? <Check size={17} /> : <Bookmark size={17} />}</button></td></tr>)}</tbody></table></div>
      {!visible.length && <div className={styles.empty}><Lightbulb size={26} /><h3>{query ? "No matching opportunities" : busy ? "Researching new connections" : scan ? "No sufficiently supported new angles" : "Ready to explore beyond your archive"}</h3></div>}
    </> : <div className={styles.calendar}>{entries.slice().sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.title.localeCompare(b.title)).map(e => <div key={e.id} className={styles.calendarRow}><button className={styles.ideaTitle} onClick={() => open(e.id)}>{e.title}</button><input aria-label={`Publication date for ${e.title}`} type="date" value={e.date} onChange={event => setEntries(old => old.map(item => item.id === e.id ? { ...item, date: event.target.value, status: item.status === "Idea" && event.target.value ? "Planned" : item.status } : item))} /><select aria-label={`Status for ${e.title}`} value={e.status} onChange={event => setEntries(old => old.map(item => item.id === e.id ? { ...item, status: event.target.value as EditorialEntry["status"] } : item))}>{["Idea", "Planned", "Drafting", "Published"].map(s => <option key={s}>{s}</option>)}</select><button className="icon-button" title="Remove from calendar" aria-label={`Remove ${e.title}`} onClick={() => { setEntries(old => old.filter(item => item.id !== e.id)); setRemoved(e); if (selected === e.id) setSelected(null); }}><Trash2 size={16} /></button></div>)}{!entries.length && <div className={styles.empty}><CalendarDays size={26} /><h3>No scheduled ideas</h3></div>}</div>}
    {current && <section ref={detail} className={styles.detail} aria-label="Opportunity brief">
      <EditorialBrief entry={current} opportunity={active} saved={!!saved} copied={copied}
        onClose={() => setSelected(null)} onSave={() => { if (active) save(active); }}
        onCopy={() => { void navigator.clipboard.writeText(current.brief).then(() => setCopied(true)).catch(() => setError("Clipboard access is unavailable.")); }} />
    </section>}
    <p className={styles.footer}>{ranking.method} · Source-specific case studies and editorial hypotheses, not claims made by source writers. Alignment and newness are relative to the sampled public text and metadata; paywalled text is not accessed. This is a bounded cross-Substack sample, not an exhaustive search. Calendar and briefs stay in this browser.</p>
  </section>;
}
