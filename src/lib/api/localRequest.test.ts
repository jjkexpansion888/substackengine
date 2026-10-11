import { describe, expect, it } from "vitest";
import { isLocalRequest } from "./localRequest";

describe("local roster access", () => {
  const request = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers: { host: new URL(url).host, ...headers } });
  it("allows same-origin writes on the active local port only", async () => {
    expect(await isLocalRequest(request("http://localhost:3001/api/saved-radar", { origin: "http://localhost:3001" }), true)).toBe(true);
    expect(await isLocalRequest(request("http://localhost:3001/api/saved-radar", { origin: "http://localhost:3000" }), true)).toBe(false);
    expect(await isLocalRequest(request("http://localhost:3001/api/saved-radar"), true)).toBe(false);
  });
  it("rejects hostile hosts and origins, spoofed host headers and cross-site requests", async () => {
    expect(await isLocalRequest(request("http://evil.example/api/saved-radar"))).toBe(false);
    expect(await isLocalRequest(request("http://localhost:3001/api/saved-radar", { host: "evil.example" }))).toBe(false);
    expect(await isLocalRequest(request("http://localhost:3001/api/saved-radar", { origin: "https://evil.example" }))).toBe(false);
    expect(await isLocalRequest(request("http://localhost:3001/api/saved-radar", { "sec-fetch-site": "cross-site" }))).toBe(false);
  });
});
