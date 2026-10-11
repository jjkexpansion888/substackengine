import { describe, expect, it } from "vitest";
import { applyCsvRoster } from "./csvRoster";
import { discoverPublicRadar } from "./publicRadar";
import { parseSubscriberCsv } from "./subscriberCsv";

describe("local confirmed account imports", () => {
  it("replaces the unresolved row with the confirmed identity without rescanning discussions", async () => {
    const packet = parseSubscriberCsv("Name,Email\nReader,private@example.test", "example.substack.com").packet;
    const radar = await discoverPublicRadar("example", async url => url.includes("archive") ? [] : {}, packet);
    const updated = applyCsvRoster(radar, { ...packet, subscribers: [{ id: "42", name: "Reader", handle: "reader" }] });
    expect(updated.people).toHaveLength(1);
    expect(updated.people[0]).toMatchObject({ id: "42", handle: "reader", audience: null, subscriberEvidence: "file_list" });
    expect(updated.posts).toEqual(radar.posts);
    expect(updated.subscriberCoverage.discovered).toBe(1);
    expect(() => applyCsvRoster(radar, { ...packet, sourceUrl: "https://other.substack.com/publish/subscribers" })).toThrow("another");
  });
  it("never borrows another numeric account's count through a shared handle", async () => {
    const packet = parseSubscriberCsv("Name,User ID,Handle\nReader,42,reader", "example.substack.com").packet;
    const radar = await discoverPublicRadar("example", async url => url.includes("archive") ? [] : {}, packet);
    radar.people[0].audience = 999999;
    const updated = applyCsvRoster(radar, { ...packet, subscribers: [{ id: "43", name: "Reader", handle: "reader" }] });
    expect(updated.people[0].audience).toBeNull();
  });
});
