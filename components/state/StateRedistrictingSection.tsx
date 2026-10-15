import type { RedistrictingYear } from "@/lib/statePage";
import { REDISTRICT_LABEL } from "@/lib/redistrictingCalendar";
import RedistrictingYearBlock from "./RedistrictingYearBlock";

/**
 * Every year this state's House map changed since 2016, newest first: the lines before and after
 * on a pair of maps, what the calendar says was redrawn, and each district's own account.
 */
export default function StateRedistrictingSection({ stateAbbr, stateFips, stateName, years }: { stateAbbr: string; stateFips: string; stateName: string; years: RedistrictingYear[] }) {
  const cdYears = years.filter((y) => y.districts.length > 0 || y.events.some((e) => e.kind === "CD"));
  return (
    <section id="redistricting" className="mt-10 scroll-mt-20">
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3 pb-3 mb-1" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>Redistricting history</h2>
        <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          {cdYears.length === 0
            ? `one at-large House district · no congressional lines to redraw`
            : `U.S. House districts · ${cdYears.length} congressional redraw${cdYears.length === 1 ? "" : "s"} since 2016`}
        </span>
      </div>
      {cdYears.length === 0 && (
        <div className="py-5">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 700, color: "var(--app-text-primary)" }}>At-large</span>
            <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
              <span className="text-[10px] uppercase tracking-wider font-semibold mr-1.5" style={{ color: "var(--redistrict-cd)" }}>{REDISTRICT_LABEL.CD}</span>
              1 district · statewide
            </span>
          </div>
          <p className="mt-2 text-sm max-w-2xl" style={{ color: "var(--app-text-primary)" }}>
            {stateName} elects its one U.S. House member statewide, so there are no congressional lines to draw. The
            district only changes if the state gains a second seat at a census apportionment; the next one follows the 2030 census.
          </p>
        </div>
      )}
      {cdYears.map((y, i) => (
        <RedistrictingYearBlock key={y.year} stateAbbr={stateAbbr} stateFips={stateFips} year={y} last={i === cdYears.length - 1} />
      ))}
    </section>
  );
}
