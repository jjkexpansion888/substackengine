(() => {
  const page = new URL(window.location.href);
  if (page.origin !== "https://substack.com" || !/^\/@[a-z0-9_-]+\/subscribers\/?$/i.test(page.pathname)) {
    throw new Error("Open a creator's public Subscribers page on substack.com first.");
  }
  const selected = document.querySelector('[role="tab"][aria-selected="true"]');
  if (!selected || !selected.textContent.trim().startsWith("Subscribers")) {
    throw new Error("Select the Subscribers tab before exporting.");
  }
  const subscribers = new Map();
  for (const anchor of document.querySelectorAll('a[aria-label^="View "][href*="/@"]')) {
    const profile = new URL(anchor.href, page.origin);
    const match = /^\/@([a-z0-9_-]+)\/?$/i.exec(profile.pathname);
    const label = anchor.getAttribute("aria-label") ?? "";
    const name = /^View (.+)'s profile$/.exec(label)?.[1];
    if (profile.origin !== page.origin || !match || !name) continue;
    const handle = match[1].toLowerCase();
    if (subscribers.size < 1000) subscribers.set(handle, { handle, name });
  }
  if (!subscribers.size) throw new Error("No subscriber rows have loaded. Let the page load, then try again.");
  return {
    version: 1,
    sourceUrl: `${page.origin}${page.pathname}`,
    capturedAt: new Date().toISOString(),
    subscribers: [...subscribers.values()],
  };
})();
