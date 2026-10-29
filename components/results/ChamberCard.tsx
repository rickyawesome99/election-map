"use client";

import type { ChamberTally } from "@/lib/resultsNeedle";
import { OFFICE_LABEL, type Party, type ResultsOffice, type SeatPoint } from "@/lib/resultsTypes";
import { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "@/lib/forecastTypes";
import { callSideColor, fmtCall, fmtInt, partyColor } from "@/lib/resultsFormat";
import type { ResultsRow } from "@/components/results/ResultsPage";
import SeatTrend from "@/components/results/SeatTrend";

// One chamber on the Results page, flat on the page background like the forecast hero: the called
// seats in the serif, one balance-of-power bar (called solid, leading light, not yet counted grey,
// majority tick), the needle's projection in a line, and the popular vote; the net seat change (called
// flips only, absent until one is called) sits in the header.
// At xl the three cards stack in a column beside the map, so each one tightens: the called seats
// flank the bar, and popular vote / projection / seat trend sit side by side in one row. Phones
// (max-sm) borrow the same moves: seats flanking the bar, the projection beside its trend chart.

const MAJORITY: Record<ResultsOffice, number> = { senate: 51, governor: 26, house: 218 };
const label = "font-mono text-[10px] font-bold uppercase tracking-wider";
const muted = { color: "var(--app-text-muted)" };
const serif = { fontFamily: "var(--font-serif)" };
const LIGHT: Record<Party, string> = { D: "color-mix(in srgb, var(--party-dem) 38%, var(--app-bg))", R: "color-mix(in srgb, var(--party-rep) 38%, var(--app-bg))", I: "color-mix(in srgb, var(--party-ind) 38%, var(--app-bg))" };

export default function ChamberCard({ office, tally, rows, history }: { office: ResultsOffice; tally: ChamberTally; rows: ResultsRow[]; history: SeatPoint[] }) {
  const total = TOTAL_SEATS_BY_TYPE[office];
  const majority = MAJORITY[office];
  const { called, leading, projectedDem, popular: pv } = tally;
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
  // Net seat change from called flips only (a projected or leading flip is not a change yet):
  // seats gained by Democrats less seats they lose; nothing shown until a flip is called. The
  // called flips are listed in the hover title.
  const calledFlips = tally.flips.filter((f) => f.status === "called");
  const notUp = office !== "house" ? <span title="Seats not on the ballot this year, counted in the called totals">Not up: {holdover.dem} D, {holdover.rep} R</span> : null;
  const net = calledFlips.filter((f) => f.to === "D").length - calledFlips.filter((f) => f.from === "D").length;
  const flipList = calledFlips.map((f) => { const r = rows.find((x) => x.prior.id === f.id); return `${r ? (office === "house" ? r.prior.label : r.prior.state) : f.id} ${f.from}→${f.to}`; }).join(", ");
  const pvCounted = pv.projectedTotal ? `${Math.round((pv.total / pv.projectedTotal) * 100)}% of ~${pv.projectedTotal >= 1e6 ? `${(pv.projectedTotal / 1e6).toFixed(1)}M` : fmtInt(pv.projectedTotal)}` : "";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-bold">{OFFICE_LABEL[office]}</h3>
        <span className="text-[11px] tabular-nums" style={muted}>{tally.racesIn}/{rows.length} reporting · {tally.racesCalled} called{calledFlips.length > 0 && <> · <b className="whitespace-nowrap" title={`Called flips: ${flipList}`} style={{ color: net === 0 ? "var(--app-text-primary)" : partyColor(net > 0 ? "D" : "R") }}>{net === 0 ? "no net change" : `net ${net > 0 ? "D" : "R"}+${Math.abs(net)}`}</b></>}{called.ind > 0 && <span className="hidden max-sm:inline xl:inline"> · <b style={{ color: "var(--party-ind)" }}>{called.ind} I</b></span>}</span>
      </div>

      {/* Called seats over the bar; on phones and at xl, either side of it */}
      <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 max-sm:items-center xl:items-center">
        <span className="text-[2rem] font-bold leading-none tabular-nums max-sm:col-start-1 max-sm:row-start-1 xl:col-start-1 xl:row-start-1" style={{ ...serif, color: "var(--party-dem)" }}>{called.dem}</span>
        <span className="justify-self-center max-sm:hidden xl:hidden">{called.ind > 0 && <span className="text-xl font-bold tabular-nums" style={{ ...serif, color: "var(--party-ind)" }}>{called.ind}</span>}</span>
        <span className="text-[2rem] font-bold leading-none tabular-nums max-sm:col-start-3 max-sm:row-start-1 xl:col-start-3 xl:row-start-1" style={{ ...serif, color: "var(--party-rep)" }}>{called.rep}</span>

        {/* Balance of power */}
        <div className="col-span-3 mt-2 max-sm:col-span-1 max-sm:col-start-2 max-sm:row-start-1 max-sm:mt-0 xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:mt-0">
          <div className="relative">
            <div className="flex h-3.5 overflow-hidden rounded-sm">
              {segments.map((s, i) => s.n > 0 && <div key={i} title={s.title} style={{ width: w(s.n), background: s.bg }} />)}
            </div>
            <div className="absolute -top-1 h-[22px] w-0.5" style={{ left: `calc(${w(majority)} - 1px)`, background: "var(--app-text-primary)" }} />
          </div>
          <div className="mt-1 flex justify-between text-[10.5px] sm:text-[11px] xl:text-[10.5px]" style={muted}>
            <span>{lead.dem > 0 ? `+${lead.dem} leading` : ""}</span>
            <span className="tabular-nums" style={{ color: "var(--app-text-primary)" }}>{majority} for majority</span>
            <span>{lead.rep > 0 ? `+${lead.rep} leading` : ""}</span>
          </div>
        </div>
      </div>

      <div className="max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)] xl:relative xl:mt-3 xl:grid xl:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.25fr)] xl:gap-x-4 xl:border-t xl:pt-2" style={{ borderColor: "var(--app-border)" }}>
        {/* Popular vote: two lines (at xl, without the raw counts, and the share counted under them) */}
        <div className="mt-3 border-t pt-2 max-sm:col-span-2 xl:mt-0 xl:border-t-0 xl:pt-0" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex items-baseline justify-between gap-2">
            <span className={label} style={muted}>Popular vote{pv.projectedTotal ? <span className="ml-2 font-sans text-[11px] font-normal normal-case tracking-normal xl:hidden">{pvCounted} counted</span> : null}</span>
            <b className="text-sm tabular-nums" style={{ color: callSideColor(pvMargin) }}>{pv.total > 0 ? fmtCall(pvMargin) : "—"}</b>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-2 text-sm tabular-nums">
            <span><b style={{ color: "var(--party-dem)" }}>D {pv.total > 0 ? `${((pv.dem / pv.total) * 100).toFixed(1)}%` : "—"}</b> <span className="xl:hidden" style={muted}>{pv.total > 0 ? fmtInt(pv.dem) : ""}</span></span>
            <span><span className="xl:hidden" style={muted}>{pv.total > 0 ? fmtInt(pv.rep) : ""}</span> <b style={{ color: "var(--party-rep)" }}>{pv.total > 0 ? `${((pv.rep / pv.total) * 100).toFixed(1)}%` : "—"} R</b></span>
          </div>
          {pv.projectedTotal ? <div className="mt-0.5 hidden text-[10.5px] tabular-nums xl:block" style={muted} title={pv.total > 0 ? `${fmtInt(pv.dem)} D · ${fmtInt(pv.rep)} R` : undefined}>{pvCounted} counted</div> : null}
        </div>

        {/* Needle */}
        <div className="mt-3 border-t pt-2 xl:mt-0 xl:border-t-0 xl:pt-0" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex items-baseline justify-between gap-2 max-sm:block xl:block">
            <div className={label} style={muted}>Projected</div>
            <div className="text-sm tabular-nums max-sm:mt-0.5 xl:mt-0.5">
              <b style={{ color: "var(--party-dem)" }}>{projectedDem.seats}</b>
              <span style={muted}> D seats<span className="max-sm:hidden xl:hidden"> · </span></span>
              <span className="max-sm:block max-sm:text-[10.5px] xl:block xl:text-[10.5px]" style={muted}><span className="hidden max-sm:inline xl:inline">80%: </span>{Math.round(projectedDem.lo80)}–{Math.round(projectedDem.hi80)}</span>
            </div>
          </div>
        </div>
        <div className="mt-1.5 max-sm:mt-3 max-sm:border-t max-sm:pt-2 max-sm:pl-4 xl:mt-0" style={{ borderColor: "var(--app-border)" }}><SeatTrend points={history} majority={majority} total={total} /></div>
        {/* At xl the chart has its own column, so the seats-not-up note sits under the other two,
            on the chart's time-label row, instead of adding a line to the card. */}
        {notUp && <div className="absolute bottom-0 left-0 hidden text-[10px] tabular-nums xl:block" style={{ color: "var(--app-text-very-muted)" }}>{notUp}</div>}
      </div>

      {notUp && <div className="mt-2 text-[10px] xl:hidden" style={{ color: "var(--app-text-very-muted)" }}>{notUp}</div>}
    </div>
  );
}
