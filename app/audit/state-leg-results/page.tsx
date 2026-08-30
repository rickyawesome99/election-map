import StateLegCoverageAuditTable from "@/components/StateLegCoverageAuditTable";
import StateLegAggregateAuditTable from "@/components/StateLegAggregateAuditTable";
import StateLegCalendarAuditTable from "@/components/StateLegCalendarAuditTable";
import { buildAggregateAuditRows } from "@/lib/stateLegAggregateAudit";
import { buildCoverageChamberYearCount } from "@/lib/stateLegCoverageCount";

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

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, var(--app-tab-bg) 0%, var(--app-bg) 65%)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
            >
              INTERNAL
            </span>
            <h1
              style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.75rem, 4vw, 2.75rem)", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
            >
              State Legislative Results — Coverage &amp; Aggregation Audit
            </h1>
          </div>
          <div className="mt-2 text-sm max-w-4xl" style={{ color: "var(--app-text-muted)" }}>
            The standing scoreboard for the 2016&ndash;2025 state legislative results project. Section 1 checks the
            statewide chamber-year figures in{" "}
            <code style={{ color: "var(--app-text-secondary)" }}>data-entry/state_leg.csv</code> &mdash; whether every
            field is filled, where it came from, and whether the row&rsquo;s own numbers agree with each other. Section 2
            lays out each chamber&rsquo;s election calendar and the redistricting eras its results have to be read
            against. Section 3 sums the per-district results in{" "}
            <code style={{ color: "var(--app-text-secondary)" }}>data/stateLegResults.ts</code> and diffs each
            chamber-year against that statewide row. All three re-read the built data on every page load, so they fill
            in as sourcing lands. Temporary page, not linked from site navigation.
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-10">
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
      </main>
    </div>
  );
}
