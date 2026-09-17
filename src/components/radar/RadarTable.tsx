import type { SortOrder, SubscribersQuery, SubscribersSortKey } from "@/lib/rank/query";
import { buildRadarHref, nextSortOrder, type RadarRowView } from "@/lib/radar/view";

/**
 * The ranked radar table — presentational, props only (spec convention:
 * plain semantic table, Tailwind defaults, no component library).
 *
 * Sort controls are the column headers, links that re-render the page
 * server-side; the rank column never renumbers — alternate sorts reorder the
 * view but keep each row's ladder-assigned rank visible.
 */

const ACTIVE_SORT: Record<SortOrder, string> = { asc: "▲", desc: "▼" };

function subscriberName(row: RadarRowView): string {
  return row.displayName ?? (row.handle ? `@${row.handle}` : "Unknown subscriber");
}

function SortHeaderLink({
  column,
  label,
  query,
  baseUrl,
}: {
  column: SubscribersSortKey;
  label: string;
  query: SubscribersQuery;
  baseUrl: string;
}) {
  const active = query.sort === column;
  const nextOrder = nextSortOrder(column, query);
  return (
    <a
      href={buildRadarHref(baseUrl, query, { sort: column, order: nextOrder, offset: 0 })}
      aria-label={`Sort by ${label.toLowerCase()}, ${nextOrder === "asc" ? "ascending" : "descending"}`}
      className="hover:underline underline-offset-2"
    >
      {label}
      {active && (
        <span aria-hidden="true" data-testid={`sort-indicator-${column}`}>
          {" "}
          {ACTIVE_SORT[query.order]}
        </span>
      )}
    </a>
  );
}

export function Pagination({
  baseUrl,
  query,
  total,
  pageLength,
}: {
  baseUrl: string;
  query: SubscribersQuery;
  total: number;
  pageLength: number;
}) {
  const hasPrev = query.offset > 0;
  const hasNext = query.offset + query.limit < total;
  const from = total === 0 ? 0 : query.offset + 1;
  const to = query.offset + pageLength;
  return (
    <nav aria-label="Pagination" data-testid="pagination" className="mt-3 flex items-center gap-3 text-sm">
      {hasPrev ? (
        <a
          href={buildRadarHref(baseUrl, query, { offset: Math.max(0, query.offset - query.limit) })}
          data-testid="pagination-prev"
          className="underline underline-offset-2"
        >
          Previous
        </a>
      ) : (
        <span aria-disabled="true" className="opacity-40" data-testid="pagination-prev">
          Previous
        </span>
      )}
      <span className="opacity-70">
        Subscribers {from}&ndash;{to} of {total}
      </span>
      {hasNext ? (
        <a
          href={buildRadarHref(baseUrl, query, { offset: query.offset + query.limit })}
          data-testid="pagination-next"
          className="underline underline-offset-2"
        >
          Next
        </a>
      ) : (
        <span aria-disabled="true" className="opacity-40" data-testid="pagination-next">
          Next
        </span>
      )}
    </nav>
  );
}

export function RadarTable({
  rows,
  query,
  baseUrl,
  total,
}: {
  rows: RadarRowView[];
  query: SubscribersQuery;
  baseUrl: string;
  /** Full ranked-set size — pagination is computed against it, not the page. */
  total: number;
}) {
  const ariaSortFor = (column: SubscribersSortKey): "ascending" | "descending" | undefined => {
    if (query.sort !== column) return undefined;
    return query.order === "asc" ? "ascending" : "descending";
  };

  return (
    <>
      <table data-testid="radar-table" className="w-full border-collapse text-sm">
        <caption className="sr-only">Subscribers ranked by their own audience size</caption>
        <thead>
          <tr className="border-b border-foreground/20 text-left">
            <th scope="col" aria-sort={ariaSortFor("rank")} className="py-2 pr-4 font-medium text-center">
              <SortHeaderLink column="rank" label="Rank" query={query} baseUrl={baseUrl} />
            </th>
            <th scope="col" aria-sort={ariaSortFor("name")} className="py-2 pr-4 font-medium">
              <SortHeaderLink column="name" label="Name" query={query} baseUrl={baseUrl} />
            </th>
            <th scope="col" aria-sort={ariaSortFor("audience")} className="py-2 pr-4 font-medium">
              <SortHeaderLink column="audience" label="Audience" query={query} baseUrl={baseUrl} />
            </th>
            <th scope="col" aria-sort={ariaSortFor("subscribedAt")} className="py-2 pr-4 font-medium">
              <SortHeaderLink column="subscribedAt" label="Subscribed" query={query} baseUrl={baseUrl} />
            </th>
            <th scope="col" className="py-2 font-medium">As of</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.subscriberId} data-testid="radar-row" className="border-b border-foreground/10">
              <td data-testid="cell-rank" className="py-2 pr-4 text-center tabular-nums">
                {row.rank}
              </td>
              <td data-testid="cell-name" className="py-2 pr-4">
                {row.profileUrl ? (
                  <a
                    href={row.profileUrl}
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {subscriberName(row)}
                  </a>
                ) : (
                  <span>{subscriberName(row)}</span>
                )}
                {row.handle !== null && (
                  <span className="ml-2 text-xs opacity-60">@{row.handle}</span>
                )}
              </td>
              <td data-testid="cell-audience" className="py-2 pr-4 tabular-nums">
                {row.audienceLabel}
                {row.badgeLabel !== null && (
                  <span
                    data-testid="audience-badge"
                    className="ml-2 rounded border border-foreground/20 px-1.5 py-0.5 text-xs opacity-80"
                  >
                    {row.badgeLabel}
                  </span>
                )}
              </td>
              <td data-testid="cell-subscribed" className="py-2 pr-4 tabular-nums">
                {row.subscribedLabel ?? "unknown"}
              </td>
              <td data-testid="cell-asof" className="py-2 tabular-nums">
                {row.asOfLabel ?? "not synced yet"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination baseUrl={baseUrl} query={query} total={total} pageLength={rows.length} />
    </>
  );
}
