import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const script = readFileSync(new URL("../../../chrome-extension/popup.js", import.meta.url), "utf8");
describe("Chrome direct owner sync", () => {
  it("starts a persistent sync tab instead of collecting inside the popup", async () => {
    const nodes = new Map(["export", "owner", "status"].map(id => [id, { disabled: false, textContent: "", dataset: {}, addEventListener: vi.fn() }]));
    const create = vi.fn();
    const executeScript = vi.fn();
    const chrome = { runtime: { getURL: (path: string) => `chrome-extension://${"a".repeat(32)}/${path}` }, permissions: { request: async () => true }, tabs: { query: async () => [{ id: 42, url: "https://example.substack.com/publish/subscribers" }], create }, scripting: { executeScript } };
    const context = { chrome, document: { getElementById: (id: string) => nodes.get(id) } };
    runInNewContext(script, context);
    await runInNewContext("beginOwnerSync()", context);
    expect(create).toHaveBeenCalledWith({ url: `chrome-extension://${"a".repeat(32)}/sync.html?tab=42` });
    expect(executeScript).not.toHaveBeenCalled();
  });
  it("collects from the original owner tab even when another tab is active", async () => {
    const nodes = new Map(["export", "owner", "status"].map(id => [id, { disabled: false, textContent: "", dataset: {}, addEventListener: vi.fn() }]));
    const packet = { version: 2, subscribers: [{ id: "1", handle: null, name: "Reader" }], totalCount: 1, rowsRead: 1 };
    const query = vi.fn();
    const executeScript = vi.fn(async () => [{ result: packet }]);
    const chrome = { runtime: { id: "a".repeat(32) }, permissions: { contains: async () => true }, tabs: { get: async (id: number) => ({ id, url: "https://example.substack.com/publish/subscribers" }), query, create: vi.fn() }, scripting: { executeScript } };
    const context = { enrichOwnerProfiles: vi.fn(async value => value), chrome, document: { getElementById: (id: string) => nodes.get(id) }, fetch: async () => Response.json({ url: `http://localhost:3000/connect?browserSync=${"a".repeat(64)}` }), URL, AbortSignal };
    runInNewContext(script, context);
    await runInNewContext("exportSubscribers(true, 42)", context);
    expect(query).not.toHaveBeenCalled();
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 42 }, files: ["owner-collector.js"] });
    expect(nodes.get("status")?.textContent).toContain("Synced 1 profiles");
  });
  it("sends the roster to localhost and opens the handoff without creating a download", async () => {
    const handlers = new Map<string, () => Promise<void>>();
    const nodes = new Map(["export", "owner", "status"].map(id => [id, { disabled: false, textContent: "", dataset: {}, addEventListener: (_type: string, handler: () => Promise<void>) => handlers.set(id, handler) }]));
    const packet = { version: 2, sourceUrl: "https://example.substack.com/publish/subscribers", subscribers: [{ id: "1", handle: null, name: "Reader" }], totalCount: 1, rowsRead: 1 };
    const fetch = vi.fn(async () => Response.json({ url: `http://localhost:3000/connect?browserSync=${"a".repeat(64)}` }));
    const create = vi.fn();
    const createElement = vi.fn();
    const chrome = { runtime: { id: "a".repeat(32) }, permissions: { request: vi.fn(async () => true) }, tabs: { query: async () => [{ id: 1, url: packet.sourceUrl }], create }, scripting: { executeScript: async () => [{ result: packet }] } };
    const context = { enrichOwnerProfiles: vi.fn(async value => value), chrome, document: { getElementById: (id: string) => nodes.get(id), createElement }, fetch, URL, AbortSignal };
    runInNewContext(script, context);
    await runInNewContext("exportSubscribers(true)", context);
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ["http://localhost:3000/*", "https://substack.com/*"] });
    expect(fetch).toHaveBeenCalledWith("http://localhost:3000/api/browser-connect", expect.objectContaining({ method: "POST", credentials: "omit" }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(createElement).not.toHaveBeenCalled();
    expect(nodes.get("status")?.textContent).toContain("Synced 1 profiles");
  });
  it.each(["denied", "offline", "unsafe"])("handles %s without opening a tab or downloading a file", async failure => {
    const nodes = new Map(["export", "owner", "status"].map(id => [id, { disabled: false, textContent: "", dataset: {}, addEventListener: vi.fn() }]));
    const packet = { subscribers: [{ id: "1", name: "Reader" }], rowsRead: 1, totalCount: 1 };
    const fetch = vi.fn(async () => {
      if (failure === "offline") throw new Error("offline");
      return Response.json({ url: "https://example.com/connect" });
    });
    const query = vi.fn(async () => [{ id: 1, url: "https://example.substack.com/publish/subscribers" }]);
    const create = vi.fn();
    const createElement = vi.fn();
    const chrome = { runtime: { id: "a".repeat(32) }, permissions: { request: async () => failure !== "denied" }, tabs: { query, create }, scripting: { executeScript: async () => [{ result: packet }] } };
    const context = { enrichOwnerProfiles: vi.fn(async value => value), chrome, document: { getElementById: (id: string) => nodes.get(id), createElement }, fetch, URL, AbortSignal };
    runInNewContext(script, context);
    await runInNewContext("exportSubscribers(true)", context);
    expect(create).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
    expect(nodes.get("status")?.dataset).toEqual({ error: "true" });
    expect(nodes.get("owner")?.disabled).toBe(false);
    if (failure === "denied") { expect(query).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); }
  });
});
