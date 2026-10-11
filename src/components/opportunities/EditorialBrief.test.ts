import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { briefSections, EditorialBrief } from "./EditorialBrief";
import type { ContentOpportunity, EditorialEntry } from "@/lib/opportunities/types";

const entry: EditorialEntry = { id: "test", title: "Human taste after abundance", brief: "Working title: Human taste after abundance\n\nResearch hypothesis\nInvestigate trusted curation.\n\nResearch plan\n1. Find evidence.\n2. Test the counterargument.\n\nCoverage limit\nA sampled archive.", date: "", status: "Idea" };
const opportunity: ContentOpportunity = { ...entry, kind: "Cross-Substack angle", score: 65, demand: null, coverage: 10, readers: 0, terms: ["curation"], evidence: [], related: [], external: [], fit: 0, novelty: 90 };
function render(overrides: { entry?: EditorialEntry; opportunity?: ContentOpportunity } = {}) {
  return renderToStaticMarkup(createElement(EditorialBrief, { entry, opportunity, saved: false, copied: false, onCopy() {}, onSave() {}, onClose() {}, ...overrides }));
}
describe("read-only editorial brief", () => {
  it("renders structured research without editable fields or duplicated title", () => {
    const html = render();
    expect(html).not.toMatch(/<(input|textarea|select)\b|contenteditable/i);
    expect(html).toContain("<ol");
    expect(html).toContain("Test the counterargument.");
    expect(html).not.toContain("Working title:");
    expect(html).toContain('value="0"');
    expect(html).toContain('aria-label="Alignment"');
    expect(html).toContain("Copy opportunity brief");
  });
  it("preserves earlier saved custom notes and source links without matching research", () => {
    const html = render({ opportunity: undefined, entry: { ...entry, brief: "My earlier notes\nhttps://example.com/article\n<script>not executable</script>" } });
    expect(html).toContain("My earlier notes");
    expect(html).toContain('href="https://example.com/article"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("handles CRLF and retains unknown headings", () => {
    expect(briefSections("Research hypothesis\r\nA premise\r\n\r\nCustom note")).toEqual([{ heading: "Research hypothesis", lines: ["A premise", "Custom note"] }]);
  });
});
