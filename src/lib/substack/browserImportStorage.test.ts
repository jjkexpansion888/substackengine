import { describe, expect, it, vi } from "vitest";
import { readSubscriberImport, saveSubscriberImport } from "./browserImportStorage";

const packet = { version: 1 as const, sourceUrl: "https://substack.com/@writer/subscribers", capturedAt: "2026-10-11T12:00:00Z", subscribers: [{ handle: "reader", name: "Reader" }] };
describe("public subscriber import storage", () => {
  it("restores validated public imports without setting a default domain", () => {
    const setItem = vi.fn();
    saveSubscriberImport("example.substack.com", packet, { setItem });
    expect(setItem.mock.calls[0][0]).toContain("example.substack.com");
    expect(readSubscriberImport("example.substack.com", { getItem: () => setItem.mock.calls[0][1] })).toEqual(packet);
  });
  it("ignores corrupt storage, and never persists private owner lists", () => {
    expect(readSubscriberImport("example", { getItem: () => "bad" })).toBeUndefined();
    expect(readSubscriberImport("example", { getItem: () => { throw Error("disabled"); } })).toBeUndefined();
    const setItem = vi.fn();
    saveSubscriberImport("example", { ...packet, version: 2 }, { setItem });
    expect(setItem).not.toHaveBeenCalled();
  });
});
