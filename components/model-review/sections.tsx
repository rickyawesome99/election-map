"use client";

import { useMemo, useState } from "react";
import type { MapRow } from "@/components/tpl/TplMaps";
import { LazyMount, MarginFig, Notes, Picked, PickedFig, RankTable, Reveal, RowLink, ScaleLegend, Seg, TplMap, type Col } from "@/components/results/ui";
import { fmtLean, fmtMargin, getRaceColor, leanColor, marginColor } from "@/lib/colorScale";
import { MR_OFFICES, MR_OFFICE_NAME, fmtMiss, missInk, type MrOffice, type MrRace } from "@/lib/modelReview2026Types";
import { Figure, Grade, Key, useTip } from "./charts";

// The interactive parts of the 2026 Model Review: the forecast-against-result scatter, the map of
// where the forecast missed, and the graded table of every contested race.

const INK = "var(--app-text-primary)", MUTED = "var(--app-text-muted)", RULE = "var(--app-border)";
const slotLetter = (r: MrRace) => (r.demParty === "D" ? "D" : r.demParty);
/** A margin in the race's own letters: an independent in the Democratic slot reads "I+". */
const raceMargin = (r: MrRace, v: number) => (v < 0 && r.demParty !== "D" ? `${slotLetter(r)}+${Math.abs(v).toFixed(1)}` : fmtMargin(v));
const raceName = (r: MrRace) => (r.office === "house" ? r.label : `${r.label} ${MR_OFFICE_NAME[r.office]}`);
const surname = (n: string) => n.trim().split(/\s+/).filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w)).pop() ?? n;

type Scope = MrOffice | "all";
const SCOPES: [Scope, string][] = [["all", "All"], ...MR_OFFICES];

// ── scatter ───────────────────────────────────────────────────────────────────

export function ForecastScatter({ races, bias }: { races: MrRace[]; bias: Record<Scope, number> }) {
  const [scope, setScope] = useState<Scope>("all");
  const [tip, bind] = useTip();
  const W = 560, H = 560, m = { l: 58, r: 14, t: 14, b: 48 }, lim = 50, pw = W - m.l - m.r, ph = H - m.t - m.b;
  const x = (v: number) => m.l + ((v + lim) / (2 * lim)) * pw, y = (v: number) => m.t + ph - ((v + lim) / (2 * lim)) * ph;
  const shown = useMemo(() => races.filter((r) => (scope === "all" || r.office === scope) && Math.abs(r.f) <= lim && Math.abs(r.a) <= lim).sort((p, q) => Number(q.right) - Number(p.right)), [races, scope]);
  const mu = bias[scope], a1 = Math.max(-lim, -lim - mu), a2 = Math.min(lim, lim - mu);
  const tick = (v: number) => (v === 0 ? "Even" : `${v < 0 ? "D" : "R"}+${Math.abs(v)}`);
  return (
    <Figure title="Forecast against result, every contested race"
      legend={<><Key color="var(--party-dem)">Democrat won</Key><Key color="var(--party-rep)">Republican won</Key><Key color={INK} hollow>Forecast favourite lost</Key><Key color={MUTED} line="dashed">A perfect forecast</Key><Key color={INK} line>The average miss</Key></>}
      note={<>Each dot is one race. A dot on the dashed line was forecast exactly; a dot below it is a race where Democrats did better than forecast. The dots form a narrow band that runs parallel to the dashed line and sits below it: the forecast put the races in the right order, and the whole field came in more Democratic. Races beyond 50 points are not drawn.</>}>
      <div className="mb-2 w-fit"><Seg label="Office" value={scope} onChange={setScope} options={SCOPES} /></div>
      <div className="max-w-[620px]">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Scatter of forecast margin against result margin">
          <rect x={x(0)} y={y(0)} width={x(lim) - x(0)} height={y(-lim) - y(0)} fill="var(--party-dem)" opacity="0.07" />
          <rect x={x(-lim)} y={y(lim)} width={x(0) - x(-lim)} height={y(0) - y(lim)} fill="var(--party-rep)" opacity="0.07" />
          {[-40, -20, 0, 20, 40].map((v) => (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1={m.t} y2={m.t + ph} stroke={RULE} strokeWidth={v === 0 ? 1.4 : 0.8} />
              <line y1={y(v)} y2={y(v)} x1={m.l} x2={m.l + pw} stroke={RULE} strokeWidth={v === 0 ? 1.4 : 0.8} />
              <text x={x(v)} y={m.t + ph + 17} textAnchor="middle" fontSize="12" fill={MUTED}>{tick(v)}</text>
              <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill={MUTED}>{tick(v)}</text>
            </g>
          ))}
          <text x={m.l + pw / 2} y={H - 8} textAnchor="middle" fontSize="12.5" fill={INK}>Forecast margin</text>
          <text transform={`translate(14 ${m.t + ph / 2}) rotate(-90)`} textAnchor="middle" fontSize="12.5" fill={INK}>Result</text>
          <text x={x(lim) - 8} y={y(-lim) - 10} textAnchor="end" fontSize="11.5" fill={MUTED}>Forecast Republican, went Democratic</text>
          <text x={x(-lim) + 8} y={y(lim) + 18} fontSize="11.5" fill={MUTED}>Forecast Democratic, went Republican</text>
          <line x1={x(-lim)} y1={y(-lim)} x2={x(lim)} y2={y(lim)} stroke={MUTED} strokeDasharray="5 4" strokeWidth="1.2" />
          <line x1={x(a1)} y1={y(a1 + mu)} x2={x(a2)} y2={y(a2 + mu)} stroke={INK} strokeWidth="1.8" />
          {shown.map((r) => (
            <circle key={`${r.office}${r.id}`} cx={x(r.f)} cy={y(r.a)} r={r.right ? 4 : 5.2} fill={r.demWon ? "var(--party-dem)" : "var(--party-rep)"} fillOpacity={r.right ? 0.6 : 0.95}
              stroke={r.right ? "var(--app-bg)" : INK} strokeWidth={r.right ? 1 : 1.8} tabIndex={r.right ? -1 : 0}
              {...bind(<><b>{raceName(r)}</b><br />Forecast {raceMargin(r, r.f)} · Result {raceMargin(r, r.a)}<br />{r.err < 0 ? "Democrats" : "Republicans"} beat the forecast by {Math.abs(r.err).toFixed(1)}{r.right ? "" : " · call missed"}</>)} />
          ))}
        </svg>
      </div>
      {tip}
    </Figure>
  );
}

// ── map ───────────────────────────────────────────────────────────────────────

type MapView = "err" | "a" | "f";
const VIEWS: [MapView, string][] = [["err", "Miss"], ["a", "Result"], ["f", "Forecast"]];
const VIEW_LABEL: Record<MapView, string> = { err: "Result against forecast", a: "Result", f: "Final forecast" };

export function MissMap({ races }: { races: MrRace[] }) {
  const [office, setOffice] = useState<MrOffice>("house");
  const [view, setView] = useState<MapView>("err");
  const [picked, setPicked] = useState<string | null>(null);
  const own = useMemo(() => races.filter((r) => r.office === office), [races, office]);
  const rows = useMemo<MapRow[]>(() => own.map((r) => ({ key: r.mapKey, name: r.label, value: r[view], href: r.href })), [own, view]);
  const sel = picked ? own.find((r) => r.mapKey === picked) ?? null : null;
  const isMiss = view === "err";
  return (
    <Reveal>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Seg label="Office" value={office} onChange={(o) => { setOffice(o); setPicked(null); }} options={MR_OFFICES} />
        <Seg label="Show" value={view} onChange={setView} options={VIEWS} />
        <div className="sm:ml-auto"><ScaleLegend label={VIEW_LABEL[view]} /></div>
      </div>
      <LazyMount className="mx-4 aspect-[5/3] max-h-[620px] sm:mx-12 lg:mx-32">
        <TplMap key={office} mode={office === "house" ? "districts" : "states"} rows={rows} valueLabel={VIEW_LABEL[view]} linkLabel="Open race page"
          colorOf={getRaceColor} formatValue={isMiss ? fmtLean : fmtMargin} valueColor={isMiss ? leanColor : marginColor}
          onSelect={(r) => setPicked(r ? r.key : null)} selectedKey={picked} zoomable={office === "house"} fill panel={false} framed={false} />
      </LazyMount>
      {sel && (
        <Picked id={`${sel.office}${sel.id}`} title={<>{raceName(sel)}<span className="ml-2 text-sm font-normal" style={{ color: MUTED }}>{surname(sel.dem)} ({slotLetter(sel)}) vs. {surname(sel.rep)} (R)</span></>} href={sel.href} linkLabel="Race page" onClose={() => setPicked(null)}>
          <PickedFig label="Final forecast" note={`${sel.rating} · ${Math.round(Math.max(sel.pDem, 1 - sel.pDem) * 100)}% favourite`}><MarginFig v={sel.f} size="1.5rem" /></PickedFig>
          <PickedFig label={sel.called ? "Result" : "Count so far"}><MarginFig v={sel.a} size="1.5rem" /></PickedFig>
          <PickedFig label="Miss" note={sel.right ? "winner called correctly" : "forecast favourite lost"}><span className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1.5rem", color: missInk(sel.err) }}>{fmtMiss(sel.err)}</span></PickedFig>
          <PickedFig label="Grade"><Grade g={sel.grade} /></PickedFig>
        </Picked>
      )}
      <Notes>
        <p><strong>Miss:</strong> the result margin minus the forecast margin. <b style={{ color: "var(--party-dem)" }}>Blue</b> means Democrats did better than the forecast said, <b style={{ color: "var(--party-rep)" }}>red</b> that Republicans did; the deeper the colour, the larger the miss (the darkest step starts at 15 points). Select a place for its figures.</p>
        <p><strong>Grey</strong> places had no race for the office, or no Democrat-versus-Republican contest to score: seats with one party on the ballot and same-party finals.</p>
      </Notes>
    </Reveal>
  );
}

// ── every race ────────────────────────────────────────────────────────────────

type Which = "close" | "wrong" | "all";
const GRADE_RANK = { A: 0, B: 1, C: 2, D: 3, F: 4 } as const;

export function RaceGrades({ races }: { races: MrRace[] }) {
  const [office, setOffice] = useState<MrOffice>("house");
  const [which, setWhich] = useState<Which>("close");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return races.filter((r) => r.office === office
      && (which === "all" || (which === "wrong" ? !r.right : Math.abs(r.f) < 10 || Math.abs(r.a) < 5 || !r.right))
      && (!needle || `${r.label} ${r.abbr} ${r.dem} ${r.rep}`.toLowerCase().includes(needle)));
  }, [races, office, which, q]);
  const total = races.filter((r) => r.office === office).length;
  const M = ({ r, v }: { r: MrRace; v: number }) => <span style={{ color: v < 0 && r.demParty !== "D" ? "var(--party-ind)" : marginColor(v) }}>{raceMargin(r, v)}</span>;
  const cols: Col<MrRace>[] = [
    { key: "race", head: "Race", left: true, sort: (r) => r.label, cell: (r) => (
      <><RowLink href={r.href}>{r.label}</RowLink>{!r.called && <span title="Not yet called; graded on the count so far" style={{ color: MUTED }}> †</span>}
        <span className="ml-2 hidden text-xs sm:inline" style={{ color: MUTED }}>{surname(r.dem)} ({slotLetter(r)}) vs. {surname(r.rep)} (R)</span></>
    ) },
    { key: "rating", head: "Rating", left: true, wide: true, sort: (r) => r.f, cell: (r) => <span className="text-xs">{r.rating}</span> },
    { key: "f", head: "Forecast", sort: (r) => r.f, cell: (r) => <M r={r} v={r.f} /> },
    { key: "model", head: "Fundamentals", wide: true, title: "The forecast before any race polls were blended in", sort: (r) => r.model, cell: (r) => <span style={{ color: MUTED }}>{raceMargin(r, r.model)}</span> },
    { key: "poll", head: "Polls", wide: true, title: "The race's poll average at face value, and the weight it got", sort: (r) => r.poll, cell: (r) => (r.poll == null ? <span style={{ color: MUTED }}>none</span> : <span style={{ color: MUTED }}>{fmtLean(r.poll)} <span className="text-xs">×{r.w.toFixed(2)}</span></span>) },
    { key: "a", head: "Result", sort: (r) => r.a, cell: (r) => <M r={r} v={r.a} /> },
    { key: "err", head: "Miss", sort: (r) => r.err, cell: (r) => <span className="font-semibold" style={{ color: missInk(r.err) }}>{fmtMiss(r.err)}</span> },
    { key: "call", head: "Call", sort: (r) => Number(r.right), cell: (r) => (r.right ? <span aria-label="right" style={{ color: MUTED }}>✓</span> : <span aria-label="missed" className="font-bold">✗</span>) },
    { key: "grade", head: "Grade", sort: (r) => GRADE_RANK[r.grade], cell: (r) => <Grade g={r.grade} /> },
    { key: "rel", head: "Net of national", wide: true, title: "The same grade after the office's average miss is taken out of every race", sort: (r) => GRADE_RANK[r.gradeRel], cell: (r) => <><span className="mr-1.5 text-xs" style={{ color: MUTED }}>{fmtMiss(r.rel)}</span><Grade g={r.gradeRel} /></> },
  ];
  return (
    <Reveal>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Seg label="Office" value={office} onChange={setOffice} options={MR_OFFICES} />
        <Seg label="Races" value={which} onChange={setWhich} options={[["close", "Competitive"], ["wrong", "Missed calls"], ["all", `All ${total}`]]} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter: TX, NC-13, a name" aria-label="Filter races"
          className="w-full rounded-md px-2.5 py-1 text-sm sm:ml-auto sm:w-56" style={{ background: "var(--app-bg)", border: `1px solid ${RULE}`, color: INK }} />
      </div>
      <RankTable key={`${office}${which}`} rows={rows} cols={cols} rowKey={(r) => `${r.office}${r.id}`} label="Forecast and result for every race" initial={{ key: "f", dir: 1 }} limit={25} noun="races" />
      {rows.length === 0 && <p className="py-4 text-sm" style={{ color: MUTED }}>No race matches.</p>}
    </Reveal>
  );
}
