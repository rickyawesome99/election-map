import { filterHref, pageCount, type RaceCalendarFilter } from "@/lib/raceCalendarQuery";

/** Page numbers to show. Always the first and last, always the neighbours of the current
 *  page, and a gap marker for whatever that skips — so the pager stays one line wide however
 *  many pages a filter produces. */
function pageWindow(current: number, last: number): (number | "gap")[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);

  const wanted = new Set([1, last, current, current - 1, current + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);

  const out: (number | "gap")[] = [];
  pages.forEach((page, i) => {
    if (i > 0 && page - pages[i - 1] > 1) out.push("gap");
    out.push(page);
  });
  return out;
}

export default function RaceCalendarPagination({
  filter,
  page,
  matching,
  from,
  to,
}: {
  filter: RaceCalendarFilter;
  page: number;
  matching: number;
  from: number;
  to: number;
}) {
  const last = pageCount(matching);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-5">
      <p className="text-xs tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>
        Showing {from.toLocaleString()}&ndash;{to.toLocaleString()} of {matching.toLocaleString()} race{matching === 1 ? "" : "s"}
        {last > 1 && <> &middot; page {page} of {last}</>}
      </p>

      {last > 1 && (
        <nav className="cal-pager" aria-label="Race Calendar pages">
          {page > 1 ? (
            <a href={filterHref(filter, { page: page - 1 })} data-jump rel="prev" aria-label="Previous page">&larr;</a>
          ) : (
            <span className="step" aria-hidden="true">&larr;</span>
          )}

          {pageWindow(page, last).map((entry, i) =>
            entry === "gap" ? (
              <span key={`gap-${i}`} className="gap" aria-hidden="true">&hellip;</span>
            ) : (
              <a
                key={entry}
                href={filterHref(filter, { page: entry })}
                data-jump
                aria-current={entry === page ? "page" : undefined}
                aria-label={`Page ${entry}`}
              >
                {entry}
              </a>
            )
          )}

          {page < last ? (
            <a href={filterHref(filter, { page: page + 1 })} data-jump rel="next" aria-label="Next page">&rarr;</a>
          ) : (
            <span className="step" aria-hidden="true">&rarr;</span>
          )}
        </nav>
      )}
    </div>
  );
}
