import { loadRadar, removeSavedRadar, saveRadar } from "@/lib/substack/savedRadar";
import { isLocalRequest } from "@/lib/api/localRequest";

export const runtime = "nodejs";
const allowed = isLocalRequest;
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  if (!allowed(request)) return Response.json({ error: "Saved scans are available only in the local app." }, { status: 403 });
  try { return Response.json({ snapshot: await loadRadar(new URL(request.url).searchParams.get("domain") ?? "") }, { headers }); }
  catch { return Response.json({ error: "Could not read the saved scan." }, { status: 400, headers }); }
}

export async function POST(request: Request): Promise<Response> {
  if (!allowed(request, true)) return Response.json({ error: "Save scans from the local app." }, { status: 403 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("No scan sent.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8 * 1024 * 1024) { await reader.cancel(); return Response.json({ error: "Saved scan exceeds 8 MB." }, { status: 413 }); }
      chunks.push(value);
    }
    await saveRadar(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    return Response.json({ saved: true }, { headers });
  } catch { return Response.json({ error: "Could not save this scan locally." }, { status: 400, headers }); }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!allowed(request, true)) return Response.json({ error: "Remove saved scans from the local app." }, { status: 403 });
  try {
    await removeSavedRadar(new URL(request.url).searchParams.get("domain") ?? "");
    return Response.json({ removed: true }, { headers });
  } catch { return Response.json({ error: "Could not remove the saved scan." }, { status: 400, headers }); }
}
