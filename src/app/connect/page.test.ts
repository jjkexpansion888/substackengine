import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ConnectPage from "./page";

describe("connect page", () => {
  it("opens a public radar without a database lookup or cookie walkthrough", () => {
    const markup = renderToStaticMarkup(ConnectPage());
    expect(markup).toContain("Influencer radar");
    expect(markup).toContain("Publication domain");
    expect(markup).not.toContain("substack.sid");
    expect(markup).toContain("complete subscriber list");
    expect(markup).not.toContain('aria-label="Header features"');
    expect(markup).not.toContain('aria-label="Engine features"');
    expect(markup).not.toContain("Sync private subscribers");
  });
});
