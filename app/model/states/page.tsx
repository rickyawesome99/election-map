import Link from "next/link";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { TplSubNav } from "@/components/tpl/TplSubNav";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { buildModelSummary } from "@/lib/modelSlices";

export const metadata = {
  title: "States — True Partisan Lean",
  description: "Every state's True Partisan Lean, ranked, each linking to its full pipeline.",
};

// The States index: all 50 ranked, most Republican first, as the way into a state's page.
export default function ModelStatesIndex() {
  const summary = buildModelSummary();
  const ranked = [...summary.states].sort((a, b) => b.tpl - a.tpl);
  const th = "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider";
  const td = "whitespace-nowrap px-2 py-1.5 tabular-nums";
  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--party-dem) 8%, var(--app-bg)) 0%, var(--app-bg) 55%, color-mix(in srgb, var(--party-rep) 8%, var(--app-bg)) 100%)" }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <TplSubNav />
          <div className="pb-6 pt-5">
            <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>State TPL · 50 states</div>
            <h1 className="mt-2" style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 3.5rem)", fontWeight: 700, lineHeight: 0.98, letterSpacing: "-0.02em" }}>States</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>Each state&apos;s page carries the full pipeline: the year × office matrix, the races behind every cell, the result ledger, its districts and its candidates.</p>
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6">
        <LedgerSectionHead label="All states" meta={`most Republican first · 50-state median ${fmtMargin(summary.medianStateTpl)}`} />
        <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
          {[ranked.slice(0, 25), ranked.slice(25)].map((half, h) => (
            <div key={h} className="min-w-0 overflow-x-auto"><table className="w-full border-collapse text-xs">
              <thead>
                <tr style={{ borderBottom: "2px solid var(--app-text-primary)", color: "var(--app-text-muted)" }}>
                  <th className={`${th} text-left`}>#</th><th className={`${th} text-left`}>State</th><th className={`${th} text-right`}>TPL</th><th className={`${th} text-right`}>Centered</th><th className={`${th} text-right`}>β*</th><th className={`${th} text-right`}>Races</th>
                </tr>
              </thead>
              <tbody>
                {half.map((s, i) => (
                  <tr key={s.abbr} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <td className={td} style={{ color: "var(--app-text-very-muted)" }}>{h * 25 + i + 1}</td>
                    <td className={td}><Link href={`/model/states/${s.id}`} className="font-medium underline decoration-dotted underline-offset-4 hover:decoration-solid" style={{ textDecorationColor: "var(--app-border)" }}>{s.name}</Link> <span className="ml-1 rounded px-1 py-px font-mono text-[9px] font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>{s.abbr}</span></td>
                    <td className={`${td} text-right font-bold`} style={{ color: marginColor(s.tpl) }}>{fmtMargin(s.tpl)}</td>
                    <td className={`${td} text-right`} style={{ color: marginColor(s.tpl - summary.medianStateTpl) }}>{fmtMargin(s.tpl - summary.medianStateTpl)}</td>
                    <td className={`${td} text-right`} style={{ color: "var(--app-text-muted)" }}>{s.beta.toFixed(2)}</td>
                    <td className={`${td} text-right`} style={{ color: "var(--app-text-muted)" }}>{s.races}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ))}
        </div>
      </main>
    </div>
  );
}
