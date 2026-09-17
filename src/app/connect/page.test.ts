import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store/prismaStore", () => ({ findLatestPublication: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
// ConnectForm is a client island calling useRouter — next/navigation needs the
// app-router context that renderToStaticMarkup does not provide.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import ConnectPage from "./page";
import { findLatestPublication } from "@/lib/store/prismaStore";

/**
 * Connect page tests — instructions and the connected-publication shortcut,
 * with the store lookup mocked (no DB).
 */

vi.mocked(findLatestPublication).mockResolvedValue(null);

async function renderConnect(): Promise<string> {
  return renderToStaticMarkup(await ConnectPage());
}

describe("connect page", () => {
  it("renders the cookie walkthrough and storage disclosure on first visit", async () => {
    const markup = await renderConnect();
    expect(markup).toContain("Connect your Substack publication");
    expect(markup).toContain("substack.sid");
    expect(markup).toContain("encrypted at rest");
    expect(markup).toContain("Not stored");
    expect(markup).not.toContain("Connected:");
  });

  it("links straight to the radar when a publication is already connected", async () => {
    vi.mocked(findLatestPublication).mockResolvedValueOnce({
      id: "pub-1",
      subdomain: "testpub",
      displayName: "Test Pub",
      cookieValid: true,
    });
    const markup = await renderConnect();
    expect(markup).toContain("Connected: Test Pub (testpub)");
    expect(markup).toContain('href="/pub/pub-1/radar"');
  });
});
