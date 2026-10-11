import { discoverCollaborators, parseDiscoveryInput } from "@/lib/collaboration/discovery";
import { jsonError } from "@/lib/api/errorMapping";

export const maxDuration = 90;
export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await request.text();
    if (raw.length > 200000) return Response.json({ error: { message: "Collaboration input is too large." } }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: { message: "Choose a valid publication." } }, { status: 400 }); }
    return Response.json(await discoverCollaborators(parseDiscoveryInput(body)));
  } catch (error) { return jsonError(error); }
}
