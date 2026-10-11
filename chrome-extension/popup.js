/* global chrome, enrichOwnerProfiles */
const button = document.getElementById("export");
const ownerButton = document.getElementById("owner");
const status = document.getElementById("status");

async function exportSubscribers(owner, sourceTabId) {
  button.disabled = true;
  ownerButton.disabled = true;
  status.textContent = owner ? "Reading your signed-in subscriber list..." : "Reading loaded subscriber rows...";
  status.dataset.error = "false";
  try {
    if (owner && !await (sourceTabId ? chrome.permissions.contains({ origins: ["http://localhost:3000/*", "https://substack.com/*"] }) : chrome.permissions.request({ origins: ["http://localhost:3000/*", "https://substack.com/*"] }))) throw new Error("Allow access to the local app and public Substack profiles to sync subscribers. No Substack cookie values are shared.");
    const tab = sourceTabId ? await chrome.tabs.get(sourceTabId) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab?.id || !tab.url) throw new Error("Open the appropriate Substack subscriber page first.");
    const page = new URL(tab.url);
    if (owner ? page.protocol !== "https:" || !/^[a-z0-9-]+\.substack\.com$/i.test(page.hostname) || !/^\/publish\/subscribers(?:\/|$)/.test(page.pathname) : !/^https:\/\/substack\.com\/@[a-z0-9_-]+\/subscribers\/?(?:[?#].*)?$/i.test(tab.url)) throw new Error(owner ? "Open your publication's Subscribers dashboard on its substack.com domain first." : "Open a public Substack Subscribers page first.");
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [owner ? "owner-collector.js" : "collector.js"] });
    const packet = result?.result;
    if (!packet?.subscribers?.length) throw new Error("No loaded subscribers found. Check the Subscribers tab and try again.");
    if (owner) {
      await enrichOwnerProfiles(packet, message => { status.textContent = message; });
      status.textContent = "Sending subscriber profiles to your local app...";
      let response;
      try { response = await fetch("http://localhost:3000/api/browser-connect", { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json", "X-Substack-Connector": chrome.runtime.id }, body: JSON.stringify(packet), signal: AbortSignal.timeout(10000) }); }
      catch { throw new Error("The local app is unavailable. Start Substack Engine on localhost:3000, then sync again."); }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The local app could not receive the sync.");
      const target = new URL(body.url);
      if (target.origin !== "http://localhost:3000" || target.pathname !== "/connect" || !/^[a-f0-9]{64}$/.test(target.searchParams.get("browserSync") ?? "")) throw new Error("The local app returned an invalid sync link.");
      await chrome.tabs.create({ url: target.href });
      status.textContent = `Synced ${packet.subscribers.length} profiles from ${packet.rowsRead} of ${packet.totalCount} rows. Opened the local app.`;
      return;
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    const source = new URL(packet.sourceUrl);
    const name = owner ? source.hostname : source.pathname.split("/")[1].slice(1);
    a.href = url; a.download = `${name}-${owner ? "owner" : "public"}-subscribers.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = `Exported ${packet.subscribers.length} profiles${owner ? ` from ${packet.rowsRead} of ${packet.totalCount} rows` : ""}. Import the JSON into the matching publication in Substack Engine.`;
  } catch (error) {
    status.dataset.error = "true";
    status.textContent = error.message ?? "Could not export subscribers.";
  } finally { button.disabled = false; ownerButton.disabled = false; }
}
button.addEventListener("click", () => void exportSubscribers(false));
async function beginOwnerSync() {
  ownerButton.disabled = true;
  try {
    if (!await chrome.permissions.request({ origins: ["http://localhost:3000/*", "https://substack.com/*"] })) throw new Error("Allow local app and public profile access to sync.");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/[a-z0-9-]+\.substack\.com\/publish\/subscribers(?:[/?#]|$)/i.test(tab.url ?? "")) throw new Error("Open your publication's Subscribers dashboard first.");
    await chrome.tabs.create({ url: `${chrome.runtime.getURL("sync.html")}?tab=${tab.id}` });
  } catch (error) {
    status.dataset.error = "true";
    status.textContent = error.message ?? "Could not start sync.";
  } finally { ownerButton.disabled = false; }
}
ownerButton.addEventListener("click", () => void beginOwnerSync());
