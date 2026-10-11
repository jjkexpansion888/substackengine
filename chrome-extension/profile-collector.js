/* global chrome */
/* Public pages only: never read or send browser cookie values. */
globalThis.enrichOwnerProfiles = async function enrichOwnerProfiles(packet, progress) {
  const deadline = Date.now() + 900000;
  let checked = 0;
  let counts = 0;
  const cache = async (identities, profiles = []) => {
    if (typeof chrome === "undefined") return [];
    try {
      const response = await fetch("http://localhost:3000/api/browser-connect", { method: "POST", credentials: "omit", signal: AbortSignal.timeout(10000), headers: { "Content-Type": "application/json", "X-Substack-Connector": chrome.runtime.id }, body: JSON.stringify({ action: "audience-cache", identities, profiles }) });
      return response.ok ? (await response.json()).profiles ?? [] : [];
    } catch { return []; }
  };
  const saved = new Map((await cache(packet.subscribers.map(row => ({ id: row.id })))).filter(row => row && typeof row.id === "string").map(row => [row.id, row]));
  let checkpoint = [];
  for (const row of packet.subscribers) {
    if (Date.now() >= deadline) break;
    if (!/^\d{1,30}$/.test(row.id)) continue;
    const previous = saved.get(row.id);
    if (previous && /^[a-z0-9_-]{1,100}$/i.test(previous.handle ?? "") && previous.publicAudience && (previous.publicAudience.count === null || Number.isSafeInteger(previous.publicAudience.count) && previous.publicAudience.count >= 0) && typeof previous.publicAudience.bestseller === "boolean" && (previous.publicAudience.label === null || typeof previous.publicAudience.label === "string" && previous.publicAudience.label.length <= 80 && /^[\d,.]+\s*[KM]?\+?(?:\s+subscribers?)?$/i.test(previous.publicAudience.label))) {
      row.handle = previous.handle.toLowerCase();
      row.publicAudience = { count: previous.publicAudience.count, label: previous.publicAudience.label, bestseller: previous.publicAudience.bestseller };
      checked++;
      if (row.publicAudience.count !== null) counts++;
      continue;
    }
    progress(`Checking public profiles: ${checked}/${packet.subscribers.length}; ${counts} counts found.`);
    try {
      const response = await fetch(`https://substack.com/profile/${row.id}`, { credentials: "omit", signal: AbortSignal.timeout(10000) });
      if ([401, 403, 429].includes(response.status)) break;
      if (!response.ok || new URL(response.url).origin !== "https://substack.com") continue;
      const html = await response.text();
      if (html.length > 5000000) continue;
      const match = /window\._preloads\s*=\s*JSON\.parse\(\s*("(?:\\.|[^"\\])*")\s*\)/.exec(html);
      if (!match) continue;
      const profile = JSON.parse(JSON.parse(match[1])).profile;
      if (!profile || String(profile.id) !== row.id || !/^[a-z0-9_-]{1,100}$/i.test(profile.handle ?? "")) continue;
      row.handle = profile.handle.toLowerCase();
      let count = profile.subscriberCountNumber;
      const label = typeof profile.subscriberCount === "string" ? profile.subscriberCount : profile.subscriberCountString;
      if (count === 0 && typeof label === "string") count = null;
      if (!Number.isSafeInteger(count) || count < 0) {
        const number = typeof label === "string" && /^([\d,]+(?:\.\d+)?)\s*([KM])?\+?(?:\s+subscribers?)?$/i.exec(label.trim());
        count = number ? Math.round(Number(number[1].replaceAll(",", "")) * (number[2]?.toUpperCase() === "M" ? 1000000 : number[2]?.toUpperCase() === "K" ? 1000 : 1)) : null;
      }
      row.publicAudience = { count: Number.isSafeInteger(count) && count >= 0 ? count : null, label: typeof label === "string" && label.length <= 80 && /^[\d,.]+\s*[KM]?\+?(?:\s+subscribers?)?$/i.test(label) ? label : null, bestseller: Number(profile.bestseller_tier) > 0 };
      checkpoint.push({ id: row.id, handle: row.handle, publicAudience: row.publicAudience });
      if (row.publicAudience.count !== null) counts++;
    } catch { /* Keep unresolved profiles, without treating them as zero. */ }
    finally {
      checked++;
      if (checkpoint.length >= 25) { await cache([], checkpoint); checkpoint = []; }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  if (checkpoint.length) await cache([], checkpoint);
  progress(`Public profiles checked: ${checked}/${packet.subscribers.length}; ${counts} counts found. Unfinished lookups resume on the next sync.`);
  return packet;
};
