"use client";

import { useMemo, useState } from "react";
import type { MapRow } from "@/components/tpl/TplMaps";
import { SEQUENTIAL, scaleColor, type Scale } from "@/components/turnout/turnoutColors";
import { getRaceColor } from "@/lib/colorScale";
import { R26_OFFICES, type R26Office, type R26Race } from "@/lib/results2026Types";
import { useDarkMode } from "@/lib/useDarkMode";
import { Figure, KeptBar, LazyMount, Notes, Picked, PickedFig, RankTable, Reveal, RowLink, ScaleLegend, Seg, Stat, StatRow, TplMap, fmtCompact, fmtInt, type Col } from "./ui";

// Section 3: each party's 2026 vote in a race as a share of its vote there before: the 2024
// presidential vote on the same ground, or the last time that exact seat was up.

type Base = "pres" | "prev";
type Measure = "net" | "d" | "r";
const BASES: [Base, string][] = [["pres", "President 2024"], ["prev", "Last time the seat was up"]];
const MEASURES: [Measure, string][] = [["net", "Net"], ["d", "Democratic votes"], ["r", "Republican votes"]];

type Row = { race: R26Race; baseYear: number | null; d0: number | null; r0: number | null; dPct: number | null; rPct: number | null; net: number | null; why?: string };

function rowOf(race: R26Race, base: Base): Row {
  const b = base === "pres"
    ? (race.pres ? { year: 2024, d: race.pres.d, r: race.pres.r, dRan: true, rRan: true, moved: false } : null)
    : race.prev;
  if (!b) return { race, baseYear: null, d0: null, r0: null, dPct: null, rPct: null, net: null, why: "no earlier race" };
  if (b.moved) return { race, baseYear: b.year, d0: null, r0: null, dPct: null, rPct: null, net: null, why: "lines redrawn" };
  const d0 = b.dRan ? b.d : null, r0 = b.rRan ? b.r : null;
  const dPct = race.dRan && d0 ? (race.d / d0) * 100 : null, rPct = race.rRan && r0 ? (race.r / r0) * 100 : null;
  return { race, baseYear: b.year, d0, r0, dPct, rPct, net: dPct != null && rPct != null ? rPct - dPct : null };
}

/** Not a swing or a margin: the gap between two shares runs to 80 points, so it is drawn on the party colours at a third strength (darkest from 45). */
const netColor = (v: number) => getRaceColor(v / 3);
const pctText = (v: number | null) => (v == null ? "—" : `${v.toFixed(0)}%`);
/** The net gap reads as the party that held more of its vote: "D +24". */
const netText = (v: number | null) => (v == null ? "—" : Math.abs(v) < 0.5 ? "Even" : `${v < 0 ? "D" : "R"} +${Math.abs(v).toFixed(0)}`);
const netInk = (v: number | null) => (v == null ? "var(--app-text-very-muted)" : Math.abs(v) < 0.5 ? "var(--app-text-primary)" : v < 0 ? "var(--party-dem)" : "var(--party-rep)");

export default function RawVoteSection({ races }: { races: R26Race[] }) {
  const [office, setOffice] = useState<R26Office>("house");
  const [base, setBase] = useState<Base>("pres");
  const [measure, setMeasure] = useState<Measure>("net");
  const [picked, setPicked] = useState<string | null>(null);
  const dark = useDarkMode();

  const rows = useMemo(() => races.filter((r) => r.office === office).map((r) => rowOf(r, base)), [races, office, base]);
  const mapRows = useMemo<MapRow[]>(() => rows.flatMap((r) => {
    const value = measure === "net" ? r.net : measure === "d" ? r.dPct : r.rPct;
    return value == null ? [] : [{ key: r.race.mapKey, name: r.race.label, value, href: r.race.href }];
  }), [rows, measure]);
  const scale = useMemo<Scale>(() => ({ kind: "sequential", min: 40, max: 120, ramp: SEQUENTIAL[dark ? "dark" : "light"] }), [dark]);
  const colorOf = useMemo(() => (measure === "net" ? netColor : (v: number) => scaleColor(scale, v)), [measure, scale]);

  // The parties' totals over the races where each can be compared.
  const totals = useMemo(() => {
    let d = 0, d0 = 0, r = 0, r0 = 0;
    for (const x of rows) {
      if (x.dPct != null) { d += x.race.d; d0 += x.d0!; }
      if (x.rPct != null) { r += x.race.r; r0 += x.r0!; }
    }
    return { d, d0, r, r0 };
  }, [rows]);
  const sel = picked ? rows.find((r) => r.race.mapKey === picked) ?? null : null;
  const baseWord = base === "pres" ? "2024 presidential" : office === "house" ? "2024 House" : "previous";

  const cols: Col<Row>[] = [
    { key: "race", head: "Race", left: true, sort: (r) => r.race.label, cell: (r) => <><RowLink href={r.race.href}>{r.race.label}</RowLink>{(r.why ?? r.race.note) && <span className="ml-2 text-xs" style={{ color: "var(--app-text-very-muted)" }}>{r.why ?? r.race.note}</span>}</> },
    ...(base === "prev" && office !== "house" ? [{ key: "year", head: "Last up", sort: (r: Row) => r.baseYear, cell: (r: Row) => r.baseYear ?? "—" }] : []),
    { key: "d", head: "Dem. 2026", wide: true, sort: (r) => (r.race.dRan ? r.race.d : null), cell: (r) => (r.race.dRan ? fmtInt(r.race.d) : "—") },
    { key: "d0", head: "Before", wide: true, sort: (r) => r.d0, cell: (r) => (r.d0 == null ? "—" : fmtInt(r.d0)) },
    { key: "dPct", head: "Dem. kept", sort: (r) => r.dPct, cell: (r) => <span className="inline-grid w-full min-w-[4.5rem] justify-items-end gap-1"><Figure color="var(--party-dem)">{pctText(r.dPct)}</Figure><KeptBar pct={r.dPct} color="var(--party-dem)" /></span> },
    { key: "r", head: "Rep. 2026", wide: true, sort: (r) => (r.race.rRan ? r.race.r : null), cell: (r) => (r.race.rRan ? fmtInt(r.race.r) : "—") },
    { key: "r0", head: "Before", wide: true, sort: (r) => r.r0, cell: (r) => (r.r0 == null ? "—" : fmtInt(r.r0)) },
    { key: "rPct", head: "Rep. kept", sort: (r) => r.rPct, cell: (r) => <span className="inline-grid w-full min-w-[4.5rem] justify-items-end gap-1"><Figure color="var(--party-rep)">{pctText(r.rPct)}</Figure><KeptBar pct={r.rPct} color="var(--party-rep)" /></span> },
    { key: "net", head: "Net", sort: (r) => r.net, title: "The gap between the two shares, named for the party that held more of its vote", cell: (r) => <Figure color={netInk(r.net)}>{netText(r.net)}</Figure> },
  ];

  return (
    <Reveal>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Seg label="Office" value={office} onChange={(v) => { setOffice(v); setPicked(null); }} options={R26_OFFICES} />
        <Seg label="Compared with" value={base} onChange={setBase} options={BASES} />
        <Seg label="Color by" value={measure} onChange={setMeasure} options={MEASURES} />
        <div className="sm:ml-auto">
          {measure === "net"
            ? <ScaleLegend lo="D +45" hi="R +45" label="Net share of vote kept" />
            : <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--app-text-muted)" }} aria-label="Map legend: 40% to 120% of the earlier vote"><span>40%</span>{scale.ramp.map((c) => <span key={c} className="inline-block h-2 w-3.5" style={{ background: c }} />)}<span>120%</span></div>}
        </div>
      </div>

      <StatRow key={`${office}-${base}`}>
        <Stat value={fmtCompact(totals.d)} color="var(--party-dem)" label="votes for Democratic candidates" />
        <Stat delay={60} value={pctText(totals.d0 ? (totals.d / totals.d0) * 100 : null)} color="var(--party-dem)" label={<>of the {baseWord} Democratic vote in the same places</>} />
        <Stat delay={120} value={fmtCompact(totals.r)} color="var(--party-rep)" label="votes for Republican candidates" />
        <Stat delay={180} value={pctText(totals.r0 ? (totals.r / totals.r0) * 100 : null)} color="var(--party-rep)" label={<>of the {baseWord} Republican vote</>} />
      </StatRow>

      <LazyMount>
        <TplMap mode={office === "house" ? "districts" : "states"} rows={mapRows} valueLabel={measure === "net" ? "Net vote kept" : measure === "d" ? "Dem. vote kept" : "Rep. vote kept"} linkLabel="Open race page"
          colorOf={colorOf} formatValue={measure === "net" ? netText : pctText} valueColor={measure === "net" ? netInk : () => "var(--app-text-primary)"}
          onSelect={(r) => setPicked(r ? r.key : null)} selectedKey={picked} panel={false} wide />
      </LazyMount>

      {sel && (
        <Picked id={sel.race.mapKey} title={sel.race.label} href={sel.race.href} linkLabel="Race page" onClose={() => setPicked(null)}>
          <PickedFig label="Democrats kept" note={<>{sel.race.dRan ? fmtInt(sel.race.d) : "—"} of {sel.d0 == null ? "—" : fmtInt(sel.d0)}</>}><Figure size="1.5rem" color="var(--party-dem)">{pctText(sel.dPct)}</Figure></PickedFig>
          <PickedFig label="Republicans kept" note={<>{sel.race.rRan ? fmtInt(sel.race.r) : "—"} of {sel.r0 == null ? "—" : fmtInt(sel.r0)}</>}><Figure size="1.5rem" color="var(--party-rep)">{pctText(sel.rPct)}</Figure></PickedFig>
          <PickedFig label="Net" note={sel.why ?? sel.race.note}><Figure size="1.5rem" color={netInk(sel.net)}>{netText(sel.net)}</Figure></PickedFig>
          <PickedFig label="Compared with"><span className="text-sm">{sel.baseYear ?? "—"} {base === "pres" ? "president" : "same seat"}</span></PickedFig>
        </Picked>
      )}

      <div className="mt-8">
        <RankTable rows={rows} cols={cols} rowKey={(r) => `${r.race.office}-${r.race.id}`} label="Each party's 2026 vote against the earlier vote, by race" initial={{ key: "net", dir: 1 }} noun="races" />
      </div>
      <Notes>
        <p><strong>Totals</strong> count only the races where the party ran both times.</p>
        <p><strong>Kept:</strong> the party&rsquo;s 2026 votes in the race as a percentage of its votes on the same ground in the earlier election. Midterm turnout is lower than presidential turnout, so both parties usually land under 100% against 2024; what matters is the gap between them.</p>
        <p><strong>Net:</strong> the difference between the two percentages, named for the party that held more of its vote. It is not a margin.</p>
        <p><strong>Last time the seat was up:</strong> the 2024 House race in the district; for a Senate seat its own last election, special elections included, never the state&rsquo;s other seat (most were last up in 2020; Nebraska&rsquo;s in the 2024 special, Oklahoma&rsquo;s in the 2022 special, Florida&rsquo;s and Ohio&rsquo;s in 2022); for governor the last governor&rsquo;s race (2022, or 2024 in New Hampshire and Vermont).</p>
        <p><strong>Left blank:</strong> a House district whose lines changed for 2026 has no earlier House vote on the same ground; its 2024 presidential vote is on the new lines. A party with no candidate in either year, or an independent standing in its place, has nothing to compare.</p>
      </Notes>
    </Reveal>
  );
}
