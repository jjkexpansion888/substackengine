import { describe, expect, it, vi } from "vitest";
import { discoverPublicRadar } from "./publicRadar";
import { loadWorkspaceRadar, readBrowserRadar, removeWorkspaceRadar, saveWorkspaceRadar } from "./browserRadarStorage";
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
describe("independent browser workspaces", () => {
  it("isolates visitors researching the same publication and never uploads shared snapshots", async () => {
    const radar = await discoverPublicRadar("example", async url => url.includes("archive") ? [] : {});
    const alice = storage(), bob = storage();
    const request = vi.fn<typeof fetch>(async () => Response.json({ storage: "browser" }));
    await saveWorkspaceRadar({ version: 1, radar }, alice, request);
    expect((await loadWorkspaceRadar(radar.domain, alice, request))?.radar.domain).toBe(radar.domain);
    expect(await loadWorkspaceRadar(radar.domain, bob, request)).toBeNull();
    expect(request.mock.calls.every(([url]) => url === "/api/workspace")).toBe(true);
    await removeWorkspaceRadar(radar.domain, alice, request);
    expect(readBrowserRadar(radar.domain, alice)).toBeNull();
  });
  it("retains browser research when the network fails and rejects malformed cache data", async () => {
    const radar = await discoverPublicRadar("example", async url => url.includes("archive") ? [] : {});
    const browser = storage();
    const offline = vi.fn<typeof fetch>(async () => { throw new Error("Offline"); });
    await saveWorkspaceRadar({ version: 1, radar }, browser, offline);
    expect((await loadWorkspaceRadar(radar.domain, browser, offline))?.radar.name).toBe(radar.name);
    browser.setItem(`substack-radar:v1:${radar.domain}`, '{"radar":{}}');
    expect(readBrowserRadar(radar.domain, browser)).toBeNull();
    await expect(saveWorkspaceRadar({ version: 1, radar }, undefined, offline)).rejects.toThrow("Could not save");
  });
});
