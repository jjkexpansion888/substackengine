"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Search, Square } from "lucide-react";
import type { SubscriberImport } from "@/lib/substack/subscriberRanking";
import type { AccountSearchResult } from "@/lib/substack/accountCandidates";
import { applyLikelyMatches } from "@/lib/substack/automaticMatches";

export function SubscriberNameDiscovery({ packet, busy, onImport, onMatchingStateChange }: { packet: SubscriberImport; busy: boolean; onImport: (packet: SubscriberImport) => Promise<void>; onMatchingStateChange?: (running: boolean) => void }) {
  const key = `substack-engine:account-candidates:${new URL(packet.sourceUrl).hostname}`;
  const [results, setResults] = useState<Record<string, AccountSearchResult>>(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
      return Object.fromEntries(Object.entries(stored).filter(([, value]) => {
        if (!value || typeof value !== "object") return false;
        const result = value as AccountSearchResult;
        return typeof result.name === "string" && ["found", "no_matches", "unavailable", "unattempted"].includes(result.status) && Array.isArray(result.candidates) && result.candidates.every(candidate => candidate && /^\d{1,30}$/.test(candidate.id) && /^[a-z0-9_-]{1,100}$/i.test(candidate.handle) && typeof candidate.name === "string" && typeof candidate.score === "number" && Number.isFinite(candidate.score));
      })) as Record<string, AccountSearchResult>;
    } catch { return {}; }
  });
  const [running, setRunning] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  const cancelWait = useRef<(() => void) | null>(null);
  useEffect(() => () => { stop.current = true; cancelWait.current?.(); onMatchingStateChange?.(false); }, [onMatchingStateChange]);
  const unresolved = packet.subscribers.filter(row => row.id?.startsWith("csv:") && !row.handle && row.name.length >= 2 && row.name.length <= 150 && !/^Imported subscriber \d+$/.test(row.name));
  const pending = unresolved.filter(row => results[row.id!]?.name !== row.name || ["unavailable", "unattempted"].includes(results[row.id!]?.status));
  const ready = applyLikelyMatches(packet, results).subscribers.filter(row => row.nameMatch).length - packet.subscribers.filter(row => row.nameMatch).length;
  const discover = async () => {
    setRunning(true); onMatchingStateChange?.(true); setError(null); stop.current = false;
    const current = { ...results };
    let working = packet;
    const apply = async () => {
      const updated = applyLikelyMatches(working, current);
      if (updated.subscribers.some((row, i) => row.id !== working.subscribers[i].id)) {
        await onImport(updated);
        working = updated;
      }
    };
    try {
      await apply();
      const batch = [...pending];
      let cooldowns = 0;
      while (batch.length && !stop.current) {
        const rows = batch.splice(0, 5);
        const response = await fetch("/api/subscribers/find-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscribers: rows.map(row => ({ id: row.id, name: row.name })) }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Name search failed.");
        for (const result of data.results as AccountSearchResult[]) current[result.id] = result;
        setResults({ ...current });
        try { window.localStorage.setItem(key, JSON.stringify(current)); } catch { /* Matches remain available for this session. */ }
        await apply();
        if (data.results.some((result: AccountSearchResult) => result.status === "found" || result.status === "no_matches")) cooldowns = 0;
        if (data.stopped) {
          if (!data.retryAfterMs || cooldowns >= 3 || stop.current) { setError(data.reason); break; }
          batch.unshift(...rows.filter(row => ["unavailable", "unattempted"].includes(current[row.id!]?.status)));
          setCoolingDown(true);
          const delay = Math.min(300000, Math.max(1000, data.retryAfterMs) * 2 ** cooldowns++);
          await new Promise<void>(resolve => {
            const timer = window.setTimeout(() => { cancelWait.current = null; resolve(); }, delay);
            cancelWait.current = () => { window.clearTimeout(timer); cancelWait.current = null; resolve(); };
          });
          setCoolingDown(false);
        }
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Name search failed."); }
    finally { setRunning(false); setCoolingDown(false); onMatchingStateChange?.(false); }
  };
  if (!unresolved.length && !running) return null;
  return <section className="name-discovery" aria-label="Find subscriber accounts">
    <div className="name-discovery-heading"><div><h3>Automatic account matching</h3><p>{packet.subscribers.filter(row => row.nameMatch).length} inferred matches · {pending.length} awaiting search{ready > 0 ? ` · ${ready} cached matches ready` : ""}</p></div>
      {running ? <button className="secondary-button" onClick={() => { stop.current = true; cancelWait.current?.(); }}><Square size={14} />Stop after batch</button> : <button className="secondary-button" disabled={busy || (!pending.length && !ready)} onClick={() => void discover()}><Search size={15} />Match and rank automatically</button>}
    </div>
    {running && <p role="status"><LoaderCircle className="spin" size={14} /> {coolingDown ? "Search cooling down; resumes automatically…" : "Matching exact names across your roster…"}</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
  </section>;
}
