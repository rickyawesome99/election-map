"use client";

import { useMemo, useState } from "react";
import { LedgerSubhead } from "@/components/LedgerSectionHead";
import type { MapRow } from "@/components/tpl/TplMaps";
import { fmtLean, fmtMargin, getRaceColor, leanColor, marginColor } from "@/lib/colorScale";
import type { R26GenericBallot, R26StateRow } from "@/lib/results2026Types";
import { LazyMount, MarginFig, Notes, Picked, PickedFig, RankTable, Reveal, RowLink, ScaleLegend, Seg, ShiftTrack, SwingFig, TH, TplMap, rowMotion, swingColor, type Col } from "./ui";

// Section 5: the House popular vote, 2024 to 2026, with every seat contested (the basis a
// generic-ballot poll measures), nationally and in each state.

type View = "shift" | "y2026" | "y2024";
const VIEWS: [View, string][] = [["shift", "Shift, 2024 to 2026"], ["y2026", "2026"], ["y2024", "2024"]];
const BASES: [keyof Omit<R26GenericBallot["y2024"], "seatsFilled">, string, string][] = [
  ["imputed", "Every seat contested", "Seats with no two-party race filled in from their presidential vote: the adjusted figure"],
  ["contested", "Contested seats only", "Only the seats where a Democrat faced a Republican"],
  ["raw", "Every vote", "The official total, unopposed and same-party seats included"],
];

const M = ({ v, bold }: { v: number | null; bold?: boolean }) => <span className={bold ? "font-semibold" : ""} style={{ color: marginColor(v) }}>{fmtMargin(v)}</span>;

export default function GenericBallotSection({ national, states }: { national: R26GenericBallot; states: R26StateRow[] }) {
  const [view, setView] = useState<View>("shift");
  const [picked, setPicked] = useState<string | null>(null);
  const valueOf = (s: R26StateRow) => (view === "shift" ? s.house - s.house24 : view === "y2026" ? s.house : s.house24);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- valueOf depends on view alone
  const mapRows = useMemo<MapRow[]>(() => states.map((s) => ({ key: s.name, name: s.name, value: valueOf(s), href: s.href })), [states, view]);
  const sel = picked ? states.find((s) => s.name === picked) ?? null : null;

  const cols: Col<R26StateRow>[] = [
    { key: "name", head: "State", left: true, sort: (s) => s.name, cell: (s) => <><RowLink href={s.href}>{s.name}</RowLink>{s.redrawn && <span title="District lines changed for 2026" style={{ color: "var(--app-text-very-muted)" }}> *</span>}</> },
    { key: "seats", head: "Seats", wide: true, sort: (s) => s.seats, cell: (s) => s.seats },
    { key: "h24", head: "2024", sort: (s) => s.house24, cell: (s) => <M v={s.house24} /> },
    { key: "h26", head: "2026", sort: (s) => s.house, cell: (s) => <M v={s.house} /> },
    { key: "track", head: "", wide: true, cell: (s) => <ShiftTrack from={s.house24} to={s.house} className="ml-auto w-24 lg:w-36" /> },
    { key: "shift", head: "Shift", sort: (s) => s.house - s.house24, cell: (s) => <SwingFig v={s.house - s.house24} /> },
    { key: "raw", head: "Shift, every vote", wide: true, title: "The same shift on the official totals, before any seat is filled in", sort: (s) => s.houseRaw - s.houseRaw24, cell: (s) => <span style={{ color: leanColor(s.houseRaw - s.houseRaw24) }}>{fmtLean(s.houseRaw - s.houseRaw24)}</span> },
    { key: "filled", head: "Seats filled in, 2024 / 2026", left: true, wide: true, cell: (s) => <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>{s.dropped24.length || s.dropped.length ? `${s.dropped24.join(", ") || "none"} / ${s.dropped.join(", ") || "none"}` : ""}</span> },
  ];

  return (
    <Reveal>
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <table className="w-full self-start border-collapse text-sm" aria-label="National House vote on three bases, 2024 and 2026">
          <thead>
            <tr style={{ color: "var(--app-text-muted)" }}>
              {["Basis", "2024", "", "2026", "Shift"].map((h, i) => <th key={i} scope="col" className={`${TH} ${i ? "text-right" : "text-left"} ${i === 2 ? "hidden sm:table-cell" : ""}`} style={{ borderBottom: "1px solid var(--app-border)" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {BASES.map(([k, name, desc], i) => (
              <tr key={k} {...rowMotion(i * 3)}>
                <td className="px-2 py-2.5"><div className="font-semibold">{name}</div><div className="text-xs" style={{ color: "var(--app-text-muted)" }}>{desc}</div></td>
                <td className="px-2 py-2.5 text-right tabular-nums"><M v={national.y2024[k]} bold={i === 0} /></td>
                <td className="hidden px-2 py-2.5 sm:table-cell"><ShiftTrack from={national.y2024[k]} to={national.y2026[k]} span={20} className="ml-auto w-28 lg:w-40" /></td>
                <td className="px-2 py-2.5 text-right tabular-nums"><M v={national.y2026[k]} bold={i === 0} /></td>
                <td className="px-2 py-2.5 text-right"><SwingFig v={national.y2026[k] - national.y2024[k]} size={i === 0 ? "1.5rem" : "1.1rem"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-3 text-[15px] leading-relaxed">
          <p>
            A generic-ballot poll asks every voter which party they would back for Congress, including voters whose district has only one party on the ballot. The official House total
            cannot answer that: a seat with no opponent gives its whole vote to one side. The adjusted figure fills each such seat with the vote a Democrat-versus-Republican race there
            would likely have produced, so the two years compare like with like.
          </p>
          <p style={{ color: "var(--app-text-muted)" }} className="text-sm">
            {national.y2024.seatsFilled} seats were filled in for 2024 and {national.y2026.seatsFilled} for 2026.
          </p>
        </div>
      </div>

      <LedgerSubhead label="By state, every seat contested" />
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Seg label="Show" value={view} onChange={setView} options={VIEWS} />
        <div className="sm:ml-auto"><ScaleLegend label={view === "shift" ? "Shift" : "Margin"} /></div>
      </div>
      <LazyMount className="mx-4 aspect-[5/3] max-h-[620px] sm:mx-12 lg:mx-32">
        <TplMap mode="states" rows={mapRows} valueLabel={view === "shift" ? "House vote shift" : `House vote ${view.slice(1)}`} linkLabel="Open state page"
          colorOf={view === "shift" ? swingColor : getRaceColor} formatValue={view === "shift" ? fmtLean : fmtMargin} valueColor={view === "shift" ? leanColor : marginColor}
          onSelect={(r) => setPicked(r ? r.name : null)} selectedKey={picked} zoomable={false} fill panel={false} framed={false} />
      </LazyMount>
      {sel && (
        <Picked id={sel.abbr} title={sel.name} href={sel.href} linkLabel="State page" onClose={() => setPicked(null)}>
          <PickedFig label="House vote 2024"><MarginFig v={sel.house24} size="1.5rem" /></PickedFig>
          <PickedFig label="House vote 2026" note={<>{sel.seats} seat{sel.seats === 1 ? "" : "s"}{sel.dropped.length > 0 && <> · filled in: {sel.dropped.join(", ")}</>}</>}><MarginFig v={sel.house} size="1.5rem" /></PickedFig>
          <PickedFig label="Shift" note={sel.redrawn ? "district lines changed for 2026" : undefined}><SwingFig v={sel.house - sel.house24} size="1.5rem" /></PickedFig>
          <PickedFig label="On the official totals"><span className="text-sm tabular-nums"><M v={sel.houseRaw24} /> → <M v={sel.houseRaw} /></span></PickedFig>
        </Picked>
      )}
      <div className="mt-8">
        <RankTable rows={states} cols={cols} rowKey={(s) => s.abbr} label="Adjusted House vote by state, 2024 and 2026" initial={{ key: "shift", dir: 1 }} limit={15} noun="states" />
      </div>
      <Notes>
        <p><strong>Filling in a seat:</strong> a seat with no Democrat-versus-Republican race (unopposed, a same-party final, an independent in a party&rsquo;s place) is given its 2024 presidential margin plus the year&rsquo;s average gap between House and presidential margins on contested seats, at its state&rsquo;s median contested turnout. The method is on the <RowLink href="/analysis/generic-ballot">Generic Ballot vs Popular Vote</RowLink> page.</p>
        <p><strong>Margins</strong> are Republican minus Democrat in points of all votes cast. <strong>*</strong> marks a state whose district lines changed for 2026; the statewide figure is still comparable, since it sums every district.</p>
        <p><strong>Louisiana</strong> counts the party split of its November electorate in both years; two of its 2026 seats go to a December runoff.</p>
      </Notes>
    </Reveal>
  );
}
