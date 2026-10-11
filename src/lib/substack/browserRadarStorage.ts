import { parseSavedRadar, type SavedRadar } from "./savedRadarSchema";

const key = (domain: string) => `substack-radar:v1:${domain}`;
type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;

async function serverStorageAvailable(request: typeof fetch): Promise<boolean> {
  try {
    const response = await request("/api/workspace", { cache: "no-store" });
    return response.ok && (await response.json()).storage === "server";
  } catch { return false; }
}

export function readBrowserRadar(domain: string, storage?: StorageAccess): SavedRadar | null {
  try {
    const raw = storage?.getItem(key(domain));
    if (!raw || raw.length > 8 * 1024 * 1024) return null;
    const snapshot = parseSavedRadar(JSON.parse(raw));
    return snapshot.radar.domain === domain ? snapshot : null;
  } catch { return null; }
}

export async function loadWorkspaceRadar(domain: string, storage?: StorageAccess, request = fetch): Promise<SavedRadar | null> {
  try {
    if (!await serverStorageAvailable(request)) return readBrowserRadar(domain, storage);
    const response = await request(`/api/saved-radar?domain=${encodeURIComponent(domain)}`, { cache: "no-store" });
    if (response.ok) {
      const value = (await response.json()).snapshot;
      if (value) {
        const snapshot = parseSavedRadar(value);
        if (snapshot.radar.domain === domain) return snapshot;
      }
    }
  } catch { /* A browser workspace remains readable when server storage is unavailable. */ }
  return readBrowserRadar(domain, storage);
}

export async function saveWorkspaceRadar(value: unknown, storage?: StorageAccess, request = fetch): Promise<void> {
  const snapshot = parseSavedRadar(value);
  let stored = false;
  if (storage) {
    try { storage.setItem(key(snapshot.radar.domain), JSON.stringify(snapshot)); stored = true; } catch { /* Try trusted server storage if the browser is full. */ }
  }
  try {
    if (!await serverStorageAvailable(request)) {
      if (stored) return;
      throw new Error("Browser storage is unavailable.");
    }
    const response = await request("/api/saved-radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot) });
    if (response.ok) return;
  } catch { /* Browser persistence does not require a running storage server. */ }
  if (!stored) throw new Error("Could not save this workspace. Browser storage may be unavailable or full.");
}

export async function removeWorkspaceRadar(domain: string, storage?: StorageAccess, request = fetch): Promise<void> {
  if (await serverStorageAvailable(request)) {
    const response = await request(`/api/saved-radar?domain=${encodeURIComponent(domain)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Could not remove the saved list.");
  }
  storage?.removeItem(key(domain));
}
