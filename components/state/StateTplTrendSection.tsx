import type { ReactNode } from "react";
import Link from "next/link";
import type { YearAggregation } from "@/lib/tplCompute";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { TplOverTime } from "@/components/tpl/TplOverTime";
import type { TplAsOf } from "@/components/tpl/types";

/**
 * A snapshot of the state's TPL page: three headline figures (today's TPL, the latest cycle's
 * blended vote, the 2020–24 presidential trend) and that page's own "TPL over time" graph.
 */

const LABEL = "text-[11px] font-bold uppercase tracking-wider";

function Figure({ label, value, sub }: { label: string; value: number; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className={LABEL} style={{ color: "var(--app-text-muted)" }}>{label}</div>
      <div className="mt-1 tabular-nums leading-none" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.2rem, 2.6vw, 1.6rem)", fontWeight: 700, color: marginColor(value) }}>
        {fmtMargin(value)}
      </div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{sub}</div>}
    </div>
  );
}

export default function StateTplTrendSection({ abbr, name, tpl, yearAggregations, overTime, trend }: { abbr: string; name: string; tpl: number | null; yearAggregations: YearAggregation[]; overTime: TplAsOf[]; trend?: { last: number; prior: number | null } | null }) {
  const points = yearAggregations
    .filter((y) => y.racesPresent.length > 0)
    .sort((a, b) => a.year - b.year)
    .map((y) => {
      const env = y.env ?? 0;
      return {
        year: y.year,
        vote: Math.round((y.WRS + env) * 10) / 10,
        share: y.finalWeight,
      };
    });
  if (points.length === 0) return null;
  const latest = points[points.length - 1];

  return (
    <section id="tpl-trend" className="mt-8 scroll-mt-20">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1.5 sm:gap-3 pb-3 mb-1" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <div className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-3">
          <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>State TPL trend</h2>
        </div>
        <Link href={`/model/${abbr.toLowerCase()}`} prefetch={false} className="text-xs font-semibold underline underline-offset-2 hover:opacity-80" style={{ color: "var(--app-text-muted)" }}>Full calculation</Link>
      </div>

      <div className="grid grid-cols-3 gap-x-4 pt-3.5 sm:max-w-2xl sm:gap-x-6">
        {tpl != null && <Figure label="Today's TPL" value={tpl} sub="environment removed" />}
        <Figure label={`${latest.year} vote`} value={latest.vote} sub={`${Math.round(latest.share * 100)}% of the TPL`} />
        {trend && (
          <Figure
            label="Pres. trend"
            value={trend.last}
            sub="2020–24, beyond the national shift"
          />
        )}
      </div>

      {overTime.length > 1 && (
        <div className="mt-4">
          <TplOverTime points={overTime} name={name} />
        </div>
      )}
    </section>
  );
}
