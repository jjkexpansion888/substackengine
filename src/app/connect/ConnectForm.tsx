"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDown, ArrowLeft, ArrowUpRight, Check, Download, Globe, RefreshCw, Search, Users, FileText, MessageCircle, Handshake, Radar, Lightbulb, LoaderCircle } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import type { PublicRadar } from "@/lib/substack/publicRadar";
import { ConnectFormView, type ConnectPhase } from "./ConnectFormView";
import { SubscribersPanel } from "@/components/radar/SubscribersPanel";
import { CollaborationFinder } from "@/components/collaboration/CollaborationFinder";
import { ContentOpportunities } from "@/components/opportunities/ContentOpportunities";
import { parseSubscriberImport, type SubscriberImport } from "@/lib/substack/subscriberRanking";
import { readSubscriberImport, saveSubscriberImport, removeSubscriberImport } from "@/lib/substack/browserImportStorage";
import type { PublicAudienceSnapshot } from "@/lib/substack/publicAudienceCache";
import type { SavedRadar } from "@/lib/substack/savedRadar";
import { mergeAudienceResults, pendingAudienceProfiles, type EnrichedAudience } from "@/lib/substack/audienceQueue";
import { radarFeatures } from "@/lib/radar/featureAccess";

function browserStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

function Avatar({ src, name, large = false }: { src: string | null; name: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className={large ? "avatar avatar-large" : "avatar"}>{src && !failed
    // Publication avatars come from Substack's public CDN.
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt="" onError={() => setFailed(true)} /> : name.slice(0, 2).toUpperCase()}</span>;
}

export function ConnectForm() {
  const [domain, setDomain] = useState("");
  const [phase, setPhase] = useState<ConnectPhase>({ kind: "idle" });
  const [radar, setRadar] = useState<PublicRadar | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Readers");
  const [sort, setSort] = useState("audience");
  const [tab, setTab] = useState("Subscribers");
  const [selectedFeature, setFeature] = useState("Radar");
  const [returningToSearch, setReturningToSearch] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | "error" | null>(null);
  const saves = useRef<Promise<void>>(Promise.resolve());
  const audienceAttempts = useRef(new Set<string>());
  const [audienceQueue, setAudienceQueue] = useState<"idle" | "running" | "paused" | "done">("idle");
  const importedList = useRef<{ domain: string; packet: SubscriberImport } | null>(null);
  const syncClaim = useRef<Promise<SubscriberImport> | null>(null);
  const busy = phase.kind === "connecting" || returningToSearch;
  const features = radarFeatures(radar?.subscriberCoverage.source);
  const feature = features.includes(selectedFeature) ? selectedFeature : "Radar";
  const selectFeature = (item: string) => {
    if (!features.includes(item)) return;
    setFeature(item);
    const params = new URLSearchParams(window.location.search);
    if (item === "Collaboration finder") params.set("feature", "collaborations");
    else if (item === "Content opportunities") params.set("feature", "opportunities");
    else params.delete("feature");
    window.history.replaceState(null, "", `/connect${params.size ? `?${params}` : ""}`);
  };

  const scan = useCallback(async (target: string, packet?: SubscriberImport) => {
    setPhase({ kind: "connecting" });
    audienceAttempts.current.clear();
    setAudienceQueue("idle");
    try {
      const subscriberImport = packet ?? (importedList.current?.domain === target ? importedList.current.packet : readSubscriberImport(target, browserStorage()));
      const response = await fetch("/api/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: target, subscriberImport }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not scan this publication.");
      setRadar(body.radar);
      setFeature("Radar");
      setDomain(body.radar.domain);
      setSearch("");
      if (subscriberImport) {
        importedList.current = { domain: body.radar.domain, packet: subscriberImport };
        saveSubscriberImport(body.radar.domain, subscriberImport, browserStorage());
        if (subscriberImport.version === 2) removeSubscriberImport(body.radar.domain, browserStorage());
      }
      setPhase({ kind: "idle" });
      const params = new URLSearchParams(window.location.search);
      params.delete("feature");
      params.set("domain", body.radar.domain);
      window.history.replaceState(null, "", `/connect?${params}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection failed. Please try again.";
      setPhase({ kind: "error", message });
      if (packet) throw new Error(message);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const syncToken = params.get("browserSync");
    if (syncToken) {
      setPhase({ kind: "connecting" });
      // Reuse the one-time claim promise across React Strict Mode effect replays.
      syncClaim.current ??= fetch(`/api/browser-connect?token=${encodeURIComponent(syncToken)}`, { cache: "no-store" }).then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not receive browser sync.");
        return parseSubscriberImport(body.packet);
      });
      let active = true;
      void syncClaim.current.then(async packet => {
        if (!active) return;
        const target = new URL(packet.sourceUrl).hostname;
        importedList.current = { domain: target, packet };
        setDomain(target);
        window.history.replaceState(null, "", `/connect?domain=${encodeURIComponent(target)}`);
        await scan(target, packet);
      }).catch(error => { if (active) setPhase({ kind: "error", message: error instanceof Error ? error.message : "Browser sync failed." }); });
      return () => { active = false; };
    }
    const target = params.get("domain");
    if (target) {
      setDomain(target);
      let active = true;
      void fetch(`/api/saved-radar?domain=${encodeURIComponent(target)}`, { cache: "no-store" }).then(async response => {
        if (!response.ok) throw new Error("No saved scan available.");
        return (await response.json()).snapshot as SavedRadar | null;
      }).then(snapshot => {
        if (!active) return;
        if (!snapshot) { void scan(target); return; }
        importedList.current = snapshot.subscriberImport ? { domain: snapshot.radar.domain, packet: snapshot.subscriberImport } : null;
        setRadar(snapshot.radar);
        setFeature("Radar");
        setDomain(snapshot.radar.domain);
        setSaveStatus("saved");
        window.history.replaceState(null, "", `/connect?domain=${encodeURIComponent(snapshot.radar.domain)}`);
      }).catch(() => { if (active) void scan(target); });
      return () => { active = false; };
    }
  }, [scan]);

  useEffect(() => {
    if (!radar || busy || audienceQueue === "paused") return;
    const batch = pendingAudienceProfiles(radar.people, audienceAttempts.current).slice(0, 20);
    if (!batch.length) { if (audienceQueue !== "done") setAudienceQueue("done"); return; }
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setAudienceQueue("running");
      void fetch("/api/subscribers/enrich", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identities: batch.map(p => ({ id: /^\d{1,30}$/.test(p.id) ? p.id : undefined, handle: p.handle })) }) }).then(async response => {
        const body = await response.json() as { profiles: EnrichedAudience[]; stopped: boolean };
        if (!response.ok) throw new Error("Count lookup failed.");
        if (!active) return;
        // Move past individual failed profiles instead of retrying the first batch forever.
        for (const profile of batch) {
          const result = body.profiles.find(p => p.id === profile.id || p.handle && p.handle === profile.handle);
          if (result && result.attempted !== false) audienceAttempts.current.add(profile.id);
        }
        if (body.stopped) setAudienceQueue("paused");
        setRadar(current => {
          if (!current || current.domain !== radar.domain) return current;
          const updated = mergeAudienceResults(current.people, body.profiles);
          return { ...current, people: updated, subscriberCoverage: { ...current.subscriberCoverage, enriched: updated.filter(p => p.role === "Reader" && p.membership === "Subscriber" && p.handle && p.audienceStatus !== "unavailable").length } };
        });
      }).catch(() => { if (active) setAudienceQueue("paused"); });
    }, 800);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
    // Queue state alone must not cancel an in-flight batch when it becomes "running".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radar, busy]);

  useEffect(() => {
    if (!radar || busy) return;
    const snapshot = { version: 1, radar, subscriberImport: importedList.current?.domain === radar.domain ? importedList.current.packet : undefined };
    setSaveStatus("saving");
    const timer = window.setTimeout(() => {
      // Serialize writes so an earlier scan cannot overwrite newer recovered counts.
      saves.current = saves.current.catch(() => {}).then(async () => {
        try {
          const response = await fetch("/api/saved-radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot) });
          if (!response.ok) throw new Error("Local save failed.");
          setSaveStatus("saved");
        } catch { setSaveStatus("error"); }
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [radar, busy]);

  const people = useMemo(() => {
    const query = search.toLowerCase();
    return (radar?.people ?? []).filter(p => (filter === "All people" || (filter === "Readers" ? p.role === "Reader" : p.membership === "Subscriber" && p.role === "Reader")) && `${p.name} ${p.handle ?? ""} ${p.publicationName ?? ""}`.toLowerCase().includes(query))
      .sort((a, b) => sort === "comments" ? b.comments - a.comments : sort === "name" ? a.name.localeCompare(b.name) : (b.audience ?? -1) - (a.audience ?? -1));
  }, [radar, search, filter, sort]);

  useEffect(() => {
    if (!radar) return;
    let active = true;
    const sharePublicCounts = async () => {
      try {
        const response = await fetch("/api/browser-connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "audience-cache",
          identities: radar.people.map(p => ({ id: /^\d{1,30}$/.test(p.id) ? p.id : undefined, handle: p.handle })),
          profiles: radar.people.filter(p => p.handle && p.audience !== null).map(p => ({ id: /^\d{1,30}$/.test(p.id) ? p.id : undefined, handle: p.handle, publicAudience: { count: p.audience, label: p.audienceLabel, bestseller: p.bestseller } })),
        }) });
        if (!response.ok) return;
        const body = await response.json() as { profiles: PublicAudienceSnapshot[] };
        if (!active) return;
        setRadar(current => {
          if (!current || current.domain !== radar.domain) return current;
          const byId = new Map(body.profiles.filter(p => p.id).map(p => [p.id, p]));
          const byHandle = new Map(body.profiles.map(p => [p.handle, p]));
          let changed = false;
          const updated = current.people.map(person => {
            const cached = byId.get(person.id) ?? (person.handle ? byHandle.get(person.handle.toLowerCase()) : undefined);
            if (cached?.id && /^\d{1,30}$/.test(person.id) && cached.id !== person.id) return person;
            if (!cached || person.audience !== null || cached.publicAudience.count === null) return person;
            changed = true;
            return { ...person, handle: cached.handle, profileUrl: `https://substack.com/@${cached.handle}`, audience: cached.publicAudience.count, audienceLabel: cached.publicAudience.label, bestseller: person.bestseller || cached.publicAudience.bestseller, audienceStatus: "public" as const };
          });
          return changed ? { ...current, people: updated, subscriberCoverage: { ...current.subscriberCoverage, enriched: updated.filter(p => p.role === "Reader" && p.membership === "Subscriber" && p.handle && p.audienceStatus !== "unavailable").length } } : current;
        });
      } catch { /* Keep the current ranking if the local cache is temporarily unavailable. */ }
    };
    void sharePublicCounts();
    const timer = window.setInterval(() => void sharePublicCounts(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [radar]);

  const exportCsv = () => {
    const cell = (v: unknown) => '"' + String(v ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
    const rows = [["Name", "Handle", "Role", "Membership signal", "Public audience", "Audience label", "Comments", "Profile"], ...people.map(p => [p.name, p.handle, p.role, p.membership, p.audience, p.audienceLabel, p.comments, p.profileUrl])];
    const url = URL.createObjectURL(new Blob([rows.map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = `${radar?.domain ?? "radar"}-public-people.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const removeImportedList = async () => {
    if (!radar) return;
    setPhase({ kind: "connecting" });
    try {
      await saves.current;
      const response = await fetch(`/api/saved-radar?domain=${encodeURIComponent(radar.domain)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove the saved list.");
      removeSubscriberImport(radar.domain, browserStorage());
      importedList.current = null;
      await scan(radar.domain);
    } catch (error) { setPhase({ kind: "error", message: error instanceof Error ? error.message : "Could not remove the saved list." }); }
  };

  const backToSearch = async () => {
    if (!radar || busy) return;
    setReturningToSearch(true);
    try {
      await saves.current;
      const response = await fetch("/api/saved-radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 1, radar, subscriberImport: importedList.current?.domain === radar.domain ? importedList.current.packet : undefined }) });
      if (!response.ok) throw new Error("Could not save these results before returning to search.");
      setRadar(null);
      setDomain("");
      setSearch("");
      setTab("Subscribers");
      setFilter("Readers");
      setSort("audience");
      setFeature("Radar");
      setPhase({ kind: "idle" });
      setSaveStatus(null);
      importedList.current = null;
      audienceAttempts.current.clear();
      setAudienceQueue("idle");
      window.history.replaceState(null, "", "/connect");
    } catch (error) {
      setPhase({ kind: "error", message: error instanceof Error ? error.message : "Could not return to search." });
    } finally { setReturningToSearch(false); }
  };

  return <div className="app-shell">
    <header className="app-nav"><div className="app-header-main"><a className="brand" href="/connect"><BrandLogo size={40} priority />Substack Engine</a>{features.length > 1 && <nav className="header-feature-nav" aria-label="Header features">{features.map(item => <button key={item} aria-current={feature === item ? "page" : undefined} onClick={() => selectFeature(item)}>{item}</button>)}</nav>}</div><div className="local-status"><span />{radar?.subscriberCoverage.source === "owner_session" ? "Owner connected" : "Public data"}</div></header>
    <main className="workspace">
      <div className="workspace-label"><Activity size={15} /> PUBLICATION INTELLIGENCE</div>
      {features.length > 1 && <nav className="feature-nav" aria-label="Engine features">{features.map(item => <button key={item} aria-current={feature === item ? "page" : undefined} onClick={() => selectFeature(item)}>{item === "Radar" ? <Radar size={18} /> : item === "Collaboration finder" ? <Handshake size={18} /> : <Lightbulb size={18} />}{item}</button>)}</nav>}
      {!radar ? <>
        <section className="start-heading"><h1>{feature === "Radar" ? "Influencer radar" : feature === "Collaboration finder" ? "Collaboration finder" : "Content opportunities"}</h1><p>{feature === "Radar" ? "A closer look at the people around your publication." : feature === "Collaboration finder" ? "Find writers who share your readers' interests." : "Find the questions your next article could answer."}</p></section>
        <section className="connection-panel"><div className="section-heading"><span className="section-icon"><Globe size={21} /></span><div><h2>Open a publication</h2><span className="muted">Publication domain or Substack profile URL</span></div><span className="public-tag"><Check size={13} />Public access</span></div>
          <ConnectFormView domain={domain} phase={phase} onDomainChange={setDomain} onSubmit={() => void scan(domain)} />
        </section>
        <section className="coverage-section"><h2>Public activity, in focus</h2><div className="coverage-grid"><div><Users size={20} /><h3>People</h3><p>Readers and contributors visible in recent public discussions.</p></div><div><Activity size={20} /><h3>Audience signals</h3><p>Public audience sizes, publisher profiles, and bestseller badges.</p></div><div><FileText size={20} /><h3>Recent posts</h3><p>Publication activity and the conversations around it.</p></div></div></section>
        <p className="coverage-note">Coverage is limited to public activity. The complete subscriber list and email addresses require owner access.</p>
      </> : <>
        <section className="publication-heading"><div className="publication-identity"><Avatar key={radar.domain} src={radar.logoUrl} name={radar.name} large /><div><h1>{radar.name}</h1><a href={`https://${radar.domain}`} target="_blank" rel="noreferrer">{radar.domain}<ArrowUpRight size={13} /></a></div></div><div className="heading-actions"><button className="secondary-button" onClick={() => void backToSearch()} disabled={busy}><ArrowLeft size={16} />Back to search</button><button className="secondary-button" onClick={() => void scan(radar.domain)} disabled={busy}><RefreshCw size={16} className={phase.kind === "connecting" ? "spin" : ""} />{phase.kind === "connecting" ? "Scanning…" : "Refresh"}</button></div></section>
        {radar.description && <p className="publication-description">{radar.description}</p>}
        {phase.kind === "error" && <p role="alert" className="error-message">{phase.message}</p>}
        {saveStatus === "error" && <p role="alert" className="error-message">Could not save your results locally. Keep this page open and try Refresh.</p>}
        {audienceQueue === "running" && <p role="status" className="form-feedback"><LoaderCircle size={15} className="spin" /> Looking up remaining subscriber counts...</p>}
        {audienceQueue === "paused" && <div className="form-feedback" role="status">Count lookups paused. Substack may require browser access or a cooldown. <button className="secondary-button" onClick={() => { if (!pendingAudienceProfiles(radar.people, audienceAttempts.current).length) audienceAttempts.current.clear(); setAudienceQueue("idle"); setRadar(current => current ? { ...current } : current); }}><RefreshCw size={15} />Retry counts</button></div>}
        {phase.kind === "connecting" && <p role="status" className="form-feedback">Refreshing public activity. Your previous results remain available.</p>}
        {returningToSearch && <p role="status" className="form-feedback">Saving results...</p>}
        {feature === "Collaboration finder" && <CollaborationFinder key={radar.domain} radar={radar} />}
        {feature === "Content opportunities" && <ContentOpportunities key={radar.domain} radar={radar} />}
        {feature === "Radar" && <>
        <section className="metrics"><div><span>Reported subscribers</span><strong>{radar.subscriberCoverage.totalLabel ?? radar.subscriberCoverage.totalCount?.toLocaleString() ?? "Unknown"}</strong><small>Creator profile total</small></div><div><span>Profiles in ranking</span><strong>{radar.subscriberCoverage.discovered.toLocaleString()}</strong><small>{radar.subscriberCoverage.enriched} audience lookups completed</small></div><div><span>Posts scanned</span><strong>{radar.postsScanned}</strong><small>Most recent archive entries</small></div><div><span>Last scan</span><strong className="time-metric">{new Date(radar.scannedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong><small>{new Date(radar.scannedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</small></div></section>
        <div className="view-tabs" role="tablist" aria-label="Radar views">{["Subscribers", "People", "Recent posts"].map(view => <button key={view} role="tab" aria-selected={tab === view} onClick={() => setTab(view)}>{view === "Recent posts" ? <FileText size={16} /> : <Users size={16} />}{view}<span>{view === "Subscribers" ? radar.subscriberCoverage.discovered : view === "People" ? radar.people.length : radar.posts.length}</span></button>)}</div>
        {tab === "Subscribers" ? <SubscribersPanel key={radar.domain} radar={radar} busy={busy} onImport={packet => scan(radar.domain, packet)} onRemoveImport={() => void removeImportedList()} onUpdate={updatedPeople => setRadar(current => current ? { ...current, people: updatedPeople, subscriberCoverage: { ...current.subscriberCoverage, enriched: updatedPeople.filter(p => p.role === "Reader" && p.membership === "Subscriber" && p.handle && p.audienceStatus !== "unavailable").length } } : current)} /> : tab === "People" ? <section>
          <div className="table-toolbar"><div className="search-field"><Search size={17} /><input aria-label="Search people" placeholder="Search people or publications…" value={search} onChange={e => setSearch(e.target.value)} /></div><select aria-label="Filter people" value={filter} onChange={e => setFilter(e.target.value)}>{["Readers", "Public subscribers", "All people"].map(v => <option key={v}>{v}</option>)}</select><select aria-label="Sort people" value={sort} onChange={e => setSort(e.target.value)}><option value="audience">Audience: high to low</option><option value="comments">Most active</option><option value="name">Name: A to Z</option></select><button className="icon-button" title="Export filtered people as CSV" aria-label="Export CSV" onClick={exportCsv} disabled={!people.length}><Download size={17} /></button></div>
          <div className="table-scroll"><table className="people-table"><thead><tr><th>#</th><th>Person</th><th>Public audience <ArrowDown size={12} /></th><th>Activity</th><th>Relationship</th><th><span className="sr-only">Profile</span></th></tr></thead><tbody>{people.map((p, i) => <tr key={p.id}><td className="rank-cell">{i + 1}</td><td><div className="person-cell"><Avatar src={p.photoUrl} name={p.name} /><div><a href={p.profileUrl ?? undefined} target="_blank" rel="noreferrer">{p.name}</a><small>{p.publicationName ?? (p.handle ? `@${p.handle}` : "Public profile")}</small></div></div></td><td><span className="audience-value">{p.audienceLabel ?? (p.audience === null ? p.audienceStatus === "not_public" ? "Not public" : "Unavailable" : p.audience.toLocaleString())}</span>{p.bestseller && <span className="bestseller">Bestseller</span>}</td><td><span className="activity-cell"><MessageCircle size={14} />{p.comments}</span></td><td><span className={p.role === "Author" ? "relationship author" : p.membership === "Subscriber" ? "relationship subscriber" : "relationship"}>{p.role === "Author" ? "Contributor" : p.membership}</span></td><td>{p.profileUrl && <a className="profile-link" href={p.profileUrl} target="_blank" rel="noreferrer" aria-label={`Open ${p.name}'s profile`}><ArrowUpRight size={17} /></a>}</td></tr>)}</tbody></table></div>
          {!people.length && <div className="empty-results"><Users size={28} /><h3>{search ? "No matching people" : "No public readers found"}</h3><p>{search ? "Try a different name or publication." : "Try All people to see contributors. Private or closed discussions may have no visible readers."}</p></div>}
          <div className="table-footer"><span>{people.length} people shown</span><span>Audience counts may be rounded by Substack.</span></div>
        </section> : <section className="posts-list">{radar.posts.map(post => <a key={post.id} href={post.url ?? undefined} target="_blank" rel="noreferrer" className="post-row">{post.image &&
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.image} alt="" />}<div><small>{post.date ? new Date(post.date).toLocaleDateString([], { month: "short", day: "numeric" }) : "Date unavailable"}</small><h3>{post.title}</h3><span>{post.reactions} reactions · {post.comments} comments</span></div><ArrowUpRight size={18} /></a>)}{!radar.posts.length && <p className="empty-results">No public archive posts found.</p>}</section>}
        <aside className="data-note"><Globe size={17} /><div><strong>{radar.subscriberCoverage.source === "owner_session" ? "Owner session coverage" : "Public coverage"}</strong><p>{radar.subscriberCoverage.source === "owner_session" ? "Subscriber membership comes from your signed-in owner snapshot. Audience rankings still use public profile data; unavailable audience sizes remain unknown." : `Discussions are sampled from ${radar.postsScanned} recent posts and up to 50 top-level comments per post, plus visible replies. Subscriber evidence comes from public lists or comment metadata; this is not the complete subscriber list.`}</p>{radar.warnings.map(w => <p key={w} className="warning">{w}</p>)}</div></aside>
        </>}
      </>}
      <footer className="app-footer"><span>SUBSTACK ENGINE</span><span role="status">{radar && saveStatus === "saved" ? "Saved locally" : radar && saveStatus === "saving" ? "Saving..." : "Independent publication research"}</span></footer>
    </main>
  </div>;
}
