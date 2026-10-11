import { describe, expect, it } from "vitest";
import { discoverCollaborators, parseDiscoveryInput } from "./discovery";
import { RateLimitedError } from "@/lib/substack/errors";

describe("collaboration discovery", () => {
  it("discovers outside publications without a subscriber roster", async () => {
    const scan = await discoverCollaborators({ domain: "garden.substack.com", people: [], seeds: [], writing: "culture philosophy literature education university institutions" }, async url => {
      if (url.includes("public_profile")) return { name: "Outside writer", handle: "outside" };
      return [{ id: 1, title: "Literature and institutions", comment_count: 0, publishedBylines: [{ name: "Outside writer", handle: "outside" }] }];
    });
    expect(scan.candidates.length).toBeGreaterThan(0);
    expect(scan.candidates.every(candidate => candidate.source === "extended")).toBe(true);
    expect(scan.candidates[0].evidence.join(" ")).toContain("semantic alignment");
  });
  it("skips previously discovered publications", async () => {
    const requests: string[] = [];
    const scan = await discoverCollaborators({ domain: "garden.substack.com", people: [{ handle: "sam", comments: 1, author: false, domain: "other.substack.com" }], seeds: [], excludeDomains: ["other.substack.com"] }, async url => { requests.push(url); return []; });
    expect(requests).toEqual([]);
    expect(scan.candidates).toEqual([]);
  });
  it("validates and bounds untrusted input", () => {
    expect(() => parseDiscoveryInput({ domain: "127.0.0.1", people: [], seeds: [] })).toThrow();
    expect(() => parseDiscoveryInput({ domain: "garden.substack.com", people: [{ handle: "../admin", comments: 0, author: false }], seeds: [] })).toThrow();
    expect(() => parseDiscoveryInput({ domain: "garden.substack.com", people: [], seeds: Array(7).fill("other.substack.com") })).toThrow();
    expect(parseDiscoveryInput({ domain: "garden", people: [], seeds: ["garden", "other", "other"] }).seeds).toEqual(["other.substack.com"]);
  });
  it("discovers writers, excludes the source publication, and reports observed overlap", async () => {
    const get = async (url: string) => {
      if (url.includes("public_profile")) return { name: "Sam", handle: "sam", primaryPublication: { subdomain: "other", name: "Other Garden", hero_text: "Native plants" }, subscriberCountNumber: 1500 };
      if (url.includes("/comments")) return { comments: [{ handle: "reader", children: [] }, { handle: "guest", children: [] }] };
      return [{ id: 1, title: "Native plants", comment_count: 2, canonical_url: "https://other.substack.com/p/plants", post_date: "2026-10-01" }];
    };
    const scan = await discoverCollaborators({ domain: "garden.substack.com", people: [{ handle: "sam", comments: 2, author: false }, { handle: "reader", comments: 1, author: false }], seeds: [] }, get);
    expect(scan.candidates).toHaveLength(1);
    expect(scan.candidates[0].sharedParticipants).toBe(1);
    expect(scan.candidates[0].sampledParticipants).toBe(2);
    expect(scan.candidates[0].publication).toBe("Other Garden");
    const self = await discoverCollaborators({ domain: "other.substack.com", people: [{ handle: "sam", comments: 1, author: false }], seeds: [] }, get);
    expect(self.candidates).toHaveLength(0);
  });
  it("stops further upstream requests after rate limiting and returns partial results", async () => {
    let requests = 0;
    const scan = await discoverCollaborators({ domain: "garden.substack.com", people: [{ handle: "sam", comments: 1, author: false }], seeds: [] }, async () => { requests++; throw new RateLimitedError("Rate limited"); });
    expect(requests).toBe(1);
    expect(scan.candidates).toEqual([]);
    expect(scan.warnings.join(" ")).toContain("rate limited");
  });
  it("reuses known publication metadata instead of looking up profiles again", async () => {
    const requests: string[] = [];
    const scan = await discoverCollaborators({ domain: "garden.substack.com", people: [{ handle: "sam", comments: 3, author: false, domain: "other.substack.com", name: "Sam", publication: "Other", audience: 1000 }, { handle: "reader", comments: 1, author: false, domain: null }], seeds: [] }, async url => {
      requests.push(url);
      return [{ id: 1, title: "Native plants", comment_count: 0 }];
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("/archive");
    expect(scan.candidates[0].name).toBe("Sam");
    expect(scan.candidates[0].audience).toBe(1000);
  });
});
