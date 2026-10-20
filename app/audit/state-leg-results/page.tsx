import { Fig, StandfirstHeader } from "@/components/StandfirstHeader";
import StateLegCoverageAuditTable from "@/components/StateLegCoverageAuditTable";
import StateLegAggregateAuditTable from "@/components/StateLegAggregateAuditTable";
import StateLegCalendarAuditTable from "@/components/StateLegCalendarAuditTable";
import StateLegPresByEraAuditTable from "@/components/StateLegPresByEraAuditTable";
import StateLegChamberMarginAuditTable from "@/components/StateLegChamberMarginAuditTable";
import { buildChamberMarginAuditRows } from "@/lib/stateLegChamberMarginAudit";
import { buildAggregateAuditRows } from "@/lib/stateLegAggregateAudit";
import { buildCoverageChamberYearCount } from "@/lib/stateLegCoverageCount";
import { buildPresByEraAuditRows } from "@/lib/stateLegPresByEraAudit";

export const metadata = {
  title: "State Leg Results Audit",
  robots: { index: false, follow: false },
};

function SectionHeading({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="pb-3 mb-4" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-bold" style={{ color: "var(--app-text-muted)" }}>{n}</span>
        <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-serif)", color: "var(--app-text-primary)" }}>
          {title}
        </h2>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed max-w-4xl" style={{ color: "var(--app-text-muted)" }}>
        {children}
      </p>
    </div>
  );
}

export default function StateLegResultsAuditPage() {
  // Computed on the server: data/stateLegResults.ts is ~2.5 MB of per-district rows and only the
  // per-chamber-year summaries need to reach the browser.
  const aggregateRows = buildAggregateAuditRows();
  const totalChamberYears = buildCoverageChamberYearCount();
  const presByEraRows = buildPresByEraAuditRows();
  const chamberMarginRows = buildChamberMarginAuditRows();

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <StandfirstHeader kicker="Audit" title="State Legislative Results Audit">
        The standing scoreboard for the {"2016\u20132025"} state legislative results: whether each of the{" "}
        <Fig>{totalChamberYears.toLocaleString()}</Fig> statewide chamber-years is complete and agrees with itself, which map
        era each chamber&rsquo;s results belong to, and whether the district results add up to the statewide figures.
      </StandfirstHeader>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-7 sm:pt-8 pb-6 flex flex-col gap-10">
        <section>
          <SectionHeading n={1} title="Coverage — statewide chamber-years">
            One row per chamber-year in scope (49 states &times; 2 chambers plus Nebraska&rsquo;s unicameral
            legislature, 2016&ndash;2025). A row is complete when all twelve fields are present: D/R/other/total votes,
            the chamber composition <em>after</em> the election, and the seats <em>won</em> in the cycle &mdash; those
            last two are different quantities, since a staggered chamber&rsquo;s composition counts holdovers that were
            never on the ballot. &ldquo;Internally inconsistent&rdquo; means the row contradicts itself: votes not
            summing to the total, seats not summing to the chamber size, seats won not summing to seats up, seats up
            exceeding the chamber, or a percentage that does not follow from the votes. Blank cells in the grid are
            years the chamber held no election, so each row also reads as its election calendar.
          </SectionHeading>
          <StateLegCoverageAuditTable />
        </section>

        <section>
          <SectionHeading n={2} title="Calendar &amp; map eras — every chamber, 2016–2025">
            When each chamber elects, how many of its seats stand, and which district map those lines came from.
            Almost all of it is derived rather than researched: the year columns of{" "}
            <code style={{ color: "var(--app-text-secondary)" }}>data-entry/state_leg.csv</code> are the calendar, and{" "}
            <code style={{ color: "var(--app-text-secondary)" }}>firstCycle</code> in{" "}
            <code style={{ color: "var(--app-text-secondary)" }}>data/stateLegMapInfo.ts</code> dates the current map, so
            everything before it is a prior era by definition. A <strong>staggered</strong> chamber putting every seat up
            at once is the giveaway that it was redrawn &mdash; that signal alone finds the 2022 resets and
            Florida&rsquo;s extra mid-decade Senate redraw in 2016. What it cannot find is a redraw of a chamber that
            elects everyone every two years regardless, so the four mid-decade 2010s cases (Alabama 2018, North Carolina
            2018 and 2020, Virginia&rsquo;s House in 2019) were researched and cited individually. Every era says whether
            its start year is evidenced or merely assumed.
          </SectionHeading>
          <StateLegCalendarAuditTable />
        </section>

        <section>
          <SectionHeading n={3} title="Aggregate vs. statewide — district-level results">
            For each chamber-year that has per-district results, the district sum against the statewide row above. The
            check only means something when the two sides were sourced independently, so each row says which it is:
            a <strong>shared</strong> lineage compares a source to itself and tests the plumbing rather than the
            numbers. Note that some diffs are expected rather than defects &mdash; Louisiana declares unopposed
            candidates elected without printing a vote count, so those seats have no district row at all.
          </SectionHeading>
          <StateLegAggregateAuditTable rows={aggregateRows} totalChamberYears={totalChamberYears} />
        </section>

        <section>
          <SectionHeading n={4} title="President by map era — 2016 / 2020 / 2024 on every chamber's lines">
            One row per chamber and map era in{" "}
            <code style={{ color: "var(--app-text-secondary)" }}>data/stateLegPresByEra.ts</code>: Dave&rsquo;s
            Redistricting&rsquo;s 2020-VTD presidential returns area-apportioned onto that era&rsquo;s district polygons.
            The D and R diff columns are the era&rsquo;s district sum against the certified statewide result; every VTD is
            allocated in full, so a non-zero diff is DRA&rsquo;s own statewide shortfall, not votes the overlay lost.
            The holdout columns exist only for the current map: the overlay&rsquo;s 2024 margin per district against the
            precinct-exact figure in{" "}
            <code style={{ color: "var(--app-text-secondary)" }}>data/stateLegPres2024.ts</code>, estimated districts
            excluded. That is the method&rsquo;s measured error for the state and the superseded eras inherit it; a state
            whose 2024 file came from the same DRA overlay reads 0.00 by construction. &ldquo;Split %&rdquo; is the median
            share of a district&rsquo;s presidential vote that came through VTDs its lines cut.
          </SectionHeading>
          <StateLegPresByEraAuditTable rows={presByEraRows} />
        </section>

        <section>
          <SectionHeading n={5} title="Raw vs. corrected chamber margin — the State TPL's legislative rows">
            One row per chamber-year in{" "}
            <code style={{ color: "var(--app-text-secondary)" }}>lib/stateLegChamberMargin.ts</code>: the raw aggregate
            (every counted district&rsquo;s votes summed, the old State Legislature row) beside the corrected margin that
            now feeds the State TPL. Each district is <strong>contested</strong> (both major parties drew votes, its own
            margin and votes), <strong>imputed</strong> (no count or one major party absent: the district&rsquo;s
            presidential margin on the map it was run on, in the source presidential year, weighted by that presidential
            vote scaled to the chamber&rsquo;s legislative-to-presidential turnout ratio) or <strong>skipped</strong>
            (ineligible with no presidential figure on its lines). The shift is corrected minus raw, Republican-positive:
            the states that print unopposed races 100&ndash;0 compress toward their presidential lean.
          </SectionHeading>
          <StateLegChamberMarginAuditTable rows={chamberMarginRows} />
        </section>
      </main>
    </div>
  );
}
