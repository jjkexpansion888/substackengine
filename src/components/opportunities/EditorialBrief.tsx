import { ArrowUpRight, Bookmark, Check, Copy, GitBranch, Library, X } from "lucide-react";
import type { ContentOpportunity, EditorialEntry } from "@/lib/opportunities/types";
import styles from "./EditorialBrief.module.css";

const headings = new Set(["Research hypothesis", "Reader need", "Why it fits your writing", "Across Substack", "Original angle", "Research plan", "Outline", "Research checks", "Discussion evidence", "Coverage limit"]);
export function briefSections(brief: string) {
  const sections: { heading: string; lines: string[] }[] = [];
  for (const line of brief.replace(/\r\n?/g, "\n").split("\n")) {
    if (headings.has(line.trim())) sections.push({ heading: line.trim(), lines: [] });
    else {
      if (!sections.length) sections.push({ heading: "Editorial notes", lines: [] });
      sections[sections.length - 1].lines.push(line);
    }
  }
  return sections.map(s => ({ ...s, lines: s.lines.filter(l => l.trim()) })).filter(s => s.lines.length);
}

function TextLines({ lines }: { lines: string[] }) {
  return <>{lines.map((line, i) => {
    if (/^https:\/\/\S+$/.test(line.trim())) return <p key={i}><a href={line.trim()} target="_blank" rel="noreferrer">Read source <ArrowUpRight size={14} /></a></p>;
    return <p key={i}>{line}</p>;
  })}</>;
}

export function EditorialBrief({ entry, opportunity, saved, copied, onCopy, onSave, onClose }: {
  entry: EditorialEntry; opportunity?: ContentOpportunity; saved: boolean; copied: boolean;
  onCopy: () => void; onSave: () => void; onClose: () => void;
}) {
  const sections = briefSections(entry.brief);
  const generated = opportunity?.brief === entry.brief;
  const lead = sections.find(s => ["Research hypothesis", "Reader need"].includes(s.heading));
  const body = sections.filter(s => s !== lead && !(generated && ["Editorial notes", "Why it fits your writing", "Across Substack", "Discussion evidence"].includes(s.heading)));
  const signals = opportunity ? [
    { label: "Alignment", value: opportunity.fit, tone: styles.green },
    { label: "Newness", value: opportunity.novelty ?? 100 - opportunity.coverage, tone: styles.blue },
    { label: "Priority", value: opportunity.score, tone: styles.rose },
  ].filter(s => s.value !== undefined) : [];
  return <article className={styles.root}>
    <header className={styles.topline}><span>Editorial brief <span className={styles.separator}>/</span> {opportunity?.kind ?? "Saved idea"}</span><div className={styles.actions}>
      <button className="icon-button" title={copied ? "Copied" : "Copy brief"} aria-label="Copy opportunity brief" onClick={onCopy}>{copied ? <Check size={17} /> : <Copy size={17} />}</button>
      <button className="icon-button" title={saved ? "Saved to calendar" : "Save to calendar"} aria-label={saved ? "Saved to calendar" : "Save opportunity to calendar"} disabled={saved} onClick={onSave}>{saved ? <Check size={17} /> : <Bookmark size={17} />}</button>
      <button className="icon-button" title="Close brief" aria-label="Close opportunity brief" onClick={onClose}><X size={18} /></button>
    </div></header>
    <h3 className={styles.title}>{entry.title}</h3>
    {saved && <p className={styles.saved}>{entry.status}{entry.date ? ` · ${entry.date}` : " · Saved to calendar"}</p>}
    {lead && <div className={styles.hypothesis}><span className={styles.eyebrow}>{lead.heading}</span><TextLines lines={lead.lines} /></div>}
    {!!signals.length && <div className={styles.signals} aria-label="Opportunity signals">{signals.map(s => <div key={s.label} className={s.tone}><div><span>{s.label}</span><strong>{s.value}<small>/100</small></strong></div><meter min={0} max={100} value={s.value} aria-label={s.label} /></div>)}</div>}
    <div className={styles.columns}><div className={styles.narrative}>
      {opportunity?.rationale && <section><h4>Why this fits your writing</h4><p>{opportunity.rationale}</p>{!!opportunity.terms.length && <ul className={styles.terms} aria-label="New dimensions">{opportunity.terms.map(t => <li key={t}>{t}</li>)}</ul>}</section>}
      {body.map((s, i) => <section key={i} className={s.heading === "Coverage limit" ? styles.limit : undefined}><h4>{s.heading === "Original angle" ? "The distinct contribution" : s.heading}</h4>{["Research plan", "Outline"].includes(s.heading) && s.lines.every(l => /^\d+\.\s/.test(l)) ? <ol className={styles.steps}>{s.lines.map((l, j) => <li key={j}>{l.replace(/^\d+\.\s*/, "")}</li>)}</ol> : <TextLines lines={s.lines} />}</section>)}
    </div>{opportunity && <aside className={styles.evidence}>
      {!!opportunity.external?.length && <section><h4><Library size={16} />Across Substack <span>{opportunity.external.length}</span></h4>{opportunity.external.map(p => <div className={styles.source} key={p.id}><small>{p.publication}</small><p>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title}<ArrowUpRight size={14} /></a> : p.title}</p>{p.subtitle && <p className={styles.subtitle}>{p.subtitle}</p>}<span className={styles.sourceType}>{p.text ? "Public article text" : "Title & subtitle only"}</span></div>)}</section>}
      {!!opportunity.related.length && <section><h4><GitBranch size={16} />Your writing</h4>{opportunity.related.map(p => <div className={styles.connection} key={p.id}><small>{p.date ? p.date.slice(0, 10) : "From your archive"}</small><p>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.subtitle || p.title}<ArrowUpRight size={14} /></a> : p.subtitle || p.title}</p></div>)}</section>}
      {!!opportunity.evidence.length && <section><h4>Reader evidence</h4>{opportunity.evidence.slice(0, 8).map(e => <blockquote key={e.id}><p>{e.text}</p>{e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.postTitle}<ArrowUpRight size={14} /></a> : <small>{e.postTitle}</small>}</blockquote>)}</section>}
    </aside>}</div>
    <span className="sr-only" role="status">{copied ? "Brief copied" : ""}</span>
  </article>;
}
