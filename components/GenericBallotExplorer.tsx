"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import Segmented from "@/components/MarketSegmented";
import { MapLegend, type MapRow } from "@/components/tpl/TplMaps";
import { electionYear } from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import type { DroppedSeat, HouseVoteBasis, StateHouseVote, StateProjected2026, YearHouseVote } from "@/lib/genericBallotPopularVote";

// /analysis/generic-ballot: the 50-state map of each state's House popular vote — 2016 to 2024
// on three bases (every vote, contested seats only, dropped seats imputed) and the 2026 forecast's
// implied vote (all seats, or contested seats only) — with the by-state table under it. The map is
// the TPL hub's state choropleth on the site's margin scale.

const TplMap = dynamic(() => import("./tpl/TplMaps").then((m) => m.TplMap), {
  ssr: false,
  loading: () => <div className="mx-4 aspect-[5/3] max-h-[620px] rounded-xl sm:mx-12 lg:mx-32" />,
});

const FORECAST_YEAR = electionYear;
type YearChoice = number;
type Basis2026 = "raw" | "contested" | "leanPlusEnv";

export type ExplorerYear = Pick<YearHouseVote, "year" | "raw" | "contested" | "imputed" | "gbFinal"> & { states: StateHouseVote[] };
export type ExplorerProps = { years: ExplorerYear[]; now: { raw: number; contested: number; states: StateProjected2026[] } };

const BASES: [HouseVoteBasis, string][] = [["raw", "Every vote"], ["contested", "Contested seats only"], ["imputed", "Dropped seats imputed"]];
const BASES_2026: [Basis2026, string][] = [["raw", "All seats"], ["contested", "Contested seats only"], ["leanPlusEnv", "Lean + national mood"]];
const KIND_LABEL: Record<DroppedSeat["kind"], string> = { "unopposed-D": "no Republican", "unopposed-R": "no Democrat", "same-party-D": "two Democrats", "same-party-R": "two Republicans" };

function droppedText(d: DroppedSeat[]): string {
  return d.map((x) => `${x.code} (${KIND_LABEL[x.kind]})`).join(", ");
}

type TableRow = { abbr: string; state: string; seats: number; contestedSeats: number; value: number | null; cols: (number | null)[]; dropped: DroppedSeat[] };

export default function GenericBallotExplorer({ years, now }: ExplorerProps) {
  const [year, setYear] = useState<YearChoice>(FORECAST_YEAR);
  const [basis, setBasis] = useState<HouseVoteBasis>("raw");
  const [basis2026, setBasis2026] = useState<Basis2026>("raw");
  const [selected, setSelected] = useState<string | null>(null);
  const forecast = year === FORECAST_YEAR;

  const rows = useMemo<TableRow[]>(() => {
    if (forecast) {
      return now.states.map((s) => ({ abbr: s.abbr, state: s.state, seats: s.seats, contestedSeats: s.contestedSeats, value: basis2026 === "raw" ? s.raw : basis2026 === "contested" ? s.contested : s.leanPlusEnv, cols: [s.raw, s.contested, s.leanPlusEnv], dropped: s.dropped }));
    }
    const y = years.find((x) => x.year === year);
    if (!y) return [];
    return y.states.map((s) => ({ abbr: s.abbr, state: s.state, seats: s.seats, contestedSeats: s.contestedSeats, value: s[basis], cols: [s.raw, s.contested, s.imputed], dropped: s.dropped }));
  }, [forecast, year, basis, basis2026, years, now]);

  const sorted = useMemo(() => [...rows].sort((a, b) => (a.value ?? 999) - (b.value ?? 999)), [rows]);
  const mapRows = useMemo<MapRow[]>(() => rows.filter((r) => r.value != null).map((r) => ({ key: r.state, name: r.state, value: r.value!, href: `/states/${statesData.find((s) => s.abbr === r.abbr)?.id ?? r.abbr.toLowerCase()}` })), [rows]);
  const national = forecast ? (basis2026 === "contested" ? now.contested : now.raw) : (years.find((x) => x.year === year)?.[basis] ?? null);
  const demStates = rows.filter((r) => r.value != null && r.value < 0).length, repStates = rows.filter((r) => r.value != null && r.value > 0).length;
  const picked = selected ? rows.find((r) => r.state === selected) ?? null : null;
  const colHeads = forecast ? ["All seats", "Contested", "Lean + mood"] : ["Every vote", "Contested", "Imputed"];
  const basisLabel = forecast ? BASES_2026.find((b) => b[0] === basis2026)![1] : BASES.find((b) => b[0] === basis)![1];
  const yearOptions: [YearChoice, string][] = [...years.map((y) => [y.year, String(y.year)] as [YearChoice, string]), [FORECAST_YEAR, `${FORECAST_YEAR} forecast`]];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented label="Year" value={year} onChange={(v) => { setYear(v); setSelected(null); }} options={yearOptions} scroll />
        {forecast
          ? <Segmented label="Basis" value={basis2026} onChange={setBasis2026} options={BASES_2026} />
          : <Segmented label="Basis" value={basis} onChange={setBasis} options={BASES} />}
        <div className="hidden sm:ml-auto sm:block"><MapLegend /></div>
      </div>

      <p className="mb-5 text-sm leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
        {forecast ? <>What the {FORECAST_YEAR} forecast&rsquo;s race projections add up to in each state</> : <>The {year} House vote in each state</>}, counted as <b style={{ color: "var(--app-text-primary)" }}>{basisLabel.toLowerCase()}</b>.
        {national != null && <> Nationally that is <b style={{ color: marginColor(national) }}>{fmtMargin(national)}</b>.</>}
        {" "}Democrats lead in <b style={{ color: "var(--party-dem)" }}>{demStates}</b> state{demStates === 1 ? "" : "s"} and Republicans in <b style={{ color: "var(--party-rep)" }}>{repStates}</b>. Select a state to see its seats.
      </p>

      <div className="mb-4 sm:hidden"><MapLegend /></div>

      <TplMap mode="states" rows={mapRows} valueLabel="House vote" linkLabel="Open state page" formatValue={fmtMargin} valueColor={marginColor} onSelect={(r) => setSelected(r ? r.name : null)} zoomable={false} fill panel={false} framed={false} selectedKey={selected} />

      {picked && (
        <div className="mt-6 text-sm leading-relaxed" aria-live="polite">
          <b>{picked.state}</b>, {forecast ? `${FORECAST_YEAR} forecast` : year}: {picked.seats} seat{picked.seats === 1 ? "" : "s"}, {picked.contestedSeats} contested.
          {" "}{colHeads.map((h, i) => <span key={h}>{i > 0 && " · "}{h} <b style={{ color: marginColor(picked.cols[i]) }}>{fmtMargin(picked.cols[i])}</b></span>)}.
          {picked.dropped.length > 0 && <> Seats without a two-party contest: {droppedText(picked.dropped)}.</>}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 pb-3 mb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <h3 className="text-base font-bold">By state{forecast ? `, ${FORECAST_YEAR} forecast` : `, ${year}`}</h3>
        <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>Sorted most Democratic to most Republican on the chosen basis. Margins are Republican minus Democrat, two-party.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" aria-label="House popular vote by state">
          <thead>
            <tr>
              {["State", "Seats", "Contested", ...colHeads, "Seats without a two-party contest"].map((h, i) => (
                <th key={i} scope="col" className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wider ${i === 0 || i === 6 ? "text-left" : "text-right"}`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.abbr} style={{ borderBottom: "1px solid var(--app-border)", background: selected === r.state ? "var(--app-tab-bg)" : undefined }}>
                <td className="px-2 py-1.5 font-semibold"><Link href={`/states/${statesData.find((s) => s.abbr === r.abbr)?.id ?? r.abbr.toLowerCase()}`} prefetch={false} className="hover:underline">{r.state}</Link></td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.seats}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r.contestedSeats}</td>
                {r.cols.map((v, i) => <td key={i} className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color: marginColor(v) }}>{fmtMargin(v)}</td>)}
                <td className="px-2 py-1.5 text-left text-xs" style={{ color: "var(--app-text-muted)" }}>{r.dropped.length ? droppedText(r.dropped) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
