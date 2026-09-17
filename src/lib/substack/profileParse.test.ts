import { describe, expect, it } from "vitest";
import { parseBestsellerStatus, parseProfileHtml, parseSubscriberCount } from "./profileParse";

// Fragment captured verbatim from the probe's stored profile sample
// (profile-1679017.html): the preloads blob is an escaped JSON string inside
// JSON.parse("..."), so quotes appear as \" in the raw HTML.
const REAL_ESCAPED_BLOB =
  'null,\\"subscriberCountString\\":\\"20 subscribers\\",\\"subscriberCount\\":\\"20\\",\\"subscriberCountNumber\\":20,\\"hasHiddenPub';

describe("parseSubscriberCount", () => {
  it("reads the number form from a real escaped preloads blob", () => {
    expect(parseSubscriberCount(REAL_ESCAPED_BLOB)).toBe(20);
  });

  it("reads the number form from unescaped JSON", () => {
    expect(parseSubscriberCount('{"profile":{"subscriberCountNumber":291}}')).toBe(291);
  });

  it("falls back to the string form", () => {
    expect(parseSubscriberCount('{"subscriberCount":"35"}')).toBe(35);
  });

  it("falls back to visible badge text", () => {
    expect(parseSubscriberCount("<span>20 subscribers</span>")).toBe(20);
    expect(parseSubscriberCount("<span>1,234 subscribers</span>")).toBe(1234);
  });

  it("prefers the exact number form over the badge text", () => {
    const html = `<div>9 subscribers</div><script>JSON.parse("{\\"subscriberCountNumber\\":20}")</script>`;
    expect(parseSubscriberCount(html)).toBe(20);
  });

  it("resolves to null — never zero — when nothing is parseable", () => {
    expect(parseSubscriberCount("<html><body>no data here</body></html>")).toBeNull();
    expect(parseSubscriberCount("")).toBeNull();
    expect(parseSubscriberCount("subscribers-only circle joins")).toBeNull();
  });

  it("treats a malformed count as no data", () => {
    expect(parseSubscriberCount('{"subscriberCountNumber":"many"}')).toBeNull();
  });
});

describe("parseBestsellerStatus", () => {
  it("reads an explicit bestseller status key", () => {
    expect(parseBestsellerStatus('\\"bestsellerStatus\\":\\"BESTSELLER\\"')).toBe("BESTSELLER");
  });

  it("reads an isBestseller flag", () => {
    expect(parseBestsellerStatus('\\"isBestseller\\":true')).toBe("bestseller");
  });

  it("ignores prose that merely mentions bestseller (bios do)", () => {
    // Real sample bios contain "bestseller" in text — must not false-positive.
    expect(parseBestsellerStatus("author of bestseller 'The Little Book' and #1 seller")).toBeNull();
  });
});

describe("parseProfileHtml", () => {
  it("returns nulls for a page without any profile data", () => {
    const parsed = parseProfileHtml("<html>nothing useful</html>");
    expect(parsed).toEqual({ name: null, subscriberCount: null, bestsellerStatus: null });
  });

  it("extracts the count from the embedded blob", () => {
    const parsed = parseProfileHtml(`<html>...${REAL_ESCAPED_BLOB}...</html>`);
    expect(parsed.subscriberCount).toBe(20);
  });
});
