"use client";

import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import type { NightFit } from "@/lib/resultsNight";
import { OFFICE_LABEL, RESULTS_OFFICES } from "@/lib/resultsTypes";
import { fmtCall, fmtInt, fmtMargin, marginSideColor, raceHash } from "@/lib/resultsFormat";
import type { ResultsRow } from "@/components/results/ResultsPage";

// What the counties finished anywhere say about the races still out (lib/resultsNight.ts): the
// national swing, each office's offset, how the swing runs with a county's makeup, the states with
// their own shared miss, how far the votes counted first run from the final count, and the races
// with nothing counted whose projection moved most.

const muted = { color: "var(--app-text-muted)" };
const veryMuted = { color: "var(--app-text-very-muted)" };
const serif = { fontFamily: "var(--font-serif)" };

function Term({ label, value, se, note }: { label: string; value: number; se: number; note?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider" style={muted}>{label}</div>
      <div className="text-xl font-bold tabular-nums" style={{ ...serif, color: marginSideColor(value) }}>{fmtMargin(value, undefined, 1)} <span className="text-[11px] font-normal" style={veryMuted}>±{se.toFixed(1)}</span></div>
      {note && <div className="text-[11px]" style={veryMuted}>{note}</div>}
    </div>
  );
}

export default function NightPanel({ fit, rows, onSelect }: { fit: NightFit; rows: ResultsRow[]; onSelect: (row: ResultsRow) => void }) {
  const inFit = fit.n >= 0.5;
  const states = Object.entries(fit.states).filter(([, s]) => s.n >= 0.5).sort((a, b) => Math.abs(b[1].value) - Math.abs(a[1].value)).slice(0, 8);
  // The early-vote skew is stored with positive = the first votes lean Democratic; shown as the early
  // count's lean against the final, R-positive like every margin here.
  const mirages = Object.entries(fit.mirage).filter(([, m]) => m.n >= 1).sort((a, b) => Math.abs(b[1].value) - Math.abs(a[1].value)).slice(0, 8);
  // Competitive races first (the forecast within 15 pts), where a shift can change the outcome; safe
  // seats only when fewer than four of those have moved.
  const waiting = rows.filter((r) => r.proj.tier === "none" && !r.proj.locked && r.prior.forecast.contest === "contested" && Math.abs(r.proj.night.shift) >= 0.5);
  const competitive = waiting.filter((r) => Math.abs(r.prior.forecast.margin) < 15);
  const movers = (competitive.length >= 4 ? competitive : waiting).sort((a, b) => Math.abs(b.proj.night.shift) - Math.abs(a.proj.night.shift)).slice(0, 8);
  return (
    <section>
      <LedgerSectionHead label="What early results say" meta={inFit ? `${fmtInt(fit.n)} counties' weight · ${fmtInt(fit.votes)} votes in the fit` : "no county is half counted yet"} />
      {!inFit ? (
        <p className="text-[13px]" style={muted}>Once counties finish counting, their swing against the projection is read across every race — the national swing, each state&apos;s own miss, and how the swing runs with a county&apos;s makeup — and carried to the races still out. Until then every race is at its forecast.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
            <Term label="National swing" value={fit.national.value} se={fit.national.se} note="vs the forecast, at β = 1" />
            {RESULTS_OFFICES.map((o) => <Term key={o} label={`${OFFICE_LABEL[o]} offset`} value={fit.office[o].value} se={fit.office[o].se} />)}
            <Term label="+10 pts nonwhite" value={fit.slopes.nonwhite.value} se={fit.slopes.nonwhite.se} note="swing per 10 pts more nonwhite" />
            <Term label="+10 pts college" value={fit.slopes.college.value} se={fit.slopes.college.se} note="per 10 pts more college grads" />
            <Term label="+10 pts redder" value={fit.slopes.lean.value} se={fit.slopes.lean.se} note="per 10 pts redder prior" />
          </div>
          {states.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={muted}>States running off their projection <span className="font-normal normal-case tracking-normal" style={veryMuted}>— beyond the national swing; shared by every race in the state</span></div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] tabular-nums">
                {states.map(([st, s]) => <span key={st}><b>{st}</b> <span style={{ color: marginSideColor(s.value) }}>{fmtMargin(s.value, undefined, 1)}</span> <span style={veryMuted}>±{s.se.toFixed(1)}</span></span>)}
              </div>
            </div>
          )}
          {fit.mirageNational.n >= 1 && (
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={muted}>Votes counted first vs the final <span className="font-normal normal-case tracking-normal" style={veryMuted}>— how far a county&apos;s first votes run from where it finishes; part-counted counties are read with this removed</span></div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] tabular-nums">
                <span><b>Nation</b> <span style={{ color: marginSideColor(-fit.mirageNational.value) }}>{fmtMargin(-fit.mirageNational.value, undefined, 1)}</span> <span style={veryMuted}>±{fit.mirageNational.se.toFixed(1)}</span></span>
                {mirages.map(([st, m]) => <span key={st}><b>{st}</b> <span style={{ color: marginSideColor(-m.value) }}>{fmtMargin(-m.value, undefined, 1)}</span> <span style={veryMuted}>±{m.se.toFixed(1)}</span></span>)}
              </div>
            </div>
          )}
          {movers.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={muted}>Races not yet counting, moved most <span className="font-normal normal-case tracking-normal" style={veryMuted}>— forecast → implied by the counties in elsewhere</span></div>
              <div className="grid gap-x-6 gap-y-1 text-[13px] tabular-nums sm:grid-cols-2 lg:grid-cols-4">
                {movers.map((r) => (
                  <button key={raceHash(r.prior)} onClick={() => onSelect(r)} className="flex min-w-0 items-baseline gap-2 text-left hover:underline">
                    <span className="truncate font-semibold">{r.prior.office === "house" ? r.prior.label : `${r.prior.label} ${OFFICE_LABEL[r.prior.office]}`}</span>
                    <span className="ml-auto whitespace-nowrap"><span style={muted}>{fmtCall(r.prior.forecast.margin, r.prior)}</span> → <b style={{ color: marginSideColor(r.proj.margin, r.prior) }}>{fmtCall(r.proj.margin, r.prior)}</b> <span style={veryMuted}>±{r.proj.night.se.toFixed(1)}</span></span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
