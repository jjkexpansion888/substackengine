import { isSharedDeployment } from "@/lib/api/privateDeployment";

export async function GET() {
  return Response.json({ storage: isSharedDeployment() ? "browser" : "server" }, { headers: { "Cache-Control": "no-store" } });
}
