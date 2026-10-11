import { describe, expect, it } from "vitest";
import { radarFeatures } from "./featureAccess";

describe("owner-only research tools", () => {
  it("shows only Radar before connecting and for public searches or imports", () => {
    for (const source of [undefined, "comments", "public_list", "browser_list"] as const) expect(radarFeatures(source)).toEqual(["Radar"]);
  });
  it("makes owner tools available without changing the default Radar view", () => {
    expect(radarFeatures("owner_session")).toEqual(["Radar", "Collaboration finder", "Content opportunities"]);
  });
});
