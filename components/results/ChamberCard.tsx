"use client";

import type { ChamberTally } from "@/lib/resultsNeedle";
import { OFFICE_LABEL, type Party, type ResultsOffice, type SeatPoint } from "@/lib/resultsTypes";
import { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "@/lib/forecastTypes";
import { fmtInt, fmtMargin, marginSideColor, partyColor } from "@/lib/resultsFormat";
import type { ResultsRow } from "@/components/results/ResultsPage";
import SeatTrend from "@/components/results/SeatTrend";

// One chamber on the Results page, flat on the page background like the forecast hero: the called
// seats in the serif, one balance-of-power bar (called solid, leading light, not yet counted grey,
// majority tick), the needle's projection in a line, flips as chips, and the popular vote as a bar.

const MAJORITY: Record<ResultsOffice, number> = { senate: 51, governor: 26, house: 218 };
const label = "font-mono text-[10px] font-bold uppercase tracking-wider";
const muted = { color: "var(--app-text-muted)" };
const serif = { fontFamily: "var(--font-serif)" };
const LIGHT: Record<Party, string> = { D: "color-mix(in srgb, var(--party-dem) 38%, var(--app-bg))", R: "color-mix(in srgb, var(--party-rep) 38%, var(--app-bg))", I: "color-mix(in srgb, var(--party-ind) 38%, var(--app-bg))" };

export default function ChamberCard({ office, tally, rows, history, onSelect }: { office: ResultsOffice; tally: ChamberTally; rows: ResultsRow[]; history: SeatPoint[]; onSelect: (r: ResultsRow) => void }) {
  const total = TOTAL_SEATS_BY_TYPE[office];
  const majority = MAJORITY[office];
  const { called, leading, expectedDem, popular: pv } = tally;
  const lead = { dem: leading.dem - called.dem, rep: leading.rep - called.rep, ind: leading.ind - called.ind };
  const open = Math.max(0, total - leading.dem - leading.rep - leading.ind);
  const w = (n: number) => `${(n / total) * 100}%`;
  const segments: { n: number; bg: string; title: string }[] = [
    { n: called.dem, bg: "var(--party-dem)", title: `${called.dem} Democratic seats called or not up` },
    { n: lead.dem, bg: LIGHT.D, title: `${lead.dem} Democrats leading` },
    { n: called.ind, bg: "var(--party-ind)", title: `${called.ind} independents called` },
    { n: lead.ind, bg: LIGHT.I, title: `${lead.ind} independents leading` },
    { n: open, bg: "var(--app-tab-bg)", title: `${open} with no votes counted` },
    { n: lead.rep, bg: LIGHT.R, title: `${lead.rep} Republicans leading` },
    { n: called.rep, bg: "var(--party-rep)", title: `${called.rep} Republican seats called or not up` },
  ];
  const pvMargin = pv.total > 0 ? ((pv.rep - pv.dem) / pv.total) * 100 : null;
  const holdover = SEAT_HOLDOVERS[office];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold">{OFFICE_LABEL[office]}</h3>
        <span className="text-[11px] tabular-nums" style={muted}>{tally.racesIn}/{rows.length} reporting · {tally.racesCalled} called</span>
      </div>

      {/* Called seats */}
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-[2rem] font-bold leading-none tabular-nums" style={{ ...serif, color: "var(--party-dem)" }}>{called.dem}</span>
        {called.ind > 0 && <span className="text-xl font-bold tabular-nums" style={{ ...serif, color: "var(--party-ind)" }}>{called.ind}</span>}
        <span className="text-[2rem] font-bold leading-none tabular-nums" style={{ ...serif, color: "var(--party-rep)" }}>{called.rep}</span>
      </div>

      {/* Balance of power */}
      <div className="relative mt-2">
        <div className="flex h-3.5 overflow-hidden rounded-sm">
          {segments.map((s, i) => s.n > 0 && <div key={i} title={s.title} style={{ width: w(s.n), background: s.bg }} />)}
        </div>
        <div className="absolute -top-1 h-[22px] w-0.5" style={{ left: `calc(${w(majority)} - 1px)`, background: "var(--app-text-primary)" }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px]" style={muted}>
        <span>{lead.dem > 0 ? `+${lead.dem} leading` : ""}</span>
        <span className="tabular-nums" style={{ color: "var(--app-text-primary)" }}>{majority} for majority</span>
        <span>{lead.rep > 0 ? `+${lead.rep} leading` : ""}</span>
      </div>

      {/* Popular vote: two lines */}
      <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--app-border)" }}>
        <div className="flex items-baseline justify-between gap-2">
          <span className={label} style={muted}>Popular vote{pv.projectedTotal ? <span className="ml-2 font-sans text-[11px] font-normal normal-case tracking-normal">{Math.round((pv.total / pv.projectedTotal) * 100)}% of ~{pv.projectedTotal >= 1e6 ? `${(pv.projectedTotal / 1e6).toFixed(1)}M` : fmtInt(pv.projectedTotal)} counted</span> : null}</span>
          <b className="text-sm tabular-nums" style={{ color: marginSideColor(pvMargin) }}>{pv.total > 0 ? fmtMargin(pvMargin) : "—"}</b>
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-2 text-sm tabular-nums">
          <span><b style={{ color: "var(--party-dem)" }}>D {pv.total > 0 ? `${((pv.dem / pv.total) * 100).toFixed(1)}%` : "—"}</b> <span style={muted}>{pv.total > 0 ? fmtInt(pv.dem) : ""}</span></span>
          <span><span style={muted}>{pv.total > 0 ? fmtInt(pv.rep) : ""}</span> <b style={{ color: "var(--party-rep)" }}>{pv.total > 0 ? `${((pv.rep / pv.total) * 100).toFixed(1)}%` : "—"} R</b></span>
        </div>
      </div>

      {/* Needle */}
      <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--app-border)" }}>
        <div className="flex items-baseline justify-between gap-2">
          <span className={label} style={muted}>Projected</span>
          <span className="text-sm tabular-nums">
            <b style={{ color: "var(--party-dem)" }}>{Math.round(expectedDem.mean)}</b>
            <span style={muted}> D seats · {Math.round(expectedDem.lo80)}–{Math.round(expectedDem.hi80)}</span>
          </span>
        </div>
        <div className="mt-1.5"><SeatTrend points={history} majority={majority} total={total} /></div>
      </div>

      {/* Flips */}
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className={label} style={muted}>Flips</span>
        <span className="text-sm tabular-nums">{tally.flips.length === 0 ? <span style={muted}>None yet</span> : <><b>{tally.flips.length}</b><span style={muted}> · {tally.flips.filter((f) => f.status === "called").length} called</span></>}</span>
      </div>
      {tally.flips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tally.flips.slice(0, 10).map((f) => {
            const row = rows.find((r) => r.prior.id === f.id);
            if (!row) return null;
            const isCalled = f.status === "called";
            return (
              <button key={f.id} onClick={() => onSelect(row)} title={`${f.from} → ${f.to}, ${isCalled ? "called" : "projected"}`}
                className="rounded-sm px-1.5 py-0.5 text-[11px] font-semibold"
                style={isCalled ? { background: partyColor(f.to), color: "#ffffff" } : { border: `1px dashed ${partyColor(f.to)}`, color: partyColor(f.to) }}>
                {office === "house" ? row.prior.label : row.prior.state}
              </button>
            );
          })}
          {tally.flips.length > 10 && <span className="self-center text-[11px]" style={muted}>+{tally.flips.length - 10}</span>}
        </div>
      )}

      {office !== "house" && <div className="mt-2 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>Called includes {holdover.dem} D and {holdover.rep} R seats not up</div>}
    </div>
  );
}
