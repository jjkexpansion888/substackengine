import { jsonError } from "@/lib/api/errorMapping";
import {
  buildRankedPage,
  parseSubscribersQuery,
  toRankedJson,
} from "@/lib/rank/query";
import { loadSubscriberRows } from "@/lib/store/radarStore";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/publications/[id]/subscribers — the ranked radar list.
 *
 * Query: sort=rank|audience|subscribedAt|name (default rank), order=asc|desc
 * (per-key default), offset>=0 (default 0), limit 1..200 (default 50).
 * Ranks are the ladder's, assigned over the whole set before paging, so they
 * are stable across pages and view sorts.
 *
 * Headers: X-Total-Count, and a Link rel="next" while more pages remain.
 * Errors: structured { error: { code, message } } — 400 invalid_input for
 * bad query params, 404 not_found for an unknown publication.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const query = parseSubscribersQuery(new URL(request.url).searchParams);

    const rows = await loadSubscriberRows({ prisma }, id);
    if (rows === null) {
      return Response.json(
        { error: { code: "not_found", message: "Unknown publication. Connect it first." } },
        { status: 404 },
      );
    }

    const page = buildRankedPage(rows, query);
    const headers = new Headers({ "X-Total-Count": String(page.total) });
    const nextOffset = query.offset + query.limit;
    if (nextOffset < page.total) {
      const nextUrl = new URL(request.url);
      nextUrl.searchParams.set("offset", String(nextOffset));
      headers.set("Link", `<${nextUrl}>; rel="next"`);
    }

    return Response.json(
      {
        publicationId: id,
        total: page.total,
        offset: query.offset,
        limit: query.limit,
        sort: query.sort,
        order: query.order,
        subscribers: page.items.map(toRankedJson),
      },
      { headers },
    );
  } catch (error) {
    return jsonError(error);
  }
}
