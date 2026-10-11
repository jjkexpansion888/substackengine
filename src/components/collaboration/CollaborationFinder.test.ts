import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CollaborationFinder } from "./CollaborationFinder";
import { discoverPublicRadar } from "@/lib/substack/publicRadar";

describe("single-publication collaboration workspace", () => {
  it("uses the connected publication and omits redundant setup controls", async () => {
    const radar = await discoverPublicRadar("whitetigercapital", async url => url.includes("archive") ? [] : {});
    radar.name = "Baekho Research";
    const markup = renderToStaticMarkup(createElement(CollaborationFinder, { radar }));
    expect(markup).toContain("Baekho Research");
    expect(markup).toContain("Find collaborators");
    expect(markup).toContain("Shortlist");
    expect(markup).toContain("Outcomes");
    for (const label of ["Matching preferences", "Your publication name", "Your publication URL", "Research publication", "Additional publications", "Topics and reader interests", "Reference subscriber count", "Partnership goal", "Diversify the shortlist"]) {
      expect(markup).not.toContain(label);
    }
  });
});
