"use client";

// Controls, maps and detail panel for /precincts. Two views: the national inset map (pick a state) and
// one state's precincts on their own. This shell fetches and keeps each state's results and names, so
// an office switch or a theme change (which remounts the map) never refetches.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDarkMode } from "@/lib/useDarkMode";
import { fmtMargin, marginColor } from "@/lib/colorScale";
import { RATING_SCALE, OFFICES, OFFICE_LABEL, marginOf, type Office, type StateDemographics, type StateIndex, type StateLocale, type StateResults, type StateShell } from "./types";
import PrecinctDemographics from "./PrecinctDemographics";
import PrecinctTrend, { type TrendPoint } from "./PrecinctTrend";
import PlaceSearch, { type PlaceHit } from "./PlaceSearch";
import NationalTrends, { type NationalTrendsData } from "./NationalTrends";
import PrecinctTurnout, { type TurnoutPoint } from "./PrecinctTurnout";
import { chamberDistrictHref } from "@/lib/statePageLinks";

const NationalMap = dynamic(() => import("./NationalMap"), { ssr: false, loading: () => <div style={{ height: "100%" }} /> });
// One box for both maps, so switching between all states and one state never resizes the map.
const MAP_BOX: React.CSSProperties = { height: "min(72vh, 680px)", minHeight: 400 };
const PrecinctMap = dynamic(() => import("./PrecinctMap"), { ssr: false, loading: () => <div style={{ height: "100%" }} /> });

// Column heads of the past-results grid: short enough for seven offices in the sidebar.
const OFFICE_SHORT: Record<Office, [string, string?]> = {
  PRES: ["Pres"], USS: ["Sen"], USSS: ["Sen", "Spec."], GOV: ["Gov"], USH: ["House"], SLDU: ["State", "Sen"], SLDL: ["State", "House"],
};
const EST_FLAG = 10; // percent of a precinct-year's vote that was fitted from other boundaries before it is italicized

// Typography shared with the site's county cards and ledgers (components/CountyTooltip, RaceDetailSections).
const LABEL = "text-[10px] font-semibold uppercase tracking-[0.06em]";
const KICKER = "text-[10.5px] font-bold uppercase tracking-[0.07em]";
const SERIF_FIGURE = { fontFamily: "var(--font-serif)", fontWeight: 700, lineHeight: 1.05 } as const;

const pill = (active: boolean, enabled = true): React.CSSProperties => ({
  border: "1px solid var(--app-border)",
  background: active ? "var(--app-text-primary)" : "transparent",
  color: active ? "var(--app-bg)" : enabled ? "var(--app-text-primary)" : "var(--app-text-very-muted)",
  opacity: enabled ? 1 : 0.55,
  cursor: enabled ? "pointer" : "default",
});

// The district page behind a precinct's district code, or null where the code can't be matched to
// one. House: /house/st-nn. Legislature: the chamber explorer, keyed by the atlas's district key
// (legKey below). MA, NH House and VT codes are the source's own abbreviations, not atlas keys, so they stay unlinked.
function districtHref(abbr: string, o: Office, code: string, year: number): string | null {
  if (o === "USH") {
    const n = code === "AL" ? 1 : parseInt(code, 10);
    return Number.isFinite(n) && n > 0 ? `/house/${abbr.toLowerCase()}-${String(n).padStart(2, "0")}` : null;
  }
  if (o !== "SLDU" && o !== "SLDL") return null;
  const chamber = o === "SLDU" ? "senate" : "house";
  if (abbr === "MA" || abbr === "VT" || (abbr === "NH" && chamber === "house")) return null;
  const key = legKey(abbr, o, code, year);
  if (!/^\d+[A-Z]?$|^[A-Z]$/.test(key)) return null;
  if (abbr === "MN" && chamber === "house" && /^\d+$/.test(key)) return null; // MN House keys are always 1A/1B
  return chamberDistrictHref(abbr.toLowerCase(), chamber, key);
}

// A precinct file's legislative district code as the site's district key ("1", "1A", "B"). Codes vary
// by source: WA writes "DISTRICT 1, POSITION 1", "001, POSITION 1", or in 2024 "011" (district 01,
// position 1); ID House seats carry a letter ("01A") the site's districts don't. Mirrors leg_key() in
// scripts/precincts/build_one_party.py.
function legKey(abbr: string, o: Office, code: string, year: number): string {
  let k = code.trim().toUpperCase().replace(/^DISTRICT\s+/, "").replace(/(,\s*POSITION.*|-P\d+)$/, "");
  if (o === "SLDL" && abbr === "WA" && year === 2024 && /^\d{3}$/.test(k)) k = k.slice(0, -1);
  if (o === "SLDL" && abbr === "ID") k = k.replace(/[A-Z]$/, "");
  return k.replace(/^0+(?=\d)/, "");
}

// Races where one of the two parties had no candidate, from public/precincts/one-party.json
// (scripts/precincts/build_one_party.py, built from the site's district-level results). Where that
// file doesn't cover a state-year-office, the fallback is a district (statewide: state) with no votes
// on one side in the precinct rows.
type OnePartyData = {
  covered: Record<string, Record<string, Office[]>>;
  races: Record<string, Record<string, Partial<Record<Office, Record<string, "D" | "R" | "same">>>>>;
};
type OneParty = { long: string };
const districtSums = new WeakMap<StateResults, Map<Office, Map<string, [number, number]>>>();
function sidesOf(res: StateResults, o: Office, district: string): [number, number] | undefined {
  let byOffice = districtSums.get(res);
  if (!byOffice) districtSums.set(res, (byOffice = new Map()));
  let sums = byOffice.get(o);
  if (!sums) {
    const m = new Map<string, [number, number]>();
    const ds = res.districts[o] ?? [];
    (res.offices[o] ?? []).forEach((row, n) => {
      const d = ds[n];
      if (!d || !row) return;
      const t = m.get(d) ?? [0, 0];
      t[0] += row[0]; t[1] += row[1];
      m.set(d, t);
    });
    byOffice.set(o, (sums = m));
  }
  return sums.get(district);
}
function describeOneParty(kind: "D" | "R" | "same"): OneParty {
  if (kind === "same") return { long: "Both candidates were of one party, so the margin is between two of its candidates, not a D-vs-R race." };
  return { long: `No ${kind === "D" ? "Republican" : "Democrat"} ran, so the margin is not a D-vs-R race.` };
}
function onePartyRace(shell: StateShell, res: StateResults | null | undefined, o: Office, i: number, year: number, data: OnePartyData | null): OneParty | null {
  if (!res || o === "PRES") return null;
  const statewide = o === "USS" || o === "USSS" || o === "GOV";
  const district = statewide ? "*" : res.districts[o]?.[i];
  if (!district) return null;
  if (data?.covered[shell.abbr]?.[year]?.includes(o)) {
    const kind = data.races[shell.abbr]?.[year]?.[o]?.[statewide ? "*" : legKey(shell.abbr, o, district, year)];
    return kind ? describeOneParty(kind) : null;
  }
  const sum = statewide ? shell.years[String(year)]?.[o] : undefined;
  const sides = statewide ? (sum ? [sum.d, sum.r] : undefined) : sidesOf(res, o, district);
  if (!sides || (sides[0] > 0 && sides[1] > 0) || sides[0] + sides[1] === 0) return null;
  return describeOneParty(sides[1] === 0 ? "D" : "R");
}
const ONE_PARTY_OPACITY = 0.45;

// TPL's race types for the precinct offices. Both legislative chambers are "L", averaged equally.
const TPL_TYPE: Record<Office, string> = { PRES: "P", USS: "S", USSS: "S", GOV: "G", USH: "H", SLDU: "L", SLDL: "L" };
/** TPL's base race-type weights (data/tplModelData.ts), handed down by the server page. */
export type TplWeights = { presidential: Record<string, number>; midterm: Record<string, number> };

// One year's blended result for a precinct: contested races at face value (estimates kept), averaged
// within each race type, then weighed by TPL's type weights renormalized over the types present.
function blendYear(shell: StateShell, res: StateResults, i: number, year: number, oneParty: OnePartyData | null, weights: TplWeights): TrendPoint | null {
  const W = year % 4 === 0 ? weights.presidential : weights.midterm;
  const byType = new Map<string, { office: Office; margin: number }[]>();
  for (const o of OFFICES) {
    const m = marginOf(res.offices[o]?.[i]);
    if (m === null || onePartyRace(shell, res, o, i, year, oneParty)) continue;
    const t = TPL_TYPE[o];
    if (!W[t]) continue;
    byType.set(t, [...(byType.get(t) ?? []), { office: o, margin: m }]);
  }
  const total = [...byType.keys()].reduce((sum, t) => sum + W[t], 0);
  if (total <= 0) return null;
  const parts = [...byType].flatMap(([t, rows]) => rows.map((r) => ({ ...r, weight: W[t] / total / rows.length })));
  return { year, margin: parts.reduce((sum, p) => sum + p.weight * p.margin, 0), parts };
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <div className={`${KICKER} pb-1`} style={{ color: "var(--app-text-muted)", borderBottom: "1px solid var(--app-border)" }}>{children}</div>;
}

export default function PrecinctExplorer({ states, years, tplWeights, national }: { states: StateShell[]; years: { year: number; loaded: boolean }[]; tplWeights: TplWeights; national: NationalTrendsData }) {
  const darkMode = useDarkMode();
  const [office, setOffice] = useState<Office>("PRES");
  // Opens on the last presidential election (2024 president), not the newest year on file.
  const [pickedYear, setYear] = useState(() => years.filter((y) => y.loaded && y.year % 4 === 0).at(-1)?.year ?? 2024);
  // The one state whose precincts are on screen; null = the national map.
  const [current, setCurrent] = useState<string | null>(null);
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const [moved, setMoved] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [data, setData] = useState<Map<string, StateResults | null>>(() => new Map()); // keyed "year|ST"
  const [onePartyData, setOnePartyData] = useState<OnePartyData | null>(null);
  const [indexes, setIndexes] = useState<Map<string, StateIndex | null>>(() => new Map()); // keyed ST
  const [demographics, setDemographics] = useState<Map<string, StateDemographics | null>>(() => new Map()); // keyed ST
  const [locales, setLocales] = useState<Map<string, StateLocale | null>>(() => new Map()); // keyed ST
  const [stateTrends, setStateTrends] = useState<Map<string, NationalTrendsData | null>>(() => new Map()); // keyed ST
  const byAbbr = useMemo(() => new Map(states.map((s) => [s.abbr, s])), [states]);
  // The last searched place; the map flies to it while its state is the one open.
  const [target, setTarget] = useState<(PlaceHit & { nonce: number }) | null>(null);

  const openState = useCallback((abbr: string | null) => {
    setCurrent(abbr);
    setSelectedPid(null);
    setMoved(false);
    window.history.replaceState(null, "", abbr ? `#${abbr}` : window.location.pathname);
  }, []);

  const goTo = useCallback((hit: PlaceHit) => {
    if (hit.abbr !== current) openState(hit.abbr);
    // zoom 0: the place is the whole state, so its full view is the answer.
    setTarget(hit.zoom > 0 ? { ...hit, nonce: Date.now() } : null);
  }, [current, openState]);

  // /precincts#TX opens Texas. After hydration, so the server-rendered picker and the first client render agree.
  useEffect(() => {
    const h = window.location.hash.replace("#", "").toUpperCase();
    if (!byAbbr.has(h)) return;
    const id = requestAnimationFrame(() => setCurrent(h));
    return () => cancelAnimationFrame(id);
  }, [byAbbr]);

  const shell = current ? byAbbr.get(current) : undefined;
  // Every year this state has precinct results for, newest first (the rows of the past-results grid).
  const stateYears = useMemo(() => (shell ? Object.keys(shell.years).map(Number).sort((a, b) => b - a) : []), [shell]);
  // The year on the map. A state opened on a year it has no results for (2026 before it certifies, an
  // odd year elsewhere) shows its latest year instead; the national map shows even years only.
  const year = shell ? (shell.years[String(pickedYear)] ? pickedYear : (stateYears[0] ?? pickedYear)) : pickedYear % 2 === 0 ? pickedYear : pickedYear - 1;
  // Year buttons: the even years, plus the odd years the open state voted in.
  const yearPills = years.filter((y) => (shell ? y.year % 2 === 0 || !!shell.years[String(y.year)] : y.year % 2 === 0))
    .map((y) => ({ year: y.year, loaded: shell ? !!shell.years[String(y.year)] : y.loaded }));

  // Names for the open state; results for the year on the map. Once a precinct is picked, the state's
  // other years load too, so its panel can show every past result. Fetched once per state and kept.
  const key = current ? `${year}|${current}` : null;
  const wantAll = selectedPid !== null;
  useEffect(() => {
    if (!current || indexes.has(current)) return;
    let live = true;
    fetch(`/precincts/index/${current}.json`).then((r) => (r.ok ? (r.json() as Promise<StateIndex>) : null)).catch(() => null)
      .then((index) => { if (live) setIndexes((prev) => new Map(prev).set(current, index)); });
    return () => { live = false; };
  }, [current, indexes]);
  useEffect(() => {
    if (selectedPid === null || onePartyData) return;
    let live = true;
    fetch("/precincts/one-party.json").then((r) => (r.ok ? (r.json() as Promise<OnePartyData>) : null)).catch(() => null)
      .then((d) => { if (live && d) setOnePartyData(d); });
    return () => { live = false; };
  }, [selectedPid, onePartyData]);
  // Census profile for the open state: fetched the first time a precinct is picked there.
  useEffect(() => {
    if (!current || !wantAll || demographics.has(current)) return;
    let live = true;
    fetch(`/precincts/demographics/${current}.json`).then((r) => (r.ok ? (r.json() as Promise<StateDemographics>) : null)).catch(() => null)
      .then((d) => { if (live) setDemographics((prev) => new Map(prev).set(current, d)); });
    return () => { live = false; };
  }, [current, wantAll, demographics]);
  // The open state's own group trends, for its summary panel.
  useEffect(() => {
    if (!current || stateTrends.has(current)) return;
    let live = true;
    fetch(`/precincts/trends/${current}.json`).then((r) => (r.ok ? (r.json() as Promise<NationalTrendsData>) : null)).catch(() => null)
      .then((d) => { if (live) setStateTrends((prev) => new Map(prev).set(current, d)); });
    return () => { live = false; };
  }, [current, stateTrends]);
  // Area types for the open state: fetched the first time a precinct is picked there.
  useEffect(() => {
    if (!current || !wantAll || locales.has(current)) return;
    let live = true;
    fetch(`/precincts/locale/${current}.json`).then((r) => (r.ok ? (r.json() as Promise<StateLocale>) : null)).catch(() => null)
      .then((d) => { if (live) setLocales((prev) => new Map(prev).set(current, d)); });
    return () => { live = false; };
  }, [current, wantAll, locales]);
  useEffect(() => {
    if (!current) return;
    const need = (wantAll ? [year, ...stateYears] : [year]).filter((y, n, a) => a.indexOf(y) === n && !data.has(`${y}|${current}`));
    if (need.length === 0) return;
    let live = true;
    Promise.all(need.map((y) => fetch(`/precincts/results/${current}/${y}.json`).then((r) => (r.ok ? (r.json() as Promise<StateResults>) : null)).catch(() => null)))
      .then((all) => {
        if (!live) return;
        setData((prev) => { const next = new Map(prev); need.forEach((y, n) => next.set(`${y}|${current}`, all[n])); return next; });
      });
    return () => { live = false; };
  }, [current, year, wantAll, stateYears, data]);

  const cached = key ? { results: data.get(key) ?? null, index: (current && indexes.get(current)) || null } : undefined;
  // Offices with precinct data this year: for the open state, or anywhere on the national map.
  const available = useMemo(() => {
    const pool = shell ? [shell] : states;
    return new Set(OFFICES.filter((o) => pool.some((s) => s.years[String(year)]?.[o])));
  }, [shell, states, year]);
  const shown: Office = available.has(office) ? office : (OFFICES.find((o) => available.has(o)) ?? office);

  const i = shell && selectedPid !== null ? selectedPid - shell.first : -1;
  // On wide screens the sidebar scrolls inside the map's height; a new precinct starts at its top.
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => { asideRef.current?.scrollTo({ top: 0 }); }, [i, current]);
  const selName = i >= 0 ? cached?.index?.names[i] : undefined;
  const selCounty = i >= 0 && cached?.index ? cached.index.counties[cached.index.county[i]]?.[1] : undefined;
  const selRow = i >= 0 ? cached?.results?.offices[shown]?.[i] : undefined;
  // Offices this state has in any year: the columns of the past-results grid.
  const historyOffices = useMemo(() => (shell ? OFFICES.filter((o) => Object.values(shell.years).some((y) => y[o])) : []), [shell]);
  const historyLoading = !!current && stateYears.some((y) => !data.has(`${y}|${current}`));
  const selMargin = marginOf(selRow);
  const selOneParty = shell && i >= 0 && selMargin !== null ? onePartyRace(shell, cached?.results, shown, i, year, onePartyData) : null;
  const stateSum = shell?.years[String(year)]?.[shown];
  const stateMargin = stateSum ? marginOf([stateSum.d, stateSum.r, stateSum.o]) : null;
  // Analysis stats over every contested race on file for the selected precinct (estimates kept,
  // uncontested races left out): its best result for each party, and the selected year's spread.
  const stats = useMemo(() => {
    if (!shell || i < 0) return null;
    type Race = { year: number; office: Office; margin: number; rShare: number };
    const races: Race[] = [];
    for (const y of stateYears) {
      const res = data.get(`${y}|${shell.abbr}`);
      if (!res) continue;
      for (const o of OFFICES) {
        const row = res.offices[o]?.[i];
        const m = marginOf(row);
        if (!row || m === null || onePartyRace(shell, res, o, i, y, onePartyData)) continue;
        races.push({ year: y, office: o, margin: m, rShare: (row[1] / (row[0] + row[1] + row[2])) * 100 });
      }
    }
    if (races.length === 0) return null;
    const bestR = races.reduce((a, b) => (b.margin > a.margin ? b : a));
    const bestD = races.reduce((a, b) => (b.margin < a.margin ? b : a));
    // Spread: the gap between the year's highest and lowest Republican share. At least that share of
    // the precinct's voters backed a Republican in one race and not in another.
    const thisYear = races.filter((r) => r.year === year);
    const hi = thisYear.length > 1 ? thisYear.reduce((a, b) => (b.rShare > a.rShare ? b : a)) : null;
    const lo = thisYear.length > 1 ? thisYear.reduce((a, b) => (b.rShare < a.rShare ? b : a)) : null;
    return { bestR, bestD, spread: hi && lo ? { hi, lo, pts: hi.rShare - lo.rShare } : null };
  }, [shell, i, stateYears, data, onePartyData, year]);
  // Turnout: each loaded year's biggest race (most votes cast), oldest first. Uncontested races count:
  // their ballots were still cast. Estimated when that race's votes were divided from other lines.
  const turnout = useMemo(() => {
    if (!shell || i < 0) return [];
    return [...stateYears].reverse().flatMap((y): TurnoutPoint[] => {
      const res = data.get(`${y}|${shell.abbr}`);
      if (!res) return [];
      let best: TurnoutPoint | null = null;
      for (const o of OFFICES) {
        const row = res.offices[o]?.[i];
        const votes = row ? row[0] + row[1] + row[2] : 0;
        if (votes > (best?.votes ?? 0)) best = { year: y, votes, office: o, est: (res.est?.[o]?.[i] ?? 0) > EST_FLAG };
      }
      return best ? [best] : [];
    });
  }, [shell, i, stateYears, data]);
  // The trend: each loaded year's blended result for the selected precinct, oldest first.
  const trend = useMemo(() => {
    if (!shell || i < 0) return [];
    return [...stateYears].reverse().flatMap((y) => {
      const res = data.get(`${y}|${shell.abbr}`);
      const pt = res ? blendYear(shell, res, i, y, onePartyData, tplWeights) : null;
      return pt ? [pt] : [];
    });
  }, [shell, i, stateYears, data, onePartyData, tplWeights]);

  return (
    <div>
      {/* controls: address search, state, office and year buttons */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
        <PlaceSearch states={states} onFound={goTo} />
        {/* No visible "State" label: the picker reads "All states" or the state's name, and the row needs the room. */}
        <label className="flex items-center text-sm">
          <span className="sr-only">State</span>
          <select
            id="precinct-state"
            value={current ?? ""}
            onChange={(e) => openState(e.target.value || null)}
            className="px-2 py-1 text-sm"
            style={{ background: "var(--app-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
          >
            <option value="">All states</option>
            {states.map((s) => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {OFFICES.map((o) => {
            const ok = available.has(o);
            return (
              <button key={o} id={`precinct-office-${o}`} disabled={!ok} onClick={() => setOffice(o)} className="px-2.5 py-1 text-xs font-semibold" style={pill(shown === o, ok)}>
                {OFFICE_LABEL[o]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {yearPills.map((y) => (
            <button
              key={y.year}
              id={`precinct-year-${y.year}`}
              disabled={!y.loaded}
              title={y.loaded ? undefined : shell ? `No ${y.year} precinct results for ${shell.name} yet` : "Not loaded yet"}
              onClick={() => setYear(y.year)}
              className="px-2 py-1 text-xs font-semibold"
              style={pill(year === y.year, y.loaded)}
            >
              {y.year}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-0">
        {/* map */}
        <div className="min-w-0">
          {shell ? (
            <div className="relative" style={MAP_BOX}>
              <PrecinctMap
                key={`${shell.abbr}-${darkMode ? "dark" : "light"}`}
                shell={shell}
                year={year}
                office={shown}
                darkMode={darkMode}
                results={cached?.results ?? null}
                index={cached?.index ?? null}
                selectedPid={selectedPid}
                onSelect={setSelectedPid}
                onMoved={setMoved}
                resetNonce={resetNonce}
                target={target?.abbr === shell.abbr ? target : null}
              />
              <div className="absolute right-2 top-2 z-10 flex gap-1.5">
                {moved && (
                  <button onClick={() => setResetNonce((n) => n + 1)} className="rounded-lg px-2.5 py-1 text-xs font-semibold backdrop-blur-sm" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                    Reset view
                  </button>
                )}
                <button id="precinct-all-states" onClick={() => openState(null)} className="rounded-lg px-2.5 py-1 text-xs font-semibold backdrop-blur-sm" style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                  ← All states
                </button>
              </div>
            </div>
          ) : (
            <div style={MAP_BOX}><NationalMap states={states} year={year} office={shown} darkMode={darkMode} onPick={openState} /></div>
          )}
          {/* legend, as on the Historical map */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 md:gap-x-4">
            {RATING_SCALE.map((r) => (
              <div key={r.label} className="flex items-center gap-1 md:gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full md:h-2.5 md:w-2.5" style={{ background: r.color }} />
                <span className="whitespace-nowrap text-[9px] font-medium md:text-[10px]" style={{ color: "var(--app-text-muted)" }}>{r.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1 md:gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full md:h-2.5 md:w-2.5" style={{ background: darkMode ? "#39424f" : "#c9ced6" }} />
              <span className="whitespace-nowrap text-[9px] font-medium md:text-[10px]" style={{ color: "var(--app-text-muted)" }}>No contest or uncounted</span>
            </div>
          </div>
        </div>

        {/* panel */}
        {/* Sidebar: hangs off the map behind a hairline rule rather than standing as its own section. */}
        <aside ref={asideRef} className="min-w-0 border-t pt-4 lg:ml-5 lg:max-h-[max(400px,min(72vh,680px))] lg:overflow-y-auto lg:overscroll-contain lg:border-l lg:border-t-0 lg:pl-5 lg:pr-2 lg:pt-0" style={{ scrollbarWidth: "thin", borderColor: "var(--app-border)" }}>
          {shell && i >= 0 && cached?.results ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={KICKER} style={{ color: "var(--app-text-primary)", overflowWrap: "anywhere" }}>{selName || `Precinct ${selectedPid}`}</div>
                  <div className="mt-px text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>{selCounty ? `${selCounty}, ` : ""}{shell.name}</div>
                </div>
                <button onClick={() => setSelectedPid(null)} aria-label="Close precinct details" className="-my-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[22px] leading-none hover:bg-[var(--app-tab-bg)]" style={{ color: "var(--app-text-muted)" }}>×</button>
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <div className="tabular-nums" title={selOneParty?.long} style={{ ...SERIF_FIGURE, fontSize: 30, color: marginColor(selMargin), opacity: selOneParty ? ONE_PARTY_OPACITY : undefined }}>{selMargin === null ? "—" : fmtMargin(selMargin)}</div>
                  <div className={`mt-0.5 ${LABEL}`} style={{ color: "var(--app-text-muted)" }}>{OFFICE_LABEL[shown]} · {year}</div>
                </div>
                {selRow && selMargin !== null && (
                  <div className="text-right">
                    <div className="text-[13px] font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{(selRow[0] + selRow[1] + selRow[2]).toLocaleString()}</div>
                    <div className={LABEL} style={{ color: "var(--app-text-muted)" }}>Votes</div>
                  </div>
                )}
              </div>

              <div className="mt-5"><SectionHead>Every race here, {year}</SectionHead></div>
              <table className="w-full tabular-nums" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className={LABEL} style={{ color: "var(--app-text-muted)" }}>
                    <th className="py-1.5 text-left font-semibold">Office</th>
                    <th className="py-1.5 text-right font-semibold">Dem</th>
                    <th className="py-1.5 text-right font-semibold">Rep</th>
                    <th className="py-1.5 text-right font-semibold">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {OFFICES.map((o) => {
                    const row = cached.results!.offices[o]?.[i];
                    if (!row) return null;
                    const m = marginOf(row);
                    const district = cached.results!.districts[o]?.[i];
                    const one = m === null ? null : onePartyRace(shell, cached.results, o, i, year, onePartyData);
                    return (
                      <tr key={o} onClick={() => setOffice(o)} className="cursor-pointer" style={{ borderTop: "1px solid var(--app-border)", background: o === shown ? "var(--app-tab-bg)" : undefined }}>
                        <td className="py-1.5 pr-2 text-[13px]" style={{ color: "var(--app-text-primary)" }}>
                          <span className="font-semibold">{OFFICE_LABEL[o]}</span>
                          {district && (() => {
                            const href = districtHref(shell.abbr, o, district, year);
                            const label = district.replace(/^0+(?=\d)/, "");
                            return href ? (
                              <Link prefetch={false} href={href} onClick={(e) => e.stopPropagation()} title={`Go to ${OFFICE_LABEL[o]} district ${label}`} className="ml-1.5 text-[11px] underline decoration-dotted underline-offset-2 hover:decoration-solid" style={{ color: "var(--app-text-muted)" }}>{label}</Link>
                            ) : (
                              <span className="ml-1.5 text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>{label}</span>
                            );
                          })()}
                        </td>
                        <td className="py-1.5 pl-1 text-right text-xs" style={{ color: "var(--party-dem)" }}>{m === null ? "" : row[0].toLocaleString()}</td>
                        <td className="py-1.5 pl-2 text-right text-xs" style={{ color: "var(--party-rep)" }}>{m === null ? "" : row[1].toLocaleString()}</td>
                        <td className="py-1.5 pl-2 text-right text-[13px] font-bold" title={one?.long} style={{ color: marginColor(m), whiteSpace: "nowrap" }}>
                          {m === null ? <span className="text-[11px] font-normal" style={{ color: "var(--app-text-very-muted)" }}>no contest</span> : <span style={{ opacity: one ? ONE_PARTY_OPACITY : undefined }}>{fmtMargin(m)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {(() => {
                const loc = locales.get(shell.abbr);
                const k = loc ? loc.cls[i] : -1;
                if (!loc || k < 0) return null;
                const dens = loc.dens[i];
                const dist = loc.dist[i] / 10;
                const where = k <= 1
                  ? `${dens.toLocaleString()} homes per sq mi where its residents live, inside a metro area`
                  : `${dist < 1 ? "Under 1" : Math.round(dist)} mi from the edge of a metro area`;
                return (
                  <div id="precinct-locale">
                    <div className="mt-6"><SectionHead>Area type</SectionHead></div>
                    <div className="mt-2 flex items-baseline justify-between gap-3">
                      <div className="text-[20px]" style={{ ...SERIF_FIGURE, color: "var(--app-text-primary)" }}>{loc.labels[k]}</div>
                      <div className="flex gap-1">
                        {loc.labels.map((l, n) => (
                          <span key={l} title={l} className="h-1.5 w-6" style={{ background: n === k ? "var(--app-text-primary)" : "var(--app-border)" }} />
                        ))}
                      </div>
                    </div>
                    <div className="mt-1 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{where}</div>
                  </div>
                );
              })()}
              {trend.length > 1 && (
                <div id="precinct-trend">
                  <div className="mt-6"><SectionHead>Trend</SectionHead></div>
                  <div className="mt-2"><PrecinctTrend points={trend} year={year} onPick={setYear} /></div>
                </div>
              )}
              {turnout.length > 1 && (
                <div id="precinct-turnout">
                  <div className="mt-6"><SectionHead>Turnout</SectionHead></div>
                  <div className="mt-2">
                    <PrecinctTurnout points={turnout} year={year} onPick={setYear}
                      adults={demographics.get(shell.abbr)?.cols.vap[i] ?? null} />
                  </div>
                </div>
              )}
              {stats && (
                <div id="precinct-stats">
                  <div className="mt-6"><SectionHead>Analysis</SectionHead></div>
                  <div className="tabular-nums">
                    {[
                      { label: "Best R performance", value: fmtMargin(stats.bestR.margin), color: marginColor(stats.bestR.margin), sub: `${stats.bestR.year} ${OFFICE_LABEL[stats.bestR.office]}`, pick: () => { setYear(stats.bestR.year); setOffice(stats.bestR.office); } },
                      { label: "Best D performance", value: fmtMargin(stats.bestD.margin), color: marginColor(stats.bestD.margin), sub: `${stats.bestD.year} ${OFFICE_LABEL[stats.bestD.office]}`, pick: () => { setYear(stats.bestD.year); setOffice(stats.bestD.office); } },
                      stats.spread
                        ? { label: `Ticket split, ${year}`, value: `${stats.spread.pts.toFixed(1)}%`, color: "var(--app-text-primary)", sub: `R ${stats.spread.hi.rShare.toFixed(1)}% ${OFFICE_LABEL[stats.spread.hi.office]} vs ${stats.spread.lo.rShare.toFixed(1)}% ${OFFICE_LABEL[stats.spread.lo.office]}`, pick: undefined }
                        : { label: `Ticket split, ${year}`, value: "—", color: "var(--app-text-very-muted)", sub: "Fewer than two contested races", pick: undefined },
                    ].map((r) => (
                      <div key={r.label} className="flex items-baseline justify-between gap-3 py-2" style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold" style={{ color: "var(--app-text-primary)" }}>{r.label}</div>
                          <div className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>{r.sub}</div>
                        </div>
                        {r.pick ? (
                          <button onClick={r.pick} title="Put this race on the map" className="shrink-0 text-[15px] font-bold hover:underline" style={{ color: r.color }}>{r.value}</button>
                        ) : (
                          <span className="shrink-0 text-[15px] font-bold" style={{ color: r.color }}>{r.value}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
                    Contested races only. Ticket split is the gap between the year&rsquo;s highest and lowest Republican share of the vote:
                    at least that share of voters backed a Republican in one race and not in another.
                  </p>
                </div>
              )}
              {stateYears.length > 1 && (() => {
                let anyEst = false;
                let anyOne = false;
                const body = stateYears.map((y) => {
                  const res = data.get(`${y}|${shell.abbr}`);
                  return (
                    <tr key={y} style={{ borderTop: "1px solid var(--app-border)" }}>
                      <td className="py-2 pr-2 text-left text-[12.5px] font-semibold" style={{ color: "var(--app-text-primary)" }}>
                        <button onClick={() => setYear(y)} className="hover:underline" style={{ fontWeight: y === year ? 800 : 600 }}>{y}</button>
                      </td>
                      {historyOffices.map((o) => {
                        const row = res?.offices[o]?.[i];
                        const m = marginOf(row);
                        const est = m !== null && (res?.est?.[o]?.[i] ?? 0) > EST_FLAG;
                        if (est) anyEst = true;
                        const one = m === null ? null : onePartyRace(shell, res, o, i, y, onePartyData);
                        if (one) anyOne = true;
                        const on = y === year && o === shown;
                        return (
                          <td key={o} className="py-2 pl-2 text-right text-[11px] font-semibold" style={{ whiteSpace: "nowrap", background: on ? "var(--app-tab-bg)" : undefined }}>
                            {m === null || !row ? (
                              <span style={{ color: "var(--app-text-very-muted)", fontWeight: 400 }}>{res === undefined ? "" : "–"}</span>
                            ) : (
                              <button
                                onClick={() => { setYear(y); setOffice(o); }}
                                title={`${OFFICE_LABEL[o]} ${y}: Democrat ${row[0].toLocaleString()}, Republican ${row[1].toLocaleString()}, other ${row[2].toLocaleString()}${est ? ". Estimate: divided from different lines or a larger area." : ""}${one ? `. ${one.long}` : ""}`}
                                className="hover:underline"
                                style={{ color: marginColor(m), fontStyle: est ? "italic" : undefined, opacity: one ? ONE_PARTY_OPACITY : undefined }}
                              >
                                {fmtMargin(m)}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                });
                return (
                  <div id="precinct-history">
                    <div className="mt-6"><SectionHead>Past results here</SectionHead></div>
                    <div className="overflow-x-auto">
                      <table className="w-full tabular-nums" style={{ borderCollapse: "collapse" }}>
                        <thead>
                          <tr className={LABEL} style={{ color: "var(--app-text-muted)" }}>
                            <th className="pb-2 pt-1.5 text-left align-bottom font-semibold">Year</th>
                            {historyOffices.map((o) => (
                              <th key={o} className="pb-2 pt-1.5 pl-2 text-right align-bottom font-semibold" style={{ lineHeight: 1.25, color: o === shown ? "var(--app-text-primary)" : undefined }}>
                                {OFFICE_SHORT[o][0]}{OFFICE_SHORT[o][1] && <><br />{OFFICE_SHORT[o][1]}</>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>{body}</tbody>
                      </table>
                    </div>
                    <p className="mt-3 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
                      {historyLoading ? "Loading earlier years… " : ""}
                      Every year is shown on this precinct&rsquo;s 2024 lines. Click a margin to put that race on the map.
                      {anyOne ? " A faded margin had no candidate from one of the two parties." : ""}
                      {anyEst ? " A margin in italics is an estimate: that year’s votes were counted on different lines or for a larger area, and were divided among precincts." : ""}
                    </p>
                  </div>
                );
              })()}
              {(() => {
                const demo = demographics.get(shell.abbr);
                if (demo === null) return null; // no census file for this state
                return (
                  <div id="precinct-demographics">
                    <div className="mt-6"><SectionHead>Who lives here</SectionHead></div>
                    {demo ? <PrecinctDemographics demo={demo} i={i} /> : <p className="mt-3 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>Loading census figures…</p>}
                  </div>
                );
              })()}
              <Link prefetch={false} href={`/states/${shell.abbr.toLowerCase()}`} className="mt-4 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>Go to {shell.name} →</Link>
            </div>
          ) : shell ? (
            <div>
              <div className={KICKER} style={{ color: "var(--app-text-primary)" }}>{shell.name}</div>
              <div className="mt-px text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>{shell.n.toLocaleString()} precincts</div>
              <div className="mt-2 tabular-nums" style={{ ...SERIF_FIGURE, fontSize: 30, color: marginColor(stateMargin) }}>{stateMargin === null ? "—" : fmtMargin(stateMargin)}</div>
              <div className={`mt-0.5 ${LABEL}`} style={{ color: "var(--app-text-muted)" }}>Statewide · {OFFICE_LABEL[shown]} · {year}</div>
              {stateSum?.note && <p className="mt-3 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>{stateSum.note}</p>}
              <p className="mt-3 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>Hover a precinct for its result. Click one for every race on its ballot.</p>
              <Link prefetch={false} href={`/states/${shell.abbr.toLowerCase()}`} className="mt-2 inline-block text-xs font-semibold hover:underline" style={{ color: "var(--app-text-primary)" }}>Go to {shell.name} →</Link>
              {stateTrends.get(shell.abbr) && <div className="mt-6"><NationalTrends data={stateTrends.get(shell.abbr)!} /></div>}
            </div>
          ) : (
            <div>
              <div className={KICKER} style={{ color: "var(--app-text-primary)" }}>Pick a state</div>
              <p className="mt-2 text-[11.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
                Click a state on the map, or choose one above, to see its precincts. The map shows each state&rsquo;s
                statewide {OFFICE_LABEL[shown].toLowerCase()} result for {year}.
              </p>
              <div className="mt-6"><NationalTrends data={national} /></div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
