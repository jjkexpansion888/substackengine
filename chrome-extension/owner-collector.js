(async () => {
  const page = new URL(window.location.href);
  if (page.protocol !== "https:" || page.port || !/^[a-z0-9-]+\.substack\.com$/i.test(page.hostname) || !/^\/publish\/subscribers(?:\/|$)/.test(page.pathname)) throw new Error("Open your publication's Subscribers dashboard on its substack.com domain in Chrome first.");
  const subscribers = new Map();
  const seenPages = new Set();
  let rowsRead = 0;
  let totalCount = null;
  const deadline = Date.now() + 120000;
  while (rowsRead < 10000 && Date.now() < deadline) {
    // Chrome attaches the active publication's session; cookie values never leave the browser.
    const response = await fetch(`${page.origin}/api/v1/subscriber-stats`, {
      method: "POST", credentials: "same-origin", redirect: "error",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ limit: 50, offset: rowsRead }), signal: AbortSignal.timeout(15000),
    });
    if (response.status === 401 || response.status === 403) throw new Error("Sign in as this publication's owner in Chrome, then try again. Browser verification must be completed normally.");
    if (response.status === 429) throw new Error("Substack rate limited the export. No further requests were sent; try later.");
    if (!response.ok) throw new Error(`Substack could not read the owner list (${response.status}).`);
    const body = await response.json();
    if (!Array.isArray(body.subscribers) || !Number.isSafeInteger(body.count) || body.count < 0) throw new Error("Substack's owner-list format changed. No data was exported.");
    totalCount = body.count;
    if (!body.subscribers.length) break;
    const fingerprint = JSON.stringify(body.subscribers.map(row => row?.user_id));
    if (seenPages.has(fingerprint)) throw new Error("Substack repeated a subscriber page. Export stopped to avoid an incomplete list.");
    seenPages.add(fingerprint);
    for (const row of body.subscribers) {
      if (!row || typeof row !== "object") continue;
      const id = String(row.user_id ?? "");
      if (!/^\d{1,30}$/.test(id)) continue;
      let handle = [row.user_handle, row.handle, row.user_slug, row.user?.handle].find(value => typeof value === "string" && /^[a-z0-9_-]{1,100}$/i.test(value)) ?? null;
      if (!handle && typeof row.user_profile_url === "string") {
        try { const url = new URL(row.user_profile_url); if (url.origin === "https://substack.com") handle = /^\/@([a-z0-9_-]+)\/?$/i.exec(url.pathname)?.[1] ?? null; } catch { /* No public profile URL. */ }
      }
      // Never infer handles from names or use email addresses to identify public profiles.
      const name = typeof row.user_name === "string" && row.user_name.trim() && !row.user_name.includes("@") ? row.user_name.trim().slice(0, 300) : `Subscriber ${id}`;
      subscribers.set(id, { id, handle: handle?.toLowerCase() ?? null, name });
    }
    rowsRead += body.subscribers.length;
    if (rowsRead >= totalCount) break;
  }
  if (!subscribers.size) throw new Error("No subscriber profiles were returned for this owner session.");
  return {
    version: 2, sourceUrl: `${page.origin}/publish/subscribers`, capturedAt: new Date().toISOString(),
    totalCount, rowsRead, subscribers: [...subscribers.values()],
  };
})();
