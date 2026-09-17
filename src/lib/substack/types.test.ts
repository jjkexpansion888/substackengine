import { describe, expect, it } from "vitest";
import { InvalidInputError } from "./errors";
import { normalizeDomain } from "./types";

/**
 * normalizeDomain guards the connect form's domain field. Reader-host
 * rejection is load-bearing: a profile URL silently normalizing to
 * substack.com sent users into the misleading upstream-change banner.
 */
describe("normalizeDomain", () => {
  it("normalizes scheme, case, whitespace, and paths", () => {
    expect(normalizeDomain("https://Example.Substack.com/about")).toBe("example.substack.com");
    expect(normalizeDomain("  whitetigercapital.substack.com  ")).toBe(
      "whitetigercapital.substack.com",
    );
    expect(normalizeDomain("whitetigercapital.substack.com")).toBe(
      "whitetigercapital.substack.com",
    );
  });

  it("accepts custom publication domains", () => {
    expect(normalizeDomain("https://gimmedia.com")).toBe("gimmedia.com");
  });

  it("rejects the substack.com reader host and profile URLs with guidance", () => {
    for (const input of [
      "substack.com",
      "https://substack.com",
      "https://substack.com/@handle",
      "www.substack.com",
    ]) {
      expect(() => normalizeDomain(input)).toThrow(InvalidInputError);
      expect(() => normalizeDomain(input)).toThrow(/publication's own domain/);
    }
  });

  it("rejects non-domains", () => {
    for (const input of ["", "   ", "not a domain"]) {
      expect(() => normalizeDomain(input)).toThrow(InvalidInputError);
    }
  });
});
