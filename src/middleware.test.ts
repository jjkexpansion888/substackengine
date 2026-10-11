import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "./middleware";
afterEach(() => vi.unstubAllEnvs());
describe("shared deployment boundary", () => {
  it("opens publication research but blocks all server-roster and legacy paths", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "shared");
    vi.stubEnv("APP_ORIGIN", "https://engine.example.com");
    const request = (path: string) => new NextRequest(`https://engine.example.com${path}`, { headers: { host: "engine.example.com", "x-forwarded-proto": "https" } });
    expect((await middleware(request("/connect"))).status).toBe(200);
    for (const path of ["/api/saved-radar", "/api/sync", "/api/publications/123/subscribers", "/pub/123/radar"]) expect((await middleware(request(path))).status).toBe(403);
    vi.stubEnv("APP_ORIGIN", "");
    expect((await middleware(request("/connect"))).status).toBe(503);
    expect((await middleware(request("/api/health"))).status).toBe(200);
  });
});
