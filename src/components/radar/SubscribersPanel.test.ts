import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SubscribersPanel } from "./SubscribersPanel";
import { parseSubscriberCsv } from "@/lib/substack/subscriberCsv";
import { discoverPublicRadar } from "@/lib/substack/publicRadar";

describe("subscriber CSV interface", () => {
  it("shows CSV input, unresolved account matching and no extension controls", async () => {
    const packet = parseSubscriberCsv("Name,Email\nReader,private@example.test", "example.substack.com").packet;
    const radar = await discoverPublicRadar("example", async url => url.includes("archive") ? [] : {}, packet);
    const markup = renderToStaticMarkup(createElement(SubscribersPanel, { radar, busy: false, importedPacket: packet, onImport: async () => {}, onRemoveImport: () => {}, onUpdate: () => {} }));
    expect(markup).toContain("Choose CSV file");
    expect(markup).toContain("text/csv");
    expect(markup).toContain("Unresolved account");
    expect(markup).toContain("Match account for Reader");
    expect(markup).toContain("Imported CSV");
    expect(markup).not.toContain("Chrome");
    expect(markup).not.toContain("substack-radar-helper");
    expect(markup).not.toContain("private@example.test");
  });
});
