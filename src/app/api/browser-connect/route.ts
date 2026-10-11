import { claimBrowserHandoff, stageBrowserHandoff } from "@/lib/substack/browserHandoff";
import { cachedPublicAudience, rememberPublicAudience } from "@/lib/substack/publicAudienceCache";
import type { ProfileIdentity } from "@/lib/substack/publicAudience";

export const runtime = "nodejs";
const localOrigin = "http://localhost:3000";
const extensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/;
const localRequest = (request: Request) => request.headers.get("host") === "localhost:3000";
const connectorRequest = (request: Request) => {
  const origin = request.headers.get("origin");
  const id = request.headers.get("x-substack-connector") ?? "";
  // Privileged extension fetches can omit Origin; ordinary cross-site web requests cannot.
  return /^[a-p]{32}$/.test(id) && (origin ? origin === `chrome-extension://${id}` : !request.headers.has("sec-fetch-site") || request.headers.get("sec-fetch-site") === "none");
};
const cors = (request: Request): Record<string, string> => ({ "Cache-Control": "no-store", Vary: "Origin", ...(extensionOrigin.test(request.headers.get("origin") ?? "") ? { "Access-Control-Allow-Origin": request.headers.get("origin")! } : {}) });

export function OPTIONS(request: Request): Response {
  if (!localRequest(request) || !extensionOrigin.test(request.headers.get("origin") ?? "")) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: { ...cors(request), "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type, X-Substack-Connector", "Access-Control-Max-Age": "600" } });
}

export async function POST(request: Request): Promise<Response> {
  const sameOrigin = request.headers.get("origin") === localOrigin && request.headers.get("sec-fetch-site") !== "cross-site";
  if (!localRequest(request) || (!connectorRequest(request) && !sameOrigin)) return Response.json({ error: "Use the Chrome connector to sync your owner list." }, { status: 403 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("No subscriber roster was sent.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4 * 1024 * 1024) { await reader.cancel(); return Response.json({ error: "Subscriber sync exceeds 4 MB." }, { status: 413, headers: cors(request) }); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body.action === "audience-cache") {
      if (!Array.isArray(body.profiles ?? []) || !Array.isArray(body.identities ?? []) || (body.profiles?.length ?? 0) > 10000 || (body.identities?.length ?? 0) > 10000) throw new Error("Invalid public profile batch.");
      for (const profile of body.profiles ?? []) rememberPublicAudience(profile);
      const profiles = (body.identities ?? []).flatMap((identity: ProfileIdentity) => {
        if (!identity || typeof identity !== "object" || (identity.id !== undefined && (typeof identity.id !== "string" || !/^\d{1,30}$/.test(identity.id))) || (identity.handle != null && (typeof identity.handle !== "string" || !/^[a-z0-9_-]{1,100}$/i.test(identity.handle)))) return [];
        const cached = cachedPublicAudience(identity);
        return cached ? [cached] : [];
      });
      return Response.json({ profiles }, { headers: cors(request) });
    }
    if (!connectorRequest(request)) return Response.json({ error: "Owner sync requires the Chrome connector." }, { status: 403 });
    const token = stageBrowserHandoff(body);
    return Response.json({ url: `${localOrigin}/connect?browserSync=${token}` }, { headers: cors(request) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not receive subscriber sync." }, { status: 400, headers: cors(request) });
  }
}

export function GET(request: Request): Response {
  const origin = request.headers.get("origin");
  if (!localRequest(request) || (origin && origin !== localOrigin)) return Response.json({ error: "Open this sync in the local app." }, { status: 403 });
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const packet = /^[a-f0-9]{64}$/.test(token) ? claimBrowserHandoff(token) : null;
  if (!packet) return Response.json({ error: "This sync expired or was already opened. Sync again from the Chrome connector." }, { status: 410, headers: { "Cache-Control": "no-store" } });
  return Response.json({ packet }, { headers: { "Cache-Control": "no-store" } });
}
