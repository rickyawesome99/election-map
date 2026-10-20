"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import Segmented from "@/components/MarketSegmented";
import { statesData } from "@/data/statesData";
import type { PollingMissOffice, PollingMissRace, PollingMissSet } from "@/lib/pollingMisses";
import { fmtLean, leanColor } from "@/lib/pollsterDisplay";
import type { MapRow } from "@/components/tpl/TplMaps";

// /analysis/polling-misses: the 50-state map and the by-state table of every statewide race's
// final-poll miss, with year / office / state filters shared by both. The map is the TPL hub's
// choropleth (states only here), filled by each state's miss: one year's average when a year is
// chosen, otherwise the average of its yearly averages weighted by recency.

const TplMap = dynamic(() => import("./tpl/TplMaps").then((m) => m.TplMap), {
  ssr: false,
  loading: () => <div className="h-[300px] sm:h-[400px] md:h-[480px] rounded-xl" style={{ border: "1px solid var(--app-border)" }} />,
});

type YearFilter = "all" | number;
type OfficeFilter = "all" | PollingMissOffice;

const OFFICES: [OfficeFilter, string][] = [["all", "All races"], ["President", "President"], ["Senate", "Senate"], ["Governor", "Governor"]];
const OFFICE_ORDER: Record<PollingMissOffice, number> = { President: 0, Senate: 1, Governor: 2 };
const STATE_ID = new Map(statesData.map((s) => [s.abbr, s.id] as const));

// Diverging fill by miss size: the TPL map's eight D/R shades at ±1, ±3, ±6 instead of ±1, ±5, ±15.
const BANDS: { cut: number; d: string; r: string }[] = [
  { cut: 1, d: "#959bb3", r: "#cf8980" }, { cut: 3, d: "#8bafff", r: "#ff8b98" }, { cut: 6, d: "#587ccc", r: "#ff5864" }, { cut: Infinity, d: "#1b408c", r: "#be1c29" },
];
export function missColor(v: number): string {
  const band = BANDS.find((b) => Math.abs(v) < b.cut) ?? BANDS[BANDS.length - 1];
  return v >= 0 ? band.r : band.d;
}

const LEGEND: { label: string; color: string }[] = [
  { label: "Democrats beat polls by 6+", color: "#1b408c" }, { label: "Democrats beat polls by 3–6", color: "#587ccc" }, { label: "Democrats beat polls by 1–3", color: "#8bafff" }, { label: "Democrats beat polls by under 1", color: "#959bb3" },
  { label: "Republicans beat polls by under 1", color: "#cf8980" }, { label: "Republicans beat polls by 1–3", color: "#ff8b98" }, { label: "Republicans beat polls by 3–6", color: "#ff5864" }, { label: "Republicans beat polls by 6+", color: "#be1c29" },
];
function MissLegend() {
  return (
    <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--app-text-muted)" }} aria-label="Map legend: Democrats beat their polls (blue) to Republicans beat theirs (red)">
      <span>D+6</span>
      {LEGEND.map((l) => <span key={l.label} title={l.label} className="inline-block h-2 w-3.5" style={{ background: l.color }} />)}
      <span>R+6</span>
    </div>
  );
}

type StateSummary = { abbr: string; state: string; value: number; races: PollingMissRace[]; years: number };

/** One number per state for the current filters: the year's mean miss, or the recency-weighted mean of yearly means. */
function summarize(races: PollingMissRace[], year: YearFilter, decay: number, asOf: number): StateSummary[] {
  const byState = new Map<string, PollingMissRace[]>();
  for (const r of races) {
    if (year !== "all" && r.year !== year) continue;
    const list = byState.get(r.abbr);
    if (list) list.push(r); else byState.set(r.abbr, [r]);
  }
  const out: StateSummary[] = [];
  for (const [abbr, list] of byState) {
    const byYear = new Map<number, number[]>();
    for (const r of list) {
      const m = byYear.get(r.year);
      if (m) m.push(r.miss); else byYear.set(r.year, [r.miss]);
    }
    let num = 0, den = 0;
    for (const [y, misses] of byYear) {
      const w = year === "all" ? Math.pow(decay, asOf - y) : 1;
      num += w * misses.reduce((s, v) => s + v, 0) / misses.length;
      den += w;
    }
    out.push({ abbr, state: list[0].state, value: num / den, races: list, years: byYear.size });
  }
  return out;
}

const raceLabel = (r: PollingMissRace) => `${r.office}${r.stage ? ` ${r.stage.toLowerCase()}` : ""}`;
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const th = "whitespace-nowrap px-2 py-2 text-[10px] font-bold uppercase tracking-wider";
const thStyle = { color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" } as const;

export default function PollingMissExplorer({ data }: { data: PollingMissSet }) {
  const [year, setYear] = useState<YearFilter>("all");
  const [office, setOffice] = useState<OfficeFilter>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");

  const filtered = useMemo(() => data.races.filter((r) => office === "all" || r.office === office), [data.races, office]);
  const summaries = useMemo(() => summarize(filtered, year, data.decay, data.asOf), [filtered, year, data.decay, data.asOf]);
  const mapRows: MapRow[] = useMemo(
    () => summaries.map((s) => ({ key: s.state, name: s.state, value: s.value, href: `/states/${STATE_ID.get(s.abbr) ?? s.abbr.toLowerCase()}` })),
    [summaries],
  );

  const demStates = summaries.filter((s) => s.value < -0.05).length;
  const repStates = summaries.filter((s) => s.value > 0.05).length;
  const sortedValues = summaries.map((s) => s.value).sort((a, b) => a - b);
  const median = sortedValues.length ? sortedValues[Math.floor(sortedValues.length / 2)] : null;
  const raceCount = summaries.reduce((n, s) => n + s.races.length, 0);

  // the table shows one state at a time: the one picked on the map or in the dropdown
  const group = stateFilter === "all" ? null : summaries.find((s) => s.abbr === stateFilter) ?? null;

  const onSelect = (row: MapRow | null) => {
    const abbr = row ? statesData.find((s) => s.name === row.name)?.abbr : null;
    setStateFilter(abbr ?? "all");
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented label="Year" value={year} onChange={setYear} options={[["all", "All years"], ...data.years.map((y) => [y, String(y)] as [YearFilter, string])]} scroll />
        <div className="flex w-full justify-center sm:w-auto"><Segmented label="Race" value={office} onChange={setOffice} options={OFFICES} /></div>
        {/* on phones the legend moves down between the summary and the map */}
        <div className="hidden sm:ml-auto sm:block"><MissLegend /></div>
      </div>

      <p className="mb-5 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
        {summaries.length === 0 ? "No statewide race matches these filters." : (
          <>
            Across the {raceCount} {office === "all" ? "statewide" : office.toLowerCase()} race{raceCount === 1 ? "" : "s"}{year === "all" ? " since 2016" : ` of ${year}`} with
            final polls, Republicans beat their polls in <b style={{ color: "var(--party-rep)" }}>{repStates}</b> state{repStates === 1 ? "" : "s"} and Democrats in{" "}
            <b style={{ color: "var(--party-dem)" }}>{demStates}</b>{median != null && <>; the median state&rsquo;s miss is <b style={{ color: leanColor(median) }}>{fmtLean(median)}</b></>}.
            {" "}Select a state to filter the table.
          </>
        )}
      </p>

      <div className="mb-4 sm:hidden"><MissLegend /></div>

      <TplMap mode="states" rows={mapRows} valueLabel="Polling miss" linkLabel="Open state page" colorOf={missColor} formatValue={fmtLean} valueColor={leanColor} onSelect={onSelect} zoomable={false} panel={false} framed={false} selectedKey={group?.state ?? null} />

      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 pb-3 mb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h2 className="text-[11px] uppercase tracking-wider font-bold" style={{ color: "var(--app-text-muted)" }}>Every Race</h2>
        <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>Final polling average, result and miss for each of the selected state&rsquo;s statewide races</span>
        <label className="flex items-center gap-1.5 text-xs sm:ml-auto" style={{ color: "var(--app-text-muted)" }}>
          State
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} aria-label="State" className="rounded px-1.5 py-1 text-xs font-semibold"
            style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}>
            <option value="all">Select a state</option>
            {statesData.map((s) => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
          </select>
        </label>
      </div>

      {stateFilter === "all" ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--app-text-very-muted)" }}>Select a state on the map or from the list to show its polling data.</p>
      ) : !group ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--app-text-very-muted)" }}>No {office === "all" ? "statewide" : office.toLowerCase()} race in {statesData.find((s) => s.abbr === stateFilter)?.name ?? stateFilter}{year === "all" ? " since 2016" : ` in ${year}`} has final polls.</p>
      ) : (

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" aria-label="Polling misses by state and race">
          <thead>
            <tr>
              <th scope="col" className={`${th} hidden text-left sm:table-cell`} style={thStyle}>Year</th>
              <th scope="col" className={`${th} text-left`} style={thStyle}>Race</th>
              <th scope="col" className={`${th} hidden text-right sm:table-cell`} style={thStyle}>Final polls</th>
              <th scope="col" className={`${th} text-right`} style={thStyle}><span className="sm:hidden">Polls</span><span className="hidden sm:inline">Poll average</span></th>
              <th scope="col" className={`${th} text-right`} style={thStyle}>Result</th>
              <th scope="col" className={`${th} text-right`} style={thStyle}>Miss</th>
            </tr>
          </thead>
          {[group].map((g) => (
            <tbody key={g.abbr}>
              <tr style={{ background: "var(--app-tab-bg)" }}>
                {/* Year and Final polls are hidden on phones, so the label spans 3 columns there and 5 from sm up */}
                {[["sm:hidden", 3], ["hidden sm:table-cell", 5]].map(([cls, span]) => (
                  <th key={cls} scope="rowgroup" colSpan={span as number} className={`${cls} px-2 py-1.5 text-left`}>
                    <Link href={`/states/${STATE_ID.get(g.abbr) ?? g.abbr.toLowerCase()}`} className="font-bold hover:underline" title={`Open the ${g.state} page`}>{g.state} <span aria-hidden style={{ color: "var(--app-text-muted)" }}>›</span></Link>
                    <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--app-text-very-muted)" }}>
                      {g.races.length} race{g.races.length === 1 ? "" : "s"}{year === "all" && g.years > 1 ? ` over ${g.years} years` : ""}
                    </span>
                  </th>
                ))}
                <td className="px-2 py-1.5 text-right font-bold tabular-nums" style={{ color: leanColor(g.value) }}
                  title={year === "all" ? "Average of the state's yearly misses, recent years weighted most" : `Average miss of the state's ${year} races`}>
                  {fmtLean(g.value)}
                </td>
              </tr>
              {[...g.races].sort((a, b) => b.year - a.year || OFFICE_ORDER[a.office] - OFFICE_ORDER[b.office] || (a.stage ?? "").localeCompare(b.stage ?? "")).map((r) => (
                <tr key={r.key} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className="hidden px-2 py-1.5 tabular-nums sm:table-cell">{r.year}</td>
                  <td className="px-2 py-1.5">
                    <span className="mr-1.5 tabular-nums sm:hidden">{r.year}</span>
                    {r.href ? <Link href={r.href} className="font-semibold hover:underline">{raceLabel(r)}</Link> : <span className="font-semibold">{raceLabel(r)}</span>}
                    <div className="text-[11px] tabular-nums sm:hidden" style={{ color: "var(--app-text-very-muted)" }}>
                      {r.polls} final poll{r.polls === 1 ? "" : "s"}{r.partisan > 0 ? ` · ${r.partisan} partisan` : ""}
                    </div>
                  </td>
                  <td className="hidden px-2 py-1.5 text-right tabular-nums sm:table-cell" title={`Final polls ended ${fmtDate(r.firstDate)}–${fmtDate(r.lastDate)}, ${r.year}`}>
                    {/* the partisan note has a fixed slot so the count lines up down the column whether or not it is shown */}
                    <span className="inline-flex items-baseline justify-end">
                      <span className="w-[1.5rem] text-left">{r.polls}</span>
                      <span className="w-[5.75rem] pl-1 text-left text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{r.partisan > 0 ? `(${r.partisan} partisan)` : ""}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: leanColor(r.pollAvg) }}>{fmtLean(r.pollAvg)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: leanColor(r.result) }}>{fmtLean(r.result)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color: leanColor(r.miss) }}>{fmtLean(r.miss)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      )}
    </div>
  );
}
