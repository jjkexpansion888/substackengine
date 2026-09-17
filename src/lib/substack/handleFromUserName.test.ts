import { describe, expect, it } from "vitest";
import { handleFromUserName } from "./types";

// Pinned against the live probe (results8-profile-samples.json), which resolved
// 25/25 handles from the feed's user_name this way.
describe("handleFromUserName", () => {
  it("slugifies display names the way the probe did", () => {
    expect(handleFromUserName("Tom McAuley")).toBe("tommcauley");
  });

  it("keeps digit-only names (probe saw handle 19274937)", () => {
    expect(handleFromUserName("19274937")).toBe("19274937");
  });

  it("collapses punctuation and spaces", () => {
    expect(handleFromUserName("  A. B - C! ")).toBe("abc");
  });

  it("returns null for unusable names", () => {
    expect(handleFromUserName(null)).toBeNull();
    expect(handleFromUserName("")).toBeNull();
    expect(handleFromUserName("   ")).toBeNull();
    expect(handleFromUserName("🎉🚀")).toBeNull();
  });
});
