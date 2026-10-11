import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { rememberPublicAudience } from "@/lib/substack/publicAudienceCache";

describe("local public count cache", () => {
  const request = (body: unknown, origin = "http://localhost:3001") => new Request("http://localhost:3001/api/subscribers/audience-cache", { method: "POST", headers: { host: "localhost:3001", origin }, body: JSON.stringify(body) });
  it("returns verified public facts on the current port without allowing uploaded count injection", async () => {
    rememberPublicAudience({ id: "823741", handle: "cachecsvreader", publicAudience: { count: 142, label: "142", bestseller: false } });
    const response = await POST(request({ identities: [{ id: "823741" }], profiles: [{ id: "823741", handle: "cachecsvreader", publicAudience: { count: 999999, label: null, bestseller: false } }] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ profiles: [{ id: "823741", handle: "cachecsvreader", publicAudience: { count: 142, label: "142", bestseller: false } }] });
  });
  it("rejects extension or unrelated origins and invalid batches", async () => {
    expect((await POST(request({ identities: [] }, `chrome-extension://${"a".repeat(32)}`))).status).toBe(403);
    expect((await POST(request({ identities: [] }, "https://evil.example"))).status).toBe(403);
    expect((await POST(request({ identities: "invalid" }))).status).toBe(400);
  });
});
