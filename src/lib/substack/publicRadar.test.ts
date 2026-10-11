import { describe, expect, it } from "vitest";
import { discoverPublicRadar, isPublicAddress, publicationDomain } from "./publicRadar";
import { PublicAccessRequiredError, RateLimitedError } from "./errors";

describe("public domain discovery", () => {
  const archive = [{ id: 1, publication_id: 9, comment_count: 1, publishedBylines: [{ id: 100, handle: "writer", publicationUsers: [{ publication: { id: 9, primary_user_id: 100, name: "Example" } }] }] }];
  const author = { id: 100, handle: "writer" };
  it("paginates up to 50 posts and discovers readers from older discussions", async () => {
    const urls: string[] = [];
    const radar = await discoverPublicRadar("example", async url => {
      urls.push(url);
      if (url.includes("archive")) {
        const offset = Number(new URL(url).searchParams.get("offset"));
        return Array.from({ length: 25 }, (_, i) => ({ id: offset + i + 1, title: `Post ${offset + i + 1}`, comment_count: offset + i === 49 ? 1 : 0 }));
      }
      if (url.includes("/post/50/comments")) return { comments: [{ user_id: 99, handle: "olderreader", metadata: { membership_state: "subscribed" } }] };
      if (url.includes("public_profile")) return { subscriberCountNumber: 589 };
      return {};
    });
    expect(radar.postsScanned).toBe(50);
    expect(radar.posts).toHaveLength(50);
    expect(radar.people.find(p => p.handle === "olderreader")).toMatchObject({ audience: 589, subscriberEvidence: "comment" });
    expect(urls.filter(url => url.includes("archive"))).toEqual(["https://example.substack.com/api/v1/archive?sort=new&limit=25&offset=0", "https://example.substack.com/api/v1/archive?sort=new&limit=25&offset=25"]);
  });
  it("stops on duplicate archive pages and retains posts if a later page fails", async () => {
    const page = Array.from({ length: 25 }, (_, i) => ({ id: i + 1 }));
    let requests = 0;
    const duplicate = await discoverPublicRadar("example", async () => { requests++; return page; });
    expect(duplicate.postsScanned).toBe(25);
    expect(requests).toBe(2);
    const partial = await discoverPublicRadar("example", async url => {
      if (url.endsWith("offset=0")) return page;
      throw new RateLimitedError("limited");
    });
    expect(partial.postsScanned).toBe(25);
    expect(partial.warnings).toContain("The archive scan stopped after 25 posts. Earlier results were retained.");
  });
  it("preserves Chrome audience snapshots without repeating their server lookup", async () => {
    const urls: string[] = [];
    const radar = await discoverPublicRadar("example", async url => {
      urls.push(url);
      if (url.includes("archive")) return archive;
      if (url.includes("comments")) return { comments: [] };
      return {};
    }, { version: 2, sourceUrl: "https://example.substack.com/publish/subscribers", capturedAt: "2026-10-11T12:00:00Z", totalCount: 1, rowsRead: 1, subscribers: [{ id: "12", name: "Reader", handle: "reader", publicAudience: { count: 3200, label: "3.2K+", bestseller: false } }] });
    expect(radar.people.find(p => p.id === "12")).toMatchObject({ audience: 3200, audienceLabel: "3.2K+", audienceStatus: "public" });
    expect(urls.some(url => url.includes("/reader/"))).toBe(false);
  });
  it("keeps the reported 638 total separate from two comment-identified subscribers", async () => {
    const radar = await discoverPublicRadar("example", async url => {
      if (url.includes("archive")) return archive;
      if (url.endsWith("/writer/public_profile")) return { ...author, subscriberCountNumber: 638, subscriberCount: "638" };
      if (url.includes("subscriber-lists")) throw new PublicAccessRequiredError("browser required");
      if (url.includes("comments")) return { comments: [2, 3].map(id => ({ user_id: id, handle: `reader${id}`, metadata: { membership_state: "subscribed" } })) };
      return {};
    });
    expect(radar.subscriberCoverage).toMatchObject({ totalCount: 638, totalLabel: "638", discovered: 2, source: "comments" });
  });
  it("imports owner rows without handles and rejects exports from another publication", async () => {
    const getJson = async (url: string) => {
      if (url.includes("archive")) return archive;
      if (url.includes("comments")) return { comments: [{ user_id: 99, handle: "former", metadata: { membership_state: "subscribed" } }, { user_id: 2, handle: "reader", name: "Reader" }] };
      return {};
    };
    const packet = { version: 2 as const, sourceUrl: "https://example.substack.com/publish/subscribers", capturedAt: "2026-10-11T12:00:00Z", totalCount: 2, rowsRead: 2, subscribers: [{ id: "2", handle: null, name: "Reader" }, { id: "3", handle: null, name: "No public profile" }] };
    const radar = await discoverPublicRadar("example", getJson, packet);
    expect(radar.subscriberCoverage).toMatchObject({ source: "owner_session", totalCount: 2, discovered: 2 });
    expect(radar.people.find(p => p.id === "3")).toMatchObject({ subscriberEvidence: "owner_list", handle: null, membership: "Subscriber", audience: null });
    expect(radar.people.find(p => p.id === "2")?.handle).toBe("reader");
    expect(radar.people.find(p => p.id === "99")?.membership).toBe("Public participant");
    await expect(discoverPublicRadar("example", getJson, { ...packet, sourceUrl: "https://other.substack.com/publish/subscribers" })).rejects.toThrow("different creator");
  });
  it("reads public list wrappers, deduplicates commenters, and does not count list entries as comments", async () => {
    const radar = await discoverPublicRadar("example", async url => {
      if (url.includes("archive")) return archive;
      if (url.endsWith("/100/public_profile")) return author;
      if (url.includes("subscriber-lists")) return { hiddenSubscriberCount: 7, subscriberLists: [{ groups: [{ users: [{ user: { id: 2, handle: "reader", name: "Reader" } }, { id: 3, handle: "other", name: "Other" }] }] }] };
      if (url.includes("comments")) return { comments: [{ user_id: 2, handle: "reader", metadata: { membership_state: "subscribed" } }] };
      return { subscriberCountNumber: 0, bestseller_tier: 0 };
    });
    expect(radar.subscriberCoverage).toMatchObject({ status: "available", source: "public_list", discovered: 2, hiddenCount: 7 });
    expect(radar.people.find(p => p.handle === "reader")).toMatchObject({ comments: 1, subscriberEvidence: "public_list", bestseller: false });
    expect(radar.people.find(p => p.handle === "other")?.comments).toBe(0);
  });
  it("offers browser import when the public list requires browser access", async () => {
    const radar = await discoverPublicRadar("example", async url => {
      if (url.includes("archive")) return archive;
      if (url.endsWith("/100/public_profile")) return author;
      if (url.includes("subscriber-lists")) throw new PublicAccessRequiredError("browser required");
      if (url.includes("comments")) return { comments: [] };
      return {};
    });
    expect(radar.subscriberCoverage).toMatchObject({ status: "browser_required", source: "comments", profileUrl: "https://substack.com/@writer/subscribers" });
  });
  it("imports only the matching creator's public subscriber export", async () => {
    const getJson = async (url: string) => {
      if (url.includes("archive")) return archive;
      if (url.includes("/100/")) return author;
      if (url.includes("comments")) return { comments: [] };
      if (url.includes("subscriber-lists")) throw new Error("Should not request the list on import");
      return { subscriberCountNumber: 2000 };
    };
    const packet = { version: 1 as const, capturedAt: "2026-10-11T12:00:00Z", sourceUrl: "https://substack.com/@writer/subscribers", subscribers: [{ handle: "reader", name: "Reader" }] };
    const radar = await discoverPublicRadar("example", getJson, packet);
    expect(radar.subscriberCoverage).toMatchObject({ status: "available", source: "browser_list", discovered: 1, enriched: 1 });
    expect(radar.people.find(p => p.handle === "reader")).toMatchObject({ audience: 2000, subscriberEvidence: "browser_list", comments: 0 });
    await expect(discoverPublicRadar("example", getJson, { ...packet, sourceUrl: "https://substack.com/@other/subscribers" })).rejects.toThrow("different creator");
  });
  it("resolves a profile URL to its primary publication before scanning", async () => {
    const urls: string[] = [];
    const radar = await discoverPublicRadar("https://substack.com/@whitetigercapital", async url => {
      urls.push(url);
      if (url.includes("public_profile")) return { primaryPublication: { subdomain: "whitetigercapital", name: "Baekho Research" } };
      return [];
    });
    expect(radar.domain).toBe("whitetigercapital.substack.com");
    expect(radar.name).toBe("Baekho Research");
    expect(urls).toEqual(["https://substack.com/api/v1/user/whitetigercapital/public_profile", "https://whitetigercapital.substack.com/api/v1/archive?sort=new&limit=25&offset=0"]);
  });
  it("resolves @handles and prioritizes the publication's custom domain", async () => {
    const radar = await discoverPublicRadar("@writer", async url => url.includes("public_profile") ? { publicationUsers: [{ is_primary: true, publication: { subdomain: "newsletter", custom_domain: "newsletter.example.com" } }] } : []);
    expect(radar.domain).toBe("newsletter.example.com");
  });
  it("does not infer a publication from a handle or a profile's subscriptions", async () => {
    await expect(discoverPublicRadar("substack.com/@reader", async () => ({ subscriptions: [{ subdomain: "other" }] }))).rejects.toThrow("no primary publication");
    await expect(discoverPublicRadar("substack.com", async () => [])).rejects.toThrow("profile URL");
    await expect(discoverPublicRadar("@bad/handle", async () => [])).rejects.toThrow("valid Substack profile handle");
  });
  it("accepts subdomains, URLs, and custom domains", () => {
    expect(publicationDomain("lenny")).toBe("lenny.substack.com");
    expect(publicationDomain("https://Example.Substack.com/about")).toBe("example.substack.com");
    expect(publicationDomain("www.lennysnewsletter.com")).toBe("www.lennysnewsletter.com");
  });
  it("rejects credentials, ports, IP literals, and non-HTTP schemes", () => {
    for (const domain of ["https://user:pass@example.com", "example.com:8080", "127.0.0.1", "https://[::1]", "file:///etc/passwd"]) expect(() => publicationDomain(domain)).toThrow();
    for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.0.1", "::1", "::ffff:127.0.0.1", "fc00::1"]) expect(isPublicAddress(ip)).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("deduplicates public commenters, includes replies, preserves unknown counts, and separates authors", async () => {
    const urls: string[] = [];
    const result = await discoverPublicRadar("example", async url => {
      urls.push(url);
      if (url.includes("archive")) return [{ id: 1, publication_id: 9, title: "Post", comment_count: 2, publishedBylines: [{ id: 100, name: "Author", handle: "author", publicationUsers: [{ publication: { id: 9, name: "Example" } }] }] }];
      if (url.includes("comments")) return { comments: [{ user_id: 1, name: "Reader", handle: "reader", metadata: { membership_state: "subscribed" }, children: [{ user_id: 1, name: "Reader", handle: "reader" }, { user_id: 2, name: "Unknown", handle: "unknown" }] }, { user_id: 3, name: "Deleted", deleted: true }] };
      if (url.includes("/reader/")) return { subscriberCountNumber: 1200, subscriberCount: "1.2K+" };
      return {};
    });
    expect(result.name).toBe("Example");
    expect(result.people).toHaveLength(3);
    expect(result.people[0]).toMatchObject({ name: "Reader", comments: 2, audience: 1200, audienceLabel: "1.2K+", membership: "Subscriber" });
    expect(result.people.find(p => p.name === "Unknown")?.audience).toBeNull();
    expect(result.people.find(p => p.name === "Author")?.role).toBe("Author");
    expect(urls.every(url => !url.includes("subscriber-stats") && !url.includes("/me"))).toBe(true);
  });
  it("keeps usable results when discussions or enrichment are unavailable", async () => {
    const radar = await discoverPublicRadar("example", async url => {
      if (url.includes("archive")) return [{ id: 1, comment_count: 3, publishedBylines: [{ id: 1, handle: "author" }] }];
      throw new Error("unavailable");
    });
    expect(radar.postsScanned).toBe(1);
    expect(radar.people).toHaveLength(1);
    expect(radar.warnings).toHaveLength(2);
    expect(radar.people[0].audience).toBeNull();
  });
  it("rejects unexpected archive shapes and accepts genuinely empty archives", async () => {
    await expect(discoverPublicRadar("example", async () => ({ error: "no" }))).rejects.toThrow();
    expect((await discoverPublicRadar("example", async () => [])).people).toEqual([]);
  });
  it("stops issuing new lookups after a rate limit", async () => {
    let profileCalls = 0;
    const radar = await discoverPublicRadar("example", async url => {
      if (url.includes("archive")) return [{ id: 1, publishedBylines: [1, 2, 3, 4].map(id => ({ id, handle: `author${id}` })) }];
      profileCalls++;
      throw new RateLimitedError("limited");
    });
    expect(profileCalls).toBeLessThanOrEqual(2);
    expect(radar.warnings.some(w => w.includes("Further requests were stopped"))).toBe(true);
    expect(radar.people.every(p => p.audienceStatus === "unavailable")).toBe(true);
  });
});
