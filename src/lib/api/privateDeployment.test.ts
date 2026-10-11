import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalRequest } from "./localRequest";
import { isPrivateDeployment, privateDeploymentAuthorized, privateDeploymentReady, privateOrigin } from "./privateDeployment";
afterEach(() => vi.unstubAllEnvs());
describe("private deployment authentication", () => {
  it("fails closed for missing configuration and weak passwords", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "private");
    vi.stubEnv("APP_ORIGIN", "https://engine.example.com");
    vi.stubEnv("APP_USERNAME", "owner");
    vi.stubEnv("APP_PASSWORD", "short");
    expect(privateDeploymentReady()).toBe(false);
    expect(await privateDeploymentAuthorized(new Request("https://engine.example.com"))).toBe(false);
    vi.stubEnv("APP_ORIGIN", "http://engine.example.com");
    expect(privateOrigin()).toBeNull();
  });
  it("authenticates only the configured credentials and enforces private mode on Railway", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_ID", "example");
    vi.stubEnv("APP_ORIGIN", "https://engine.example.com");
    vi.stubEnv("APP_USERNAME", "owner");
    vi.stubEnv("APP_PASSWORD", "a".repeat(64));
    expect(isPrivateDeployment()).toBe(true);
    const request = (credentials: string, origin = "https://engine.example.com") => new Request("https://engine.example.com/api/saved-radar", { headers: { host: "engine.example.com", origin, authorization: `Basic ${btoa(credentials)}` } });
    expect(await privateDeploymentAuthorized(request(`owner:${"a".repeat(64)}`))).toBe(true);
    expect(await privateDeploymentAuthorized(request(`other:${"a".repeat(64)}`))).toBe(false);
    expect(await privateDeploymentAuthorized(request(`owner:${"b".repeat(64)}`))).toBe(false);
    expect(await isLocalRequest(request(`owner:${"a".repeat(64)}`), true)).toBe(true);
    expect(await isLocalRequest(request(`owner:${"a".repeat(64)}`, "https://evil.example"), true)).toBe(false);
  });
});
