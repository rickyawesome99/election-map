import type { RedistrictingYear } from "@/lib/statePage";
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
          U.S. House districts · {cdYears.length === 0 ? `no congressional redraw in ${stateName} since 2016` : `${cdYears.length} congressional redraw${cdYears.length === 1 ? "" : "s"} since 2016`}
        </span>
      </div>
      {cdYears.map((y) => (
        <RedistrictingYearBlock key={y.year} stateAbbr={stateAbbr} stateFips={stateFips} year={y} />
      ))}
    </section>
  );
}
