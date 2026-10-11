import { describe, expect, it } from "vitest";
import { cachedPublicAudience, rememberPublicAudience } from "./publicAudienceCache";

describe("shared public audience cache", () => {
  it("shares only public facts across IDs and handles, not owner membership", () => {
    rememberPublicAudience({ id: "9876501", handle: "CacheReader", name: "Private", email: "private@example.com", membership: "Subscriber", publicAudience: { count: 849, label: "849", bestseller: false } }, 1000);
    expect(cachedPublicAudience({ handle: "cachereader" }, 1001)).toEqual({ id: "9876501", handle: "cachereader", publicAudience: { count: 849, label: "849", bestseller: false } });
    expect(cachedPublicAudience({ id: "9876501" }, 1001)?.publicAudience.count).toBe(849);
    expect(cachedPublicAudience({ id: "9876502", handle: "cachereader" }, 1001)).toBeNull();
    expect(cachedPublicAudience({ id: "9876501" }, 3601000)).toBeNull();
  });
  it("does not overwrite a recovered count with an empty result", () => {
    const row = { id: "9876503", handle: "cacheknown", publicAudience: { count: 187, label: null, bestseller: false } };
    rememberPublicAudience(row, 1000);
    rememberPublicAudience({ ...row, publicAudience: { ...row.publicAudience, count: null } }, 2000);
    expect(cachedPublicAudience({ id: row.id }, 2001)?.publicAudience.count).toBe(187);
  });
  it("expires unknown counts quickly and rejects placeholder labels", () => {
    rememberPublicAudience({ id: "9876504", handle: "cacheunknown", publicAudience: { count: null, label: null, bestseller: false } }, 1000);
    expect(cachedPublicAudience({ id: "9876504" }, 301000)).toBeNull();
    rememberPublicAudience({ id: "9876505", handle: "cacheinvalid", publicAudience: { count: 0, label: "See subscribers", bestseller: false } }, 1000);
    expect(cachedPublicAudience({ id: "9876505" }, 1001)).toBeNull();
  });
  it("matches a publicly verified handle without inventing its numeric ID", () => {
    rememberPublicAudience({ handle: "cachehandleonly", publicAudience: { count: 142, label: "142", bestseller: false } }, 1000);
    expect(cachedPublicAudience({ handle: "cachehandleonly" }, 1001)?.publicAudience.count).toBe(142);
    expect(cachedPublicAudience({ id: "9876506", handle: "cachehandleonly" }, 1001)).toBeNull();
    expect(cachedPublicAudience({ id: "9876506" }, 1001)).toBeNull();
  });
});
