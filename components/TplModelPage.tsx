"use client";

import { useState, useMemo } from "react";
import {
  presPastResults,
  senateData,
  senateHoldovers,
  senateNoElection,
  governorData,
  governorNoElection,
  houseData,
  stateLegData,
} from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import {
  TPL_GLOBAL_CONSTANTS as G,
  STATE_MODEL_CONSTANTS,
  STATE_RACE_INPUTS,
  type RaceModelInputs,
} from "@/data/tplModelData";

// ── Race stub type (input to computation) ───────────────────────────────────

interface RaceStub {
  race: string;
  district?: string;
  raceType: "P" | "S" | "G" | "H" | "L";
  year: number;
  incumbent: string;
  IF: number;
  CQFMatchup: string;
  CQF: number;
}

// ── Dynamic race list generation ────────────────────────────────────────────

function generateRaceList(stateAbbr: string, stateName: string): RaceStub[] {
  const modelInputs: RaceModelInputs[] = STATE_RACE_INPUTS[stateAbbr] ?? [];
  const stubs: RaceStub[] = [];

  function overlay(race: string, year: number) {
    return modelInputs.find((i) => i.race === race && i.year === year);
  }

  function makeStub(
    race: string,
    raceType: RaceStub["raceType"],
    year: number,
    district?: string
  ): RaceStub {
    const inp = overlay(race, year);
    return {
      race,
      district,
      raceType,
      year,
      incumbent: inp?.incumbent ?? "—",
      IF: inp?.IF ?? 1.00,
      CQFMatchup: inp?.CQFMatchup ?? "—",
      CQF: inp?.CQF ?? 1.00,
    };
  }

  // President (2017+)
  for (const r of presPastResults[stateAbbr] ?? []) {
    if (r.year >= 2017) stubs.push(makeStub("President", "P", r.year));
  }

  // Senate — all seats for this state (multiple seats OK — distinguished by year)
  const allSenate = [
    ...senateData.filter((d) => d.id === stateAbbr || d.id.startsWith(stateAbbr + "-")),
    ...senateHoldovers.filter((d) => d.abbr === stateAbbr),
    ...senateNoElection.filter((d) => d.abbr === stateAbbr),
  ];
  for (const seat of allSenate) {
    for (const r of seat.pastResults ?? []) {
      if (r.year >= 2017) stubs.push(makeStub("Senate", "S", r.year));
    }
  }

  // Governor (2017+ — catches NJ/VA odd-year elections)
  const allGov = [
    ...governorData.filter((d) => d.id === stateAbbr),
    ...governorNoElection.filter((d) => d.abbr === stateAbbr),
  ];
  for (const seat of allGov) {
    for (const r of seat.pastResults ?? []) {
      if (r.year >= 2017) stubs.push(makeStub("Governor", "G", r.year));
    }
  }

  // House — each district, each election year (2017+)
  for (const dist of houseData.filter((r) => r.state === stateName)) {
    for (const r of dist.pastResults ?? []) {
      if (r.year >= 2017) {
        stubs.push(makeStub(`House ${dist.name}`, "H", r.year, dist.name));
      }
    }
  }

  // State Legislature — 2 most recent years with two-party vote data
  const legEntries = stateLegData[stateName] ?? [];
  const legYears = [
    ...new Set(
      legEntries
        .filter((e) => e.demVotes != null && e.repVotes != null)
        .map((e) => e.year)
    ),
  ]
    .sort((a, b) => b - a)
    .slice(0, 2)
    .reverse();

  for (const year of legYears) {
    stubs.push(makeStub("State Legislature", "L", year));
  }

  // Sort: year asc, then race name asc
  return stubs.sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.race.localeCompare(b.race)
  );
}

// ── Raw margin lookup (D-positive: positive = D wins) ──────────────────────

function getRawMargin(
  race: string,
  district: string | undefined,
  year: number,
  stateAbbr: string,
  stateName: string
): number | null {
  if (race === "President") {
    const e = (presPastResults[stateAbbr] ?? []).find((r) => r.year === year);
    return e != null ? e.demPct - e.repPct : null;
  }

  if (race === "Senate") {
    const all = [
      ...senateData.filter((d) => d.id === stateAbbr || d.id.startsWith(stateAbbr + "-")),
      ...senateHoldovers.filter((d) => d.abbr === stateAbbr),
      ...senateNoElection.filter((d) => d.abbr === stateAbbr),
    ];
    for (const seat of all) {
      const e = (seat.pastResults ?? []).find((r) => r.year === year);
      if (e != null) return e.demPct - e.repPct;
    }
    return null;
  }

  if (race === "Governor") {
    const all = [
      ...governorData.filter((d) => d.id === stateAbbr),
      ...governorNoElection.filter((d) => d.abbr === stateAbbr),
    ];
    for (const seat of all) {
      const e = (seat.pastResults ?? []).find((r) => r.year === year);
      if (e != null) return e.demPct - e.repPct;
    }
    return null;
  }

  if (district) {
    const dist = houseData.find((r) => r.name === district);
    const e = (dist?.pastResults ?? []).find((r) => r.year === year);
    return e != null ? e.demPct - e.repPct : null;
  }

  if (race === "State Legislature") {
    const entries = (stateLegData[stateName] ?? []).filter((e) => e.year === year);
    let dem = 0, rep = 0;
    for (const e of entries) {
      if (e.demVotes != null && e.repVotes != null) {
        dem += e.demVotes;
        rep += e.repVotes;
      }
    }
    const total = dem + rep;
    return total > 0 ? ((dem - rep) / total) * 100 : null;
  }

  return null;
}

// ── WF formula: 1/(1+NES×SWSC×k×sign), bounded [0.6, 1.6] ─────────────────

function computeWF(
  rawMargin: number,
  NES: number,
  SWSC: number,
  k: number
): { wf: number; capped: boolean } {
  if (rawMargin === 0) return { wf: 1.0, capped: false };
  const sign = rawMargin > 0 ? 1 : -1;
  const unclamped = 1 / (1 + NES * SWSC * k * sign);
  const clamped = Math.max(0.6, Math.min(1.6, unclamped));
  return { wf: clamped, capped: Math.abs(unclamped - clamped) > 0.0001 };
}

// ── Display helpers ─────────────────────────────────────────────────────────

function fmtMargin(v: number | null): string {
  if (v === null) return "—";
  if (Math.abs(v) < 0.005) return "EVEN";
  return `${v > 0 ? "D" : "R"}+${Math.abs(v).toFixed(2)}`;
}

function marginColor(v: number | null): string {
  if (v === null || Math.abs(v) < 0.005) return "var(--app-text-primary)";
  return v > 0 ? "var(--party-dem)" : "var(--party-rep)";
}

function marginBg(v: number | null): string {
  if (v === null || Math.abs(v) < 0.005) return "transparent";
  return v > 0 ? "var(--party-dem-subtle)" : "var(--party-rep-subtle)";
}

// ── Glossary ────────────────────────────────────────────────────────────────

const GLOSSARY = [
  { abbr: "TPL", term: "True Partisan Lean", desc: "A state's neutral structural partisan lean, centered against the median of all 50 states." },
  { abbr: "Pre-TPL", term: "Pre-True Partisan Lean", desc: "TPL before the final centering step. Requires the full 50-state dataset to complete." },
  { abbr: "ARM", term: "Adjusted Race Margin", desc: "Raw margin after all adjustments: Raw × IF × CQF × WF (× FF × CF × SIPF × PIF × ENF, all currently 1.00)." },
  { abbr: "WRS", term: "Weighted Race Score", desc: "One year's TPL signal: the weighted average of ARMs across all race types present that cycle." },
  { abbr: "PGSHL", term: "Race Type Codes", desc: "P = President, G = Governor, S = U.S. Senate, H = U.S. House, L = State Legislature." },
  { abbr: "IF", term: "Incumbency Factor", desc: "Discounts margin attributable to incumbency advantage. Open seats = 1.00. Losing incumbents treated as 1.00." },
  { abbr: "CQF", term: "Candidate Quality Factor", desc: "<1.0 when the winning party had the quality advantage; >1.0 when the winner overcame a quality disadvantage." },
  { abbr: "WF", term: "Wave Factor", desc: "Strips the national environment: 1/(1+NES×SWSC×k×sign). Bounded [0.6, 1.6]. Requires state SWSC — defaults to 1.00 if unknown." },
  { abbr: "FF/CF/SIPF/PIF/ENF", term: "Placeholder Factors", desc: "All currently 1.00. Will be calibrated with real data in a future pass." },
  { abbr: "NES", term: "National Environment Score", desc: "National partisan lean per cycle. Blended President+House popular vote (presidential years) or House alone (midterms). Positive = D-favored." },
  { abbr: "SWSC", term: "State Wave Sensitivity Coefficient", desc: "How much a state amplifies or dampens national swings. Derived from historical House vote regression. Iowa = 1.43." },
  { abbr: "k", term: "Wave Scaling Constant", desc: "Scaling factor inside WF formula. Currently 0.05 — placeholder pending calibration." },
];

const RACE_TYPE_LABELS: Record<string, string> = {
  P: "President", S: "Senate", G: "Governor", H: "House", L: "State Leg",
};

// ── Computed race type ───────────────────────────────────────────────────────

interface ComputedRace extends RaceStub {
  rawMargin: number | null;
  WF: number;
  WFCapped: boolean;
  ARM: number | null;
  inAggregation: boolean; // false for odd-year races not in YEAR_WEIGHTS
}

interface YearAggregation {
  year: number;
  racesPresent: string[];
  redistributedWeights: Record<string, number>;
  houseAvgARM: number | null;
  WRS: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TplModelPage() {
  const [selectedAbbr, setSelectedAbbr] = useState("IA");
  const [raceFilter, setRaceFilter] = useState<string>("All");
  const [yearFilter, setYearFilter] = useState<string>("All");
  const [showGlossary, setShowGlossary] = useState(false);

  // Derive full state name from abbreviation
  const selectedStateName = useMemo(
    () => statesData.find((s) => s.abbr === selectedAbbr)?.name ?? selectedAbbr,
    [selectedAbbr]
  );

  const SWSC = STATE_MODEL_CONSTANTS[selectedAbbr]?.SWSC ?? null;
  const hasSWSC = SWSC != null;

  // Generate race stubs, then compute ARM for each
  const allRaces = useMemo<ComputedRace[]>(() => {
    const stubs = generateRaceList(selectedAbbr, selectedStateName);
    return stubs.map((stub) => {
      const rawMargin = getRawMargin(
        stub.race,
        stub.district,
        stub.year,
        selectedAbbr,
        selectedStateName
      );
      const NES = G.NES_BY_YEAR[stub.year] ?? null;
      const inAggregation = stub.year in G.YEAR_WEIGHTS;

      let wf = 1.0, capped = false;
      if (rawMargin != null && hasSWSC && NES != null) {
        ({ wf, capped } = computeWF(rawMargin, NES, SWSC!, G.k));
      }

      const ARM = rawMargin != null ? rawMargin * stub.IF * stub.CQF * wf : null;

      return { ...stub, rawMargin, WF: wf, WFCapped: capped, ARM, inAggregation };
    });
  }, [selectedAbbr, selectedStateName, SWSC, hasSWSC]);

  // Year aggregation (only for years in YEAR_WEIGHTS)
  const yearAggregations = useMemo<YearAggregation[]>(() => {
    return G.YEARS.map((year) => {
      const yearRaces = allRaces.filter((r) => r.year === year && r.ARM != null);
      const presentTypes = [...new Set(yearRaces.map((r) => r.raceType))];

      const houseRaces = yearRaces.filter((r) => r.raceType === "H");
      const houseAvgARM =
        houseRaces.length > 0
          ? houseRaces.reduce((s, r) => s + (r.ARM ?? 0), 0) / houseRaces.length
          : null;

      const totalBase = presentTypes.reduce(
        (s, t) => s + (G.RACE_TYPE_WEIGHTS[t] ?? 0),
        0
      );
      const redistributedWeights: Record<string, number> = {};
      for (const t of presentTypes) {
        redistributedWeights[t] = (G.RACE_TYPE_WEIGHTS[t] ?? 0) / totalBase;
      }

      let WRS = 0;
      for (const type of presentTypes) {
        const w = redistributedWeights[type];
        if (type === "H") {
          WRS += w * (houseAvgARM ?? 0);
        } else {
          const r = yearRaces.find((r) => r.raceType === type);
          WRS += w * (r?.ARM ?? 0);
        }
      }

      return { year, racesPresent: presentTypes, redistributedWeights, houseAvgARM, WRS };
    });
  }, [allRaces]);

  // Pre-TPL
  const preTpl = useMemo(
    () =>
      yearAggregations.reduce(
        (sum, a) => sum + (G.YEAR_WEIGHTS[a.year] ?? 0) * a.WRS,
        0
      ),
    [yearAggregations]
  );

  // Available years for the year filter pill
  const availableYears = useMemo(
    () => [...new Set(allRaces.map((r) => r.year))].sort(),
    [allRaces]
  );

  // Filtered races for the per-race table
  const filteredRaces = useMemo(
    () =>
      allRaces.filter((r) => {
        if (raceFilter !== "All" && r.raceType !== raceFilter) return false;
        if (yearFilter !== "All" && r.year !== Number(yearFilter)) return false;
        return true;
      }),
    [allRaces, raceFilter, yearFilter]
  );

  const anyWFCapped = filteredRaces.some((r) => r.WFCapped);
  const hasOddYears = allRaces.some((r) => !r.inAggregation);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mt-4 md:mt-5">
      {/* ── State selector ── */}
      <div
        className="mb-5 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl px-4 py-4"
        style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
      >
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--app-text-very-muted)" }}>
            State
          </div>
          <select
            value={selectedAbbr}
            onChange={(e) => {
              setSelectedAbbr(e.target.value);
              setRaceFilter("All");
              setYearFilter("All");
            }}
            className="rounded-lg px-3 py-2 text-sm font-semibold cursor-pointer"
            style={{
              background: "var(--app-bg)",
              border: "1px solid var(--app-border)",
              color: "var(--app-text-primary)",
              minWidth: 200,
            }}
          >
            {[...statesData].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
              <option key={s.abbr} value={s.abbr}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="sm:ml-4 flex flex-wrap gap-x-6 gap-y-1.5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-very-muted)" }}>SWSC</div>
            <div className="text-sm font-bold font-mono" style={{ color: hasSWSC ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
              {hasSWSC ? SWSC : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-very-muted)" }}>WF Active</div>
            <div className="text-sm font-bold" style={{ color: hasSWSC ? "var(--party-dem)" : "var(--app-text-very-muted)" }}>
              {hasSWSC ? "Yes" : "No (defaults 1.00)"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-very-muted)" }}>Model Inputs</div>
            <div className="text-sm font-bold" style={{ color: (STATE_RACE_INPUTS[selectedAbbr]?.length ?? 0) > 0 ? "var(--party-dem)" : "var(--app-text-very-muted)" }}>
              {STATE_RACE_INPUTS[selectedAbbr]?.length
                ? `${STATE_RACE_INPUTS[selectedAbbr].length} races`
                : "All defaults (1.00)"}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-very-muted)" }}>Races Loaded</div>
            <div className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{allRaces.length}</div>
          </div>
          {!hasSWSC && (
            <div className="self-end text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              Add this state's SWSC to <code className="font-mono text-[11px]">tplModelData.ts</code> to enable WF.
            </div>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="mb-5">
        <h2 className="text-xl font-bold sm:text-2xl" style={{ color: "var(--app-text-primary)" }}>
          True Partisan Lean (TPL) — {selectedStateName}
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--app-text-muted)" }}>
          Raw election data 2017–2024 · IF/CQF/WF{!hasSWSC && " all"} defaulted to 1.00{hasSWSC ? " where not yet calibrated" : " (no SWSC set for this state)"}
        </p>
      </div>

      {/* Glossary (collapsible) */}
      <div className="mb-5 rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-left transition-opacity hover:opacity-80"
          style={{ background: "var(--app-panel)" }}
          onClick={() => setShowGlossary((g) => !g)}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
            Abbreviations &amp; Factor Glossary
          </span>
          <span className="text-xs font-mono" style={{ color: "var(--app-text-muted)" }}>
            {showGlossary ? "▲ hide" : "▼ show"}
          </span>
        </button>
        {showGlossary && (
          <div style={{ borderTop: "1px solid var(--app-border)" }}>
            {GLOSSARY.map((item, i) => (
              <div
                key={item.abbr}
                className="px-4 py-2.5"
                style={{
                  background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                  borderBottom: i < GLOSSARY.length - 1 ? "1px solid var(--app-border)" : undefined,
                }}
              >
                <span className="font-mono text-xs font-bold" style={{ color: "var(--app-text-primary)" }}>
                  {item.abbr}
                </span>
                <span className="text-xs mx-1.5" style={{ color: "var(--app-text-very-muted)" }}>—</span>
                <span className="text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
                  {item.term}
                </span>
                <span className="text-xs mx-1.5" style={{ color: "var(--app-text-very-muted)" }}>·</span>
                <span className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                  {item.desc}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Step 1: Per-race table ── */}
      <div className="mb-7">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          Step 1 — Per-Race Calculations
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
          ARM = Raw Margin × IF × CQF × WF. All factors default to 1.00 unless model inputs have been entered for this state.{" "}
          {!hasSWSC && <span style={{ color: "var(--app-text-very-muted)" }}>WF = 1.00 (no SWSC). </span>}
          Raw margins are live from the site's data.
        </p>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>Race</span>
            {["All", "P", "S", "G", "H", "L"].map((f) => (
              <button
                key={f}
                onClick={() => setRaceFilter(f)}
                className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: raceFilter === f ? "var(--app-tab-bg)" : "transparent",
                  color: raceFilter === f ? "var(--app-text-primary)" : "var(--app-text-muted)",
                  border: "1px solid var(--app-border)",
                  boxShadow: raceFilter === f ? "inset 0 0 0 1px var(--app-border)" : "none",
                }}
              >
                {f === "All" ? "All" : `${f} · ${RACE_TYPE_LABELS[f]}`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>Year</span>
            <button
              onClick={() => setYearFilter("All")}
              className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
              style={{
                background: yearFilter === "All" ? "var(--app-tab-bg)" : "transparent",
                color: yearFilter === "All" ? "var(--app-text-primary)" : "var(--app-text-muted)",
                border: "1px solid var(--app-border)",
                boxShadow: yearFilter === "All" ? "inset 0 0 0 1px var(--app-border)" : "none",
              }}
            >
              All
            </button>
            {availableYears.map((y) => (
              <button
                key={y}
                onClick={() => setYearFilter(String(y))}
                className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: yearFilter === String(y) ? "var(--app-tab-bg)" : "transparent",
                  color: yearFilter === String(y) ? "var(--app-text-primary)" : "var(--app-text-muted)",
                  border: "1px solid var(--app-border)",
                  boxShadow: yearFilter === String(y) ? "inset 0 0 0 1px var(--app-border)" : "none",
                  opacity: G.YEARS.includes(y) ? 1 : 0.6,
                }}
                title={!G.YEARS.includes(y) ? "Odd-year race — not included in Pre-TPL aggregation" : undefined}
              >
                {y}{!G.YEARS.includes(y) ? "*" : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Per-race table */}
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-xs">
              <thead>
                <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                  {[
                    ["Race", "Race type and name"],
                    ["Year", "Election year. * = odd-year race, not yet included in Pre-TPL aggregation"],
                    ["Raw Margin ↗", "Two-party margin (D% − R%). Positive = D wins. Live from site data."],
                    ["Incumbent", "Incumbent or open-seat note. — = not yet entered for this state"],
                    ["IF ↗", "Incumbency Factor. 1.00 = no adjustment (default or open seat)"],
                    ["CQF Matchup ↗", "Candidate quality tier matchup. — = not yet entered"],
                    ["CQF ↗", "Candidate Quality Factor. 1.00 = no adjustment (default)"],
                    ["WF ↗", "Wave Factor. 1.00 if SWSC not set for this state. † = value was capped at [0.6, 1.6]"],
                    ["ARM ↗", "Adjusted Race Margin = Raw × IF × CQF × WF"],
                  ].map(([label, tip], ci) => (
                    <th
                      key={label}
                      title={tip}
                      className={`px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap ${ci >= 2 && ci !== 3 && ci !== 5 ? "text-right" : "text-left"}`}
                      style={{ color: ci === 8 ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRaces.map((r, i) => (
                  <tr
                    key={i}
                    style={{
                      background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                      borderBottom: "1px solid var(--app-border)",
                      opacity: r.inAggregation ? 1 : 0.75,
                    }}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono"
                          style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
                        >
                          {r.raceType}
                        </span>
                        <span className="font-semibold">{r.race}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                      {r.year}{!r.inAggregation ? <span style={{ color: "var(--app-text-very-muted)" }}>*</span> : ""}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: marginColor(r.rawMargin) }}>
                      {fmtMargin(r.rawMargin)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>
                      {r.incumbent}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-mono" style={{ color: "var(--app-text-primary)" }}>
                      {r.IF.toFixed(3)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                      {r.CQFMatchup}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-mono" style={{ color: "var(--app-text-primary)" }}>
                      {r.CQF.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-mono" style={{ color: "var(--app-text-primary)" }}>
                      {r.WF.toFixed(3)}{r.WFCapped && <span style={{ color: "var(--app-text-very-muted)" }}>†</span>}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right tabular-nums font-bold"
                      style={{ color: marginColor(r.ARM), background: marginBg(r.ARM) }}
                    >
                      {fmtMargin(r.ARM)}
                    </td>
                  </tr>
                ))}
                {filteredRaces.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                      No races match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 flex flex-wrap gap-x-5 text-[10px]" style={{ borderTop: "1px solid var(--app-border)", background: "var(--app-panel)", color: "var(--app-text-very-muted)" }}>
            {anyWFCapped && <span>† WF was capped at the [0.6, 1.6] bound.</span>}
            {hasOddYears && <span>* Odd-year race (NJ/VA governor elections). Shown in table but not yet included in Pre-TPL aggregation.</span>}
            {!hasSWSC && <span>WF = 1.00 for all races (no SWSC on record for {selectedStateName}).</span>}
          </div>
        </div>

        {/* NES strip */}
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
          {G.YEARS.map((year) => {
            const nes = G.NES_BY_YEAR[year] ?? 0;
            return (
              <span key={year} className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                {year} NES:{" "}
                <span className="font-semibold" style={{ color: nes >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
                  {nes >= 0 ? "D" : "R"}+{Math.abs(nes)}
                </span>
              </span>
            );
          })}
          {hasSWSC && (
            <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
              {selectedStateName} SWSC: <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>{SWSC}</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Step 2: Year aggregation ── */}
      <div className="mb-7">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          Step 2 — Year-Level Aggregation
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
          House districts averaged into one state-level signal per year.
          Race type weights redistributed among types present.
          <strong style={{ color: "var(--app-text-primary)" }}> WRS</strong> = weighted average of ARMs.
        </p>

        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[580px] text-xs">
              <thead>
                <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                  {[
                    ["Year", "left"],
                    ["Races Present", "left"],
                    ["Redistributed Weights", "left"],
                    ["House Avg ARM", "right"],
                    ["WRS", "right"],
                  ].map(([label, align]) => (
                    <th
                      key={label}
                      className={`px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap text-${align}`}
                      style={{ color: label === "WRS" ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yearAggregations.map((agg, i) => (
                  <tr
                    key={agg.year}
                    style={{
                      background: i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                  >
                    <td className="px-4 py-3 font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                      {agg.year}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--app-text-muted)" }}>
                      {agg.racesPresent.length > 0
                        ? agg.racesPresent.map((t) => RACE_TYPE_LABELS[t] ?? t).join(", ")
                        : <span style={{ color: "var(--app-text-very-muted)" }}>No data</span>}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono" style={{ color: "var(--app-text-muted)" }}>
                      {agg.racesPresent.length > 0
                        ? agg.racesPresent
                            .map((t) => `${t}=${((agg.redistributedWeights[t] ?? 0) * 100).toFixed(1)}%`)
                            .join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: marginColor(agg.houseAvgARM) }}>
                      {agg.houseAvgARM != null ? fmtMargin(agg.houseAvgARM) : "—"}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums font-bold"
                      style={{ color: marginColor(agg.WRS || null), background: marginBg(agg.WRS || null) }}
                    >
                      {agg.racesPresent.length > 0 ? fmtMargin(agg.WRS) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
          {G.YEARS.map((year) => (
            <span key={year} className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
              {year} weight: <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>
                {((G.YEAR_WEIGHTS[year] ?? 0) * 100).toFixed(0)}%
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Step 3: Pre-TPL card ── */}
      <div className="mb-7">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          Step 3 — Final Calculation
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
          Pre-TPL = recency-weighted average of annual WRS scores.
        </p>

        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}>
          {/* Formula */}
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--app-text-very-muted)" }}>Formula</p>
            <div className="rounded-lg px-4 py-3 font-mono text-xs leading-relaxed" style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}>
              <div style={{ color: "var(--app-text-muted)" }}>Pre-TPL =</div>
              {yearAggregations.filter((a) => a.racesPresent.length > 0).map((agg, i) => {
                const w = G.YEAR_WEIGHTS[agg.year] ?? 0;
                return (
                  <div key={agg.year} className="ml-4">
                    <span style={{ color: "var(--app-text-very-muted)" }}>{i === 0 ? "  " : "+ "}</span>
                    <span style={{ color: "var(--app-text-primary)" }}>{w.toFixed(2)}</span>
                    <span style={{ color: "var(--app-text-very-muted)" }}> × </span>
                    <span style={{ color: agg.WRS >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}>
                      {agg.WRS >= 0 ? "D" : "R"}+{Math.abs(agg.WRS).toFixed(2)}
                    </span>
                    <span style={{ color: "var(--app-text-very-muted)" }}> ({agg.year})</span>
                  </div>
                );
              })}
              {yearAggregations.every((a) => a.racesPresent.length === 0) && (
                <div style={{ color: "var(--app-text-very-muted)" }} className="ml-4">No data available for this state</div>
              )}
            </div>
          </div>

          {/* Result */}
          <div className="flex flex-col sm:flex-row gap-0">
            <div
              className="flex flex-col items-center justify-center py-8 px-6 sm:w-56 sm:shrink-0"
              style={{
                borderRight: "1px solid var(--app-border)",
                background: preTpl >= 0 ? "var(--party-dem-subtle)" : "var(--party-rep-subtle)",
              }}
            >
              <div
                className="text-[10px] font-bold uppercase tracking-widest mb-2"
                style={{ color: preTpl >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}
              >
                {selectedStateName} Pre-TPL
              </div>
              <div
                className="text-5xl font-bold tabular-nums leading-none"
                style={{ color: preTpl >= 0 ? "var(--party-dem)" : "var(--party-rep)" }}
              >
                {Math.abs(preTpl) < 0.05
                  ? "EVEN"
                  : `${preTpl >= 0 ? "D" : "R"}+${Math.abs(preTpl).toFixed(1)}`}
              </div>
              <div className="text-xs mt-2" style={{ color: "var(--app-text-muted)" }}>
                {!hasSWSC && <span style={{ color: "var(--app-text-very-muted)" }}>No WF · </span>}
                Pre-centering
              </div>
            </div>

            <div className="flex-1 px-5 py-5 flex flex-col gap-3 text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
              <div>
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>Why "Pre-TPL"? </span>
                Final TPL = Pre-TPL minus the median Pre-TPL across all 50 states. This centering step
                requires the full 50-state dataset and has not yet been computed.
              </div>
              {!hasSWSC && (
                <div style={{ color: "var(--app-text-very-muted)" }}>
                  <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>WF not active: </span>
                  No SWSC on record for {selectedStateName}. WF = 1.00 for all races, so ARM = Raw × IF × CQF.
                  Add <code className="font-mono">"{selectedAbbr}": {"{ SWSC: X.XX }"}</code> to{" "}
                  <code className="font-mono">STATE_MODEL_CONSTANTS</code> in{" "}
                  <code className="font-mono">tplModelData.ts</code> to enable it.
                </div>
              )}
              {STATE_RACE_INPUTS[selectedAbbr] == null && (
                <div style={{ color: "var(--app-text-very-muted)" }}>
                  <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>All factors = 1.00: </span>
                  No per-race model inputs entered for this state yet. Pre-TPL shown is a{" "}
                  raw-margin weighted average — useful as a baseline but not a calibrated TPL estimate.
                </div>
              )}
              <div>
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>Placeholder factors: </span>
                FF, CF, SIPF, PIF, ENF are all 1.00 for every state. ARM recalculates automatically
                as inputs are filled in.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
