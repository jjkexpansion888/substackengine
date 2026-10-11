import { discoverPublicRadar } from "@/lib/substack/publicRadar";
import { jsonError } from "@/lib/api/errorMapping";
import { parseSubscriberImport } from "@/lib/substack/subscriberRanking";

export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  let body: { domain?: unknown; subscriberImport?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: { code: "invalid_input", message: "Enter a publication domain." } }, { status: 400 }); }
  if (!body || typeof body.domain !== "string") return Response.json({ error: { code: "invalid_input", message: "Enter a publication domain." } }, { status: 400 });
  try {
    const subscriberImport = body.subscriberImport === undefined ? undefined : parseSubscriberImport(body.subscriberImport);
    return Response.json({ radar: await discoverPublicRadar(body.domain, undefined, subscriberImport) });
  } catch (error) { return jsonError(error); }
}
