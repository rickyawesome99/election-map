import { electionYear } from "@/data/forecastData";
import { TplHub } from "@/components/tpl/TplHub";
import { TplSubNav } from "@/components/tpl/TplSubNav";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { buildModelSummary } from "@/lib/modelSlices";

export const metadata = {
  title: `True Partisan Lean — ${electionYear} Model`,
  description: "Every state's and district's neutral partisan lean, with the races, years and candidates behind each number.",
};

// The TPL tab's landing page: the national map with the ranked table, then the distribution,
// the cycle's standout candidates and the section links. Everything is computed at build time
// in lib/modelSlices.ts; the map's year lens and sorts run on the summary alone.
export default function ModelHubPage() {
  const summary = buildModelSummary();
  const tilt = summary.states.filter((s) => Math.abs(s.tpl) < 5).length;
  const safeR = summary.states.filter((s) => s.tpl >= 15).length;
  const safeD = summary.states.filter((s) => s.tpl <= -15).length;
  const stat = (value: string, label: string) => (
    <div className="pr-6" style={{ borderRight: "1px solid var(--app-border)" }}>
      <div className="text-xl font-extrabold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>{label}</div>
    </div>
  );
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--party-dem) 8%, var(--app-bg)) 0%, var(--app-bg) 55%, color-mix(in srgb, var(--party-rep) 8%, var(--app-bg)) 100%)" }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <TplSubNav />
          <div className="pb-6 pt-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>True Partisan Lean · {summary.fitYears[0]}–{summary.fitYears[summary.fitYears.length - 1]}</div>
                <h1 className="mt-2" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 3.5rem)", fontWeight: 700, lineHeight: 0.98, letterSpacing: "-0.02em" }}>True Partisan Lean</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                  Each state&apos;s and district&apos;s neutral partisan composition: every race since {summary.fitYears[0]} with incumbency, fundraising and the national environment stripped out, then recency-weighted. Environment and elasticity are fitted jointly across all 50 states.
                </p>
              </div>
              <div className="shrink-0 sm:text-right">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>50-state median</div>
                <div className="mt-1 tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 4.5vw, 3rem)", fontWeight: 700, lineHeight: 1, color: marginColor(summary.medianStateTpl) }}>{fmtMargin(summary.medianStateTpl)}</div>
                <div className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>435-district median <span style={{ color: marginColor(summary.medianDistrictTpl) }}>{fmtMargin(summary.medianDistrictTpl)}</span></div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-4 pt-4" style={{ borderTop: "1px solid var(--app-border)" }}>
              {stat(String(tilt), "States within 5")}
              {stat(`${safeR} · ${safeD}`, "Safe R · Safe D")}
              {stat(`${summary.fitYears[0]}–${summary.fitYears[summary.fitYears.length - 1]}`, "Fit window")}
              {stat(summary.yearDecay.toFixed(2), "Year decay")}
              <div>
                <div className="text-xl font-extrabold tabular-nums">2026</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>District lines</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6">
        <TplHub summary={summary} />
      </main>
    </div>
  );
}
