import { describe, expect, it } from "vitest";
import { isLocalRequest } from "./localRequest";

describe("local roster access", () => {
  const request = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers: { host: new URL(url).host, ...headers } });
  it("allows same-origin writes on the active local port only", () => {
    expect(isLocalRequest(request("http://localhost:3001/api/saved-radar", { origin: "http://localhost:3001" }), true)).toBe(true);
    expect(isLocalRequest(request("http://localhost:3001/api/saved-radar", { origin: "http://localhost:3000" }), true)).toBe(false);
    expect(isLocalRequest(request("http://localhost:3001/api/saved-radar"), true)).toBe(false);
  });
  it("rejects hostile hosts and origins, spoofed host headers and cross-site requests", () => {
    expect(isLocalRequest(request("http://evil.example/api/saved-radar"))).toBe(false);
    expect(isLocalRequest(request("http://localhost:3001/api/saved-radar", { host: "evil.example" }))).toBe(false);
    expect(isLocalRequest(request("http://localhost:3001/api/saved-radar", { origin: "https://evil.example" }))).toBe(false);
    expect(isLocalRequest(request("http://localhost:3001/api/saved-radar", { "sec-fetch-site": "cross-site" }))).toBe(false);
  });
});
