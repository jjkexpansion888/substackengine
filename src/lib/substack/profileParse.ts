/**
 * Extracts public data from a Substack profile page's HTML.
 *
 * Pure module — no network, no fs. Pinned against the real profile sample
 * stored by the live probe (profile-1679017.html, probe report art_k1eE1cvA):
 * the page embeds an escaped JSON blob containing, for the profile owner,
 *
 *   \"subscriberCountString\":\"20 subscribers\",\"subscriberCount\":\"20\",\"subscriberCountNumber\":20
 *
 * Extraction ladder (first hit wins):
 *   1. "subscriberCountNumber": <int>      — embedded JSON, number form
 *   2. "subscriberCount": "<int>"          — embedded JSON, string form
 *   3. "<n> subscribers" badge text        — visible badge fallback
 *
 * No match at all resolves to null — parse failure means "no public data",
 * NEVER zero. `\"` escapes are tolerated so the same regex works on escaped
 * preloads blobs and plain JSON. `subscriberCount` is deliberately anchored by
 * its closing quote so it cannot match the longer `subscriberCountNumber` /
 * `subscriberCountString` keys.
 */

export type ParsedProfile = {
  /** Profile display name — left null: extraction is unreliable without a pinned shape, the owner feed supplies the name. */
  name: null;
  subscriberCount: number | null;
  bestsellerStatus: string | null;
};

const NUMBER_FORM = /"subscriberCountNumber\\?"\s*:\s*(\d+)/;
const STRING_FORM = /"subscriberCount\\?"\s*:\s*\\?"([\d,]+)\\?"/;
const BADGE_TEXT = /(\d[\d,]*)\s+subscribers?/i;

const BESTSELLER_STATUS_KEY = /"bestsellerStatus\\?"\s*:\s*\\?"([^"\\]{1,64})\\?"/;
const BESTSELLER_FLAG = /"isBestseller\\?"\s*:\s*true/;

function toCount(raw: string): number | null {
  const value = Number.parseInt(raw.replaceAll(",", ""), 10);
  return Number.isSafeInteger(value) ? value : null;
}

export function parseSubscriberCount(html: string): number | null {
  const numberForm = NUMBER_FORM.exec(html);
  if (numberForm) return toCount(numberForm[1]);

  const stringForm = STRING_FORM.exec(html);
  if (stringForm) return toCount(stringForm[1]);

  const badge = BADGE_TEXT.exec(html);
  if (badge) return toCount(badge[1]);

  return null;
}

export function parseBestsellerStatus(html: string): string | null {
  const statusKey = BESTSELLER_STATUS_KEY.exec(html);
  if (statusKey) return statusKey[1];
  return BESTSELLER_FLAG.test(html) ? "bestseller" : null;
}

export function parseProfileHtml(html: string): ParsedProfile {
  return {
    name: null,
    subscriberCount: parseSubscriberCount(html),
    bestsellerStatus: parseBestsellerStatus(html),
  };
}
