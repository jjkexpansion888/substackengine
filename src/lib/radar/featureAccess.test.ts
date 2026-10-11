import { describe, expect, it } from "vitest";
import { radarFeatures } from "./featureAccess";

describe("extension-free publication research", () => {
  it("waits for a publication before offering research features", () => {
    expect(radarFeatures()).toEqual(["Radar"]);
  });
  it.each(["comments", "public_list", "browser_list", "owner_session"] as const)("offers all three tools for %s coverage without requiring private sync", source => {
    expect(radarFeatures(source)).toEqual(["Radar", "Collaboration finder", "Content opportunities"]);
  });
});
