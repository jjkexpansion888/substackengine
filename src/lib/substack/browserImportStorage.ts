import { parseSubscriberImport, type SubscriberImport } from "./subscriberRanking";

const prefix = "substack-radar:public-import:v1:";

export function readSubscriberImport(domain: string, storage?: Pick<Storage, "getItem">): SubscriberImport | undefined {
  try {
    const value = storage?.getItem(prefix + domain);
    if (!value || value.length > 500000) return undefined;
    const packet = parseSubscriberImport(JSON.parse(value));
    return packet.version === 1 ? packet : undefined;
  } catch { return undefined; }
}

export function saveSubscriberImport(domain: string, packet: SubscriberImport, storage?: Pick<Storage, "setItem">): void {
  if (packet.version !== 1) return;
  try { storage?.setItem(prefix + domain, JSON.stringify(parseSubscriberImport(packet))); } catch { /* Imports remain usable in memory when browser storage is unavailable. */ }
}

export function removeSubscriberImport(domain: string, storage?: Pick<Storage, "removeItem">): void {
  try { storage?.removeItem(prefix + domain); } catch { /* Browser storage may be disabled. */ }
}
