import Papa from "papaparse";
import { parseSubscriberImport, type SubscriberImport } from "./subscriberRanking";

export function parseSubscriberCsv(text: string, domain: string) {
  if (text.length > 5_000_000) throw new Error("Choose a CSV smaller than 5 MB.");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true, skipEmptyLines: "greedy", dynamicTyping: false,
    transformHeader: value => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
  });
  const errors = parsed.errors.filter(error => error.code !== "UndetectableDelimiter");
  if (errors.length) throw new Error(`CSV could not be read: ${errors[0].message}`);
  if (!parsed.data.length || parsed.data.length > 10000) throw new Error("Choose a CSV with 1 to 10,000 subscriber rows.");
  const fields = parsed.meta.fields ?? [];
  const known = ["email", "email_address", "name", "full_name", "subscriber_name", "user_id", "substack_user_id", "handle", "user_handle", "profile_url", "user_profile_url", "substack_profile", "substack_profile_url"];
  if (!fields.some(field => known.includes(field))) throw new Error("CSV needs an email, name, Substack user ID, handle, or profile URL column.");
  const subscribers: SubscriberImport["subscribers"] = [];
  const ids = new Map<string, SubscriberImport["subscribers"][number]>();
  const handles = new Map<string, SubscriberImport["subscribers"][number]>();
  const emails = new Map<string, SubscriberImport["subscribers"][number]>();
  let duplicates = 0;
  let invalidIdentities = 0;
  parsed.data.forEach((row, index) => {
    const value = (...keys: string[]) => keys.map(key => row[key]?.trim()).find(Boolean) ?? "";
    let id = value("substack_user_id", "user_id");
    let handle = value("handle", "user_handle").replace(/^@/, "").toLowerCase();
    const profile = value("profile_url", "user_profile_url", "substack_profile_url", "substack_profile");
    if (profile) {
      try {
        const url = new URL(profile);
        const match = /^\/(?:@([a-z0-9_-]{1,100})|profile\/(\d{1,30}))\/?$/i.exec(url.pathname);
        if (url.protocol !== "https:" || url.hostname !== "substack.com" || url.port || url.username || url.password || !match) throw new Error();
        if (match[1]) {
          if (handle && handle !== match[1].toLowerCase()) throw new Error(`Conflicting identities in row ${index + 2}.`);
          handle = match[1].toLowerCase();
        }
        if (match[2]) {
          if (id && id !== match[2]) throw new Error(`Conflicting identities in row ${index + 2}.`);
          id = match[2];
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Conflicting")) throw error;
        invalidIdentities++;
        id = ""; handle = "";
      }
    }
    if (id && !/^\d{1,30}$/.test(id) || handle && !/^[a-z0-9_-]{1,100}$/i.test(handle)) {
      invalidIdentities++; id = ""; handle = "";
    }
    const email = value("email", "email_address").toLowerCase();
    const name = value("name", "subscriber_name", "full_name");
    const subscriber = { id: id || (!handle ? `csv:${index + 1}` : undefined), handle: handle || null,
      name: name && !name.includes("@") ? name.slice(0, 300) : handle || `Imported subscriber ${index + 1}` };
    const candidates = [id ? ids.get(id) : undefined, handle ? handles.get(handle) : undefined, email ? emails.get(email) : undefined].filter(Boolean);
    if (new Set(candidates).size > 1) throw new Error(`Conflicting identities in row ${index + 2}. Check duplicate subscriber rows.`);
    const previous = candidates[0];
    if (previous) {
      if (id && previous.id && /^\d+$/.test(previous.id) && previous.id !== id || handle && previous.handle && previous.handle !== handle) throw new Error(`Conflicting identities in row ${index + 2}. Check duplicate subscriber rows.`);
      if (id) previous.id = id;
      if (handle) previous.handle = handle;
      if (id) ids.set(id, previous);
      if (handle) handles.set(handle, previous);
      if (email) emails.set(email, previous);
      duplicates++; return;
    }
    subscribers.push(subscriber);
    if (id) ids.set(id, subscriber);
    if (handle) handles.set(handle, subscriber);
    if (email) emails.set(email, subscriber);
  });
  const packet = parseSubscriberImport({ version: 3, sourceUrl: `https://${domain}/publish/subscribers`, capturedAt: new Date().toISOString(), subscribers, totalCount: subscribers.length, rowsRead: parsed.data.length });
  return { packet, duplicates, invalidIdentities, identifiable: subscribers.filter(row => row.handle || /^\d+$/.test(row.id ?? "")).length, unresolved: subscribers.filter(row => !row.handle && !/^\d+$/.test(row.id ?? "")).length };
}
