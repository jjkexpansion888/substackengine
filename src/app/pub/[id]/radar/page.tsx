import { buildRankedPage } from "@/lib/rank/query";
import { prisma } from "@/lib/db/prisma";
import { loadRadarViewData } from "@/lib/store/radarStore";
import { RadarView } from "@/components/radar/RadarView";
import {
  countExactAudience,
  lastSyncedLabel as computeLastSyncedLabel,
  parseRadarQueryOrFallback,
  runSummaryLabel,
  toRadarRowView,
} from "@/lib/radar/view";
import { SyncButton } from "./SyncButton";

/**
 * The radar page — server-rendered ranked table (spec: data fetching lives in
 * the page; components take props). Reads the store directly and reuses the
 * API route's rank/sort/pagination logic, so ranks here are the API's ranks.
 * DB-backed, so never statically prerendered.
 */
export const dynamic = "force-dynamic";

type RadarPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") out.set(key, value);
    else if (Array.isArray(value)) value.forEach((entry) => out.append(key, entry));
  }
  return out;
}

export default async function RadarPage({ params, searchParams }: RadarPageProps) {
  const { id } = await params;
  const data = await loadRadarViewData({ prisma }, id);
  const { query, notice } = parseRadarQueryOrFallback(toSearchParams(await searchParams));

  if (data === null) {
    return <RadarView publication={null} />;
  }

  const ranked = buildRankedPage(data.rows, query);
  const lastSynced = computeLastSyncedLabel(data.rows, data.latestRun);

  return (
    <RadarView
      publication={data.publication}
      lastSyncedLabel={lastSynced}
      runSummary={data.latestRun ? runSummaryLabel(data.latestRun) : null}
      rows={ranked.items.map(toRadarRowView)}
      total={ranked.total}
      exactCount={countExactAudience(data.rows)}
      query={query}
      baseUrl={`/pub/${id}/radar`}
      syncSlot={
        <>
          {notice !== null && (
            <p role="note" data-testid="query-notice" className="mb-2 text-sm opacity-70">
              {notice}
            </p>
          )}
          <SyncButton publicationId={id} knownTotal={data.rows.length} lastSyncedLabel={lastSynced} />
        </>
      }
    />
  );
}
