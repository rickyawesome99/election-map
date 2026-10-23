"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";
import { LedgerSectionHead } from "@/components/LedgerSectionHead";
import Segmented from "@/components/MarketSegmented";
import Dropdown from "./Dropdown";
import { useDarkMode } from "@/lib/useDarkMode";
import { useStaticJson } from "@/lib/useStaticJson";
import {
  MIDTERM_YEARS, OFFICE_LABEL, PRESIDENTIAL_YEARS, PROJECTION_YEAR, TURNOUT_OFFICES, TURNOUT_YEARS,
  cycleTypeOf, projectionSliceUrl, turnoutSliceUrl,
  type NationalYearRow, type ProjectedRace, type ProjectionStateSlice, type StateSeries, type TurnoutMapView, type TurnoutOffice, type TurnoutRace, type TurnoutSlice,
} from "@/lib/turnoutTypes";

const TurnoutMap = dynamic(() => import("./TurnoutMap"), { loading: () => <div className="py-10 text-center text-xs" style={{ color: "var(--app-text-muted)" }}>Loading map…</div> });

// Fixed-order categorical hues for the trend chart (validated for light and dark surfaces).
const SERIES = { light: ["#1f6f9a", "#c67e3f", "#6f5aa8", "#4b8a3a", "#a5487a"], dark: ["#3a95bd", "#c48046", "#8f7fd0", "#5fa84e", "#c76d9c"] };

export type FirstRoundNote = { office: TurnoutOffice; state: string; year: number; seat: string; votes: number; source: string; note: string };

export type ImpliedBallotProps = {
  offices: { office: "house" | "senate" | "governor" | "overall"; races: number; votes: number; demVotes: number; repVotes: number; demPct: number; repPct: number; margin: number; twoPartyMargin: number }[];
  house: { all: number; contestedOnly: number; contestedEqualWeight: number; contestedRaces: number; decidedRaces: number; decidedNetVotes: number };
  polling: { gb: number; pvHat: number; eHat: number };
};

export type TurnoutPageProps = {
  states: StateSeries[];
  impliedBallot: ImpliedBallotProps;
  national: NationalYearRow[];
  projection: ProjectedRace[];
  projectionNational: { houseVotes: number; low: number; high: number; cvap: number; rate: number; basis: { year: number; houseVotes: number; topVotes: number; cvap: number }[] };
  firstRound: FirstRoundNote[];
  model: { midtermWeights: Record<number, number>; shrinkVotes: number; ticketFactor: number; slope: number; dropoffWeight: number };
};

const MUTED = { color: "var(--app-text-muted)" } as const;
const VERY_MUTED = { color: "var(--app-text-very-muted)" } as const;
const fmtInt = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());
const fmtPct = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${v.toFixed(d)}%`);
const fmtPts = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`);
const fmtM = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}K` : String(v));

// ── Small building blocks ─────────────────────────────────────────────────────
function Pills<T extends string | number>({ options, value, onChange, label }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.key)} onClick={() => onChange(o.key)} aria-pressed={o.key === value} className="rounded-md px-2.5 py-1 text-xs font-semibold"
          style={o.key === value ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" } : MUTED}>{o.label}</button>
      ))}
    </div>
  );
}

type SortState = { key: string; dir: 1 | -1 };
function useSort(initial: SortState) {
  const [sort, setSort] = useState<SortState>(initial);
  const toggle = (key: string, defaultDir: 1 | -1 = -1) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: defaultDir }));
  return { sort, toggle };
}
// `phone` false hides the column on phones (every table fits one screen there); `wrap` lets a label cell wrap on phones.
const PHONE_HIDDEN = "hidden sm:table-cell";
function Th({ children, k, sort, onSort, align = "right", defaultDir = -1, title, phone = true }: { children: React.ReactNode; k?: string; sort?: SortState; onSort?: (k: string, d?: 1 | -1) => void; align?: "left" | "right"; defaultDir?: 1 | -1; title?: string; phone?: boolean }) {
  const active = k && sort?.key === k;
  return (
    <th scope="col" title={title} className={`whitespace-nowrap px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider ${align === "left" ? "text-left" : "text-right"} ${phone ? "" : PHONE_HIDDEN}`} style={{ color: active ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>
      {k && onSort ? <button type="button" onClick={() => onSort(k, defaultDir)} className="uppercase hover:underline">{children}{active ? (sort!.dir === -1 ? " ↓" : " ↑") : ""}</button> : children}
    </th>
  );
}
const Td = ({ children, align = "right", strong, muted, phone = true, wrap }: { children: React.ReactNode; align?: "left" | "right"; strong?: boolean; muted?: boolean; phone?: boolean; wrap?: boolean }) => (
  <td className={`px-2 py-1.5 tabular-nums ${wrap ? "sm:whitespace-nowrap" : "whitespace-nowrap"} ${align === "left" ? "text-left" : "text-right"} ${strong ? "font-semibold" : ""} ${phone ? "" : PHONE_HIDDEN}`} style={muted ? VERY_MUTED : undefined}>{children}</td>
);
/** A column label that shortens on phones. */
const Short = ({ phone, full }: { phone: string; full: string }) => <><span className="sm:hidden">{phone}</span><span className="hidden sm:inline">{full}</span></>;
function sortBy<T>(rows: T[], get: (r: T) => number | string | null | undefined, dir: 1 | -1): T[] {
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === "string" && typeof y === "string" ? x.localeCompare(y) : (x as number) - (y as number)) * dir;
  });
}
function Bar({ v, max, color }: { v: number | null; max: number; color: string }) {
  return <span className="inline-block h-2 rounded-sm align-middle" style={{ width: v == null ? 0 : `${Math.max(2, (v / max) * 72)}px`, background: color }} />;
}

// ── Sections ──────────────────────────────────────────────────────────────────
function yearsWithOffice(states: StateSeries[], office: TurnoutOffice): number[] {
  return TURNOUT_YEARS.filter((y) => states.some((s) => s.years.find((r) => r.year === y)?.races[office]?.votes != null));
}

function StateTable({ states, national, office, year, sortKey }: { states: StateSeries[]; national: NationalYearRow[]; office: TurnoutOffice; year: number; sortKey: string }) {
  const years = yearsWithOffice(states, office);
  const y = years.includes(year) ? year : years[years.length - 1];
  const { sort, toggle } = useSort({ key: sortKey, dir: -1 });
  const rows = (() => {
    const out = states.map((s) => {
      const r = s.years.find((x) => x.year === y)!;
      const race = r.races[office];
      const vepRate = race?.votes != null && r.vep ? (race.votes / r.vep) * 100 : null;
      const ballotsRate = r.ballots != null && r.vep ? (r.ballots / r.vep) * 100 : null;
      return { abbr: s.abbr, name: s.name, race, cvap: r.cvap, vepRate, ballotsRate, ofPrior: r.ofPriorPresidential, top: r.top };
    }).filter((r) => r.race);
    const get = (r: (typeof out)[number]) => sort.key === "name" ? r.name : sort.key === "votes" ? r.race?.votes : sort.key === "cvap" ? r.cvap : sort.key === "rate" ? r.race?.rate : sort.key === "vep" ? r.vepRate : sort.key === "ballots" ? r.ballotsRate : sort.key === "ofTop" ? r.race?.ofTop : sort.key === "change" ? r.race?.change : r.ofPrior;
    return sortBy(out, get, sort.dir);
  })();
  const nat = national.find((n) => n.year === y);
  const maxRate = Math.max(...rows.map((r) => r.race?.rate ?? 0), 1);
  const isMid = cycleTypeOf(y) !== "presidential";
  const ph = { cvap: sortKey !== "change", change: sortKey === "change" };
  return (
    <section id="by-state" className="pt-8">
      <LedgerSectionHead label="Turnout by state" meta={`${rows.length} states · ${OFFICE_LABEL[office]} ${y}`} />
      <p className="mb-3 max-w-3xl text-sm leading-relaxed" style={MUTED}>
        Votes cast in the race as a share of the state&apos;s citizen voting-age population (CVAP, the ACS five-year release ending that year). The VEP column is the same votes over the U.S. Elections Project&apos;s voting-eligible population, and Ballots is that project&apos;s total ballots counted over VEP, both as a cross-check. Change compares the rate with the same office four years earlier.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid var(--app-border)" }}>
            <Th k="name" sort={sort} onSort={toggle} align="left" defaultDir={1}>State</Th>
            <Th k="votes" sort={sort} onSort={toggle}>Votes</Th>
            <Th k="cvap" sort={sort} onSort={toggle} phone={ph.cvap}>CVAP</Th>
            <Th k="rate" sort={sort} onSort={toggle}>% CVAP</Th>
            <Th phone={false}>&nbsp;</Th>
            <Th k="vep" sort={sort} onSort={toggle} title="Votes in this race over the voting-eligible population" phone={false}>% VEP</Th>
            <Th k="ballots" sort={sort} onSort={toggle} title="Total ballots counted over VEP (U.S. Elections Project)" phone={false}>Ballots / VEP</Th>
            <Th k="ofTop" sort={sort} onSort={toggle} title="Votes as a share of the state's top race that year" phone={false}>% of top</Th>
            <Th k="change" sort={sort} onSort={toggle} title="Rate change from the same office four years earlier, in points" phone={ph.change}>Change</Th>
            {isMid && <Th k="ofPrior" sort={sort} onSort={toggle} title="Top-race votes as a share of the previous presidential election's votes" phone={false}>vs. prior pres.</Th>}
          </tr></thead>
          <tbody>
            {nat && nat.votes[office] != null && (
              <tr style={{ borderBottom: "2px solid var(--app-border)", fontWeight: 600 }}>
                <Td align="left" wrap>United States <span className="font-normal" style={VERY_MUTED}>({nat.states[office]} states)</span></Td>
                <Td>{fmtInt(nat.votes[office])}</Td><Td phone={ph.cvap}>{fmtInt(nat.cvap)}</Td><Td>{fmtPct(nat.rate[office])}</Td><Td align="left" phone={false}><Bar v={nat.rate[office] ?? null} max={maxRate} color="var(--app-text-muted)" /></Td>
                <Td muted phone={false}>—</Td><Td muted phone={false}>—</Td><Td muted phone={false}>—</Td><Td muted phone={ph.change}>—</Td>{isMid && <Td muted phone={false}>—</Td>}
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.abbr} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <Td align="left" strong wrap>{r.name}{r.race?.firstRound ? "*" : ""}{r.race?.special ? <span className="ml-1 font-normal" style={VERY_MUTED}>special</span> : null}{typeof r.race?.uncontested === "number" && r.race.uncontested > 0 ? <span className="ml-1 font-normal" style={VERY_MUTED}>{r.race.uncontested} of {r.race.seats} unopposed</span> : null}</Td>
                <Td>{r.race?.votes == null ? <span style={VERY_MUTED}>no count</span> : fmtInt(r.race.votes)}</Td>
                <Td phone={ph.cvap}>{fmtInt(r.cvap)}</Td>
                <Td strong>{fmtPct(r.race?.rate)}</Td>
                <Td align="left" phone={false}><Bar v={r.race?.rate ?? null} max={maxRate} color="#4a8aa6" /></Td>
                <Td phone={false}>{fmtPct(r.vepRate)}</Td>
                <Td muted phone={false}>{fmtPct(r.ballotsRate)}</Td>
                <Td phone={false}>{r.race?.ofTop == null || r.top?.office === office ? <span style={VERY_MUTED}>top</span> : fmtPct(r.race.ofTop, 0)}</Td>
                <Td phone={ph.change}>{fmtPts(r.race?.change)}</Td>
                {isMid && <Td phone={false}>{fmtPct(r.ofPrior, 0)}</Td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PresVsMidterm({ states }: { states: StateSeries[] }) {
  const { sort, toggle } = useSort({ key: "ratio", dir: -1 });
  const rows = (() => {
    const out = states.map((s) => {
      const topRate = (y: number) => { const r = s.years.find((x) => x.year === y); return r?.top && r.cvap ? (r.top.votes / r.cvap) * 100 : null; };
      const mean = (ys: number[]) => { const v = ys.map(topRate).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      const pres = mean(PRESIDENTIAL_YEARS), mid = mean(MIDTERM_YEARS);
      const midOf = MIDTERM_YEARS.map((y) => s.years.find((x) => x.year === y)?.ofPriorPresidential ?? null);
      const hasStatewide = (y: number) => { const r = s.years.find((x) => x.year === y); return !!(r?.races.senate || r?.races.governor); };
      return { abbr: s.abbr, name: s.name, pres, mid, gap: pres != null && mid != null ? mid - pres : null, ratio: pres != null && mid != null ? (mid / pres) * 100 : null, mid2018: midOf[0], mid2022: midOf[1], ticket: MIDTERM_YEARS.map((y) => (hasStatewide(y) ? "S" : "H")).join("/") };
    });
    const get = (r: (typeof out)[number]) => sort.key === "name" ? r.name : sort.key === "pres" ? r.pres : sort.key === "mid" ? r.mid : sort.key === "gap" ? r.gap : sort.key === "m18" ? r.mid2018 : sort.key === "m22" ? r.mid2022 : r.ratio;
    return sortBy(out, get, sort.dir);
  })();
  return (
    <section id="pres-vs-midterm" className="pt-8">
      <LedgerSectionHead label="Presidential vs. midterm turnout" meta="top race on the ballot, 2016–2024" />
      <p className="mb-3 max-w-3xl text-sm leading-relaxed" style={MUTED}>
        Each state&apos;s average top-of-the-ticket turnout in presidential years (2016, 2020, 2024) against its midterms (2018, 2022), and how much of the presidential electorate came back in each midterm. Ticket shows whether a Senate or governor race (S) or only House races (H) topped the ballot in 2018 and 2022 — a House-only ticket runs several points lower.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid var(--app-border)" }}>
            <Th k="name" sort={sort} onSort={toggle} align="left" defaultDir={1}>State</Th>
            <Th k="pres" sort={sort} onSort={toggle}><Short phone="Pres." full="Presidential yrs" /></Th>
            <Th k="mid" sort={sort} onSort={toggle}><Short phone="Mid." full="Midterms" /></Th>
            <Th align="left" phone={false}>&nbsp;</Th>
            <Th k="gap" sort={sort} onSort={toggle} phone={false}>Gap (pts)</Th>
            <Th k="ratio" sort={sort} onSort={toggle} title="Midterm rate as a share of the presidential rate"><Short phone="Mid. / pres." full="Midterm / pres." /></Th>
            <Th k="m18" sort={sort} onSort={toggle} title="2018 top-race votes over 2016 presidential votes" phone={false}>2018 vs 2016</Th>
            <Th k="m22" sort={sort} onSort={toggle} title="2022 top-race votes over 2020 presidential votes" phone={false}>2022 vs 2020</Th>
            <Th phone={false}>Ticket 18/22</Th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.abbr} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <Td align="left" strong>{r.name}</Td>
                <Td>{fmtPct(r.pres)}</Td>
                <Td>{fmtPct(r.mid)}</Td>
                <Td align="left" phone={false}><span className="inline-flex flex-col gap-px"><Bar v={r.pres} max={80} color="var(--app-text-very-muted)" /><Bar v={r.mid} max={80} color="#4a8aa6" /></span></Td>
                <Td phone={false}>{fmtPts(r.gap)}</Td>
                <Td strong>{fmtPct(r.ratio, 0)}</Td>
                <Td phone={false}>{fmtPct(r.mid2018, 0)}</Td>
                <Td phone={false}>{fmtPct(r.mid2022, 0)}</Td>
                <Td muted phone={false}>{r.ticket}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type TrendOffice = TurnoutOffice | "top";
function Trends({ states, national, dark }: { states: StateSeries[]; national: NationalYearRow[]; dark: boolean }) {
  const [office, setOffice] = useState<TrendOffice>("top");
  const [cycle, setCycle] = useState<"all" | "presidential" | "midterm">("all");
  const [picked, setPicked] = useState<string[]>(["GA", "OH", "TX", "WI"]);
  const [query, setQuery] = useState("");
  const colors = SERIES[dark ? "dark" : "light"];
  // Odd years only for governors: the national "top race" in an odd year is a handful of states.
  const years = TURNOUT_YEARS.filter((y) => (cycle === "all" ? y % 2 === 0 || office === "governor" : cycleTypeOf(y) === cycle));
  const rateOf = (s: StateSeries | null, y: number): number | null => {
    if (!s) { const n = national.find((x) => x.year === y); if (!n) return null; if (office === "top") return n.rate.president ?? (Math.max(n.rate.senate ?? 0, n.rate.governor ?? 0, n.rate.house ?? 0) || null); return n.rate[office] ?? null; }
    const r = s.years.find((x) => x.year === y);
    if (!r || !r.cvap) return null;
    if (office === "top") return r.top ? (r.top.votes / r.cvap) * 100 : null;
    return r.races[office]?.rate ?? null;
  };
  const data = years.map((y) => { const row: Record<string, number | string | null> = { year: y }; row.US = rateOf(null, y); for (const a of picked) row[a] = rateOf(states.find((s) => s.abbr === a) ?? null, y); return row; });
  const matches = query ? states.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()) || s.abbr.toLowerCase() === query.toLowerCase()).slice(0, 6) : [];
  const axis = { fontSize: 11, fill: "var(--app-text-muted)" };
  return (
    <section id="trends" className="pt-8">
      <LedgerSectionHead label="Turnout over time" meta="% of CVAP" right={
        <div className="flex flex-wrap items-center gap-3">
          <Pills label="Office" options={[{ key: "top" as TrendOffice, label: "Top race" }, ...TURNOUT_OFFICES.map((o) => ({ key: o as TrendOffice, label: OFFICE_LABEL[o] }))]} value={office} onChange={setOffice} />
          <Pills label="Cycle" options={[{ key: "all" as const, label: "All years" }, { key: "presidential" as const, label: "Presidential" }, { key: "midterm" as const, label: "Midterm" }]} value={cycle} onChange={setCycle} />
        </div>
      } />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span style={MUTED}>States (up to 5):</span>
        {picked.map((a, i) => (
          <button key={a} onClick={() => setPicked(picked.filter((x) => x !== a))} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-semibold" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }} aria-label={`Remove ${a}`}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colors[i] }} />{states.find((s) => s.abbr === a)?.name ?? a} ×
          </button>
        ))}
        {picked.length < 5 && (
          <span className="relative">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add a state…" aria-label="Add a state to the chart" className="rounded-md px-2 py-1 text-xs" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-primary)", width: 130 }} />
            {matches.length > 0 && (
              <div className="absolute left-0 top-full z-10 mt-1 min-w-[160px] rounded-md py-1 shadow-lg" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
                {matches.map((s) => <button key={s.abbr} className="block w-full px-2 py-1 text-left text-xs hover:underline" disabled={picked.includes(s.abbr)} onClick={() => { setPicked([...picked, s.abbr]); setQuery(""); }} style={{ color: picked.includes(s.abbr) ? "var(--app-text-very-muted)" : "var(--app-text-primary)" }}>{s.name}</button>)}
              </div>
            )}
          </span>
        )}
      </div>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid vertical={false} stroke="var(--app-border)" strokeDasharray="2 4" />
            <XAxis dataKey="year" tick={axis} axisLine={{ stroke: "var(--app-border)" }} tickLine={false} />
            <YAxis tick={axis} axisLine={false} tickLine={false} domain={[(min: number) => Math.max(0, Math.floor(min / 5) * 5 - 5), (max: number) => Math.min(100, Math.ceil(max / 5) * 5 + 5)]} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg px-3 py-2 text-xs shadow-lg" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}>
                  <div className="mb-1 font-bold" style={MUTED}>{label} · {cycleTypeOf(Number(label))}</div>
                  {payload.filter((p) => p.value != null).map((p) => (
                    <div key={String(p.dataKey)} className="flex justify-between gap-4 tabular-nums"><span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />{p.dataKey === "US" ? "United States" : states.find((s) => s.abbr === p.dataKey)?.name}</span><span className="font-semibold">{Number(p.value).toFixed(1)}%</span></div>
                  ))}
                </div>
              );
            }} />
            <Line type="linear" dataKey="US" stroke="var(--app-text-muted)" strokeDasharray="4 4" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            {picked.map((a, i) => <Line key={a} type="linear" dataKey={a} stroke={colors[i]} strokeWidth={2} dot={{ r: 3.5 }} connectNulls isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]" style={MUTED}>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4" style={{ borderTop: "2px dashed var(--app-text-muted)" }} />United States (where the race was held)</span>
        {picked.map((a, i) => <span key={a} className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: colors[i] }} />{states.find((s) => s.abbr === a)?.name}</span>)}
        <span style={VERY_MUTED}>Governor: odd years show the states that elected one.</span>
      </div>
    </section>
  );
}

function StateDropoff({ states, year }: { states: StateSeries[]; year: number }) {
  const { sort, toggle } = useSort({ key: "house", dir: 1 });
  const rows = useMemo(() => {
    const out = states.map((s) => { const r = s.years.find((x) => x.year === year)!; return { abbr: s.abbr, name: s.name, top: r.top, races: r.races, special: r.senateSpecial }; }).filter((r) => r.top);
    const get = (r: (typeof out)[number]) => sort.key === "name" ? r.name : sort.key === "top" ? r.top?.votes : r.races[sort.key as TurnoutOffice]?.ofTop;
    return sortBy(out, get, sort.dir);
  }, [states, year, sort]);
  return (
    <section id="dropoff" className="pt-8">
      <LedgerSectionHead label="Drop-off down the ticket" meta={`share of the top race · ${year}`} />
      <p className="mb-3 max-w-3xl text-sm leading-relaxed" style={MUTED}>
        Votes in each race as a share of the state&apos;s top race that year: in a presidential year, the president; in a midterm, whichever of Senate, governor or the House total drew the most votes. A House figure well under the rest usually means unopposed seats (no count in FL, OK and LA).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid var(--app-border)" }}>
            <Th k="name" sort={sort} onSort={toggle} align="left" defaultDir={1}>State</Th>
            <Th align="left" phone={false}>Top race</Th>
            <Th k="top" sort={sort} onSort={toggle} phone={false}>Top votes</Th>
            <Th k="president" sort={sort} onSort={toggle} phone={false}>President</Th>
            <Th k="senate" sort={sort} onSort={toggle}>Senate</Th>
            <Th k="governor" sort={sort} onSort={toggle}>Governor</Th>
            <Th k="house" sort={sort} onSort={toggle} defaultDir={1}>House</Th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.abbr} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <Td align="left" strong>{r.name}</Td>
                <Td align="left" muted phone={false}>{r.top ? OFFICE_LABEL[r.top.office] : "—"}</Td>
                <Td phone={false}>{fmtInt(r.top?.votes)}</Td>
                {TURNOUT_OFFICES.map((o) => { const race = r.races[o]; return <Td key={o} muted={!race} phone={o !== "president"}>{!race ? "—" : r.top?.office === o ? "100%" : race.votes == null ? "no count" : `${fmtPct(race.ofTop, 0)}${race.firstRound ? "*" : ""}${typeof race.uncontested === "number" && race.uncontested > 0 ? ` (${race.uncontested} unopp.)` : ""}`}</Td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DistrictTable({ states, year, sortKey }: { states: StateSeries[]; year: number; sortKey: string }) {
  const [stateFilter, setStateFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  const { sort, toggle } = useSort({ key: sortKey, dir: -1 });
  const { data: slice, loading } = useStaticJson<TurnoutSlice>(turnoutSliceUrl("district", year));
  const rows = useMemo(() => {
    if (!slice) return [];
    const seen = new Set<string>();
    const out: { key: string; name: string; state: string; house: TurnoutRace; cvap: number | null; top: { office: TurnoutOffice; votes: number } | null; ofPrior: number | null; href: string | null }[] = [];
    for (const [key, e] of Object.entries(slice.entries)) {
      if (!e.races.house || seen.has(e.name)) continue;
      seen.add(e.name);
      if (stateFilter && e.state !== stateFilter) continue;
      out.push({ key, name: e.name, state: e.state, house: e.races.house, cvap: e.cvap, top: e.top, ofPrior: e.ofPriorPresidential, href: e.moreInfoHref ?? null });
    }
    const get = (r: (typeof out)[number]) => sort.key === "name" ? r.name : sort.key === "votes" ? r.house.votes : sort.key === "cvap" ? r.cvap : sort.key === "rate" ? r.house.rate : sort.key === "ofTop" ? (r.top?.office === "house" ? null : r.house.ofTop) : sort.key === "change" ? r.house.change : r.ofPrior;
    return sortBy(out, get, sort.dir);
  }, [slice, stateFilter, sort]);
  const shown = showAll || stateFilter ? rows : rows.slice(0, 40);
  const isMid = cycleTypeOf(year) !== "presidential";
  const ph = { ofTop: sortKey !== "change" && sortKey !== "ofPrior", change: sortKey === "change", ofPrior: sortKey === "ofPrior" };
  return (
    <section id="by-district" className="pt-8">
      <LedgerSectionHead label="Turnout by House district" meta={`${rows.length} districts · ${year}`} right={
        <Dropdown label="State" value={stateFilter} onChange={(v) => { setStateFilter(v); setShowAll(false); }} options={[["", "All states"], ...states.map((s) => [s.abbr, s.name] as [string, string])]} />
      } />
      <p className="mb-3 max-w-3xl text-sm leading-relaxed" style={MUTED}>
        House votes in each district over the district&apos;s CVAP (ACS release on the lines used that year), and as a share of the statewide top race within the district. Change is available only where the lines did not move in the four years since the same cycle. Unopposed seats are shown as recorded.
      </p>
      {loading && <div className="py-6 text-center text-xs" style={MUTED}>Loading districts…</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
          <thead><tr style={{ borderBottom: "1px solid var(--app-border)" }}>
            <Th k="name" sort={sort} onSort={toggle} align="left" defaultDir={1}>District</Th>
            <Th k="votes" sort={sort} onSort={toggle}><Short phone="Votes" full="House votes" /></Th>
            <Th k="cvap" sort={sort} onSort={toggle} phone={false}>CVAP</Th>
            <Th k="rate" sort={sort} onSort={toggle}>% CVAP</Th>
            <Th align="left" phone={false}>&nbsp;</Th>
            <Th k="ofTop" sort={sort} onSort={toggle} title="House votes as a share of the top statewide race within the district" phone={ph.ofTop}><Short phone="% of top" full="% of top race" /></Th>
            <Th align="left" phone={false}>Top race</Th>
            <Th k="change" sort={sort} onSort={toggle} phone={ph.change}>Change</Th>
            {isMid && <Th k="ofPrior" sort={sort} onSort={toggle} title="Top-race votes in the district over the previous presidential vote there (same lines only)" phone={ph.ofPrior}>vs. prior pres.</Th>}
          </tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} style={{ borderBottom: "1px solid var(--app-border)" }}>
                <Td align="left" strong wrap>{r.href ? <Link href={r.href} className="hover:underline">{r.name}</Link> : r.name}{r.house.firstRound ? "*" : ""}{r.house.uncontested === true && <span className="ml-1 font-normal" style={VERY_MUTED}>unopposed</span>}</Td>
                <Td>{r.house.votes == null ? <span style={VERY_MUTED}>no count</span> : fmtInt(r.house.votes)}</Td>
                <Td phone={false}>{fmtInt(r.cvap)}</Td>
                <Td strong>{fmtPct(r.house.rate)}</Td>
                <Td align="left" phone={false}><Bar v={r.house.rate} max={80} color="#4a8aa6" /></Td>
                <Td phone={ph.ofTop}>{r.top?.office === "house" ? <span style={VERY_MUTED}>top</span> : fmtPct(r.house.ofTop, 0)}</Td>
                <Td align="left" muted phone={false}>{r.top && r.top.office !== "house" ? OFFICE_LABEL[r.top.office] : "House"}</Td>
                <Td phone={ph.change}>{fmtPts(r.house.change)}</Td>
                {isMid && <Td phone={ph.ofPrior}>{fmtPct(r.ofPrior, 0)}</Td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!showAll && !stateFilter && rows.length > shown.length && <button onClick={() => setShowAll(true)} className="mt-3 text-xs font-semibold hover:underline" style={MUTED}>Show all {rows.length} districts</button>}
    </section>
  );
}

const B = ({ children }: { children: React.ReactNode }) => <b style={{ color: "var(--app-text-primary)" }}>{children}</b>;

function Projection({ states, projection, projectionNational, office }: Pick<TurnoutPageProps, "states" | "projection" | "projectionNational"> & { office: Exclude<TurnoutOffice, "president"> }) {
  const [view, setView] = useState<"all" | "county">("all");
  const racesFor = (o: typeof office) => projection.filter((r) => r.office === o);
  const statesFor = (o: typeof office) => [...new Set(racesFor(o).map((r) => r.state))].sort();
  const [state, setState] = useState("GA");
  const st = statesFor(office).includes(state) ? state : statesFor(office)[0];
  const stateRaces = racesFor(office).filter((r) => r.state === st);
  const [raceId, setRaceId] = useState<string | null>(null);
  const race = stateRaces.find((r) => r.id === raceId) ?? stateRaces[0];
  const { data: slice } = useStaticJson<ProjectionStateSlice>(view === "county" && st ? projectionSliceUrl(st) : null);
  const detail = slice?.races.find((r) => r.id === race?.id);
  const { sort, toggle } = useSort({ key: "votes", dir: -1 });
  const all = (() => {
    const out = racesFor(office).map((r) => ({ ...r, name: states.find((s) => s.abbr === r.state)?.name ?? r.state, vsPrior: r.prior?.votes ? (r.votes / r.prior.votes - 1) * 100 : null }));
    const get = (r: (typeof out)[number]) => sort.key === "label" ? r.label : sort.key === "rate" ? r.rate : sort.key === "prior" ? r.prior?.votes : sort.key === "vsPrior" ? r.vsPrior : sort.key === "pres" ? r.pres2024 : r.votes;
    return sortBy(out, get, sort.dir);
  })();
  const [showAll, setShowAll] = useState(false);
  const shownAll = showAll ? all : all.slice(0, 25);
  // "Show all" keeps the box the size of the first 25 rows and scrolls inside it; the column
  // widths are measured first and pinned so nothing shifts when the longer list arrives.
  type Lock = { height: number; width: number; cols: number[] };
  const measure = (t: HTMLTableElement | null): Lock | null => t && { height: t.offsetHeight, width: t.getBoundingClientRect().width, cols: Array.from(t.querySelectorAll("thead th"), (th) => th.getBoundingClientRect().width) };
  // Locked tables: a fixed pixel width (not 100%, which phones squeeze), the header pinned on each cell (thead sticky is unreliable in Safari), and overlong cells clipped with an ellipsis so pinned columns never overlap.
  const lockedTable = "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:bg-[var(--app-bg)] [&_thead_th]:shadow-[inset_0_-1px_0_var(--app-border)] [&_td]:overflow-hidden [&_td]:text-ellipsis";
  const allTableRef = useRef<HTMLTableElement>(null);
  const [lock, setLock] = useState<Lock | null>(null);
  const expandAll = () => { setLock(measure(allTableRef.current)); setShowAll(true); };
  const countyTableRef = useRef<HTMLTableElement>(null);
  const [showAllCounties, setShowAllCounties] = useState(false);
  const [countyLock, setCountyLock] = useState<Lock | null>(null);
  const expandCounties = () => { setCountyLock(measure(countyTableRef.current)); setShowAllCounties(true); };
  const resetCounties = () => { setShowAllCounties(false); setCountyLock(null); };
  const counties = detail?.counties ?? [];
  const shownCounties = showAllCounties ? counties : counties.slice(0, 25);
  const stateName = (abbr: string) => states.find((s) => s.abbr === abbr)?.name ?? abbr;
  const raceName = (r: ProjectedRace) => `${office === "house" ? r.label : stateName(r.state)}${r.special ? " (special)" : ""}`;
  const openRace = (r: ProjectedRace) => { setState(r.state); setRaceId(r.id); setView("county"); resetCounties(); };
  return (
    <section id="estimate" className="pt-8">
      <LedgerSectionHead label={`${PROJECTION_YEAR} turnout estimate`} meta={`${projection.length} races`} />
      <p className="mb-4 max-w-3xl text-sm leading-relaxed" style={MUTED}>
        How many votes each {PROJECTION_YEAR} race should draw, and from which counties. Nationally that is about <B>{fmtM(projectionNational.houseVotes)}</B> House votes
        ({fmtM(projectionNational.low)}–{fmtM(projectionNational.high)}), or <B>{projectionNational.rate}%</B> of eligible citizens, against {projectionNational.basis.map((b) => `${fmtM(b.houseVotes)} in ${b.year}`).join(" and ")}.
        {" "}Each race&rsquo;s electorate is its state&rsquo;s eligible citizens times a blend of its recent midterm turnout rates, adjusted for what tops the ballot and how close the race is; counties split it by their 2024 presidential vote and midterm propensity
        (<Link href="/analysis/internal-methodology/turnout" className="underline underline-offset-2">method and backtest</Link>).
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented label="View" value={view} onChange={setView} options={[["all", "All races"], ["county", "By county"]]} />
        {view === "county" && (
          <>
            <Dropdown label="State" value={st} onChange={(v) => { setState(v); setRaceId(null); resetCounties(); }} options={statesFor(office).map((a) => [a, stateName(a)])} />
            {stateRaces.length > 1 && <Dropdown label="Race" value={race?.id ?? ""} onChange={(v) => { setRaceId(v); resetCounties(); }} options={stateRaces.map((r) => [r.id, r.label])} />}
          </>
        )}
      </div>

      {view === "all" ? (
        <>
          <div className={showAll ? "overflow-auto" : "overflow-x-auto"} style={{ scrollbarGutter: "stable", ...(showAll && lock ? { maxHeight: lock.height } : {}) }}>
            <table ref={allTableRef} className={showAll && lock ? `text-xs ${lockedTable}` : "w-full text-xs"} style={{ borderCollapse: "collapse", ...(showAll && lock ? { tableLayout: "fixed", width: lock.width } : {}) }}>
              {showAll && lock && <colgroup>{lock.cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>}
              <thead><tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                <Th k="label" sort={sort} onSort={toggle} align="left" defaultDir={1}>Race</Th>
                <Th k="pres" sort={sort} onSort={toggle} phone={false}>2024 pres.</Th>
                <Th k="votes" sort={sort} onSort={toggle}>Estimate</Th>
                <Th phone={false}>Range</Th>
                <Th k="rate" sort={sort} onSort={toggle}>% CVAP</Th>
                <Th k="prior" sort={sort} onSort={toggle} phone={false}>Prior</Th>
                <Th k="vsPrior" sort={sort} onSort={toggle}>vs. prior</Th>
              </tr></thead>
              <tbody>
                {shownAll.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <Td align="left" wrap><button type="button" className="text-left font-semibold hover:underline" onClick={() => openRace(r)} title="Show this race by county">{raceName(r)}</button></Td>
                    <Td muted phone={false}>{fmtInt(r.pres2024)}</Td>
                    <Td strong>{fmtInt(r.votes)}</Td>
                    <Td muted phone={false}>{fmtM(r.low)}–{fmtM(r.high)}</Td>
                    <Td>{fmtPct(r.rate)}</Td>
                    <Td muted phone={false}>{r.prior ? (r.prior.votes == null ? "no count" : `${fmtInt(r.prior.votes)} (${r.prior.year})`) : "—"}</Td>
                    <Td>{r.vsPrior == null ? "—" : `${fmtPts(r.vsPrior)}%`}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {all.length > 25 && (
            showAll
              ? <button type="button" onClick={() => { setShowAll(false); setLock(null); }} className="mt-3 text-xs font-semibold hover:underline" style={MUTED}>Show fewer</button>
              : <button type="button" onClick={expandAll} className="mt-3 text-xs font-semibold hover:underline" style={MUTED}>Show all {all.length} races</button>
          )}
        </>
      ) : race && (
        <>
          <p className="mb-3 text-sm tabular-nums" style={MUTED}>
            <B>{raceName(race)} {OFFICE_LABEL[race.office]}</B>: about <B>{fmtInt(race.votes)}</B> votes ({fmtM(race.low)}–{fmtM(race.high)}), {fmtPct(race.rate)} of eligible citizens
            {race.prior ? <>, {race.prior.votes ? <>{fmtPts((race.votes / race.prior.votes - 1) * 100)}% from {fmtInt(race.prior.votes)} in {race.prior.year}</> : <>no count in {race.prior.year}</>}</> : <>, no comparable prior race on these lines</>}; {fmtInt(race.pres2024)} voted for president in 2024.
          </p>
          <div className={showAllCounties ? "overflow-auto" : "overflow-x-auto"} style={{ scrollbarGutter: "stable", ...(showAllCounties && countyLock ? { maxHeight: countyLock.height } : {}) }}>
            <table ref={countyTableRef} className={showAllCounties && countyLock ? `text-xs ${lockedTable}` : "w-full text-xs"} style={{ borderCollapse: "collapse", ...(showAllCounties && countyLock ? { tableLayout: "fixed", width: countyLock.width } : {}) }}>
              {showAllCounties && countyLock && <colgroup>{countyLock.cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>}
              <thead><tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                <Th align="left">County</Th><Th phone={false}>2024 pres.</Th><Th title="Blended midterm share ÷ presidential share, after shrinkage" phone={false}>Propensity</Th><Th title={office === "house" ? "County office factor × district drop-off" : "County office factor relative to the state"}>Factor</Th>{office === "house" && <Th title="Share of the county's electorate inside this district" phone={false}>In district</Th>}<Th>Estimate</Th><Th phone={false}>Range</Th><Th>% CVAP</Th>
              </tr></thead>
              <tbody>
                {!detail && <tr><td colSpan={8} className="py-4 text-center" style={MUTED}>Loading counties…</td></tr>}
                {shownCounties.map((c) => (
                  <tr key={c.fips} style={{ borderBottom: "1px solid var(--app-border)" }}>
                    <Td align="left" wrap><Link href={`/historical/${c.fips}`} className="hover:underline">{c.name}</Link></Td>
                    <Td muted phone={false}>{fmtInt(c.pres2024)}</Td>
                    <Td phone={false}>{c.midtermRatio.toFixed(2)}</Td>
                    <Td>{c.officeFactor.toFixed(2)}</Td>
                    {office === "house" && <Td phone={false}>{c.share >= 0.999 ? "all" : `${(c.share * 100).toFixed(0)}%`}</Td>}
                    <Td strong>{fmtInt(c.votes)}</Td>
                    <Td muted phone={false}>{fmtInt(c.low)}–{fmtInt(c.high)}</Td>
                    <Td>{fmtPct(c.rate)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {counties.length > 25 && (
            showAllCounties
              ? <button type="button" onClick={resetCounties} className="mt-3 text-xs font-semibold hover:underline" style={MUTED}>Show fewer</button>
              : <button type="button" onClick={expandCounties} className="mt-3 text-xs font-semibold hover:underline" style={MUTED}>Show all {counties.length} counties</button>
          )}
        </>
      )}
    </section>
  );
}

const fmtGb = (m: number) => (Math.abs(m) < 0.05 ? "EVEN" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`);
const gbColor = (m: number) => (m > 0 ? "var(--party-rep)" : "var(--party-dem)");

function ImpliedBallot({ ballot }: { ballot: ImpliedBallotProps }) {
  const labels: Record<ImpliedBallotProps["offices"][number]["office"], string> = { house: "House", senate: "Senate", governor: "Governor", overall: "All three combined" };
  const h = ballot.house, p = ballot.polling;
  return (
    <section id="implied-ballot" className="pt-8">
      <LedgerSectionHead label="Implied generic ballot" meta="what the forecast and the turnout estimate add up to" />
      <p className="mb-3 max-w-3xl text-sm leading-relaxed" style={MUTED}>
        Every race&apos;s forecast margin is spread over its counties on the {PROJECTION_YEAR} turnout estimate, and the projected votes are added back up. The polling generic ballot goes in at the top of the forecast; this is what comes out the bottom, so the gap between them is what the model does to it. Overall counts a voter once per race, so a state with a Senate and a governor race weighs twice.
      </p>
      <div className="flex flex-col gap-6">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid var(--app-border)" }}><Th align="left">Ballot</Th><Th phone={false}>Races</Th><Th phone={false}>Votes</Th><Th>Dem</Th><Th>Rep</Th><Th>Margin</Th><Th title="Republican minus Democratic share of the two-party vote, the polling generic ballot's basis" phone={false}>Two-party</Th></tr></thead>
            <tbody>
              {ballot.offices.map((o) => (
                <tr key={o.office} style={{ borderBottom: "1px solid var(--app-border)", fontWeight: o.office === "overall" ? 600 : 400 }}>
                  <Td align="left" strong={o.office === "house"} wrap>{labels[o.office]}</Td><Td phone={false}>{o.races}</Td><Td phone={false}>{fmtM(o.votes)}</Td><Td>{fmtPct(o.demPct)}</Td><Td>{fmtPct(o.repPct)}</Td>
                  <Td><span className="font-bold" style={{ color: gbColor(o.margin) }}>{fmtGb(o.margin)}</span></Td><Td phone={false}>{fmtGb(o.twoPartyMargin)}</Td>
                </tr>
              ))}
              <tr style={{ borderBottom: "1px solid var(--app-border)" }}><Td align="left" wrap>Polling generic ballot (live average)</Td><Td muted phone={false}>—</Td><Td muted phone={false}>—</Td><Td muted>—</Td><Td muted>—</Td><Td><span className="font-bold" style={{ color: gbColor(p.gb) }}>{fmtGb(p.gb)}</span></Td><Td muted phone={false}>—</Td></tr>
              <tr style={{ borderBottom: "1px solid var(--app-border)" }}><Td align="left" wrap>Forecast&apos;s expected House vote (average + shrunk historical miss)</Td><Td muted phone={false}>—</Td><Td muted phone={false}>—</Td><Td muted>—</Td><Td muted>—</Td><Td><span className="font-bold" style={{ color: gbColor(p.pvHat) }}>{fmtGb(p.pvHat)}</span></Td><Td muted phone={false}>—</Td></tr>
            </tbody>
          </table>
        </div>
        <div className="max-w-3xl text-sm leading-relaxed" style={MUTED}>
          <div className="pb-2 text-[10px] font-bold uppercase tracking-wider" style={{ ...MUTED, borderBottom: "1px solid var(--app-border)" }}>Why the House figure differs from the polls</div>
          <ol className="list-decimal space-y-2 pl-5 pt-3">
            <li><strong style={{ color: "var(--app-text-primary)" }}>The forecast does not use the poll average as is.</strong> It expects the House vote to land at <span style={{ color: gbColor(p.pvHat) }}>{fmtGb(p.pvHat)}</span>, the average pulled toward the historical polling miss, and converts that to its environment scale before it reaches any race.</li>
            <li><strong style={{ color: "var(--app-text-primary)" }}>Decided seats.</strong> {h.decidedRaces} seats with one major party absent or two nominees of the same party are counted at 100% for the side that has them, a net {fmtGb((h.decidedNetVotes / (ballot.offices[0].votes || 1)) * 100)} of the national vote ({Math.abs(h.decidedNetVotes).toLocaleString()} votes). Across the {h.contestedRaces} contested races alone the margin is <span style={{ color: gbColor(h.contestedOnly) }}>{fmtGb(h.contestedOnly)}</span>. Where the state does not count votes for an unopposed candidate those votes will never appear in the real popular vote, which is one reason the House popular vote and the generic ballot rarely match.</li>
            <li><strong style={{ color: "var(--app-text-primary)" }}>Turnout weighting.</strong> Weighting the contested races equally instead of by estimated votes gives <span style={{ color: gbColor(h.contestedEqualWeight) }}>{fmtGb(h.contestedEqualWeight)}</span>; the difference is where the votes are cast — a party&apos;s safest districts tend to be its lowest-turnout ones.</li>
            <li><strong style={{ color: "var(--app-text-primary)" }}>Third parties.</strong> Margins here are points of all votes, with each county&apos;s 2024 third-party share carried over; the poll average is Democrat against Republican.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}

function Notes({ firstRound, model }: Pick<TurnoutPageProps, "firstRound" | "model">) {
  return (
    <section id="notes" className="pt-8">
      <LedgerSectionHead label="Notes" />
      <ul className="max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed" style={MUTED}>
        <li><strong style={{ color: "var(--app-text-primary)" }}>Turnout</strong> is the votes cast in the race, not ballots cast: no state reports ballots consistently, and the difference is blank or spoiled ballots that add nothing to a race. The denominator is the citizen voting-age population from the ACS five-year release ending in the election year (2016 → 2012–16 … 2024 → 2020–24); 2025 reuses the 2024 release. Connecticut&apos;s counties from 2022 on are the 2021 release scaled by the state&apos;s growth, because the Census now reports planning regions there. VEP and total ballots are the U.S. Elections Project&apos;s (UF Election Lab).</li>
        <li><strong style={{ color: "var(--app-text-primary)" }}>Runoffs and ranked choice (*).</strong> Races decided in a later round are counted at their first round — the November general in Georgia, Louisiana and Mississippi, the first-choice count in Alaska and Maine — since that is the electorate that turned out; the race pages keep the decisive round. By-district figures for those races are the runoff round scaled to the first-round total. In use: {firstRound.map((f) => `${f.office === "house" ? f.seat : `${f.state} ${OFFICE_LABEL[f.office]}${f.office === "senate" && f.state === "GA" && f.year === 2020 && f.seat === "2" ? " special" : ""}`} ${f.year} (${f.votes.toLocaleString()})`).join("; ")}.</li>
        <li><strong style={{ color: "var(--app-text-primary)" }}>Unopposed seats</strong> are shown as recorded — zero where the state tallies no votes for an unopposed candidate (Florida, Oklahoma, Louisiana), the actual count elsewhere — and flagged. The {PROJECTION_YEAR} estimate imputes them as contested, using the district&apos;s own drop-off where it had a contest on the same lines and the state&apos;s contested-seat drop-off otherwise.</li>
        <li><strong style={{ color: "var(--app-text-primary)" }}>Districts and lines.</strong> Every year&apos;s districts sit on the map used that year, with CVAP from the matching Congress. A district code&apos;s change over four years is shown only when its state did not redraw in between, and the {PROJECTION_YEAR} estimate builds districts from counties on the {PROJECTION_YEAR} lines (2024 county pieces where the lines are unchanged, census tracts where a state redrew).</li>
        <li><strong style={{ color: "var(--app-text-primary)" }}>The estimate&apos;s constants</strong> — the {Object.entries(model.midtermWeights).map(([y, w]) => `${Math.round(w * 100)}% ${y}`).join(" / ")} blend, the {model.ticketFactor} House-only ticket factor, {(model.slope * 100).toFixed(2)}% turnout per point of the top race&apos;s margin, {model.shrinkVotes.toLocaleString()}-vote shrinkage and the {Math.round(model.dropoffWeight * 100)}% weight on a district&apos;s own drop-off — and its 2022 backtest are on the <Link href="/analysis/internal-methodology/turnout" className="underline underline-offset-2">Methodology › Turnout</Link> tab.</li>
      </ul>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TurnoutPage(props: TurnoutPageProps) {
  const dark = useDarkMode();
  const t = dark ? DARK_THEME : LIGHT_THEME;
  const { states, national, projection, projectionNational } = props;
  const [view, setView] = useState<TurnoutMapView>({ level: "state", metric: "rate", office: "president", year: 2024 });
  const { level, metric, office, year } = view;
  // The table under the map is the metric's own: rate, votes and change live in the by-state (or
  // by-district) table sorted by that column; the other three metrics each have a section of their own.
  const sortKey = metric === "ofPriorPresidential" ? "ofPrior" : metric;
  const table = metric === "projection" ? <Projection key={office} states={states} projection={projection} projectionNational={projectionNational} office={office === "president" ? "house" : office} />
    : level === "district" ? <DistrictTable key={`${metric}-${year}`} states={states} year={year} sortKey={sortKey} />
    : metric === "ofTop" ? <StateDropoff states={states} year={year} />
    : metric === "ofPriorPresidential" ? <PresVsMidterm states={states} />
    : <StateTable key={metric} states={states} national={national} office={office} year={year} sortKey={sortKey} />;
  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-3 sm:px-6">
      <section id="map" className="pt-1 sm:pt-6">
        <TurnoutMap theme={t} dark={dark} projection={projection} view={view} onViewChange={setView} />
      </section>
      {table}
      <Trends states={states} national={national} dark={dark} />
      <ImpliedBallot ballot={props.impliedBallot} />
      <Notes firstRound={props.firstRound} model={props.model} />
    </main>
  );
}
