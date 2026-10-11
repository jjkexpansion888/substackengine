import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { publicJson, publicPage } from "@/lib/substack/publicRadar";
import { PublicAccessRequiredError, RateLimitedError } from "@/lib/substack/errors";
vi.mock("@/lib/substack/publicRadar", () => ({ publicJson: vi.fn(), publicPage: vi.fn() }));
const request = (handles: unknown) => new Request("http://localhost/api/subscribers/enrich", { method: "POST", body: JSON.stringify({ handles }) });
beforeEach(() => { vi.mocked(publicJson).mockReset(); vi.mocked(publicPage).mockReset(); vi.mocked(publicPage).mockImplementation(async () => `<script>window._preloads = JSON.parse(${JSON.stringify(JSON.stringify({ profile: { handle: "unknown" } }))})</script>`); });

describe("public subscriber enrichment", () => {
  it("rejects invalid or oversized batches before any upstream request", async () => {
    for (const handles of [[], ["../private"], [123], Array(51).fill("reader")]) expect((await POST(request(handles))).status).toBe(400);
    expect(publicJson).not.toHaveBeenCalled();
  });
  it("deduplicates handles and preserves zero and unknown counts", async () => {
    vi.mocked(publicJson).mockImplementation(async url => url.includes("zero") ? { subscriberCountNumber: 0, subscriberCount: "0", bestseller_tier: 0 } : {});
    const response = await POST(request(["zero", "zero", "unknown"]));
    expect(await response.json()).toMatchObject({ profiles: [{ handle: "zero", audience: 0, status: "public", bestseller: false }, { handle: "unknown", audience: null, status: "not_public" }], stopped: false });
    expect(publicJson).toHaveBeenCalledTimes(2);
  });
  it("stops new lookups after rate limiting and keeps partial results", async () => {
    vi.mocked(publicJson).mockRejectedValue(new RateLimitedError("limited"));
    const response = await POST(request(["one", "two", "three", "four"]));
    expect(await response.json()).toMatchObject({ stopped: true });
    expect(vi.mocked(publicJson).mock.calls.length).toBeLessThanOrEqual(2);
    expect(publicPage).not.toHaveBeenCalled();
  });
  it("resolves numeric IDs using the public owner preload", async () => {
    vi.mocked(publicPage).mockResolvedValue(`<script>window._preloads = JSON.parse(${JSON.stringify(JSON.stringify({ profile: { id: 12, handle: "writer", subscriberCount: "1.2K+" } }))})</script>`);
    const response = await POST(new Request("http://localhost/api/subscribers/enrich", { method: "POST", body: JSON.stringify({ identities: [{ id: "12", handle: null }] }) }));
    expect(await response.json()).toMatchObject({ profiles: [{ id: "12", handle: "writer", audience: 1200, status: "public" }] });
    expect(publicPage).toHaveBeenCalledWith("https://substack.com/profile/12");
    expect(publicJson).not.toHaveBeenCalled();
  });
  it("continues past an individually restricted profile without bypassing its check", async () => {
    vi.mocked(publicJson).mockImplementation(async url => {
      if (url.includes("restrictedindividual")) throw new PublicAccessRequiredError("restricted profile");
      return { subscriberCountNumber: 589 };
    });
    const body = await (await POST(request(["restrictedindividual", "unrestrictedone", "unrestrictedtwo"]))).json();
    expect(body.stopped).toBe(false);
    expect(body.profiles).toMatchObject([{ handle: "restrictedindividual", status: "unavailable" }, { handle: "unrestrictedone", audience: 589 }, { handle: "unrestrictedtwo", audience: 589 }]);
    expect(publicPage).not.toHaveBeenCalled();
  });
  it("stops on repeated browser checks and distinguishes unattempted rows", async () => {
    vi.mocked(publicJson).mockRejectedValue(new PublicAccessRequiredError("browser check"));
    const body = await (await POST(request(["blockedone", "blockedtwo", "blockedthree", "blockedfour", "blockedfive", "blockedsix"]))).json();
    expect(body).toMatchObject({ stopped: true, stopReason: "browser_required" });
    expect(body.profiles.some((p: { attempted: boolean }) => p.attempted === false)).toBe(true);
    expect(publicPage).not.toHaveBeenCalled();
  });
});
