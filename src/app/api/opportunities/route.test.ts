import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidInputError } from "@/lib/substack/errors";
vi.mock("@/lib/opportunities/discovery", () => ({ discoverOpportunities: vi.fn() }));
import { discoverOpportunities } from "@/lib/opportunities/discovery";
import { POST } from "./route";
const request = (body: string) => new Request("http://localhost/api/opportunities", { method: "POST", body });
describe("opportunity endpoint", () => {
  beforeEach(() => vi.resetAllMocks());
  it("rejects malformed and oversized input without scanning", async () => {
    expect((await POST(request("bad json"))).status).toBe(400);
    expect((await POST(request("x".repeat(10001)))).status).toBe(413);
    expect(discoverOpportunities).not.toHaveBeenCalled();
  });
  it("returns public evidence and maps invalid domains", async () => {
    vi.mocked(discoverOpportunities).mockResolvedValue({ domain: "research.substack.com", posts: [], questions: [], commentsRead: 0, warnings: [], scannedAt: "2026-10-11" });
    expect((await POST(request('{"domain":"research.substack.com"}'))).status).toBe(200);
    vi.mocked(discoverOpportunities).mockRejectedValue(new InvalidInputError("Bad domain"));
    expect((await POST(request('{"domain":"localhost"}'))).status).toBe(400);
  });
});
