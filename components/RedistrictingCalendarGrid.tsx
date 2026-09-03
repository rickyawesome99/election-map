import {
  REDISTRICT_LABEL,
  redistrictTip,
  redistrictingByState,
  redistrictingStates,
  redistrictingYears,
  type RedistrictEvent,
  type RedistrictKind,
} from "@/lib/redistrictingCalendar";

function EventBadge({ kind, tip }: { kind: RedistrictKind; tip?: Record<string, string | undefined> }) {
  return (
    <span className="cal-badge" data-kind={kind} {...tip}>
      {kind}
    </span>
  );
}

/** A reference grid, not a control: unlike the Election Calendar above it, nothing here is a
 *  link. A redraw is a fact about the map rather than a filter over the results table, and
 *  clicking one should not throw the reader down the page. The detail is on hover instead. */
export default function RedistrictingCalendarGrid() {
  const years = redistrictingYears;

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="cal-grid">
          <thead>
            <tr>
              <th className="state">State</th>
              {years.map((year) => (
                <th key={year} className="year">{year}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {redistrictingStates.map((state) => {
              const byYear = redistrictingByState[state.abbr] ?? {};
              return (
                <tr key={state.abbr}>
                  <th className="state">
                    <span className="abbr">{state.abbr}</span>
                    <span className="full">{state.name}</span>
                  </th>
                  {years.map((year) => {
                    const events: RedistrictEvent[] = byYear[year] ?? [];
                    return (
                      <td key={year}>
                        {events.length === 0 ? (
                          <span
                            className="empty"
                            data-tip-head={`${state.name} ${year}`}
                            data-tip-result="No redraw"
                          >
                            &middot;
                          </span>
                        ) : (
                          <span className="slots">
                            {events.map((event) => (
                              <EventBadge
                                key={event.kind}
                                kind={event.kind}
                                tip={redistrictTip(event, state.name)}
                              />
                            ))}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs" style={{ color: "var(--app-text-muted)" }}>
        {(Object.keys(REDISTRICT_LABEL) as RedistrictKind[]).map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <EventBadge kind={kind} />
            {REDISTRICT_LABEL[kind]}
          </span>
        ))}
        <span style={{ color: "var(--app-text-very-muted)" }}>
          Marked in the first election year the new lines were used &middot; hover for the enacting source
        </span>
      </div>
    </div>
  );
}
