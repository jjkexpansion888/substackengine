export function GET() {
  return Response.json({ error: "Browser sync has been removed. Import a subscriber CSV in Radar instead." }, { status: 410 });
}

export const POST = GET;
export const OPTIONS = GET;
