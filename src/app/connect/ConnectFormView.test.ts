import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectFormView, type ConnectPhase } from "./ConnectFormView";

function render(phase: ConnectPhase, domain = "") {
  return renderToStaticMarkup(createElement(ConnectFormView, { domain, phase, onDomainChange: () => {}, onSubmit: () => {} }));
}
describe("domain-only connection", () => {
  it("asks only for a domain with no cookie input", () => {
    const markup = render({ kind: "idle" });
    expect(markup).toContain("Publication domain");
    expect(markup).toContain("Open radar");
    expect(markup).not.toContain("cookie");
    expect(markup).not.toMatch(/disabled(?!:)/);
  });
  it("disables submission during discovery and announces progress", () => {
    const markup = render({ kind: "connecting" });
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Scanning recent posts");
    expect(markup).toContain("disabled");
  });
  it("preserves the domain after an error", () => {
    const markup = render({ kind: "error", message: "Unavailable" }, "example.substack.com");
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('value="example.substack.com"');
    expect(markup).not.toMatch(/disabled(?!:)/);
  });
});
