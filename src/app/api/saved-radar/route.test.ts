import { describe, expect, it } from "vitest";
import { GET, POST, DELETE } from "./route";

describe("local saved scan access", () => {
  it("rejects cross-site requests and non-local hosts", async () => {
    for (const operation of [GET, POST, DELETE]) {
      expect((await operation(new Request("http://localhost:3000/api/saved-radar?domain=example.com", { headers: { host: "localhost:3000", origin: "https://evil.example", "sec-fetch-site": "cross-site" } }))).status).toBe(403);
      expect((await operation(new Request("http://example.com/api/saved-radar?domain=example.com", { headers: { host: "example.com" } }))).status).toBe(403);
    }
  });
  it("requires same-origin writes and rejects path traversal", async () => {
    expect((await POST(new Request("http://localhost:3000/api/saved-radar", { method: "POST", headers: { host: "localhost:3000" }, body: "{}" }))).status).toBe(403);
    expect((await GET(new Request("http://localhost:3000/api/saved-radar?domain=../../secret", { headers: { host: "localhost:3000" } }))).status).toBe(400);
  });
});
