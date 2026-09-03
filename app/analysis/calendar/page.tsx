import BackButton from "@/components/BackButton";
import CalendarHoverCard from "@/components/CalendarHoverCard";
import CalendarJumpLinks from "@/components/CalendarJumpLinks";
import ElectionCalendarGrid from "@/components/ElectionCalendarGrid";
import RaceCalendarFilters from "@/components/RaceCalendarFilters";
import RaceCalendarPagination from "@/components/RaceCalendarPagination";
import RaceCalendarTable from "@/components/RaceCalendarTable";
import RedistrictingCalendarGrid from "@/components/RedistrictingCalendarGrid";
import { LedgerSectionHead } from "@/components/RaceDetailSections";
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
      {/* Hero */}
      <div
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--party-dem) 8%, var(--app-bg)) 0%, var(--app-bg) 55%, color-mix(in srgb, var(--party-rep) 8%, var(--app-bg)) 100%)",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-3 sm:px-6 sm:pb-10">
          <div className="-ml-2 mb-5">
            <BackButton />
          </div>

          <div className="flex items-center gap-3">
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
            >
              US
            </span>
            <h1
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "clamp(2rem, 5.5vw, 4rem)",
                fontWeight: 700,
                lineHeight: 0.95,
                letterSpacing: "-0.02em",
                color: "var(--app-text-primary)",
              }}
            >
              Election Calendar
            </h1>
          </div>
          <div className="mt-3 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
            Which offices were on the ballot in every state and year from {FIRST_YEAR} to {LAST_YEAR}, and the full
            result of each race behind them, plus when each state redrew the district lines those races were
            run on. Where a race went to a runoff, the runoff is the result shown.
          </div>

          {/* Stat row */}
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4 pt-5" style={{ borderTop: "1px solid var(--app-border)" }}>
            {[
              { value: calendarTotals.races.toLocaleString(), label: "Races" },
              { value: `${FIRST_YEAR}–${LAST_YEAR}`, label: "Cycles covered" },
              { value: calendarStates.length, label: "States + DC" },
              { value: calendarTotals.specials, label: "Special elections" },
              { value: calendarTotals.runoffs, label: "Runoffs" },
              { value: redistrictingTotals.events, label: "Redraws" },
            ].map((stat, i, all) => (
              <div key={stat.label} className={i < all.length - 1 ? "pr-8" : ""} style={i < all.length - 1 ? { borderRight: "1px solid var(--app-border)" } : undefined}>
                <div className="text-2xl font-extrabold tabular-nums">{stat.value}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6">
        {/* Election Calendar */}
        <section className="mb-12">
          <LedgerSectionHead
            label="Election Calendar"
            meta="Which races were up in each state and year — select a cell to open it below"
          />
          <CalendarJumpLinks targetId={RACE_TABLE_ID}>
            <CalendarHoverCard>
              <ElectionCalendarGrid filter={filter} states={calendarStates} />
            </CalendarHoverCard>
          </CalendarJumpLinks>
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
