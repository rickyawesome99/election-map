import CalendarHoverCard from "@/components/CalendarHoverCard";
import CalendarJumpLinks from "@/components/CalendarJumpLinks";
import ElectionCalendarGrid from "@/components/ElectionCalendarGrid";
import RaceCalendarFilters from "@/components/RaceCalendarFilters";
import RaceCalendarPagination from "@/components/RaceCalendarPagination";
import RaceCalendarTable from "@/components/RaceCalendarTable";
import RedistrictingCalendarGrid from "@/components/RedistrictingCalendarGrid";
import { LedgerSectionHead } from "@/components/RaceDetailSections";
import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import { raceCalendarYears } from "@/data/raceCalendar";
import {
  ALL,
  RACE_KIND_LABEL,
  RACE_TABLE_ID,
  calendarStates,
  calendarTotals,
  filterRaces,
  pageOf,
  parseFilter,
} from "@/lib/raceCalendarQuery";
import { redistrictingTotals, redistrictingYears } from "@/lib/redistrictingCalendar";
import { UPCOMING_YEAR, hasUpcomingCycle, upcomingTotals } from "@/lib/upcomingElections";

const FIRST_YEAR = Math.min(...raceCalendarYears);
const LAST_YEAR = Math.max(...raceCalendarYears);
const REDISTRICT_FIRST = Math.min(...redistrictingYears);
const REDISTRICT_LAST = Math.max(...redistrictingYears);

export const metadata = {
  title: `Election & Race Calendar — ${FIRST_YEAR}–${LAST_YEAR}`,
  description:
    "Which federal and gubernatorial races were on the ballot in each state and year, the full result of every one of them, and when each state redrew its district maps.",
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filter = parseFilter(await searchParams);
  const matching = filterRaces(filter);
  const { rows, page, from, to } = pageOf(matching, filter.page);

  const activeState = filter.state === ALL ? null : calendarStates.find((s) => s.abbr === filter.state);
  const scopeParts = [
    activeState ? activeState.name : "All states",
    filter.kind === ALL ? "all offices" : RACE_KIND_LABEL[filter.kind as keyof typeof RACE_KIND_LABEL],
    filter.year === ALL ? "all years" : filter.year,
    filter.cls === ALL ? null : filter.cls.toLowerCase(),
  ].filter(Boolean);

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="Calendar" title="Election Calendar">
        Every Senate, House, governor and presidential race on the ballot in every state from {FIRST_YEAR} to {LAST_YEAR}:{" "}
        <Fig>{calendarTotals.races.toLocaleString()}</Fig> races, including <Fig>{calendarTotals.specials}</Fig> special elections and{" "}
        <Fig>{calendarTotals.runoffs}</Fig> runoffs, each shown with its final result. States redrew their district lines{" "}
        <Fig>{redistrictingTotals.events}</Fig> times from {REDISTRICT_FIRST} to {REDISTRICT_LAST}.
        {hasUpcomingCycle && <> The last column looks ahead to the <Fig>{upcomingTotals.seats.toLocaleString()}</Fig> seats up in {UPCOMING_YEAR}.</>}
      </StandfirstHeader>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-7 sm:px-6 sm:pt-8">
        {/* Election Calendar */}
        <section className="mb-12">
          <LedgerSectionHead
            label="Election Calendar"
            meta={`Which races were up in each state and year — select a cell to open it below${
              hasUpcomingCycle ? `, or a ${UPCOMING_YEAR} badge to open that race` : ""
            }`}
          />
          <CalendarJumpLinks targetId={RACE_TABLE_ID}>
            <CalendarHoverCard>
              <ElectionCalendarGrid filter={filter} states={calendarStates} />
            </CalendarHoverCard>
          </CalendarJumpLinks>
          {hasUpcomingCycle && (
            <p className="mt-4 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
              The {UPCOMING_YEAR} column is the ballot rather than a result: {upcomingTotals.senate} Senate
              seats (including {upcomingTotals.specials} specials), {upcomingTotals.governor} governorships and
              all {upcomingTotals.house} House seats, taken from the forecast rather than from the results
              files. Its badges are outlined for that reason, and they open the race itself &mdash; the Race
              Calendar below covers elections already held, so it has no row for any of them yet.
            </p>
          )}
        </section>

        {/* Redistricting Calendar */}
        <section className="mb-12">
          <LedgerSectionHead
            label="Redistricting Calendar"
            meta={`When each state redrew its congressional and legislative maps, ${REDISTRICT_FIRST}–${REDISTRICT_LAST}`}
          />
          <CalendarHoverCard>
            <RedistrictingCalendarGrid />
          </CalendarHoverCard>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
            A mark sits on the first general election held under the new lines, not the date the plan was
            enacted &mdash; Michigan&rsquo;s 2024 Senate remedial appears under 2026 because the chamber was not
            on the 2024 ballot. Congressional redraws come from the per-district boundary histories in{" "}
            <code>houseDistrictInfo</code>; legislative redraws are the map eras in <code>stateLegCalendar</code>,
            whose pre-2016 decennial baseline is assumed rather than evidenced and so is not marked here.
          </p>
        </section>

        {/* Race Calendar */}
        <section id={RACE_TABLE_ID} className="scroll-mt-20">
          <LedgerSectionHead
            label="Race Calendar"
            meta={`${matching.length.toLocaleString()} race${matching.length === 1 ? "" : "s"} — ${scopeParts.join(" · ")}`}
          />
          <div className="pb-5">
            <RaceCalendarFilters filter={filter} states={calendarStates} years={raceCalendarYears} />
          </div>
          <RaceCalendarTable races={rows} />
          <CalendarJumpLinks targetId={RACE_TABLE_ID}>
            <RaceCalendarPagination filter={filter} page={page} matching={matching.length} from={from} to={to} />
          </CalendarJumpLinks>

          <p className="mt-6 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--app-text-very-muted)" }}>
            Every row is one race on the Election Calendar above. Vote share and margin are the two-party
            candidates&rsquo; own numbers against the full turnout, so they need not sum to 100% where third
            parties ran. Margins are Republican-minus-Democratic. A candidate who ran on the opposing party&rsquo;s
            ballot line — a California top-two race, an all-Republican Louisiana runoff — is shown in their own
            party&rsquo;s color with that party marked.
          </p>
        </section>
      </main>
    </div>
  );
}
