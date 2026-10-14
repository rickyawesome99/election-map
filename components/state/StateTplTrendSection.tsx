import Link from "next/link";
import type { YearAggregation } from "@/lib/tplCompute";
import CountyLeanTrendChart from "@/components/CountyLeanTrendChart";
import { fmtMargin, marginColor } from "@/lib/colorScale";

/**
 * The state's lean by cycle since 2016: each point is the year's weighted lean (WRS), the input the
 * TPL blends, and the dashed line is today's TPL. The weight row under the chart says how much of
 * the TPL each cycle is.
 */
export default function StateTplTrendSection({ abbr, tpl, yearAggregations }: { abbr: string; tpl: number | null; yearAggregations: YearAggregation[] }) {
  const years = yearAggregations.filter((y) => y.racesPresent.length > 0).sort((a, b) => a.year - b.year);
  if (years.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3 pb-3 mb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>State TPL trend</h2>
        <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
          weighted lean by election cycle (WRS) · dashed line is today&apos;s TPL
          {tpl != null && <> <b style={{ color: marginColor(tpl) }}>{fmtMargin(tpl)}</b></>}
          {" · "}
          <Link href={`/model/${abbr.toLowerCase()}`} className="underline underline-offset-2 hover:opacity-80">full calculation</Link>
        </span>
      </div>
      <CountyLeanTrendChart yearAggregations={yearAggregations} height={200} fitAxis reference={tpl != null ? { value: tpl, label: `TPL ${fmtMargin(tpl)}` } : undefined} />
      <div className="mt-3 overflow-x-auto">
        <table className="text-xs tabular-nums" style={{ minWidth: `${years.length * 5}rem` }}>
          <tbody>
            <tr>
              <th className="pr-3 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-very-muted)" }}>Cycle</th>
              {years.map((y) => <td key={y.year} className="px-2 text-right font-semibold" style={{ color: "var(--app-text-muted)" }}>{y.year}</td>)}
            </tr>
            <tr>
              <th className="pr-3 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-very-muted)" }}>Lean</th>
              {years.map((y) => <td key={y.year} className="px-2 text-right font-bold" style={{ color: marginColor(y.WRS) }}>{fmtMargin(y.WRS)}</td>)}
            </tr>
            <tr>
              <th className="pr-3 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-very-muted)" }}>Races</th>
              {years.map((y) => <td key={y.year} className="px-2 text-right" style={{ color: "var(--app-text-muted)" }}>{y.racesPresent.length}</td>)}
            </tr>
            <tr>
              <th className="pr-3 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-very-muted)" }}>Share of TPL</th>
              {years.map((y) => <td key={y.year} className="px-2 text-right" style={{ color: "var(--app-text-muted)" }}>{(y.finalWeight * 100).toFixed(0)}%</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
