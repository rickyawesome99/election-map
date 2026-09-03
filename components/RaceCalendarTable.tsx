import CandidateLink from "@/components/CandidateLink";
import { fmtMargin } from "@/lib/colorScale";
import type { CalendarRace } from "@/data/raceCalendar";
import { RACE_KIND_LABEL, raceHref } from "@/lib/raceCalendarQuery";

const COLUMNS: { label: string; right?: true }[] = [
  { label: "Year" },
  { label: "Office" },
  { label: "Seat" },
  { label: "Type" },
  { label: "Democratic" },
  { label: "Votes", right: true },
  { label: "Share", right: true },
  { label: "Republican" },
  { label: "Votes", right: true },
  { label: "Share", right: true },
  { label: "Total Votes", right: true },
  { label: "Margin", right: true },
  { label: "Vote Margin", right: true },
];

const num = (v: number | null) => (v == null ? "—" : v.toLocaleString());

/** Which party's colour a margin takes. Margins are Republican-minus-Democratic. */
const leanOf = (margin: number) => (Math.abs(margin) < 0.05 ? "none" : margin > 0 ? "R" : "D");

/** The candidate on one ballot line. A top-two or all-Republican runoff can put a candidate
 *  from another party in the opposing slot, so the party they actually ran under colours the
 *  name — and gets spelled out when it isn't the party of the column. */
function CandidateCell({ name, party, slot }: { name: string; party: string; slot: "D" | "R" }) {
  if (!name) return <span className="none">No candidate</span>;
  // The colour is carried by the wrapper, not the link: CandidateLink forwards only the props
  // it declares, so a data attribute set on it would be dropped.
  return (
    <span className="cal-party whitespace-nowrap" data-party={party}>
      <CandidateLink name={name} className="text-sm font-semibold hover:underline" />
      {party !== slot && <span className="ml-1 text-[10px] font-bold">({party})</span>}
    </span>
  );
}

function TypeCell({ race }: { race: CalendarRace }) {
  if (race.raceClass !== "Special" && !race.runoff) return <span className="plain">Regular</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {race.raceClass === "Special" && (
        <span className="cal-chip" data-chip="special" title="Special election to fill a vacancy">Special</span>
      )}
      {race.runoff && (
        <span
          className="cal-chip"
          data-chip="runoff"
          title="Decided in a runoff — the figures shown are the runoff result, not the first round"
        >
          Runoff
        </span>
      )}
    </span>
  );
}

export default function RaceCalendarTable({ races }: { races: CalendarRace[] }) {
  if (races.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm font-semibold" style={{ color: "var(--app-text-muted)" }}>
          No races match these filters.
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          Every row is a race that was actually held — a state with no election that year has nothing to show.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="cal-table">
          <thead>
            <tr>
              {COLUMNS.map((column, i) => (
                <th key={`${column.label}-${i}`} className={column.right ? "r" : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {races.map((race) => {
              const href = raceHref(race);
              const lean = leanOf(race.margin);
              return (
                <tr key={race.id}>
                  <td className="yr">{race.year}</td>
                  <td>
                    <span className="cal-badge" data-kind={race.kind} title={RACE_KIND_LABEL[race.kind]}>
                      {race.kind}
                    </span>
                  </td>
                  <td className="seat">
                    <span className="abbr">{race.state}</span>
                    <span className="name">
                      {href ? <a href={href} className="hover:underline">{race.seat}</a> : race.seat}
                    </span>
                  </td>
                  <td><TypeCell race={race} /></td>
                  <td><CandidateCell name={race.demName} party={race.demParty} slot="D" /></td>
                  <td className="r">{num(race.demVotes)}</td>
                  {/* Coloured by the party the candidate actually ran under, not by the column:
                      a top-two race can put two Democrats, or two Republicans, on both lines. */}
                  <td className="r cal-party cal-pct" data-party={race.demParty}>{race.demPct.toFixed(1)}%</td>
                  <td><CandidateCell name={race.repName} party={race.repParty} slot="R" /></td>
                  <td className="r">{num(race.repVotes)}</td>
                  <td className="r cal-party cal-pct" data-party={race.repParty}>{race.repPct.toFixed(1)}%</td>
                  <td className="r">{num(race.totalVotes)}</td>
                  <td className="r cal-party cal-pct" data-party={lean}>{fmtMargin(race.margin)}</td>
                  <td className="r cal-party" data-party={lean}>
                    {race.voteMargin == null ? "—" : Math.abs(race.voteMargin).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
