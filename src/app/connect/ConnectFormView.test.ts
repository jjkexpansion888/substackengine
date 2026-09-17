import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectFormView, type ConnectPhase } from "./ConnectFormView";

/**
 * Connect form states — including the spec detail that a rejected cookie's
 * typed values survive the failed attempt (retry keeps what the user typed).
 */

function renderForm(phase: ConnectPhase, values = { domain: "", cookie: "" }): string {
  return renderToStaticMarkup(
    createElement(ConnectFormView, {
      ...values,
      phase,
      onDomainChange: () => {},
      onCookieChange: () => {},
      onSubmit: () => {},
    }),
  );
}

describe("ConnectFormView", () => {
  it("state: idle — empty form with an enabled Connect button", () => {
    const markup = renderForm({ kind: "idle" });
    expect(markup).toContain("data-testid=\"connect-form\"");
    expect(markup).toContain("Connect");
    // No disabled ATTRIBUTE (the disabled:opacity-50 utility class is always present).
    expect(markup).not.toMatch(/disabled(?!:)/);
    expect(markup).not.toContain("connect-error");
  });

  it("state: connecting — validating note and disabled submit", () => {
    const markup = renderForm({ kind: "connecting" });
    expect(markup).toContain("data-testid=\"connecting-note\"");
    expect(markup).toContain("Validating the cookie with Substack");
    expect(markup).toContain("disabled");
  });

  it("state: syncing — first-sync progress note", () => {
    const markup = renderForm({ kind: "syncing" });
    expect(markup).toContain("data-testid=\"first-sync-note\"");
    expect(markup).toContain("running the first sync");
  });

  it("state: cookie rejected — error message and the typed values kept for retry", () => {
    const markup = renderForm(
      { kind: "error", code: "session_expired", message: "Connection expired — reconnect." },
      { domain: "example.substack.com", cookie: "sid-paste" },
    );
    expect(markup).toContain("data-testid=\"connect-error\"");
    expect(markup).toContain("Connection expired — reconnect.");
    // Retry keeps what the user typed.
    expect(markup).toContain("value=\"example.substack.com\"");
    expect(markup).toContain("sid-paste");
    // A failed attempt re-enables the form.
    expect(markup).not.toMatch(/disabled(?!:)/);
  });

  it("renders structured labels for the two inputs", () => {
    const markup = renderForm({ kind: "idle" });
    expect(markup).toContain("Publication domain");
    expect(markup).toContain("substack.sid cookie");
    expect(markup).toContain("data-testid=\"connect-domain\"");
    expect(markup).toContain("data-testid=\"connect-cookie\"");
  });
});
