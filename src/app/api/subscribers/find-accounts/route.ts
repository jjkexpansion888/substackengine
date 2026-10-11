import { findAccountCandidates, type AccountSearchResult } from "@/lib/substack/accountCandidates";
import { RateLimitedError, PublicAccessRequiredError, UpstreamChangeError } from "@/lib/substack/errors";
import { isLocalRequest } from "@/lib/api/localRequest";
export const maxDuration = 90;

export async function POST(request: Request) {
  if (!isLocalRequest(request, true)) return Response.json({ error: "Use the local app." }, { status: 403 });
  let body: { subscribers?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid names." }, { status: 400 }); }
  const rows = body?.subscribers;
  if (!Array.isArray(rows) || !rows.length || rows.length > 5 || !rows.every(row => row && typeof row.id === "string" && /^csv:\d{1,5}$/.test(row.id) && typeof row.name === "string" && row.name.trim().length >= 2 && row.name.length <= 150 && !row.name.includes("@") && !/^Imported subscriber \d+$/.test(row.name))) return Response.json({ error: "Choose 1 to 5 named unresolved subscribers." }, { status: 400 });
  const deadline = Date.now() + 65000;
  const results: AccountSearchResult[] = [];
  let stopped = false;
  let reason: string | null = null;
  let retryAfterMs: number | null = null;
  for (const row of rows) {
    if (stopped || Date.now() > deadline) { stopped = true; reason ??= "Time limit reached; resume the remaining names."; results.push({ id: row.id, name: row.name, status: "unattempted", candidates: [] }); continue; }
    try {
      const candidates = (await findAccountCandidates(row.name.trim(), undefined, undefined, deadline, false)).filter(candidate => candidate.score === 1);
      results.push({ id: row.id, name: row.name, status: candidates.length ? "found" : "no_matches", candidates });
    } catch (error) {
      results.push({ id: row.id, name: row.name, status: "unavailable", candidates: [] });
      if (error instanceof RateLimitedError) { stopped = true; retryAfterMs = 60000; reason = "Public profile search is rate limited. Waiting before resuming."; }
      else if (error instanceof PublicAccessRequiredError) { stopped = true; reason = "Substack requires browser access for public profile search. Progress is saved."; }
      else if (Date.now() > deadline) { stopped = true; retryAfterMs = 1000; reason = "Search batch time limit reached. Resuming remaining names."; }
      else if (error instanceof UpstreamChangeError) reason ??= error.message;
      else reason ??= "Some public profile searches are temporarily unavailable.";
    }
  }
  return Response.json({ results, stopped, reason, retryAfterMs }, { headers: { "Cache-Control": "no-store" } });
}
