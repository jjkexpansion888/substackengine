import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { findAccountCandidates } from "@/lib/substack/accountCandidates";
import { RateLimitedError, PublicAccessRequiredError } from "@/lib/substack/errors";
vi.mock("@/lib/substack/accountCandidates", () => ({ findAccountCandidates: vi.fn() }));
const request = (subscribers: unknown, origin = "http://localhost:3001") => new Request("http://localhost:3001/api/subscribers/find-accounts", { method: "POST", headers: { host: "localhost:3001", origin }, body: JSON.stringify({ subscribers }) });
beforeEach(() => { vi.mocked(findAccountCandidates).mockReset(); });
describe("name-discovery batches", () => {
  it("rejects emails, oversized batches and cross-origin requests before searching", async () => {
    for (const rows of [[], Array(6).fill({ id: "csv:1", name: "Reader" }), [{ id: "csv:1", name: "private@example.com" }], [{ id: "csv:1", name: "Imported subscriber 1" }]]) expect((await POST(request(rows))).status).toBe(400);
    expect((await POST(request([{ id: "csv:1", name: "Reader" }], "https://evil.example"))).status).toBe(403);
    expect(findAccountCandidates).not.toHaveBeenCalled();
  });
  it("returns explicit no-match results rather than fabricated accounts", async () => {
    vi.mocked(findAccountCandidates).mockResolvedValue([]);
    expect(await (await POST(request([{ id: "csv:1", name: "Reader" }]))).json()).toMatchObject({ results: [{ id: "csv:1", status: "no_matches", candidates: [] }], stopped: false });
    expect(findAccountCandidates).toHaveBeenCalledWith("Reader", undefined, undefined, expect.any(Number), false);
  });
  it("stops after rate limiting and preserves unattempted names for resumption", async () => {
    vi.mocked(findAccountCandidates).mockImplementation(async () => { throw new RateLimitedError("limited"); });
    const response = await POST(request([{ id: "csv:1", name: "One" }, { id: "csv:2", name: "Two" }]));
    expect(await response.json()).toMatchObject({ stopped: true, retryAfterMs: 60000, results: [{ status: "unavailable" }, { status: "unattempted" }] });
    expect(findAccountCandidates).toHaveBeenCalledTimes(1);
  });
  it("does not automatically retry an access restriction", async () => {
    vi.mocked(findAccountCandidates).mockImplementation(async () => { throw new PublicAccessRequiredError("restricted"); });
    const data = await (await POST(request([{ id: "csv:1", name: "Reader" }]))).json();
    expect(data).toMatchObject({ stopped: true, retryAfterMs: null });
    expect(data.reason).toContain("browser access");
  });
});
