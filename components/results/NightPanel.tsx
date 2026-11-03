"use client";

import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { MIN_COMPLETE, type AreaSwing, type NightFit } from "@/lib/resultsNight";
import { COUNTY_AREAS, OFFICE_LABEL, RESULTS_OFFICES, type CountyArea } from "@/lib/resultsTypes";
import { fmtInt, fmtMargin, marginSideColor } from "@/lib/resultsFormat";

// What the counties finished anywhere say about the races still out (lib/resultsNight.ts): the
// national swing and each office's offset, then how urban, suburban and rural counties are running
// against the projection (areaSwings, plain averages beside the fit). The state misses, the demographic slopes
// and the early-count skew are still fitted and used by the needle, just not shown here.

const muted = { color: "var(--app-text-muted)" };
const veryMuted = { color: "var(--app-text-very-muted)" };
const serif = { fontFamily: "var(--font-serif)" };

function Subhead({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-2">
      <div className="text-[10px] font-bold uppercase tracking-wider" style={muted}>{title}</div>
      <div className="text-[11px] leading-snug" style={veryMuted}>{note}</div>
    </div>
  );
}

/** One term as a diverging bar: Democratic to the left of the center line, Republican to the right,
 *  with a faint whisker for ± its standard error where it has one, and `meta` (a count) beside the
 *  label. `scale` is the value that fills half the track. */
function Bar({ label, value, se, meta, scale, narrow, rule }: { label: string; value: number; se?: number; meta?: string; scale: number; narrow?: boolean; rule?: boolean }) {
  const pos = (x: number) => 50 + Math.max(-1, Math.min(1, x / scale)) * 50;
  const color = marginSideColor(value);
  return (
    <div className={`grid ${narrow ? "grid-cols-[3.75rem_minmax(0,1fr)_5.75rem]" : "grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_5.75rem]"} items-center gap-3 py-[3px] text-[13px] tabular-nums ${rule ? "mb-1 border-b pb-1.5" : ""}`} style={rule ? { borderColor: "var(--app-border)" } : undefined}>
      <span className="truncate"><span className="font-semibold">{label}</span>{meta && <span className="ml-1.5 text-[11px]" style={veryMuted}>{meta}</span>}</span>
      <span className="relative h-3.5">
        <span className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--app-border)" }} />
        {se != null && <span className="absolute top-1/2 h-px" style={{ left: `${pos(value - se)}%`, width: `${pos(value + se) - pos(value - se)}%`, background: "var(--app-text-very-muted)" }} />}
        {Math.abs(value) >= 0.05 && <span className="absolute inset-y-0.5 rounded-sm" style={{ left: `${Math.min(50, pos(value))}%`, width: `${Math.abs(pos(value) - 50)}%`, background: `color-mix(in srgb, ${color} 70%, transparent)` }} />}
      </span>
      <span className="text-right"><b style={{ color }}>{fmtMargin(value, undefined, 1)}</b> {se != null && <span className="text-[11px]" style={veryMuted}>±{se.toFixed(1)}</span>}</span>
    </div>
  );
}

/** A shared half-track scale for a group of bars: its largest value plus error, never below `floor`. */
const scaleOf = (terms: { value: number; se: number }[], floor: number) => Math.max(floor, ...terms.map((t) => Math.abs(t.value) + t.se));

const AREA_LABEL: Record<CountyArea, string> = { urban: "Urban", suburban: "Suburban", rural: "Rural" };

export default function NightPanel({ fit, areas }: { fit: NightFit; areas: Record<CountyArea, AreaSwing> }) {
  const inFit = fit.n >= 0.5;
  return (
    // A tighter gap to the races section below than the page's other sections
    <section className="mb-5">
      <LedgerSectionHead label="What early results say" meta={inFit ? `${fmtInt(fit.n)} counties' weight · ${fmtInt(fit.votes)} votes in the fit` : `no county is ${Math.round(MIN_COMPLETE * 100)}% counted yet`} />
      {!inFit ? (
        <p className="text-[13px]" style={muted}>Once counties finish counting, their swing against the projection is read across every race — the national swing, each state&apos;s own miss, and how the swing runs with a county&apos;s makeup — and carried to the races still out. Until then every race is at its forecast.</p>
      ) : (
        <div className="space-y-7">
          <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]">
            {/* The headline: the national swing, in a sentence */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={muted}>National swing</div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums" style={{ ...serif, color: marginSideColor(fit.national.value) }}>{fmtMargin(fit.national.value, undefined, 1)}</span>
                <span className="text-[12px] tabular-nums" style={veryMuted}>±{fit.national.se.toFixed(1)}</span>
              </div>
              <p className="mt-1.5 max-w-xs text-[12.5px] leading-snug" style={muted}>
                {Math.abs(fit.national.value) < 0.05
                  ? `Counties at least ${Math.round(MIN_COMPLETE * 100)}% counted are landing right on the forecast.`
                  : <>Counties at least {Math.round(MIN_COMPLETE * 100)}% counted are running <b style={{ color: marginSideColor(fit.national.value) }}>{Math.abs(fit.national.value).toFixed(1)} pts {fit.national.value > 0 ? "more Republican" : "more Democratic"}</b> than the forecast.</>}
                {" "}<span style={veryMuted}>Sized for a typical state; swingier states move more.</span>
              </p>
            </div>
            <div>
              <Subhead title="By office" note="Each office's extra swing on top of the national one" />
              {(() => { const sc = scaleOf(RESULTS_OFFICES.map((o) => fit.office[o]), 2); return RESULTS_OFFICES.map((o) => <Bar key={o} label={OFFICE_LABEL[o]} value={fit.office[o].value} se={fit.office[o].se} scale={sc} />); })()}
            </div>
            <div>
              <Subhead title="By type of county" note={`Counties at least ${Math.round(MIN_COMPLETE * 100)}% counted (count beside each) against their projection`} />
              {(() => {
                const sc = Math.max(2, ...COUNTY_AREAS.map((a) => Math.abs(areas[a].value ?? 0) * 1.25));
                return COUNTY_AREAS.map((a) => {
                  const r = areas[a];
                  if (r.value == null) return (
                    <div key={a} className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_5.75rem] items-center gap-3 py-[3px] text-[13px]">
                      <span className="truncate font-semibold">{AREA_LABEL[a]}</span><span /><span className="text-right text-[11px]" style={veryMuted}>none in yet</span>
                    </div>
                  );
                  return <Bar key={a} label={AREA_LABEL[a]} value={r.value} meta={fmtInt(r.counties)} scale={sc} />;
                });
              })()}
            </div>
          </div>

        </div>
      )}
    </section>
  );
}
