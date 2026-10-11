import { describe, expect, it } from "vitest";
import { recommendedDomains } from "./recommendations";

describe("public recommendation discovery", () => {
  it("extracts explicit recommendation links, including custom domains, without unrelated links", () => {
    const html = `<a href="https://new.substack.com/?utm_source=recommendations_page&amp;utm_campaign=1">New</a>
      <a href='https://custom.example.org/?utm_source=recommendations_page'>Custom</a>
      <a href="https://new.substack.com/?utm_source=recommendations_page">Duplicate</a>
      <a href="https://substack.com/privacy">Privacy</a><a href="https://unrelated.example.org">Other</a>
      <a href="http://insecure.substack.com/?utm_source=recommendations_page">Insecure</a>
      <a href="https://127.0.0.1/?utm_source=recommendations_page">Private</a>
      <a href="https://owner.substack.com/?utm_source=recommendations_page">Self</a>`;
    expect(recommendedDomains(html, "owner.substack.com")).toEqual(["new.substack.com", "custom.example.org"]);
  });
});
