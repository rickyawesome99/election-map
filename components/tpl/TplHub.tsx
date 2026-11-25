"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import { districtHref, fmt1, stateHref } from "./format";
import { MapLegend, TplMap } from "./TplMaps";
import { NationalReference } from "./NationalReference";
import { useTplGeo } from "./TplGeo";
import { useStaticJson } from "@/lib/useStaticJson";
import type { CountyScore, ModelSummary } from "./types";
import { Foot, M, Pills, Segmented, TD, TD_R, TH, TH_R, VERY_MUTED } from "./ui";

// The map hub: one choropleth with a States/Districts/Counties toggle and a year lens, the ranked
// table beside it (the state index: every state with its race count), then the national reference. The lens recolors the map by one cycle's WRS instead of the blended TPL and
// re-ranks the table with it.

type Lens = "all" | number;
type Sort = "d" | "r" | "c";

// A table row: districts carry no elasticity or race count of their own.
type Row = { key: string; name: string; value: number; href: string; since24?: number | null; races?: number };

// One electoral-vote unit: a state, ME/NE's district votes by district code, or DC with its
// latest presidential margin standing in for the TPL it doesn't have.
export type EvUnit = { key: string; ev: number; fallback: number };

export function TplHub({ summary, evUnits }: { summary: ModelSummary; evUnits: EvUnit[] }) {
  const { geo, setGeo } = useTplGeo();
  const [lens, setLens] = useState<Lens>("all");
  const [sort, setSort] = useState<Sort>("c");
  const [showAll, setShowAll] = useState(false);
  // "Show all" scrolls inside the collapsed table's height instead of growing the box.
  const tableBoxRef = useRef<HTMLDivElement>(null);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);

  // County leans are a separate file (~3,100 rows), fetched the first time Counties is opened.
  const counties = useStaticJson<CountyScore[]>(geo === "counties" ? "/api/model/counties" : null);
  // Counties show no Centered column: the median county (R+40) is not a useful zero.
  const median = geo === "districts" ? summary.medianDistrictTpl : summary.medianStateTpl;
  const noun = geo === "states" ? "states" : geo === "districts" ? "districts" : "counties";
  const valueLabel = lens === "all" ? "TPL" : `${lens} WRS`;
  // The table's value column names the year the lean stands at (the last year in the fit).
  const columnLabel = lens !== "all" ? valueLabel : `${summary.fitYears[summary.fitYears.length - 1]} TPL`;

  const rows = useMemo(() => {
    const list: Row[] = geo === "states"
      ? summary.states.map((s) => ({ key: s.name, name: s.name, value: lens === "all" ? s.tpl : s.yearWrs[lens] ?? s.tpl, href: stateHref(s.id), since24: s.since24, races: lens === "all" ? s.races : s.yearRaces[lens] ?? 0 }))
      : geo === "districts" ? summary.districts.map((d) => ({ key: d.id, name: d.code, value: lens === "all" ? d.tpl : d.yearWrs[lens] ?? d.tpl, href: districtHref(d.state, d.code), since24: d.since24 }))
      // Counties have no TPL page of their own: they open the county's page.
      : (counties.data ?? []).map((c) => ({ key: c.fips, name: `${c.name}, ${c.state}`, value: lens === "all" ? c.tpl : c.yearWrs[lens] ?? c.tpl, href: `/historical/${c.fips}` }));
    return list;
  }, [summary, geo, lens, counties.data]);

  const ranked = useMemo(() => {
    const list = [...rows];
    if (sort === "c") list.sort((a, b) => Math.abs(a.value) - Math.abs(b.value));
    else if (sort === "d") list.sort((a, b) => a.value - b.value);
    else list.sort((a, b) => b.value - a.value);
    return list;
  }, [rows, sort]);

  // The strip above the map: seats on each side of zero for the current geography and lens,
  // and (States only) the electoral votes those leans add up to.
  const sides: [number, number] = [rows.filter((r) => r.value > 0).length, rows.filter((r) => r.value < 0).length];
  const evSplit = useMemo(() => {
    const at = (tpl: number, wrs: Record<number, number>) => (lens === "all" ? tpl : wrs[lens] ?? tpl);
    const lean = new Map<string, number>([
      ...summary.states.map((s) => [s.abbr, at(s.tpl, s.yearWrs)] as const),
      ...summary.districts.map((d) => [d.code, at(d.tpl, d.yearWrs)] as const),
    ]);
    let r = 0, d = 0;
    for (const u of evUnits) {
      const v = lean.get(u.key) ?? u.fallback;
      if (v > 0) r += u.ev;
      else if (v < 0) d += u.ev;
    }
    return [r, d] as [number, number];
  }, [summary, evUnits, lens]);
  // Inline in the section head, after "Map": the R · D split with a small label.
  const split = ([r, d]: [number, number], label: string, rule = false) => (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap" style={rule ? { borderLeft: "1px solid var(--app-border)", paddingLeft: 12 } : undefined}>
      <span className="text-sm font-extrabold tabular-nums">
        <span style={{ color: "var(--party-rep)" }}>{r.toLocaleString()}</span>
        <span style={{ color: "var(--app-text-muted)" }}> · </span>
        <span style={{ color: "var(--party-dem)" }}>{d.toLocaleString()}</span>
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
    </span>
  );
  const shown = showAll ? ranked : ranked.slice(0, 14);

  return (
    <div>
      <LedgerSectionHead
        label="Map"
        meta={
          <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {split(sides, `R · D ${noun}`)}
            {geo === "states" && split(evSplit, "R · D EVs", true)}
          </span>
        }
        right={<MapLegend />}
      />
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>Year lens</span>
          <Pills label="Year lens" size="xs" value={lens} onChange={setLens} options={[{ key: "all" as Lens, label: "TPL", title: "Blended, recency-weighted lean" }, ...summary.lensYears.map((y) => ({ key: y as Lens, label: String(y), title: `${y}'s weighted race score alone` }))]} />
        </span>
        <span className="sm:ml-auto">
          <Segmented label="Geography" options={[{ key: "states", label: "States" }, { key: "districts", label: "Districts" }, { key: "counties", label: "Counties" }]} value={geo} onChange={(g) => { setGeo(g); setShowAll(false); }} />
        </span>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="min-w-0">
          <TplMap mode={geo} rows={rows} valueLabel={valueLabel} linkLabel={geo === "states" ? "Open state page" : geo === "districts" ? "Open district" : "Open county page"} navigateOnClick={geo === "states" ? true : "mouse"} wide framed={false} />
          <Foot>{lens === "all" ? "Blended, recency-weighted True Partisan Lean" : `${lens} Weighted Race Score (WRS)`}. {geo === "states" ? "Click a state to open its page" : geo === "districts" ? "Click a district for its pipeline inside its state page" : counties.failed ? "The county leans could not be loaded" : counties.loading ? "Loading county leans…" : "Click a county to open its page"}. Pinch or scroll to zoom.</Foot>
        </div>
        <div className="min-w-0">
          <LedgerSectionHead label="Ranked" meta={geo === "counties" && counties.loading ? "loading counties…" : `${ranked.length.toLocaleString()} ${noun}`}
            right={<Pills label="Sort" size="xs" value={sort} onChange={setSort} options={[{ key: "d" as Sort, label: "Most D" }, { key: "r" as Sort, label: "Most R" }, { key: "c" as Sort, label: "Competitive" }]} />} />
          {/* Fixed column widths and an always-reserved scrollbar gutter: "Show all" must not move a column. */}
          <div ref={tableBoxRef} className="overflow-y-auto" style={{ scrollbarGutter: "stable", height: showAll && collapsedHeight ? collapsedHeight : undefined }}>
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col className="w-9 sm:w-14" />
                <col />
                <col className="w-[76px] sm:w-[130px]" />
                {geo !== "counties" && <col className="w-[76px] sm:w-[130px]" />}
                {lens === "all" && geo !== "counties" && <col className="w-[84px] sm:w-[130px]" />}
                {geo === "states" && <col className="w-[90px] max-sm:hidden" />}
              </colgroup>
              <thead className={showAll ? "sticky top-0 z-[1]" : ""} style={showAll ? { background: "var(--app-bg)", boxShadow: "inset 0 -1px 0 var(--app-border)" } : undefined}>
                <tr style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                  <th className={TH}>#</th>
                  <th className={TH}>{geo === "states" ? "State" : geo === "districts" ? "District" : "County"}</th>
                  <th className={TH_R}>{columnLabel}</th>
                  {geo !== "counties" && <th className={TH_R}>Centered</th>}
                  {lens === "all" && geo !== "counties" && <th className={TH_R} title="The lean now minus the lean as it stood after the 2024 election, both under today's model: what 2025 and 2026 added, with the national environment removed.">Since 2024</th>}
                  {geo === "states" && <th className={`${TH_R} max-sm:hidden`} title={lens === "all" ? "Races in the state's TPL aggregation" : `Races in the state's ${lens} WRS`}>Races</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.key} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <td className={TD} style={VERY_MUTED}>{i + 1}</td>
                    <td className={`${TD} truncate`}>
                      <Link href={r.href} prefetch={false} className="font-medium underline decoration-dotted underline-offset-4 hover:decoration-solid" style={{ textDecorationColor: "var(--app-border)" }}>{r.name}</Link>
                    </td>
                    <td className={TD_R}><M v={r.value} digits={1} bold /></td>
                    {geo !== "counties" && <td className={TD_R}><M v={r.value - median} digits={1} /></td>}
                    {lens === "all" && geo !== "counties" && <td className={TD_R}>{r.since24 != null ? <M v={r.since24} digits={1} /> : "—"}</td>}
                    {geo === "states" && <td className={`${TD_R} max-sm:hidden`} style={{ color: "var(--app-text-muted)" }}>{r.races}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Foot>
            {ranked.length === 0 ? (counties.failed ? "The county leans could not be loaded" : "Loading counties…") : <>Showing {shown.length.toLocaleString()} of {ranked.length.toLocaleString()}</>} ·{" "}
            <button type="button" disabled={ranked.length <= 14} onClick={() => {
              if (!showAll && tableBoxRef.current) setCollapsedHeight(tableBoxRef.current.offsetHeight);
              setShowAll((v) => !v);
            }} className="underline">{showAll ? "Show fewer" : "Show all"}</button>
            {geo !== "counties" && <>{" "}· Centered subtracts the {geo === "states" ? "50-state" : "435-district"} median {fmt1(median)}.</>}
          </Foot>
        </div>
      </div>

      <NationalReference years={summary.national} tpl={summary.nationalTpl} />
    </div>
  );
}
