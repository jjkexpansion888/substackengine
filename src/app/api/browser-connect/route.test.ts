import { describe, expect, it } from "vitest";
import { GET, OPTIONS, POST } from "./route";
import { claimBrowserHandoff, stageBrowserHandoff } from "@/lib/substack/browserHandoff";

const id = "a".repeat(32);
const packet = { version: 2, sourceUrl: "https://example.substack.com/publish/subscribers", capturedAt: "2026-10-11T12:00:00Z", totalCount: 1, rowsRead: 1, subscribers: [{ id: "1", handle: null, name: "Reader", email: "private@example.com" }], cookie: "secret" };
const request = (body: unknown, origin = `chrome-extension://${id}`, host = "localhost:3000") => new Request("http://localhost:3000/api/browser-connect", { method: "POST", headers: { host, origin, "x-substack-connector": id, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const claim = (token: string) => GET(new Request(`http://localhost:3000/api/browser-connect?token=${token}`, { headers: { host: "localhost:3000" } }));

describe("direct browser sync handoff", () => {
  it("shares public counts with the local view without sharing the owner roster", async () => {
    const profiles = [{ id: "9876511", handle: "sharedreader", name: "Private name", email: "private@example.com", publicAudience: { count: 849, label: null, bestseller: false } }];
    expect((await POST(request({ action: "audience-cache", profiles }))).status).toBe(200);
    const local = (body: unknown) => new Request("http://localhost:3000/api/browser-connect", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const response = await POST(local({ action: "audience-cache", identities: [{ id: "9876511" }] }));
    expect(await response.json()).toEqual({ profiles: [{ id: "9876511", handle: "sharedreader", publicAudience: { count: 849, label: null, bestseller: false } }] });
    expect((await POST(local(packet))).status).toBe(403);
    expect((await POST(request({ action: "audience-cache", profiles }, "https://evil.example"))).status).toBe(403);
  });
  it("passes a sanitized roster to the local app once, with no roster in the URL", async () => {
    const response = await POST(request(packet));
    expect(response.status).toBe(200);
    const { url } = await response.json();
    expect(url).not.toContain("Reader");
    expect(url).not.toContain("secret");
    const token = new URL(url).searchParams.get("browserSync")!;
    const result = claim(token);
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    const data = await result.json();
    expect(data.packet.subscribers).toEqual([{ id: "1", handle: null, name: "Reader" }]);
    expect(JSON.stringify(data)).not.toContain("private@example.com");
    expect(claim(token).status).toBe(410);
  });
  it("rejects unrelated websites, non-local hosts, and public exports", async () => {
    expect((await POST(request(packet, "https://evil.example"))).status).toBe(403);
    expect((await POST(request(packet, `chrome-extension://${id}`, "example.com"))).status).toBe(403);
    expect((await POST(request({ ...packet, version: 1, sourceUrl: "https://substack.com/@writer/subscribers", subscribers: [{ handle: "reader", name: "Reader" }] }))).status).toBe(400);
    expect(OPTIONS(new Request("http://localhost:3000/api/browser-connect", { headers: { host: "localhost:3000", origin: "https://evil.example" } })).status).toBe(403);
  });
  it("supports privileged Chrome fetches that omit Origin but rejects cross-site requests", async () => {
    const headers = { host: "localhost:3000", "x-substack-connector": id };
    const response = await POST(new Request("http://localhost:3000/api/browser-connect", { method: "POST", headers, body: JSON.stringify(packet) }));
    expect(response.status).toBe(200);
    const token = new URL((await response.json()).url).searchParams.get("browserSync")!;
    expect(claim(token).status).toBe(200);
    expect((await POST(new Request("http://localhost:3000/api/browser-connect", { method: "POST", headers: { ...headers, "sec-fetch-site": "cross-site" }, body: JSON.stringify(packet) }))).status).toBe(403);
  });
  it("expires handoffs after five minutes and rejects oversized payloads", async () => {
    const token = stageBrowserHandoff(packet, 1000);
    expect(claimBrowserHandoff(token, 301001)).toBeNull();
    expect((await POST(request({ data: "x".repeat(4 * 1024 * 1024) }))).status).toBe(413);
  });
});
