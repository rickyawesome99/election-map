import { calculateCountyModel, calculateStateTpl, getMedianStateTpl } from "@/lib/tplCompute";
import { fmtMargin } from "@/lib/colorScale";

function directionWord(diff: number): string {
  return diff >= 0 ? "more Republican" : "more Democratic";
}

function markerColor(margin: number): string {
  if (Math.abs(margin) < 0.05) return "var(--party-ind)";
  return margin >= 0 ? "var(--party-rep)" : "var(--party-dem)";
}

export default function CountyCompareCard({
  fips,
  stateAbbr,
  stateName,
  countyLabel,
}: {
  fips: string;
  stateAbbr: string;
  stateName: string;
  countyLabel: string;
}) {
  const calc = calculateCountyModel(fips);
  if (!calc || calc.races.every((r) => r.NM == null)) return null;

  const countyTpl = calc.tpl;
  const stateTpl = calculateStateTpl(stateAbbr, stateName);
  const nationalTpl = getMedianStateTpl();

  const domainMax = Math.ceil(Math.max(80, Math.abs(countyTpl), Math.abs(stateTpl), Math.abs(nationalTpl)) / 10) * 10;
  const posFor = (m: number) => Math.min(98, Math.max(2, 50 + (m / domainMax) * 50));

  const stateDiff = countyTpl - stateTpl;
  const natDiff = countyTpl - nationalTpl;

  return (
    <section className="rounded-xl mb-3 px-4 py-4 sm:px-6" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
      <h2 className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--app-text-muted)" }}>
        How {countyLabel} Compares
      </h2>
      <p className="text-[10px] mb-4" style={{ color: "var(--app-text-very-muted)" }}>
        True Partisan Lean vs. {stateName} and a national baseline
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
        <span className="text-[13px] font-semibold" style={{ color: "var(--app-text-primary)" }}>County TPL</span>
        <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
          {countyLabel} <b style={{ color: markerColor(countyTpl) }}>{fmtMargin(countyTpl)}</b>
          &nbsp;·&nbsp; {stateName} <b style={{ color: markerColor(stateTpl) }}>{fmtMargin(stateTpl)}</b>
          &nbsp;·&nbsp; National (median state) <b style={{ color: markerColor(nationalTpl) }}>{fmtMargin(nationalTpl)}</b>
        </span>
      </div>
      <div className="relative h-2.5 rounded-full" style={{ background: "var(--app-tab-bg)" }}>
        <div className="absolute top-[-3px] bottom-[-3px] w-px" style={{ left: "50%", background: "var(--app-border)" }} />
        <div
          className="absolute rounded-full"
          style={{ left: `${posFor(nationalTpl)}%`, top: "50%", width: 6, height: 6, transform: "translate(-50%, -50%)", background: markerColor(nationalTpl), opacity: 0.45 }}
        />
        <div
          className="absolute rounded-full"
          style={{ left: `${posFor(stateTpl)}%`, top: "50%", width: 8, height: 8, transform: "translate(-50%, -50%)", background: markerColor(stateTpl), opacity: 0.75 }}
        />
        <div
          className="absolute rounded-full"
          style={{
            left: `${posFor(countyTpl)}%`, top: "50%", width: 14, height: 14, transform: "translate(-50%, -50%)",
            background: markerColor(countyTpl), border: "2px solid var(--app-panel)", boxShadow: `0 0 0 1px ${markerColor(countyTpl)}`,
          }}
        />
      </div>
      <div className="mt-1.5 text-xs" style={{ color: "var(--app-text-muted)" }}>
        {Math.abs(stateDiff) >= 0.1 && `${Math.abs(stateDiff).toFixed(1)} pts ${directionWord(stateDiff)} than ${stateName}`}
        {Math.abs(stateDiff) >= 0.1 && Math.abs(natDiff) >= 0.1 && " · "}
        {Math.abs(natDiff) >= 0.1 && `${Math.abs(natDiff).toFixed(1)} pts ${directionWord(natDiff)} than the median state`}
      </div>

      <div className="flex items-center gap-4 mt-4 pt-3 text-[11px]" style={{ borderTop: "1px solid var(--app-border)", color: "var(--app-text-very-muted)" }}>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 14, height: 14, borderRadius: 999, background: "var(--app-text-muted)", border: "2px solid var(--app-panel)", boxShadow: "0 0 0 1px var(--app-text-muted)", display: "inline-block" }} />
          County
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--app-text-muted)", opacity: 0.75, display: "inline-block" }} />
          State
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--app-text-muted)", opacity: 0.45, display: "inline-block" }} />
          National (median state)
        </span>
      </div>
    </section>
  );
}
