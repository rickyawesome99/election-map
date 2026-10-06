"use client";

import { useState, type ReactNode } from "react";
import Segmented from "@/components/MarketSegmented";
import type { PopVotePredictorYear } from "@/data/popVotePredictors";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import {
  OUTCOMES, PREDICTORS, fitPoints, fitSubset, fromIncumbentSigned, predictorValue, project,
  type CycleFilter, type FitPoint, type OutcomeKey, type PredictorKey,
} from "@/lib/popVotePredictors";

type Tip = { left: number; top: number; body: ReactNode } | null;

// Small-multiple geometry (SVG user units; each panel scales to its column).
const W = 380, H = 300, M = { l: 46, r: 16, t: 18, b: 44 };

/** A signed margin in the president's party's terms, e.g. "Obama +7.8" or "Biden −12.5". */
function fmtSigned(v: number): string {
  if (Math.abs(v) < 0.05) return "0.0";
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
}

/** Axis-tick label: R/D for a margin axis, +/− for a president-signed axis. */
function tickLabel(v: number, incumbentSigned: boolean): string {
  if (!incumbentSigned) return v === 0 ? "Even" : `${v > 0 ? "R" : "D"}+${Math.abs(v)}`;
  return v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v)}`;
}

function niceTicks(lo: number, hi: number, target = 5): number[] {
  const range = hi - lo || 1;
  const step = [1, 2, 5, 10, 20].find((s) => range / s <= target) ?? 20;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(t);
  return out;
}

function domain(values: number[], pad = 4): [number, number] {
  const lo = Math.min(...values), hi = Math.max(...values);
  return [Math.floor((lo - pad) / 5) * 5, Math.ceil((hi + pad) / 5) * 5];
}

function Panel({ predictor, outcome, cycle, years, target, onTip }: {
  predictor: PredictorKey; outcome: OutcomeKey; cycle: CycleFilter; years: PopVotePredictorYear[]; target: PopVotePredictorYear; onTip: (t: Tip) => void;
}) {
  const spec = PREDICTORS.find((p) => p.key === predictor)!;
  const outSpec = OUTCOMES.find((o) => o.key === outcome)!;
  const all = fitPoints(predictor, outcome, "all", years);
  const shown = fitPoints(predictor, outcome, cycle, years);
  const fit = fitSubset(shown, all);
  const reading = predictorValue(target, predictor);
  // No presidential election in 2026, so the presidential panels show the record only.
  const proj = outcome === "house" ? project(predictor, outcome, target, cycle, years) : null;
  const projected = proj?.fitted ?? null;              // R − D
  const projectedY = projected == null ? null : (spec.incumbentSigned ? fromIncumbentSigned(target, projected) : projected);

  const xs = [...all.map((p) => p.x), ...(reading == null || outcome !== "house" ? [] : [reading])];
  const ys = [...all.map((p) => p.y), ...(projectedY == null ? [] : [projectedY])];
  const [x0, x1] = domain(xs);
  const [y0, y1] = domain(ys);
  const sx = (v: number) => M.l + ((v - x0) / (x1 - x0)) * (W - M.l - M.r);
  const sy = (v: number) => H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b);
  const dim = cycle !== "all";

  const label = (p: FitPoint) => `${p.year} · ${p.president}`;

  // Year labels: nudge the second of any two points that land close together.
  const labelled = all.map((p) => ({ ...p, dy: -10 }));
  for (let i = 0; i < labelled.length; i++) for (let j = 0; j < i; j++) {
    const a = labelled[i], b = labelled[j];
    if (Math.abs(sx(a.x) - sx(b.x)) < 44 && Math.abs(sy(a.y) - sy(b.y)) < 16 && a.dy === b.dy) a.dy = 18;
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 pb-1">
        <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>{spec.label}</div>
        {fit && !fit.borrowedSlope && fit.r != null && <div className="text-[11px] tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>r = {fit.r.toFixed(2)} · n = {fit.n}</div>}
        {fit && fit.borrowedSlope && <div className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>n = {fit.n} · all-five slope, centered on these</div>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
        aria-label={`${spec.label} against the ${outSpec.label.toLowerCase()}: ${all.map((p) => `${p.year} ${fmtSigned(p.x)} → ${fmtSigned(p.y)}`).join("; ")}.`}>
        {niceTicks(y0, y1).map((t) => (
          <g key={`y${t}`}>
            <line x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} style={{ stroke: t === 0 ? "var(--app-text-very-muted)" : "var(--app-border)" }} strokeWidth={1} />
            <text x={M.l - 6} y={sy(t) + 4} textAnchor="end" fontSize={11} style={{ fill: "var(--app-text-muted)" }}>{tickLabel(t, spec.incumbentSigned)}</text>
          </g>
        ))}
        {niceTicks(x0, x1).map((t) => (
          <g key={`x${t}`}>
            <line y1={M.t} y2={H - M.b} x1={sx(t)} x2={sx(t)} style={{ stroke: t === 0 ? "var(--app-text-very-muted)" : "var(--app-border)" }} strokeWidth={1} />
            <text x={sx(t)} y={H - M.b + 15} textAnchor="middle" fontSize={11} style={{ fill: "var(--app-text-muted)" }}>{tickLabel(t, spec.incumbentSigned)}</text>
          </g>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 5} textAnchor="middle" fontSize={11} style={{ fill: "var(--app-text-muted)" }}>{spec.axis}</text>
        <text transform={`translate(11 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} style={{ fill: "var(--app-text-muted)" }}>
          {outSpec.label}{spec.incumbentSigned ? ", president's party" : ""}
        </text>

        {fit && (() => {
          const ya = fit.intercept + fit.slope * x0, yb = fit.intercept + fit.slope * x1;
          return <line x1={sx(x0)} y1={sy(ya)} x2={sx(x1)} y2={sy(yb)} style={{ stroke: "var(--app-text-muted)" }} strokeWidth={1.5} />;
        })()}

        {reading != null && outcome === "house" && (
          <line x1={sx(reading)} x2={sx(reading)} y1={M.t} y2={H - M.b} style={{ stroke: "var(--app-text-very-muted)" }} strokeWidth={1.5} strokeDasharray="5 4" />
        )}

        {labelled.map((p) => {
          const inSet = cycle === "all" || p.cycle === cycle;
          const fill = p.cycle === "midterm" ? "var(--app-text-primary)" : "var(--app-bg)";
          return (
            <g key={p.year} opacity={dim && !inSet ? 0.3 : 1}>
              <circle cx={sx(p.x)} cy={sy(p.y)} r={5.5} fill={fill} style={{ stroke: "var(--app-text-primary)" }} strokeWidth={2} />
              <text x={sx(p.x)} y={sy(p.y) + p.dy} textAnchor="middle" fontSize={11} fontWeight={600} style={{ fill: "var(--app-text-primary)" }}>{p.year}</text>
              <circle cx={sx(p.x)} cy={sy(p.y)} r={16} fill="transparent"
                onMouseEnter={() => onTip({
                  left: (sx(p.x) / W) * 100, top: (sy(p.y) / H) * 100,
                  body: <><strong>{label(p)}</strong> · {p.cycle === "midterm" ? "midterm" : "presidential year"}<br />{spec.short}: {fmtSigned(p.x)}{spec.incumbentSigned ? ` for ${p.president}` : ""}<br />{outSpec.short}: {fmtMargin(spec.incumbentSigned ? fromIncumbentSigned(p, p.y) : p.y)}{spec.incumbentSigned ? ` (${p.president} ${fmtSigned(p.y)})` : ""}</>,
                })}
                onMouseLeave={() => onTip(null)} />
            </g>
          );
        })}

        {reading != null && projectedY != null && projected != null && (
          <g>
            <circle cx={sx(reading)} cy={sy(projectedY)} r={7} fill={marginColor(projected)} style={{ stroke: "var(--app-bg)" }} strokeWidth={2} />
            <text x={sx(reading)} y={sy(projectedY) + 20} textAnchor="middle" fontSize={11} fontWeight={700} style={{ fill: marginColor(projected) }}>
              {target.year} {fmtMargin(projected)}
            </text>
            <circle cx={sx(reading)} cy={sy(projectedY)} r={16} fill="transparent"
              onMouseEnter={() => onTip({
                left: (sx(reading) / W) * 100, top: (sy(projectedY) / H) * 100,
                body: <><strong>{target.year} on the fitted line</strong><br />{spec.short} now: {fmtSigned(reading)}<br />Implied House vote: {fmtMargin(projected)}</>,
              })}
              onMouseLeave={() => onTip(null)} />
          </g>
        )}
      </svg>
      <div className="mt-1 text-[11px] leading-snug" style={{ color: "var(--app-text-very-muted)" }}>
        {proj ? (
          <>
            Now {fmtSigned(proj.reading)}.
            {proj.fitted != null && <> Fitted line: <span className="font-semibold" style={{ color: marginColor(proj.fitted) }}>{fmtMargin(proj.fitted)}</span>.</>}
            {proj.shifted != null && <> Average shift over {proj.shiftN} election{proj.shiftN === 1 ? "" : "s"}: <span className="font-semibold" style={{ color: marginColor(proj.shifted) }}>{fmtMargin(proj.shifted)}</span>.</>}
          </>
        ) : outcome !== "house" ? (
          <>No presidential vote in {target.year}, so nothing to project.</>
        ) : (
          <>No {target.year} reading on file.</>
        )}
      </div>
    </div>
  );
}

export default function PopVotePredictorCharts({ years, target }: { years: PopVotePredictorYear[]; target: PopVotePredictorYear }) {
  const [outcome, setOutcome] = useState<OutcomeKey>("house");
  const [cycle, setCycle] = useState<CycleFilter>("all");
  const [tip, setTip] = useState<Tip>(null);
  const [tipPanel, setTipPanel] = useState<PredictorKey>("approval");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented label="Outcome" value={outcome} options={OUTCOMES.map((o) => [o.key, o.label] as [OutcomeKey, string])}
          onChange={(o) => { setOutcome(o); if (o === "president" && cycle === "midterm") setCycle("all"); }} />
        {/* No midterm has a presidential vote, so that filter only exists for the House outcome. */}
        <Segmented label="Elections" value={cycle}
          options={outcome === "house" ? [["all", "All five"], ["midterm", "Midterms"], ["presidential", "Presidential years"]] : [["all", "All three"], ["presidential", "Presidential years"]]}
          onChange={setCycle} />
        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--app-text-primary)" }} /> Midterm</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ border: "2px solid var(--app-text-primary)" }} /> Presidential year</span>
          {outcome === "house" && <span className="inline-flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "var(--app-text-very-muted)" }} /> {target.year} reading</span>}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {PREDICTORS.map((p) => (
          <div key={p.key} className="relative" onMouseEnter={() => setTipPanel(p.key)}>
            <Panel predictor={p.key} outcome={outcome} cycle={cycle} years={years} target={target} onTip={setTip} />
            {tip && tipPanel === p.key && (
              <div className="pointer-events-none absolute z-10 rounded-md px-2.5 py-1.5 text-xs leading-snug shadow-lg"
                style={{ left: `${tip.left}%`, top: `${tip.top}%`, transform: `translate(${tip.left > 60 ? "-100%" : "0"}, -115%)`, background: "var(--app-panel)", border: "1px solid var(--app-border)", whiteSpace: "nowrap" }}>
                {tip.body}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
