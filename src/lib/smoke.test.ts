import { describe, expect, it } from "vitest";
import { appName } from "@/lib/app-info";

// Toolchain smoke: proves vitest runs, the @ alias resolves, and TS strict mode
// compiles the suite — CI fails loudly if any of that drifts.
describe("toolchain smoke", () => {
  it("resolves the @ path alias and runs assertions", () => {
    expect(appName).toBe("substackengine");
  });
});
