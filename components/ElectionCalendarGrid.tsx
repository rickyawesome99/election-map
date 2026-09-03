import { electionSlots, raceCalendarYears, type ElectionSlot, type RaceKind } from "@/data/raceCalendar";
import { fmtMargin } from "@/lib/colorScale";
import { RACE_KIND_LABEL, filterHref, type RaceCalendarFilter } from "@/lib/raceCalendarQuery";

/** What a badge says on hover. A House delegation has no single margin, so it reports the
 *  seats each party won instead. Emitted as data attributes for CalendarHoverCard to read —
 *  one delegated listener rather than a tooltip element per badge. */
function slotTip(slot: ElectionSlot, year: number, stateName: string) {
  let result = "";
  let lean = "";

  if (slot.seats) {
    const { d, r, o } = slot.seats;
    result = `${d}D–${r}R${o > 0 ? `–${o}I` : ""}`;
    lean = d === r ? "" : d > r ? "D" : "R";
  } else if (slot.margin != null) {
    result = fmtMargin(slot.margin);
    lean = Math.abs(slot.margin) < 0.05 ? "" : slot.margin > 0 ? "R" : "D";
  }

  const notes: string[] = [];
  if (slot.seats) notes.push(`${slot.count} seats contested`);
  // Maine and Nebraska split their electoral votes, so the margin above is the statewide one.
  if (slot.kind === "P" && slot.count > 1) notes.push(`Statewide + ${slot.count - 1} district votes`);
  if (slot.raceClass === "Special") notes.push("Special election");
  // Only some of a delegation's seats go to a runoff, so say so as "includes" there.
  if (slot.runoff) notes.push(slot.count > 1 ? "Includes a runoff" : "Decided in a runoff");

  return {
    "data-tip-head": `${stateName} ${year}`,
    "data-tip-office": RACE_KIND_LABEL[slot.kind],
    "data-tip-result": result,
    "data-tip-note": notes.join(" · "),
    "data-tip-lean": lean || undefined,
  };
}

/** One office on one state's ballot in one year: its letter — P/S/G/H — tinted by office,
 *  carrying the seat count for a House delegation and a degree mark for a runoff. Styling is
 *  in globals.css (.cal-badge); the grid draws roughly 1,500 of these. */
function SlotBadge({ slot, tip }: { slot: ElectionSlot; tip?: Record<string, string | undefined> }) {
  return (
    <span
      className="cal-badge"
      data-kind={slot.kind}
      data-special={slot.raceClass === "Special" ? "" : undefined}
      {...tip}
    >
      {slot.kind}
      {slot.count > 1 && <span className="count">{slot.count}</span>}
      {slot.runoff && <span className="runoff">&deg;</span>}
    </span>
  );
}

export default function ElectionCalendarGrid({
  filter,
  states,
}: {
  filter: RaceCalendarFilter;
  states: { abbr: string; name: string }[];
}) {
  const years = [...raceCalendarYears].sort((a, b) => a - b);

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
            {states.map((state) => {
              const byYear = electionSlots[state.abbr] ?? {};
              return (
                <tr key={state.abbr}>
                  <th className="state">
                    <a
                      href={filterHref(filter, { state: state.abbr, year: "all" })}
                      className="abbr hover:underline"
                      data-jump
                    >
                      {state.abbr}
                    </a>
                    <span className="full">{state.name}</span>
                  </th>
                  {years.map((year) => {
                    const slots = byYear[year] ?? [];
                    return (
                      <td key={year}>
                        {slots.length === 0 ? (
                          <span
                            className="empty"
                            data-tip-head={`${state.name} ${year}`}
                            data-tip-result="No election"
                          >
                            &middot;
                          </span>
                        ) : (
                          <a
                            href={filterHref(filter, { state: state.abbr, year: String(year) })}
                            className="slots"
                            data-jump
                          >
                            {slots.map((slot) => (
                              <SlotBadge
                                key={`${slot.kind}-${slot.raceClass}`}
                                slot={slot}
                                tip={slotTip(slot, year, state.name)}
                              />
                            ))}
                          </a>
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
        {(Object.keys(RACE_KIND_LABEL) as RaceKind[]).map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <SlotBadge slot={{ kind, raceClass: "Regular", count: 1, runoff: false, margin: null, seats: null }} />
            {RACE_KIND_LABEL[kind]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <SlotBadge slot={{ kind: "S", raceClass: "Special", count: 1, runoff: false, margin: null, seats: null }} />
          Special election
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SlotBadge slot={{ kind: "H", raceClass: "Regular", count: 7, runoff: true, margin: null, seats: null }} />
          Seats contested &middot; &deg; went to a runoff
        </span>
        <span style={{ color: "var(--app-text-very-muted)" }}>Hover a badge for the result &middot; select to filter the table below</span>
      </div>
    </div>
  );
}
