import { cachedPublicAudience } from "@/lib/substack/publicAudienceCache";
import type { ProfileIdentity } from "@/lib/substack/publicAudience";
import { isLocalRequest } from "@/lib/api/localRequest";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!await isLocalRequest(request, true)) return Response.json({ error: "Use the trusted workspace." }, { status: 403 });
  try {
    const body = await request.json();
    if (!Array.isArray(body.identities) || body.identities.length > 10000) throw new Error("Invalid profile batch.");
    const profiles = body.identities.flatMap((identity: ProfileIdentity) => {
      if (!identity || typeof identity !== "object" || (identity.id !== undefined && (typeof identity.id !== "string" || !/^\d{1,30}$/.test(identity.id))) || (identity.handle != null && (typeof identity.handle !== "string" || !/^[a-z0-9_-]{1,100}$/i.test(identity.handle)))) return [];
      const cached = cachedPublicAudience(identity);
      return cached ? [cached] : [];
    });
    return Response.json({ profiles }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Invalid profile batch." }, { status: 400 }); }
}
