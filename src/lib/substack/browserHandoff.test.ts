import { describe, expect, it, vi } from "vitest";

describe("browser handoff lifecycle", () => {
  it("survives route module reloads but can only be claimed once", async () => {
    const first = await import("./browserHandoff");
    const token = first.stageBrowserHandoff({ version: 2, sourceUrl: "https://example.substack.com/publish/subscribers", capturedAt: new Date().toISOString(), rowsRead: 1, totalCount: 1, subscribers: [{ id: "1", handle: null, name: "Reader" }] });
    vi.resetModules();
    const reloaded = await import("./browserHandoff");
    expect(reloaded.claimBrowserHandoff(token)?.subscribers).toHaveLength(1);
    expect(first.claimBrowserHandoff(token)).toBeNull();
  });
});
