"use client";

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { getRaceColor } from "@/lib/colorScale";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { useDarkMode } from "@/lib/useDarkMode";
import { NationalLandMask, NationalLandMaskDefinition } from "./StateLandMask";
import {
  houseData,
  houseDistrictInfo,
} from "@/data/forecastData";
import { statesData } from "@/data/statesData";
import {
  TPL_GLOBAL_CONSTANTS as G,
  STATE_MODEL_CONSTANTS,
  STATE_RACE_INPUTS,
  STATE_S_CALCULATIONS,
  type CQTier,
} from "@/data/tplModelData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import {
  calculateStateModel,
  calculateDistrictModel,
  type RaceStub,
  type ComputedRace,
  type YearAggregation,
  type StateModelCalculation,
  type DistrictComputedRace,
  type DistrictModelCalculation,
} from "@/lib/tplCompute";

// ── District lookup: state abbreviation → sorted list of districts ───────────

const DISTRICTS_BY_STATE: Record<string, { id: string; code: string; num: number }[]> = {};
for (const [id, d] of Object.entries(districtPresidentialData)) {
  if (!DISTRICTS_BY_STATE[d.state]) DISTRICTS_BY_STATE[d.state] = [];
  DISTRICTS_BY_STATE[d.state].push({ id, code: d.code, num: parseInt(d.code.split("-")[1]) });
}
for (const arr of Object.values(DISTRICTS_BY_STATE)) arr.sort((a, b) => a.num - b.num);

// ── Display helpers ─────────────────────────────────────────────────────────

function fmtMargin(v: number | null): string {
  if (v === null) return "—";
  if (Math.abs(v) < 0.005) return "EVEN";
  return `${v > 0 ? "R" : "D"}+${Math.abs(v).toFixed(2)}`;
}

function marginColor(v: number | null): string {
  if (v === null || Math.abs(v) < 0.005) return "var(--app-text-primary)";
  return v > 0 ? "var(--party-rep)" : "var(--party-dem)";
}

function marginBg(v: number | null): string {
  if (v === null || Math.abs(v) < 0.005) return "transparent";
  return v > 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)";
}

// ── Glossary ────────────────────────────────────────────────────────────────

const GLOSSARY = [
  { abbr: "CF", term: "Candidate Factor", desc: "Combined point contribution of IF and CQ. Non-P: Adjusted × (IF × CQ − 1) — multiplicative. P: Adjusted × (IF−1) + cappedAdj × (CQ−1) — additive." },
  { abbr: "Centered TPL", term: "Centered True Partisan Lean", desc: "TPL minus the 50-state median TPL. Shows how a state compares to the typical state, with systematic model bias removed." },
  { abbr: "CQ", term: "Candidate Quality Factor", desc: "<1.0 when the winning party had the quality advantage; >1.0 when the winner overcame a quality disadvantage. CQ = WQ × LQ." },
  { abbr: "FF", term: "Fundraising Factor", desc: "Adjusts margin based on fundraising advantage. 1.00 = no adjustment. Pending calibration." },
  { abbr: "IF", term: "Incumbency Factor", desc: "Multiplier capturing seat-level incumbent effects (G/S/H/L races) or presidential approval (P races). For P races: IF = 1 + presMargin × k_pif × partySign. Open non-P seats = 1.00." },
  { abbr: "k", term: "Wave Scaling Constants", desc: "k_add = 0.35 (additive component), k_mult = 0.05 (multiplicative component). Both placeholders pending calibration." },
  { abbr: "NES", term: "National Environment Score", desc: "National partisan lean per cycle. Blended President+House popular vote (presidential years) or House alone (midterms). Positive = R-favored." },
  { abbr: "NM", term: "Neutralized Margin", desc: "Adjusted Margin × (IF × CQ) + FF pts + WA. IF encodes incumbency (G/S/H/L) or presidential approval (P); all compound into CF." },
  { abbr: "PGSHL", term: "Race Type Codes", desc: "P = President, G = Governor, S = U.S. Senate, H = U.S. House, L = State Legislature." },
  { abbr: "S", term: "State Wave Sensitivity Coefficient", desc: "How much a state amplifies or dampens national swings, calculated from cycle-over-cycle state and national House-margin swing ratios." },
  { abbr: "TPL", term: "True Partisan Lean", desc: "The state's neutral partisan composition — what a Generic R vs Generic D race with no wave would produce. Recency-weighted average of WRS scores." },
  { abbr: "WA", term: "Wave Adjustment", desc: "Hybrid point shift: 70% additive (NES × S × k_add) + 30% multiplicative (base × (1−WF)) converted to points. Positive = D wave stripped (adds to R margin). Negative = R wave stripped (reduces R margin)." },
  { abbr: "WRS", term: "Weighted Race Score", desc: "One year's TPL signal: the weighted average of NMs across all race types present that cycle." },
];

const RACE_TYPE_LABELS: Record<string, string> = {
  P: "President", S: "Senate", G: "Governor", H: "House", L: "State Leg",
};

// ── Formula panels ───────────────────────────────────────────────────────────

const FORMULA_PANELS: Record<string, { title: string; rows: { label: string; formula: string; note?: string }[] }> = {
  "Adjusted ↗": {
    title: "Adjusted Margin (AM)",
    rows: [
      { label: "Step 1", formula: "|Raw| < 50  →  Adjusted = Raw" },
      { label: "Step 2", formula: "|Raw| ≥ 50  →  Adjusted = 0.6 × Prior Contested + 0.4 × Prior Presidential" },
      { label: "Prior Contested", formula: "Most recent result with |margin| < 50 in a year strictly before the race year" },
      { label: "Prior Presidential", formula: "District presidential result in the most recent year ≤ race year" },
      { label: "H races: boundary filter", formula: "Both priors restricted to years ≥ minValidYear (most recent redistricting year ≤ race year)", note: "Prevents old-boundary results from bleeding into a redrawn district's adjustment." },
      { label: "One prior missing", formula: "Available prior fills both weights (effectively 100% weight on the available source)" },
      { label: "Both priors missing (§)", formula: "Adjusted = Raw × 0.8  — no valid boundary-vintage data exists" },
      { label: "Cap", formula: "|Adjusted| > |Raw|  →  Adjusted = Raw" },
    ],
  },
  "IF ↗": {
    title: "Incumbency Factor (IF)",
    rows: [
      { label: "Shown as", formula: "Multiplier — compounds with CQ into Candidate Factor (CF)" },
      { label: "G / S / H / L — incumbent won", formula: "Open seat = 1.00 · H = 0.80 · S/Leg = 0.875 · G = 0.835" },
      { label: "G / S / H / L — challenger won", formula: "H = 1.25 · S/Leg = 1.14 · G = 1.20" },
      { label: "P — formula", formula: "IF = 1 + presMargin × k_pif × partySign   (k_pif = 0.005, placeholder)", note: "presMargin = approval − disapproval on election day. partySign: D president = +1, R president = −1." },
      { label: "P — examples", formula: "2024: D incumbent, presMargin = −15.2  →  IF = 0.924     2020: R incumbent, presMargin = −6.6  →  IF = 1.033" },
      { label: "Interpretation", formula: "< 1.00 = advantage discounted from margin. > 1.00 = signal inflated (challenger upset or approval drag)." },
    ],
  },
  "CQ ↗": {
    title: "Candidate Quality Factor (CQ = WQ × LQ)",
    rows: [
      { label: "Shown as", formula: "Multiplier — compounds with IF into Candidate Factor" },
      { label: "WQ — Winning Candidate Quality", formula: "Elite=0.75 · Strong=0.88 · Generic=1.00 · Weak=1.12 · Sacrificial=1.25" },
      { label: "LQ — Losing Candidate Quality", formula: "Elite=1.25 · Strong=1.12 · Generic=1.00 · Weak=0.88 · Sacrificial=0.75" },
      { label: "Default", formula: "Generic / Generic  →  CQ = 1.00" },
      { label: "Example (Elite winner vs Sacrificial loser)", formula: "0.75 × 0.75 = 0.5625" },
      { label: "Example (Weak winner vs Strong loser)", formula: "1.12 × 1.12 = 1.2544" },
    ],
  },
  "CF ↗": {
    title: "Candidate Factor (CF)",
    rows: [
      { label: "G / S / H / L formula", formula: "CF = Adjusted × (IF × CQ − 1)   [multiplicative: incumbent IS the candidate]" },
      { label: "P formula", formula: "CF = Adjusted × (IF − 1) + cappedAdj × (CQ − 1)   [additive; CQ capped at ±15 pts margin]", note: "CQ is capped because structural blowouts are driven by partisan lean, not candidate quality." },
      { label: "Default (open seat, Generic/Generic)", formula: "IF=1.00, CQ=1.00  →  CF = 0 pts" },
      { label: "Example: R incumbent won, Elite/Generic (non-P)", formula: "IF=0.80, CQ=0.75  →  0.80×0.75−1 = −0.40  →  CF = Adj × −0.40" },
      { label: "Example: P 2024 (Strong/Weak, D pres. approval −15.2)", formula: "IF=0.924, CQ=0.66  →  CF = Adj×(−0.076) + Adj×(−0.34)  →  CF = Adj × −0.416" },
    ],
  },
  "District CQ ↗": {
    title: "District Candidate Quality Factor (CQ = WQ × LQ)",
    rows: [
      { label: "Formula", formula: "CQ = WQ × LQ" },
      { label: "WQ — Winning Candidate Quality", formula: "Elite=0.75 · Strong=0.88 · Generic=1.00 · Weak=1.12 · Sacrificial=1.25" },
      { label: "LQ — Losing Candidate Quality", formula: "Elite=1.25 · Strong=1.12 · Generic=1.00 · Weak=0.88 · Sacrificial=0.75" },
      { label: "Default", formula: "Generic / Generic  →  CQ = 1.00  →  CQ term in CF = 0" },
      { label: "2024 (Strong/Weak)", formula: "WQ=0.88 × LQ=0.75 = 0.66" },
    ],
  },
  "District NM ↗": {
    title: "District Neutralized Margin (NM)",
    rows: [
      { label: "Formula", formula: "NM = Raw + CF" },
      { label: "Expanded", formula: "NM = Raw + Raw×(IF−1) + cappedRaw×(CQ−1)" },
      { label: "No WA", formula: "Wave adjustment is omitted — three-cycle presidential averaging dampens wave effects" },
      { label: "No FF", formula: "Fundraising factor is omitted — no per-district campaign finance data" },
      { label: "Purpose", formula: "What the presidential result would look like with generic candidates and neutral presidential approval" },
    ],
  },
  "District IF ↗": {
    title: "District Incumbency Factor (IF) — Presidential Approval",
    rows: [
      { label: "Formula", formula: "IF = 1 + presMargin × k_pif × partySign" },
      { label: "presMargin", formula: "Incumbent president's net approval (approval − disapproval) on election day" },
      { label: "partySign", formula: "+1 if D incumbent president · −1 if R incumbent president" },
      { label: "k_pif", formula: "0.005  (scaling constant, pending calibration)" },
      { label: "2016 (Obama D, presMargin = +7.8)", formula: "IF = 1 + 7.8 × 0.005 × (+1) = 1.039" },
      { label: "2020 (Trump R, presMargin = −6.6)", formula: "IF = 1 + (−6.6) × 0.005 × (−1) = 1.033" },
      { label: "2024 (Biden D, presMargin = −15.2)", formula: "IF = 1 + (−15.2) × 0.005 × (+1) = 0.924" },
    ],
  },
  "District CF ↗": {
    title: "District Candidate Factor (CF)",
    rows: [
      { label: "Formula", formula: "CF = Raw × (IF − 1) + cappedRaw × (CQ − 1)" },
      { label: "cappedRaw", formula: "sign(Raw) × min(|Raw|, 15)" },
      { label: "Default (Generic/Generic)", formula: "CQ = 1.00  →  CF = Raw × (IF − 1)" },
      { label: "Example: 2024 (IF=0.924, CQ=0.66, Raw=R+13)", formula: "13×(−0.076) + 13×(−0.34) = −0.99 + −4.42 = −5.41" },
      { label: "Example: 2024 blowout (Raw=R+22, cap=15)", formula: "22×(−0.076) + 15×(−0.34) = −1.67 + −5.10 = −6.77" },
    ],
  },
  "FF ↗": {
    title: "Fundraising Factor (FF)",
    rows: [
      { label: "Formula", formula: "FF pts = Adjusted × (FF − 1)" },
      { label: "Default", formula: "FF = 1.00  →  0 pts  (not yet calibrated)" },
      { label: "Interpretation", formula: "Positive FF = fundraising advantage amplifies signal. Negative = disadvantage suppresses it.", note: "FF values pending calibration from campaign finance data." },
    ],
  },
  "WA ↗": {
    title: "Wave Adjustment (WA)",
    rows: [
      { label: "Additive component (70%)", formula: "WA_add = NES × S × k_add   (k_add = 0.35)" },
      { label: "Multiplicative WF", formula: "WF = 1 / (1 + NES × S × k_mult × sign(Adj Margin))   (k_mult = 0.05, bounded [0.6, 1.6])" },
      { label: "Multiplicative component (30%)", formula: "WA_mult = Adjusted Margin × (1 − WF)" },
      { label: "Blended WA", formula: "WA = −(0.70 × WA_add + 0.30 × WA_mult)" },
      { label: "NES values", formula: "2018: D+7.1 · 2020: D+2.3 · 2022: R+4.2 · 2024: R+3.5" },
      { label: "Sign convention", formula: "Positive WA = D wave stripped (adds to R margin). Negative WA = R wave stripped (reduces R margin).", note: "WA = 0 for states without S on record." },
    ],
  },
  "NM ↗": {
    title: "Neutralized Margin (NM)",
    rows: [
      { label: "G/S/H/L formula", formula: "NM = Adjusted × (IF × CQ) + FF pts + WA" },
      { label: "P formula", formula: "NM = Adjusted + CF + FF pts + WA   where CF = Adjusted×(IF−1) + cappedAdj×(CQ−1)" },
      { label: "Both views", formula: "NM = Adjusted + CF + FF pts + WA" },
      { label: "Note", formula: "For P races, IF (presidential approval) and CQ (candidate quality) are independent effects — they add into CF rather than compound. For all other races they multiply." },
      { label: "Purpose", formula: "NM is the stripped partisan signal: what the race result would look like without incumbency, candidate quality, or national wave effects." },
    ],
  },
};

// ── TPL State Map ────────────────────────────────────────────────────────────

const STATES_GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

type TplMapRow = { abbr: string; name: string; tpl: number };

function TplStateMap({ rows, onSelect }: { rows: TplMapRow[]; onSelect: (abbr: string) => void }) {
  const isDark = useDarkMode();
  const mapUnfilled   = isDark ? "#1e2530" : "#c8cdd3";
  const mapStroke     = isDark ? "#0d1117" : "#f6f8fa";
  const hoverStroke   = isDark ? "#ffffff" : "#000000";
  const hoverUnfilled = isDark ? "#2a3441" : "#dde2e7";

  const [hovered, setHovered]   = useState<TplMapRow | null>(null);
  const [selected, setSelected] = useState<TplMapRow | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize]   = useState({ w: 0, h: 0 });
  const [mapKey, setMapKey]     = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const touchStartRef  = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickRef = useRef(0);

  const rowByName = Object.fromEntries(rows.map((r) => [r.name, r]));

  return (
    <>
    <div
      className="relative w-full rounded-xl overflow-hidden h-[320px] sm:h-[400px] md:h-[520px]"
      style={{ border: "1px solid var(--app-border)" }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMapSize({ w: rect.width, h: rect.height });
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
    >
      {/* Hover tooltip — hidden when a panel is open */}
      {hovered && !selected && (() => {
        const tipW = 152, tipH = 48, offset = 14, pad = 8;
        let left = mousePos.x + offset;
        let top  = mousePos.y + offset;
        const cW = mapSize.w || 800, cH = mapSize.h || 520;
        if (left + tipW + pad > cW) left = mousePos.x - tipW - offset;
        if (top  + tipH + pad > cH) top  = mousePos.y - tipH - offset;
        if (left < pad) left = pad;
        if (top  < pad) top  = pad;
        return (
          <div
            className="absolute z-20 pointer-events-none rounded-lg hidden md:block"
            style={{ left, top, width: tipW, padding: "7px 10px", background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}
          >
            <div className="font-bold text-xs mb-0.5" style={{ color: "var(--app-text-primary)" }}>{hovered.name}</div>
            <div className="text-[10px] font-semibold" style={{ color: marginColor(hovered.tpl) }}>TPL: {fmtMargin(hovered.tpl)}</div>
          </div>
        );
      })()}

      <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1200 }} style={{ width: "100%", height: "100%" }}>
        <ZoomableGroup key={mapKey} filterZoomEvent={filterMapZoomEvent} onMoveEnd={() => setViewChanged(true)}>
          <Geographies geography={STATES_GEO_URL}>
            {({ geographies }: { geographies: { rsmKey: string; properties?: Record<string, string | undefined> }[] }) =>
              geographies.map((geo) => {
                const row = rowByName[geo.properties?.name ?? ""];
                const isSelected = selected?.abbr === row?.abbr;
                const fill = row ? getRaceColor(row.tpl) : mapUnfilled;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => row && setHovered(row)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => {
                      if (Date.now() < ignoreClickRef.current) return;
                      if (row) setSelected(isSelected ? null : row);
                    }}
                    onPointerDown={(e: React.PointerEvent) => {
                      if (e.pointerType !== "touch") { touchStartRef.current = null; return; }
                      touchStartRef.current = { x: e.clientX, y: e.clientY };
                    }}
                    onPointerUp={(e: React.PointerEvent) => {
                      if (e.pointerType !== "touch") return;
                      const start = touchStartRef.current;
                      touchStartRef.current = null;
                      if (!row || !start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return;
                      ignoreClickRef.current = Date.now() + 500;
                      setSelected(isSelected ? null : row);
                    }}
                    style={{
                      default: { fill, stroke: isSelected ? hoverStroke : mapStroke, strokeWidth: isSelected ? 3.5 : 1, outline: "none" },
                      hover:   { fill: row ? fill : hoverUnfilled, stroke: hoverStroke, strokeWidth: 1.5, outline: "none", cursor: row ? "pointer" : "default" },
                      pressed: { fill, stroke: hoverStroke, strokeWidth: 3.5, outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {viewChanged && (
        <button
          onClick={() => { setMapKey((k) => k + 1); setViewChanged(false); }}
          className="absolute z-10 bottom-3 left-3 rounded-lg px-2.5 py-1 text-xs font-medium"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
        >
          Reset
        </button>
      )}

      {/* Selected state panel — desktop only, bottom-right */}
      {selected && (
        <div
          className="absolute z-30 hidden md:flex flex-col overflow-hidden rounded-xl"
          style={{ right: "1.25rem", bottom: 12, width: 172, background: isDark ? "rgba(22,27,34,0.95)" : "rgba(255,255,255,0.95)", border: "1px solid var(--app-border)", boxShadow: "0 10px 28px rgba(0,0,0,0.22)" }}
        >
          <div className="shrink-0 p-2 pb-1.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <div className="flex items-center justify-between gap-1.5">
              <h2 className="min-w-0 flex-1 truncate text-sm font-bold leading-tight" style={{ color: "var(--app-text-primary)" }}>
                {selected.name}
              </h2>
              <button
                onClick={() => setSelected(null)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors"
                style={{ color: "var(--app-text-very-muted)", background: "var(--app-tab-bg)" }}
                aria-label="Close"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="p-2 flex flex-col gap-1.5">
            <div className="rounded-md p-2" style={{ background: "var(--app-tab-bg)" }}>
              <div className="text-[8px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--app-text-muted)" }}>TPL</div>
              <div className="text-[11px] font-bold" style={{ color: marginColor(selected.tpl) }}>{fmtMargin(selected.tpl)}</div>
            </div>
            <button
              onClick={() => onSelect(selected.abbr)}
              className="flex items-center justify-center gap-1 rounded-md py-1.5 text-[9px] font-semibold transition-colors w-full"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
            >
              View in State TPL
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Selected state panel — mobile, below map */}
    {selected && (
      <div className="md:hidden mt-2 rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}>
        <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <h2 className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{selected.name}</h2>
          <button
            onClick={() => setSelected(null)}
            className="flex h-6 w-6 items-center justify-center rounded transition-colors"
            style={{ color: "var(--app-text-very-muted)", background: "var(--app-tab-bg)" }}
            aria-label="Close"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>TPL</div>
            <div className="text-sm font-bold" style={{ color: marginColor(selected.tpl) }}>{fmtMargin(selected.tpl)}</div>
          </div>
          <button
            onClick={() => onSelect(selected.abbr)}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
          >
            View in State TPL
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    )}
    </>
  );
}

// ── TPL District Map ─────────────────────────────────────────────────────────

const DISTRICTS_GEO_URL = "/congressional-districts-2026.json";

type TplDistrictRow = { id: string; code: string; state: string; tpl: number };

type DistrictGeoFeature = {
  rsmKey: string;
  properties?: { GEOID?: string; CD119FP?: string };
};

// GeoJSON GEOID → districtPresidentialData key.
// At-large districts use "00" in GeoJSON but "01" in data, so replace before stripping leading zeros.
function geoidToDistrictKey(geoid: string): string {
  const adjusted = geoid.endsWith("00") ? geoid.slice(0, -2) + "01" : geoid;
  return String(parseInt(adjusted, 10));
}

function TplDistrictMap({
  rows,
  onSelect,
}: {
  rows: TplDistrictRow[];
  onSelect: (state: string, id: string) => void;
}) {
  const isDark = useDarkMode();
  const mapUnfilled   = isDark ? "#1e2530" : "#c8cdd3";
  const mapStroke     = isDark ? "#0d1117" : "#f6f8fa";
  const hoverStroke   = isDark ? "#ffffff" : "#000000";
  const hoverUnfilled = isDark ? "#2a3441" : "#dde2e7";

  const [hovered, setHovered]   = useState<TplDistrictRow | null>(null);
  const [selected, setSelected] = useState<TplDistrictRow | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize]   = useState({ w: 0, h: 0 });
  const [mapKey, setMapKey]     = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const touchStartRef  = useRef<{ x: number; y: number } | null>(null);
  const ignoreClickRef = useRef(0);

  const rowById = Object.fromEntries(rows.map((r) => [r.id, r]));

  return (
    <>
    <div
      className="relative w-full rounded-xl overflow-hidden h-[320px] sm:h-[400px] md:h-[520px]"
      style={{ border: "1px solid var(--app-border)" }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMapSize({ w: rect.width, h: rect.height });
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
    >
      {/* Hover tooltip — hidden when a panel is open */}
      {hovered && !selected && (() => {
        const tipW = 152, tipH = 48, offset = 14, pad = 8;
        let left = mousePos.x + offset;
        let top  = mousePos.y + offset;
        const cW = mapSize.w || 800, cH = mapSize.h || 520;
        if (left + tipW + pad > cW) left = mousePos.x - tipW - offset;
        if (top  + tipH + pad > cH) top  = mousePos.y - tipH - offset;
        if (left < pad) left = pad;
        if (top  < pad) top  = pad;
        return (
          <div
            className="absolute z-20 pointer-events-none rounded-lg hidden md:block"
            style={{ left, top, width: tipW, padding: "7px 10px", background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.25)" }}
          >
            <div className="font-bold text-xs mb-0.5" style={{ color: "var(--app-text-primary)" }}>{hovered.code}</div>
            <div className="text-[10px] font-semibold" style={{ color: marginColor(hovered.tpl) }}>TPL: {fmtMargin(hovered.tpl)}</div>
          </div>
        );
      })()}

      <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1200 }} style={{ width: "100%", height: "100%" }}>
        <NationalLandMaskDefinition />
        <ZoomableGroup key={mapKey} filterZoomEvent={filterMapZoomEvent} onMoveEnd={() => setViewChanged(true)}>
          <NationalLandMask enabled>
          <Geographies geography={DISTRICTS_GEO_URL}>
            {({ geographies }: { geographies: DistrictGeoFeature[] }) =>
              geographies.map((geo) => {
                const geoid = geo.properties?.GEOID ?? "";
                const key = geoidToDistrictKey(geoid);
                const row = rowById[key];
                const isSelected = selected?.id === row?.id;
                const fill = row ? getRaceColor(row.tpl) : mapUnfilled;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => row && setHovered(row)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => {
                      if (Date.now() < ignoreClickRef.current) return;
                      if (row) setSelected(isSelected ? null : row);
                    }}
                    onPointerDown={(e: React.PointerEvent) => {
                      if (e.pointerType !== "touch") { touchStartRef.current = null; return; }
                      touchStartRef.current = { x: e.clientX, y: e.clientY };
                    }}
                    onPointerUp={(e: React.PointerEvent) => {
                      if (e.pointerType !== "touch") return;
                      const start = touchStartRef.current;
                      touchStartRef.current = null;
                      if (!row || !start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) return;
                      ignoreClickRef.current = Date.now() + 500;
                      setSelected(isSelected ? null : row);
                    }}
                    style={{
                      default: { fill, stroke: isSelected ? hoverStroke : mapStroke, strokeWidth: isSelected ? 2 : 0.5, outline: "none" },
                      hover:   { fill: row ? fill : hoverUnfilled, stroke: hoverStroke, strokeWidth: 1, outline: "none", cursor: row ? "pointer" : "default" },
                      pressed: { fill, stroke: hoverStroke, strokeWidth: 2, outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>
          <Geographies geography={STATES_GEO_URL}>
            {({ geographies }: { geographies: DistrictGeoFeature[] }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  style={{
                    default: { fill: "none", stroke: mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" },
                    hover: { fill: "none", stroke: mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" },
                    pressed: { fill: "none", stroke: mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" },
                  }}
                />
              ))
            }
          </Geographies>
          </NationalLandMask>
        </ZoomableGroup>
      </ComposableMap>

      {viewChanged && (
        <button
          onClick={() => { setMapKey((k) => k + 1); setViewChanged(false); }}
          className="absolute z-10 bottom-3 left-3 rounded-lg px-2.5 py-1 text-xs font-medium"
          style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)", boxShadow: "0 2px 8px rgba(0,0,0,0.18)" }}
        >
          Reset
        </button>
      )}

      {/* Selected district panel — desktop only, bottom-right */}
      {selected && (
        <div
          className="absolute z-30 hidden md:flex flex-col overflow-hidden rounded-xl"
          style={{ right: "1.25rem", bottom: 12, width: 172, background: isDark ? "rgba(22,27,34,0.95)" : "rgba(255,255,255,0.95)", border: "1px solid var(--app-border)", boxShadow: "0 10px 28px rgba(0,0,0,0.22)" }}
        >
          <div className="shrink-0 p-2 pb-1.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <div className="flex items-center justify-between gap-1.5">
              <h2 className="min-w-0 flex-1 truncate text-sm font-bold leading-tight" style={{ color: "var(--app-text-primary)" }}>
                {selected.code}
              </h2>
              <button
                onClick={() => setSelected(null)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors"
                style={{ color: "var(--app-text-very-muted)", background: "var(--app-tab-bg)" }}
                aria-label="Close"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="p-2 flex flex-col gap-1.5">
            <div className="rounded-md p-2" style={{ background: "var(--app-tab-bg)" }}>
              <div className="text-[8px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--app-text-muted)" }}>District TPL</div>
              <div className="text-[11px] font-bold" style={{ color: marginColor(selected.tpl) }}>{fmtMargin(selected.tpl)}</div>
            </div>
            <button
              onClick={() => onSelect(selected.state, selected.id)}
              className="flex items-center justify-center gap-1 rounded-md py-1.5 text-[9px] font-semibold transition-colors w-full"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
            >
              View in District TPL
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>

    {/* Selected district panel — mobile, below map */}
    {selected && (
      <div className="md:hidden mt-2 rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}>
        <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: "1px solid var(--app-border)" }}>
          <h2 className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{selected.code}</h2>
          <button
            onClick={() => setSelected(null)}
            className="flex h-6 w-6 items-center justify-center rounded transition-colors"
            style={{ color: "var(--app-text-very-muted)", background: "var(--app-tab-bg)" }}
            aria-label="Close"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>District TPL</div>
            <div className="text-sm font-bold" style={{ color: marginColor(selected.tpl) }}>{fmtMargin(selected.tpl)}</div>
          </div>
          <button
            onClick={() => onSelect(selected.state, selected.id)}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
          >
            View in District TPL
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    )}
    </>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TplModelPage({ initialSubTab }: { initialSubTab?: "state" | "district" | "table" | "districtTable" }) {
  const router = useRouter();
  // Deterministic on both server and client (no `window` check) to avoid a hydration mismatch;
  // corrected to the real `modelState` URL param via useLayoutEffect below, before first paint.
  const [selectedAbbr, setSelectedAbbr] = useState<string>(statesData[0].abbr);

  useLayoutEffect(() => {
    const stateFromUrl = new URLSearchParams(window.location.search).get("modelState")?.toUpperCase();
    if (stateFromUrl && statesData.some((state) => state.abbr === stateFromUrl)) {
      // Intentional one-time sync from the URL, done before paint to avoid a hydration mismatch
      // (server has no `window` to read `modelState` from). Not a candidate for useMemo/render-time
      // derivation since `window.location` isn't available during SSR.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedAbbr(stateFromUrl);
    }
  }, []);
  const [raceFilter, setRaceFilter] = useState<string>("All");
  const [yearFilter, setYearFilter] = useState<string>("All");
  const [showGlossary, setShowGlossary] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState<string | null>(null);
  const [adjustedPopupIdx, setAdjustedPopupIdx] = useState<number | null>(null);
  const [stepOneMode, setStepOneMode] = useState<"table" | "detail">("table");
  const [stepOneSelectedIdx, setStepOneSelectedIdx] = useState(0);
  const [districtStepMode, setDistrictStepMode] = useState<"table" | "detail">("table");
  const [districtStepSelectedIdx, setDistrictStepSelectedIdx] = useState(0);
  const [allStatesSort, setAllStatesSort] = useState<"centeredTpl" | "tpl" | "absCenteredTpl" | "name">("centeredTpl");
  const [allStatesSortDir, setAllStatesSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const enforceMobileRaceDetail = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) setStepOneMode("detail");
    };

    enforceMobileRaceDetail(mobileQuery);
    mobileQuery.addEventListener("change", enforceMobileRaceDetail);
    return () => mobileQuery.removeEventListener("change", enforceMobileRaceDetail);
  }, []);

  // Sub-tab state
  const [activeSubTab, setActiveSubTab] = useState<"state" | "district" | "table" | "districtTable">(initialSubTab ?? "state");
  const [returnSubTab, setReturnSubTab] = useState<"table" | "districtTable" | null>(null);

  // District TPL state
  const initialDistrictId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("modelDistrict")
    : null;
  const validInitialDistrictId = initialDistrictId && districtPresidentialData[initialDistrictId] ? initialDistrictId : null;
  const initialDistrictStateAbbr = validInitialDistrictId
    ? districtPresidentialData[validInitialDistrictId].state
    : Object.keys(DISTRICTS_BY_STATE).sort()[0];
  const [selectedDistrictStateAbbr, setSelectedDistrictStateAbbr] = useState<string>(initialDistrictStateAbbr);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>(
    () => validInitialDistrictId ?? DISTRICTS_BY_STATE[initialDistrictStateAbbr]?.[0]?.id ?? ""
  );

  // District Table sort state
  const [allDistrictsSort, setAllDistrictsSort] = useState<"tpl" | "centeredTpl" | "absCenteredTpl" | "district">("centeredTpl");
  const [allDistrictsSortDir, setAllDistrictsSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const handlePopState = () => {
      if (!returnSubTab) return;
      setActiveSubTab(returnSubTab);
      setReturnSubTab(null);
      window.scrollTo({ top: 0, behavior: "instant" });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [returnSubTab]);

  // Derive full state name from abbreviation
  const selectedStateName = useMemo(
    () => statesData.find((s) => s.abbr === selectedAbbr)?.name ?? selectedAbbr,
    [selectedAbbr]
  );

  const S = STATE_MODEL_CONSTANTS[selectedAbbr]?.S ?? null;
  const hasS = S != null;

  const selectedCalculation = useMemo(
    () => calculateStateModel(selectedAbbr, selectedStateName),
    [selectedAbbr, selectedStateName]
  );
  const allRaces = selectedCalculation.races;
  const yearAggregations = selectedCalculation.yearAggregations;
  const tpl = selectedCalculation.tpl;

  const nationalTpl = useMemo(() => {
    const stateScores = statesData.map((state) => ({
      ...state,
      tpl: calculateStateModel(state.abbr, state.name).tpl,
    }));
    const sortedScores = stateScores.map((state) => state.tpl).sort((a, b) => a - b);
    const midpoint = sortedScores.length / 2;
    const medianTpl =
      sortedScores.length % 2 === 0
        ? (sortedScores[midpoint - 1] + sortedScores[midpoint]) / 2
        : sortedScores[Math.floor(midpoint)];

    return { stateScores, medianTpl };
  }, []);

  const centeredTpl = tpl - nationalTpl.medianTpl;

  const allStateRows = useMemo(() => {
    const rows = nationalTpl.stateScores.map((s) => ({
      abbr: s.abbr,
      name: s.name,
      tpl: s.tpl,
      centeredTpl: s.tpl - nationalTpl.medianTpl,
    }));
    return [...rows].sort((a, b) => {
      if (allStatesSort === "name") {
        return allStatesSortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const valA = allStatesSort === "absCenteredTpl" ? Math.abs(a.tpl) : allStatesSort === "centeredTpl" ? a.centeredTpl : a.tpl;
      const valB = allStatesSort === "absCenteredTpl" ? Math.abs(b.tpl) : allStatesSort === "centeredTpl" ? b.centeredTpl : b.tpl;
      return allStatesSortDir === "asc" ? valA - valB : valB - valA;
    });
  }, [nationalTpl, allStatesSort, allStatesSortDir]);

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

  // ── District TPL computed values ──────────────────────────────────────────

  const selectedDistrictCalc = useMemo(
    () => calculateDistrictModel(selectedDistrictId),
    [selectedDistrictId]
  );

  const nationalDistrictTpl = useMemo(() => {
    const districtScores = Object.entries(districtPresidentialData).map(([id, d]) => ({
      id,
      code: d.code,
      state: d.state,
      stateName: d.stateName,
      tpl: calculateDistrictModel(id).tpl,
    }));
    const sorted = [...districtScores.map((d) => d.tpl)].sort((a, b) => a - b);
    const mid = sorted.length / 2;
    const medianTpl =
      sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[Math.floor(mid)];
    return { districtScores, medianTpl };
  }, []);

  const centeredDistrictTpl = selectedDistrictCalc.tpl - nationalDistrictTpl.medianTpl;

  const selectedDistrictData = districtPresidentialData[selectedDistrictId];

  const allDistrictRows = useMemo(() => {
    const rows = nationalDistrictTpl.districtScores.map((d) => ({
      ...d,
      centeredTpl: d.tpl - nationalDistrictTpl.medianTpl,
    }));
    return [...rows].sort((a, b) => {
      if (allDistrictsSort === "district") {
        return allDistrictsSortDir === "asc" ? a.code.localeCompare(b.code) : b.code.localeCompare(a.code);
      }
      const valA = allDistrictsSort === "absCenteredTpl" ? Math.abs(a.tpl) : allDistrictsSort === "centeredTpl" ? a.centeredTpl : a.tpl;
      const valB = allDistrictsSort === "absCenteredTpl" ? Math.abs(b.tpl) : allDistrictsSort === "centeredTpl" ? b.centeredTpl : b.tpl;
      return allDistrictsSortDir === "asc" ? valA - valB : valB - valA;
    });
  }, [nationalDistrictTpl, allDistrictsSort, allDistrictsSortDir]);

  // ── Render ───────────────────────────────────────────────────────────────

  function handleDistrictSortClick(col: "tpl" | "centeredTpl" | "absCenteredTpl" | "district") {
    if (allDistrictsSort === col) {
      setAllDistrictsSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setAllDistrictsSort(col);
      setAllDistrictsSortDir(col === "absCenteredTpl" ? "desc" : "asc");
    }
  }

  function handleSortClick(col: "centeredTpl" | "tpl" | "absCenteredTpl" | "name") {
    if (allStatesSort === col) {
      setAllStatesSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setAllStatesSort(col);
      setAllStatesSortDir(col === "absCenteredTpl" ? "desc" : "asc");
    }
  }

  function handleSubTabClick(tab: "state" | "district" | "table" | "districtTable") {
    router.push(`/model/${tab}`);
    setReturnSubTab(null);
    setActiveSubTab(tab);
  }

  const SUB_TAB_LABELS = { state: "State TPL", district: "District TPL", table: "Table", districtTable: "District Table" } as const;

  function renderSubTabRow() {
    return (
      <div className="flex h-5 justify-center">
        <div className="flex items-center leading-5" style={{ gap: "14px" }}>
          {(["state", "district", "table", "districtTable"] as const).flatMap((tab, i) => {
            const isActive = activeSubTab === tab;
            const nodes = [];
            if (i > 0) {
              nodes.push(<span key={`${tab}-dot`} style={{ fontSize: "12px", color: "var(--app-border)" }}>&middot;</span>);
            }
            nodes.push(
              <button
                key={tab}
                onClick={() => handleSubTabClick(tab)}
                className="text-[13px] leading-5"
                style={{ fontWeight: isActive ? 700 : 500, color: isActive ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}
              >
                {SUB_TAB_LABELS[tab]}
              </button>
            );
            return nodes;
          })}
        </div>
      </div>
    );
  }

  function openStateTplFromTable(abbr: string) {
    window.history.pushState({ tplModelReturnSubTab: "table" }, "");
    setReturnSubTab("table");
    setSelectedAbbr(abbr);
    setActiveSubTab("state");
    setRaceFilter("All");
    setYearFilter("All");
    setStepOneMode("table");
    setStepOneSelectedIdx(0);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function openDistrictTplFromDistrictTable(state: string, id: string) {
    window.history.pushState({ tplModelReturnSubTab: "districtTable" }, "");
    setReturnSubTab("districtTable");
    setSelectedDistrictStateAbbr(state);
    setSelectedDistrictId(id);
    setActiveSubTab("district");
    setDistrictStepMode("table");
    setDistrictStepSelectedIdx(0);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function handleReturnToTable() {
    if (returnSubTab) window.history.back();
  }

  const selectedDistrictHouseHref = selectedDistrictData
    ? houseData.find((race) => race.name === selectedDistrictData.code)?.name.toLowerCase()
    : null;
  const raceTableGridColumns = "grid grid-cols-[minmax(12rem,2fr)_5rem_7rem_9rem_8rem_6rem_10rem_7rem_6rem_5rem_6rem_7rem]";

  return (
    <div>

      {/* ── State TPL ── */}
      {activeSubTab === "state" && (<>
      {/* ── Hero ── */}
      <div
        className="-mx-3 -mt-1 mb-6 sm:-mx-4 md:-mx-6"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${tpl > 0 ? "var(--party-rep)" : "var(--party-dem)"} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`,
        }}
      >
        <div className="px-3 sm:px-4 md:px-6 pt-3 pb-6">
          <div className="mb-5">{renderSubTabRow()}</div>

          {returnSubTab === "table" && (
            <button
              onClick={handleReturnToTable}
              className="mb-4 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
            >
              ← Back to Table
            </button>
          )}

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="min-w-0">
              <select
                value={selectedAbbr}
                onChange={(e) => {
                  setSelectedAbbr(e.target.value);
                  setRaceFilter("All");
                  setYearFilter("All");
                  setStepOneSelectedIdx(0);
                  setStepOneMode("table");
                }}
                className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0 cursor-pointer"
                style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "none" }}
              >
                {[...statesData].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                  <option key={s.abbr} value={s.abbr}>{s.abbr} — {s.name}</option>
                ))}
              </select>
              <h1
                className="mt-2"
                style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 3.5rem)", fontWeight: 700, lineHeight: 0.98, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
              >
                {selectedStateName}
              </h1>
              <div className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
                True Partisan Lean · raw election data 2017&ndash;2024 · IF/CQ/WA{!hasS && " all"} defaulted to 1.00{hasS ? " where not yet calibrated" : " (no S set for this state)"}
              </div>
            </div>

            <div className="shrink-0 sm:text-right">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
                True Partisan Lean
              </div>
              <div
                className="tabular-nums"
                style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 4.5vw, 3rem)", fontWeight: 700, lineHeight: 1, marginTop: "0.35rem", color: marginColor(tpl) }}
              >
                {fmtMargin(tpl)}
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
                Centered {fmtMargin(centeredTpl)} vs. 50-state median
              </div>
            </div>
          </div>

          <div className="mt-7 pt-4 flex flex-wrap gap-x-8 gap-y-4" style={{ borderTop: "1px solid var(--app-border)" }}>
            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div
                className={hasS ? "text-xl font-extrabold tabular-nums cursor-pointer underline decoration-dotted underline-offset-4" : "text-xl font-extrabold tabular-nums"}
                style={{ color: hasS ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}
                onClick={hasS ? () => setFormulaOpen("S") : undefined}
                title={hasS ? "Click to see S derivation" : undefined}
              >
                {hasS ? S : "—"}{hasS && <span className="ml-0.5 text-xs opacity-50">ⓘ</span>}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Wave Sensitivity (S)
              </div>
            </div>
            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-xl font-extrabold" style={{ color: hasS ? "var(--party-dem)" : "var(--app-text-very-muted)" }}>
                {hasS ? "Active" : "Inactive"}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Wave Adjustment
              </div>
            </div>
            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-xl font-extrabold" style={{ color: (STATE_RACE_INPUTS[selectedAbbr]?.length ?? 0) > 0 ? "var(--party-dem)" : "var(--app-text-very-muted)" }}>
                {STATE_RACE_INPUTS[selectedAbbr]?.length ? `${STATE_RACE_INPUTS[selectedAbbr].length} races` : "Defaults (1.00)"}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Model Inputs
              </div>
            </div>
            <div>
              <div className="text-xl font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{allRaces.length}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Races Loaded
              </div>
            </div>
          </div>

          {!hasS && (
            <div className="mt-3 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              Add this state&apos;s S to <code className="font-mono">tplModelData.ts</code> to enable Wave Adjustment.
            </div>
          )}
        </div>
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
        <p className="text-xs mb-3 leading-4" style={{ color: "var(--app-text-muted)" }}>
          {stepOneMode === "table" ? (
            <>
              <span className="block">NM = Adjusted Margin × (IF × CQ) + FF pts + WA. Margins of 50 points or greater are first blended from 60% prior contested result and 40% prior presidential result.</span>
              <span className="block">
                {!hasS && <span style={{ color: "var(--app-text-very-muted)" }}>WA = 0 (no S). </span>}
                Click any race to open its full calculation in Race Detail.
              </span>
            </>
          ) : (
            <>
              <span className="block">Pick a race from the list to audit its full step-by-step math.</span>
              <span className="block">Raw Margin → Candidate Factor → Wave Adjustment → Neutralized Margin.</span>
            </>
          )}
        </p>

        <div className="flex items-end gap-4 mb-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
          {(["table", "detail"] as const).map((mode) => {
            const active = stepOneMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setStepOneMode(mode)}
                className={`${mode === "table" ? "hidden md:block" : "block"} whitespace-nowrap pb-2 text-xs font-semibold transition-colors`}
                style={
                  active
                    ? { color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)", marginBottom: "-1px" }
                    : { color: "var(--app-text-muted)", borderBottom: "2px solid transparent", marginBottom: "-1px" }
                }
              >
                {mode === "table" ? "Table" : "Race Detail"}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-3 mt-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>Race</span>
            {["All", "P", "S", "G", "H", "L"].map((f) => (
              <button
                key={f}
                onClick={() => { setRaceFilter(f); setStepOneSelectedIdx(0); }}
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
              onClick={() => { setYearFilter("All"); setStepOneSelectedIdx(0); }}
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
                onClick={() => { setYearFilter(String(y)); setStepOneSelectedIdx(0); }}
                className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
                style={{
                  background: yearFilter === String(y) ? "var(--app-tab-bg)" : "transparent",
                  color: yearFilter === String(y) ? "var(--app-text-primary)" : "var(--app-text-muted)",
                  border: "1px solid var(--app-border)",
                  boxShadow: yearFilter === String(y) ? "inset 0 0 0 1px var(--app-border)" : "none",
                  opacity: G.YEARS.includes(y) ? 1 : 0.6,
                }}
                title={!G.YEARS.includes(y) ? "Odd-year race — not included in TPL aggregation" : undefined}
              >
                {y}{!G.YEARS.includes(y) ? "*" : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Per-race table */}
        {stepOneMode === "table" && (
        <div className="hidden md:block">
          <div className="h-[30rem] overflow-x-auto overflow-y-hidden">
            <table className="flex h-full w-full min-w-[95rem] flex-col text-xs">
              <thead
                className="block shrink-0"
                style={{ background: "var(--app-bg)", boxShadow: "inset 0 -2px 0 var(--app-text-primary)" }}
              >
                <tr className={raceTableGridColumns}>
                  {[
                    ["Race", "Race type and name"],
                    ["Year", "Election year. * = odd-year race, not yet included in TPL aggregation"],
                    ["Raw", "Raw Margin = repPct − demPct. Positive = R wins. Live from site data."],
                    ["Adjusted ↗", "Adjusted Margin — raw margin unless |margin| ≥ 50, then 60% prior contested + 40% prior presidential (restricted to current boundary vintage for H races). ‡ = blended. § = blanket ×0.8 (no valid prior data within current boundaries)."],
                    ["Incumbent", "Incumbent party marker or Open. State Legislature = -."],
                    ["IF ↗", "Incumbency Factor multiplier. For G/S/H/L: seat incumbency (0.80–1.25). For P: approval-based (1 + presMargin × k_pif × partySign). Compounds with CQ into CF."],
                    ["WQ / LQ", "Winning and losing candidate quality tiers. Generic/Generic = CQ of 1.00."],
                    ["CQ ↗", "Candidate Quality Factor = WQ × LQ. Compounds with IF into CF."],
                    ["CF ↗", "Candidate Factor = Adjusted Margin × (IF × CQ − 1). Combined compounded signal."],
                    ["FF ↗", "Fundraising Factor pts = AM × (FF − 1). 0 until calibrated."],
                    ["WA ↗", "Wave Adjustment = NES × S × k. Subtracted from the sum. 0 if no S."],
                    ["NM ↗", "Adjusted × (IF × CQ) + FF pts + WA."],
                  ].map(([label, tip], ci) => {
                    const isClickable = label in FORMULA_PANELS;
                    return (
                      <th
                        key={label}
                        title={isClickable ? `Click to see ${label} formula` : tip}
                        className={`px-2 py-2 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap text-left ${isClickable ? "cursor-pointer select-none" : ""}`}
                        style={{ color: ci === 11 ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                        onClick={isClickable ? () => setFormulaOpen(label) : undefined}
                      >
                        {label}{isClickable && <span className="ml-0.5 opacity-50">ⓘ</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="block min-h-0 flex-1 overflow-y-auto">
                {filteredRaces.map((r, i) => (
                  <tr
                    key={i}
                    onClick={() => { setStepOneSelectedIdx(i); setStepOneMode("detail"); }}
                    className={`${raceTableGridColumns} h-9 cursor-pointer hover:bg-[var(--app-tab-bg)] transition-colors`}
                    style={{
                      borderBottom: "1px solid var(--app-border)",
                      opacity: r.inAggregation ? 1 : 0.75,
                    }}
                  >
                    <td className="px-2 py-2 whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono"
                          style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
                        >
                          {r.raceType}
                        </span>
                        {r.detailHref ? (
                          <a
                            href={r.detailHref}
                            onClick={(e) => e.stopPropagation()}
                            className="font-semibold hover:underline"
                            style={{ color: "var(--app-text-primary)" }}
                          >
                            {r.race}
                          </a>
                        ) : (
                          <span className="font-semibold">{r.race}</span>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                      {r.year}{!r.inAggregation ? <span style={{ color: "var(--app-text-very-muted)" }}>*</span> : ""}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-semibold" style={{ color: marginColor(r.rawMargin) }}>
                      {fmtMargin(r.rawMargin)}
                    </td>
                    <td
                      className="px-2 py-2 text-left tabular-nums font-semibold"
                      style={{ color: marginColor(r.adjustedMargin) }}
                    >
                      {fmtMargin(r.adjustedMargin)}
                      {r.blanketApplied && (
                        <span className="ml-0.5" style={{ color: "var(--app-text-very-muted)" }}>§</span>
                      )}
                      {r.competitivenessAdjusted && !r.blanketApplied && (
                        <span className="ml-0.5" style={{ color: "var(--app-text-very-muted)" }}>‡</span>
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>
                      {r.raceType === "P"
                        ? "-"
                        : r.incumbent === "R" && r.rawMargin != null
                        ? r.rawMargin > 0 ? "R won" : "R lost"
                        : r.incumbent === "D" && r.rawMargin != null
                        ? r.rawMargin < 0 ? "D won" : "D lost"
                        : r.incumbent}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono" style={{ color: r.IF !== 1 ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                      {r.IF.toFixed(3)}
                    </td>
                    <td className="px-2 py-2 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                      {`${r.wqTier} / ${r.lqTier}`}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono" style={{ color: r.CQ !== 1 ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                      {r.CQ.toFixed(4)}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-semibold" style={{ color: r.candidateFactor_pts != null && r.candidateFactor_pts !== 0 ? marginColor(r.candidateFactor_pts) : "var(--app-text-very-muted)" }}>
                      {r.candidateFactor_pts != null && r.candidateFactor_pts !== 0 ? (r.candidateFactor_pts > 0 ? "+" : "") + r.candidateFactor_pts.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono" style={{ color: r.FF_pts != null && r.FF_pts !== 0 ? marginColor(r.FF_pts) : "var(--app-text-very-muted)" }}>
                      {r.FF_pts != null && r.FF_pts !== 0 ? (r.FF_pts > 0 ? "+" : "") + r.FF_pts.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono" style={{ color: "var(--app-text-muted)" }}>
                      {r.WA !== 0 ? (r.WA > 0 ? "+" : "") + r.WA.toFixed(2) : "—"}
                      {r.WFCapped && <span style={{ color: "var(--app-text-very-muted)" }}>†</span>}
                    </td>
                    <td
                      className="px-2 py-2 text-left tabular-nums font-bold"
                      style={{ color: marginColor(r.NM), background: marginBg(r.NM) }}
                    >
                      {fmtMargin(r.NM)}
                    </td>
                  </tr>
                ))}
                {filteredRaces.length === 0 && (
                  <tr className={raceTableGridColumns}>
                    <td className="col-span-full px-4 py-6 text-center text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                      No races match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="pt-2 flex flex-wrap gap-x-5 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>
            {filteredRaces.some((r) => r.competitivenessAdjusted) && (
              <span>‡ Raw margin was 50 points or greater and replaced by the 60/40 competitiveness blend.</span>
            )}
            {anyWFCapped && <span>† Multiplicative WF component was capped at the [0.6, 1.6] bound.</span>}
            {hasOddYears && <span>* Odd-year race (NJ/VA governor elections). Shown in table but not yet included in TPL aggregation.</span>}
            {!hasS && <span>WA = 0 for all races (no S on record for {selectedStateName}).</span>}
          </div>
        </div>
        )}

        {/* Race Detail */}
        {stepOneMode === "detail" && (() => {
          const idx = Math.min(stepOneSelectedIdx, Math.max(filteredRaces.length - 1, 0));
          const r = filteredRaces[idx];
          return (
            <div className="grid min-w-0 grid-cols-1 gap-6 items-start md:h-[30rem] md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
              {/* Race rail */}
              <div className="flex h-[30rem] min-w-0 flex-col overflow-hidden">
                <table className="w-full table-fixed text-xs">
                  <colgroup>
                    <col />
                    <col className="w-12" />
                    <col className="w-16" />
                  </colgroup>
                  <thead
                    className="sticky top-0 z-10"
                    style={{ background: "var(--app-bg)" }}
                  >
                    <tr>
                      <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-left" style={{ color: "var(--app-text-muted)" }}>Race</th>
                      <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>Year</th>
                      <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-right tabular-nums" style={{ color: "var(--app-text-primary)" }}>NM</th>
                    </tr>
                  </thead>
                </table>
                <div className="h-0.5 w-full shrink-0 bg-[var(--app-text-primary)]" />
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                  <table className="w-full table-fixed text-xs">
                    <colgroup>
                      <col />
                      <col className="w-12" />
                      <col className="w-16" />
                    </colgroup>
                  <tbody>
                    {filteredRaces.map((race, i) => (
                      <tr
                        key={i}
                        onClick={() => {
                          if (i === idx && window.matchMedia("(min-width: 768px)").matches) {
                            setStepOneMode("table");
                          } else {
                            setStepOneSelectedIdx(i);
                          }
                        }}
                        className="h-9 cursor-pointer hover:bg-[var(--app-tab-bg)] transition-colors"
                        style={{
                          borderBottom: "1px solid var(--app-border)",
                          background: i === idx ? "var(--app-tab-bg)" : "transparent",
                          boxShadow: i === idx ? "inset 3px 0 0 var(--app-text-primary)" : "none",
                        }}
                      >
                        <td className="min-w-0 px-2 py-2" style={{ color: "var(--app-text-primary)" }}>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
                              {race.raceType}
                            </span>
                            <span className="min-w-0 truncate font-semibold" title={race.race}>{race.race}</span>
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{race.year}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-bold" style={{ color: marginColor(race.NM) }}>{fmtMargin(race.NM)}</td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </div>

              {/* Detail panel */}
              {r ? (
                <div className="min-w-0 md:h-full md:overflow-y-auto">
                  <div className="flex flex-wrap items-end justify-between gap-4 pb-3.5" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
                        {RACE_TYPE_LABELS[r.raceType]} · {r.year} ·{" "}
                        {r.raceType === "P"
                          ? "—"
                          : r.incumbent === "R" && r.rawMargin != null
                          ? r.rawMargin > 0 ? "R won" : "R lost"
                          : r.incumbent === "D" && r.rawMargin != null
                          ? r.rawMargin < 0 ? "D won" : "D lost"
                          : r.incumbent}
                      </div>
                      <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.4rem", fontWeight: 700, marginTop: "0.25rem", color: "var(--app-text-primary)" }}>
                        {r.race}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>Neutralized Margin</div>
                      <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, color: marginColor(r.NM) }}>{fmtMargin(r.NM)}</div>
                    </div>
                  </div>

                  <table className="w-full text-xs mt-1">
                    <thead className="sticky top-0 z-10" style={{ background: "var(--app-bg)" }}>
                      <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-left" style={{ color: "var(--app-text-muted)" }}>Step</th>
                        <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-left" style={{ color: "var(--app-text-muted)" }}>Detail</th>
                        <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-right" style={{ color: "var(--app-text-muted)" }}>Factor</th>
                        <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-right" style={{ color: "var(--app-text-muted)" }}>Contribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td className="px-2 py-2 font-semibold" style={{ color: "var(--app-text-primary)" }}>Raw Margin</td>
                        <td className="px-2 py-2" style={{ color: "var(--app-text-muted)" }}>repPct − demPct, live from site data</td>
                        <td className="px-2 py-2 text-right" style={{ color: "var(--app-text-very-muted)" }}>—</td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold" style={{ color: marginColor(r.rawMargin) }}>{fmtMargin(r.rawMargin)}</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td
                          className={r.competitivenessAdjusted ? "px-2 py-2 font-semibold cursor-pointer select-none" : "px-2 py-2 font-semibold"}
                          style={{ color: "var(--app-text-primary)" }}
                          onClick={r.competitivenessAdjusted ? () => setAdjustedPopupIdx(idx) : undefined}
                        >
                          Adjusted{(r.blanketApplied || r.competitivenessAdjusted) && <span className="ml-1 opacity-50">ⓘ</span>}
                        </td>
                        <td className="px-2 py-2" style={{ color: "var(--app-text-muted)" }}>
                          {r.blanketApplied
                            ? "§ blanket ×0.8 — no valid boundary-vintage prior data"
                            : r.competitivenessAdjusted
                            ? "‡ 60% prior contested + 40% prior presidential blend"
                            : "Unchanged — below the 50-pt competitiveness threshold"}
                        </td>
                        <td className="px-2 py-2 text-right" style={{ color: "var(--app-text-very-muted)" }}>—</td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold" style={{ color: marginColor(r.adjustedMargin) }}>{fmtMargin(r.adjustedMargin)}</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td
                          className="px-2 py-2 font-semibold cursor-pointer select-none"
                          style={{ color: "var(--app-text-primary)" }}
                          onClick={() => setFormulaOpen("CF ↗")}
                        >
                          Candidate Factor<span className="ml-1 opacity-50">ⓘ</span>
                        </td>
                        <td className="px-2 py-2" style={{ color: "var(--app-text-muted)" }}>{r.wqTier} / {r.lqTier} candidate quality</td>
                        <td className="px-2 py-2 text-right tabular-nums font-mono" style={{ color: "var(--app-text-muted)" }}>
                          <span className="cursor-pointer hover:underline" onClick={() => setFormulaOpen("IF ↗")}>IF {r.IF.toFixed(3)}</span>
                          {" × "}
                          <span className="cursor-pointer hover:underline" onClick={() => setFormulaOpen("CQ ↗")}>CQ {r.CQ.toFixed(3)}</span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold" style={{ color: r.candidateFactor_pts != null && r.candidateFactor_pts !== 0 ? marginColor(r.candidateFactor_pts) : "var(--app-text-very-muted)" }}>
                          {r.candidateFactor_pts != null && r.candidateFactor_pts !== 0 ? (r.candidateFactor_pts > 0 ? "+" : "") + r.candidateFactor_pts.toFixed(2) : "—"}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td
                          className="px-2 py-2 font-semibold cursor-pointer select-none"
                          style={{ color: "var(--app-text-primary)" }}
                          onClick={() => setFormulaOpen("FF ↗")}
                        >
                          Fundraising<span className="ml-1 opacity-50">ⓘ</span>
                        </td>
                        <td className="px-2 py-2" style={{ color: "var(--app-text-muted)" }}>Not yet calibrated for this race</td>
                        <td className="px-2 py-2 text-right tabular-nums font-mono" style={{ color: "var(--app-text-muted)" }}>FF 1.00</td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold" style={{ color: r.FF_pts != null && r.FF_pts !== 0 ? marginColor(r.FF_pts) : "var(--app-text-very-muted)" }}>
                          {r.FF_pts != null && r.FF_pts !== 0 ? (r.FF_pts > 0 ? "+" : "") + r.FF_pts.toFixed(2) : "—"}
                        </td>
                      </tr>
                      <tr>
                        <td
                          className="px-2 py-2 font-semibold cursor-pointer select-none"
                          style={{ color: "var(--app-text-primary)" }}
                          onClick={() => setFormulaOpen("WA ↗")}
                        >
                          Wave Adjustment<span className="ml-1 opacity-50">ⓘ</span>
                        </td>
                        <td className="px-2 py-2" style={{ color: "var(--app-text-muted)" }}>
                          {hasS ? `S = ${S} × national environment, ${r.year}` : "No S on record — WA = 0"}
                        </td>
                        <td className="px-2 py-2 text-right" style={{ color: "var(--app-text-very-muted)" }}>—</td>
                        <td className="px-2 py-2 text-right tabular-nums font-mono" style={{ color: "var(--app-text-muted)" }}>
                          {r.WA !== 0 ? (r.WA > 0 ? "+" : "") + r.WA.toFixed(2) : "—"}
                          {r.WFCapped && <span style={{ color: "var(--app-text-very-muted)" }}>†</span>}
                        </td>
                      </tr>
                      <tr style={{ borderTop: "2px solid var(--app-text-primary)" }}>
                        <td colSpan={3} className="px-2 py-2.5 font-bold" style={{ color: "var(--app-text-primary)" }}>Neutralized Margin</td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-bold" style={{ color: marginColor(r.NM), background: marginBg(r.NM) }}>{fmtMargin(r.NM)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>No races match the selected filters.</div>
              )}
            </div>
          );
        })()}

        {stepOneMode === "detail" && (
          <div className="pt-2 flex min-h-4 flex-wrap gap-x-5 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>
            {filteredRaces.some((race) => race.competitivenessAdjusted) && (
              <span>‡ Raw margin was 50 points or greater and replaced by the 60/40 competitiveness blend.</span>
            )}
            {anyWFCapped && <span>† Multiplicative WF component was capped at the [0.6, 1.6] bound.</span>}
            {hasOddYears && <span>* Odd-year race (NJ/VA governor elections). Shown in table but not yet included in TPL aggregation.</span>}
            {!hasS && <span>WA = 0 for all races (no S on record for {selectedStateName}).</span>}
          </div>
        )}

        {/* NES strip */}
        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
          {G.YEARS.map((year) => {
            const nes = G.NES_BY_YEAR[year] ?? 0;
            return (
              <span key={year} className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                {year} NES:{" "}
                <span className="font-semibold" style={{ color: nes >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                  {nes >= 0 ? "R" : "D"}+{Math.abs(nes)}
                </span>
              </span>
            );
          })}
          {hasS && (
            <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
              {selectedStateName} S: <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>{S}</span>
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
          Each cycle&apos;s weighted race score (WRS), and the share it contributes to the final TPL.
        </p>

        {/* Year-flow strip */}
        <div className="flex flex-wrap gap-x-8 gap-y-4 mb-6" style={{ borderTop: "1px solid var(--app-border)", paddingTop: "1.1rem" }}>
          {[...G.YEARS].reverse().map((year, i, arr) => {
            const agg = yearAggregations.find((a) => a.year === year);
            const hasData = agg && agg.racesPresent.length > 0;
            const weight = (G.YEAR_WEIGHTS[year] ?? 0) * 100;
            return (
              <div key={year} className={i < arr.length - 1 ? "pr-8" : undefined} style={i < arr.length - 1 ? { borderRight: "1px solid var(--app-border)" } : undefined}>
                <div className="text-xs font-bold" style={{ color: "var(--app-text-muted)" }}>{year}</div>
                <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 700, marginTop: "0.2rem", color: hasData ? marginColor(agg!.WRS) : "var(--app-text-very-muted)" }}>
                  {hasData ? fmtMargin(agg!.WRS) : "—"}
                </div>
                <div className="h-[3px] rounded-full mt-3.5 max-w-[8rem] overflow-hidden" style={{ background: "var(--app-tab-bg)" }}>
                  <div className="h-full" style={{ width: `${weight}%`, background: "var(--app-text-very-muted)" }} />
                </div>
                <div className="text-[10px] mt-1.5" style={{ color: "var(--app-text-very-muted)" }}>{weight.toFixed(0)}% of TPL</div>
              </div>
            );
          })}
        </div>

        <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
          House districts averaged into one state-level signal per year.
          Race type weights redistributed among types present.
          <strong style={{ color: "var(--app-text-primary)" }}> WRS</strong> = weighted average of ARMs.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-xs">
            <thead>
              <tr style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                {(["Year", "President", "Governor", "Senate", "House Avg", "Leg", "WRS"] as const).map((label) => (
                  <th
                    key={label}
                    className={`px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap ${label === "Year" ? "text-left" : "text-right"}`}
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
                  style={{ borderBottom: i < yearAggregations.length - 1 ? "1px solid var(--app-border)" : undefined }}
                >
                  <td className="px-3 py-2.5 font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                    {agg.year}
                  </td>
                  {(["P", "G", "S", "H", "L"] as const).map((type) => {
                    const val = agg.typeNMs[type] ?? null;
                    const wt = agg.redistributedWeights[type];
                    return (
                      <td key={type} className="px-3 py-2 text-right tabular-nums">
                        <div className="font-semibold" style={{ color: val != null ? marginColor(val) : "var(--app-text-very-muted)" }}>
                          {val != null ? fmtMargin(val) : "—"}
                        </div>
                        {wt != null && (
                          <div className="text-[10px] font-normal" style={{ color: "var(--app-text-very-muted)" }}>
                            {(wt * 100).toFixed(1)}%
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td
                    className="px-3 py-2.5 text-right tabular-nums font-bold"
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

      {/* ── Step 3: TPL card ── */}
      <div className="mb-7">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          Step 3 — Final Calculation
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
          TPL = recency-weighted average of annual WRS scores — the state&apos;s neutral partisan composition. Centered TPL subtracts the 50-state median for cross-state comparison.
        </p>

        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}>
          {/* Formula */}
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--app-text-very-muted)" }}>Formula</p>
            <div className="rounded-lg px-4 py-3 font-mono text-xs leading-relaxed" style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}>
              <div style={{ color: "var(--app-text-muted)" }}>TPL =</div>
              {yearAggregations.filter((a) => a.racesPresent.length > 0).map((agg, i) => {
                const w = G.YEAR_WEIGHTS[agg.year] ?? 0;
                return (
                  <div key={agg.year} className="ml-4">
                    <span style={{ color: "var(--app-text-very-muted)" }}>{i === 0 ? "  " : "+ "}</span>
                    <span style={{ color: "var(--app-text-primary)" }}>{w.toFixed(2)}</span>
                    <span style={{ color: "var(--app-text-very-muted)" }}> × </span>
                    <span style={{ color: agg.WRS >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                      {agg.WRS >= 0 ? "R" : "D"}+{Math.abs(agg.WRS).toFixed(2)}
                    </span>
                    <span style={{ color: "var(--app-text-very-muted)" }}> ({agg.year})</span>
                  </div>
                );
              })}
              {yearAggregations.every((a) => a.racesPresent.length === 0) && (
                <div style={{ color: "var(--app-text-very-muted)" }} className="ml-4">No data available for this state</div>
              )}
              <div className="mt-2" style={{ color: "var(--app-text-muted)" }}>Centered TPL =</div>
              <div className="ml-4">
                <span style={{ color: marginColor(tpl) }}>{fmtMargin(tpl)}</span>
                <span style={{ color: "var(--app-text-very-muted)" }}> − median </span>
                <span style={{ color: marginColor(nationalTpl.medianTpl) }}>
                  {fmtMargin(nationalTpl.medianTpl)}
                </span>
                <span style={{ color: "var(--app-text-very-muted)" }}> = </span>
                <span style={{ color: marginColor(centeredTpl) }}>{fmtMargin(centeredTpl)}</span>
              </div>
            </div>
          </div>

          {/* Result */}
          <div className="flex flex-col sm:flex-row gap-0">
            <div className="grid grid-cols-2 sm:w-[28rem] sm:shrink-0" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div
                className="flex flex-col items-center justify-center py-8 px-4"
                style={{
                  borderRight: "1px solid var(--app-border)",
                  background: centeredTpl >= 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)",
                }}
              >
                <div
                  className="text-[10px] font-bold uppercase tracking-widest mb-2 text-center"
                  style={{ color: centeredTpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                >
                  {selectedStateName} Centered TPL
                </div>
                <div
                  className="text-4xl font-bold tabular-nums leading-none"
                  style={{ color: centeredTpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                >
                  {Math.abs(centeredTpl) < 0.05
                    ? "EVEN"
                    : `${centeredTpl >= 0 ? "R" : "D"}+${Math.abs(centeredTpl).toFixed(1)}`}
                </div>
                <div className="text-[10px] mt-2" style={{ color: "var(--app-text-muted)" }}>
                  vs. median state
                </div>
              </div>
              <div
                className="flex flex-col items-center justify-center py-8 px-4"
                style={{ background: tpl >= 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)" }}
              >
                <div
                  className="text-[10px] font-bold uppercase tracking-widest mb-2 text-center"
                  style={{ color: tpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                >
                  {selectedStateName} TPL
                </div>
                <div
                  className="text-4xl font-bold tabular-nums leading-none"
                  style={{ color: tpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}
                >
                  {Math.abs(tpl) < 0.05
                    ? "EVEN"
                    : `${tpl >= 0 ? "R" : "D"}+${Math.abs(tpl).toFixed(1)}`}
                </div>
                <div className="text-[10px] mt-2" style={{ color: "var(--app-text-muted)" }}>
                  Neutral partisan lean
                </div>
              </div>
            </div>

            <div className="flex-1 px-5 py-5 flex flex-col gap-3 text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
              <div>
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>50-state centering: </span>
                The 50-state median TPL is {fmtMargin(nationalTpl.medianTpl)}. Centered TPL subtracts this
                common baseline so the median state sits at EVEN.
              </div>
              {!hasS && (
                <div style={{ color: "var(--app-text-very-muted)" }}>
                  <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>WA not active: </span>
                  No S on record for {selectedStateName}. WA = 0 for all races, so NM = Adjusted Margin × (IF × CQ) + FF pts.
                  Add <code className="font-mono">&quot;{selectedAbbr}&quot;: {"{ S: X.XX }"}</code> to{" "}
                  <code className="font-mono">STATE_MODEL_CONSTANTS</code> in{" "}
                  <code className="font-mono">tplModelData.ts</code> to enable it.
                </div>
              )}
              {STATE_RACE_INPUTS[selectedAbbr] == null && (
                <div style={{ color: "var(--app-text-very-muted)" }}>
                  <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>All factors = 1.00: </span>
                  No per-race IF/CQ inputs have been entered for this state yet. Its TPL and Centered TPL use
                  live raw margins and WA, but remain provisional baselines rather than fully calibrated estimates.
                </div>
              )}
              <div>
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>Placeholder factors: </span>
                FF is 0 for every state. IF for presidential races is auto-computed from incumbent approval (k_pif = 0.005). NM recalculates automatically as inputs are filled in.
              </div>
            </div>
          </div>
        </div>
      </div>

      </>)}

      {/* ── District TPL ── */}
      {activeSubTab === "district" && (<>
      {/* ── Hero ── */}
      <div
        className="-mx-3 -mt-1 mb-6 sm:-mx-4 md:-mx-6"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${selectedDistrictCalc.tpl > 0 ? "var(--party-rep)" : "var(--party-dem)"} 10%, var(--app-bg)) 0%, var(--app-bg) 65%)`,
        }}
      >
        <div className="px-3 sm:px-4 md:px-6 pt-3 pb-6">
          <div className="mb-5">{renderSubTabRow()}</div>

          {returnSubTab === "districtTable" && (
            <button
              onClick={handleReturnToTable}
              className="mb-4 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}
            >
              ← Back to District Table
            </button>
          )}

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2">
                <select
                  value={selectedDistrictStateAbbr}
                  onChange={(e) => {
                    const abbr = e.target.value;
                    setSelectedDistrictStateAbbr(abbr);
                    const first = DISTRICTS_BY_STATE[abbr]?.[0]?.id ?? "";
                    setSelectedDistrictId(first);
                    setDistrictStepMode("table");
                    setDistrictStepSelectedIdx(0);
                  }}
                  className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0 cursor-pointer"
                  style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "none" }}
                >
                  {Object.keys(DISTRICTS_BY_STATE).sort().map((abbr) => {
                    const name = statesData.find((s) => s.abbr === abbr)?.name ?? abbr;
                    return <option key={abbr} value={abbr}>{name}</option>;
                  })}
                </select>
                <select
                  value={selectedDistrictId}
                  onChange={(e) => {
                    setSelectedDistrictId(e.target.value);
                    setDistrictStepMode("table");
                    setDistrictStepSelectedIdx(0);
                  }}
                  className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0 cursor-pointer"
                  style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "none" }}
                >
                  {(DISTRICTS_BY_STATE[selectedDistrictStateAbbr] ?? []).map((dist) => (
                    <option key={dist.id} value={dist.id}>{dist.code}</option>
                  ))}
                </select>
              </div>
              <h1
                className="mt-2"
                style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 5.5vw, 3.5rem)", fontWeight: 700, lineHeight: 0.98, letterSpacing: "-0.02em", color: "var(--app-text-primary)" }}
              >
                {selectedDistrictData?.code ?? "—"}
              </h1>
              <div className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>
                {selectedDistrictData?.stateName ?? selectedDistrictStateAbbr} · presidential results 2016&ndash;2024, reaggregated to 2026 boundaries
              </div>
            </div>

            <div className="shrink-0 sm:text-right">
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-muted)" }}>
                District True Partisan Lean
              </div>
              <div
                className="tabular-nums"
                style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 4.5vw, 3rem)", fontWeight: 700, lineHeight: 1, marginTop: "0.35rem", color: marginColor(selectedDistrictCalc.tpl) }}
              >
                {fmtMargin(selectedDistrictCalc.tpl)}
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
                Centered {fmtMargin(centeredDistrictTpl)} vs. 435-district median
              </div>
            </div>
          </div>

          <div className="mt-7 pt-4 flex flex-wrap gap-x-8 gap-y-4" style={{ borderTop: "1px solid var(--app-border)" }}>
            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-xl font-extrabold" style={{ color: "var(--app-text-primary)" }}>2016&ndash;2024</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Years Covered
              </div>
            </div>
            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-xl font-extrabold" style={{ color: "var(--app-text-primary)" }}>Presidential Only</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Race Types
              </div>
            </div>
            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-xl font-extrabold" style={{ color: "var(--app-text-very-muted)" }}>Not Modeled</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Wave Adjustment
              </div>
            </div>
            <div>
              <div className="text-xl font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{selectedDistrictCalc.races.length}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Races Loaded
              </div>
            </div>
          </div>

          <div className="mt-3 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
            Three-cycle presidential averaging dampens wave effects, so WA and FF are omitted from the district model.
          </div>
        </div>
      </div>

      {/* ── Step 1: Per-race table ── */}
      <div className="mb-7">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          Step 1 — Per-Race Calculations
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
          {districtStepMode === "table" ? (
            <>NM = Raw Margin + Candidate Factor. IF encodes presidential approval; CQ encodes candidate quality. Click any race to open its full calculation in Race Detail.</>
          ) : (
            <>Pick a presidential cycle to audit its full step-by-step math — Raw Margin → Candidate Factor → Neutralized Margin.</>
          )}
        </p>

        <div className="flex items-end gap-4 mb-3" style={{ borderBottom: "1px solid var(--app-border)" }}>
          {(["table", "detail"] as const).map((mode) => {
            const active = districtStepMode === mode;
            return (
              <button
                key={mode}
                onClick={() => setDistrictStepMode(mode)}
                className="whitespace-nowrap pb-2 text-xs font-semibold transition-colors"
                style={
                  active
                    ? { color: "var(--app-text-primary)", borderBottom: "2px solid var(--app-text-primary)", marginBottom: "-1px" }
                    : { color: "var(--app-text-muted)", borderBottom: "2px solid transparent", marginBottom: "-1px" }
                }
              >
                {mode === "table" ? "Table" : "Race Detail"}
              </button>
            );
          })}
        </div>

        {/* Per-race table */}
        {districtStepMode === "table" && (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                  {[
                    ["Race", "Race type and name"],
                    ["Year", "Election year"],
                    ["Raw", "Presidential two-party margin (R-positive). Reaggregated to 2026 boundaries."],
                    ["IF ↗", "Presidential approval IF = 1 + presMargin × k_pif × partySign. Click for details."],
                    ["WQ / LQ", "Winning and losing candidate quality tiers"],
                    ["CQ ↗", "Candidate Quality Factor = WQ × LQ. Click for details."],
                    ["CF ↗", "Candidate Factor = Raw×(IF−1) + cappedRaw×(CQ−1). Click for full breakdown."],
                    ["NM ↗", "Neutralized Margin = Raw + CF. Click for details."],
                  ].map(([label, tip], ci) => {
                    const panelKey = label === "CF ↗" ? "District CF ↗" : label === "IF ↗" ? "District IF ↗" : label === "CQ ↗" ? "District CQ ↗" : label === "NM ↗" ? "District NM ↗" : null;
                    return (
                    <th
                      key={label}
                      title={panelKey ? `Click to see ${label} formula` : tip}
                      className={`px-2 py-2 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap text-left ${panelKey ? "cursor-pointer select-none" : ""}`}
                      style={{ color: ci === 7 ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                      onClick={panelKey ? () => setFormulaOpen(panelKey) : undefined}
                    >
                      {label}{panelKey && <span className="ml-0.5 opacity-50">ⓘ</span>}
                    </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {selectedDistrictCalc.races.map((r, i) => (
                  <tr
                    key={r.year}
                    onClick={() => { setDistrictStepSelectedIdx(i); setDistrictStepMode("detail"); }}
                    className="cursor-pointer hover:bg-[var(--app-tab-bg)] transition-colors"
                    style={{ borderBottom: "1px solid var(--app-border)" }}
                  >
                    <td className="px-2 py-2 whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>
                      {selectedDistrictHouseHref ? (
                        <a
                          href={`/house/${selectedDistrictHouseHref}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold hover:underline"
                          style={{ color: "var(--app-text-primary)" }}
                        >
                          President
                        </a>
                      ) : (
                        <span className="font-semibold">President</span>
                      )}
                    </td>
                    <td className="px-2 py-2 tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.year}</td>
                    <td className="px-2 py-2 text-left tabular-nums font-semibold" style={{ color: marginColor(r.rawMargin) }}>
                      {fmtMargin(r.rawMargin)}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono" style={{ color: r.IF !== 1 ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                      {r.IF.toFixed(3)}
                    </td>
                    <td className="px-2 py-2 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                      {`${r.wqTier} / ${r.lqTier}`}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono" style={{ color: r.CQ !== 1 ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                      {r.CQ.toFixed(4)}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-semibold" style={{ color: r.candidateFactor_pts !== 0 ? marginColor(r.candidateFactor_pts) : "var(--app-text-very-muted)" }}>
                      {r.candidateFactor_pts !== 0 ? (r.candidateFactor_pts > 0 ? "+" : "") + r.candidateFactor_pts.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-bold" style={{ color: marginColor(r.NM), background: marginBg(r.NM) }}>
                      {fmtMargin(r.NM)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Race Detail */}
        {districtStepMode === "detail" && (() => {
          const idx = Math.min(districtStepSelectedIdx, Math.max(selectedDistrictCalc.races.length - 1, 0));
          const r = selectedDistrictCalc.races[idx];
          return (
            <div className="grid grid-cols-1 md:grid-cols-[19rem_1fr] gap-6 items-start">
              {/* Race rail */}
              <div className="overflow-x-auto max-h-[30rem] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                      <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-left" style={{ color: "var(--app-text-muted)" }}>Race</th>
                      <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>Year</th>
                      <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-right tabular-nums" style={{ color: "var(--app-text-primary)" }}>NM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDistrictCalc.races.map((race, i) => (
                      <tr
                        key={race.year}
                        onClick={() => setDistrictStepSelectedIdx(i)}
                        className="cursor-pointer hover:bg-[var(--app-tab-bg)] transition-colors"
                        style={{
                          borderBottom: "1px solid var(--app-border)",
                          background: i === idx ? "var(--app-tab-bg)" : "transparent",
                          boxShadow: i === idx ? "inset 3px 0 0 var(--app-text-primary)" : "none",
                        }}
                      >
                        <td className="px-2 py-2 whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
                              P
                            </span>
                            <span className="font-semibold">President</span>
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{race.year}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-bold" style={{ color: marginColor(race.NM) }}>{fmtMargin(race.NM)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Detail panel */}
              {r ? (
                <div>
                  <div className="flex flex-wrap items-end justify-between gap-4 pb-3.5" style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>
                        President · {r.year}
                      </div>
                      <div style={{ fontFamily: "var(--font-serif)", fontSize: "1.4rem", fontWeight: 700, marginTop: "0.25rem", color: "var(--app-text-primary)" }}>
                        {selectedDistrictData?.code ?? "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>Neutralized Margin</div>
                      <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 700, color: marginColor(r.NM) }}>{fmtMargin(r.NM)}</div>
                    </div>
                  </div>

                  <table className="w-full text-xs mt-1">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-left" style={{ color: "var(--app-text-muted)" }}>Step</th>
                        <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-left" style={{ color: "var(--app-text-muted)" }}>Detail</th>
                        <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-right" style={{ color: "var(--app-text-muted)" }}>Factor</th>
                        <th className="px-2 py-2 text-[10px] uppercase tracking-wider font-semibold text-right" style={{ color: "var(--app-text-muted)" }}>Contribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td className="px-2 py-2 font-semibold" style={{ color: "var(--app-text-primary)" }}>Raw Margin</td>
                        <td className="px-2 py-2" style={{ color: "var(--app-text-muted)" }}>Presidential two-party margin, reaggregated to 2026 boundaries</td>
                        <td className="px-2 py-2 text-right" style={{ color: "var(--app-text-very-muted)" }}>—</td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold" style={{ color: marginColor(r.rawMargin) }}>{fmtMargin(r.rawMargin)}</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td
                          className="px-2 py-2 font-semibold cursor-pointer select-none"
                          style={{ color: "var(--app-text-primary)" }}
                          onClick={() => setFormulaOpen("District CF ↗")}
                        >
                          Candidate Factor<span className="ml-1 opacity-50">ⓘ</span>
                        </td>
                        <td className="px-2 py-2" style={{ color: "var(--app-text-muted)" }}>{r.wqTier} / {r.lqTier} candidate quality</td>
                        <td className="px-2 py-2 text-right tabular-nums font-mono" style={{ color: "var(--app-text-muted)" }}>
                          <span className="cursor-pointer hover:underline" onClick={() => setFormulaOpen("District IF ↗")}>IF {r.IF.toFixed(3)}</span>
                          {" × "}
                          <span className="cursor-pointer hover:underline" onClick={() => setFormulaOpen("District CQ ↗")}>CQ {r.CQ.toFixed(3)}</span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold" style={{ color: r.candidateFactor_pts !== 0 ? marginColor(r.candidateFactor_pts) : "var(--app-text-very-muted)" }}>
                          {r.candidateFactor_pts !== 0 ? (r.candidateFactor_pts > 0 ? "+" : "") + r.candidateFactor_pts.toFixed(2) : "—"}
                        </td>
                      </tr>
                      <tr style={{ borderTop: "2px solid var(--app-text-primary)" }}>
                        <td colSpan={3} className="px-2 py-2.5 font-bold" style={{ color: "var(--app-text-primary)" }}>Neutralized Margin</td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-bold" style={{ color: marginColor(r.NM), background: marginBg(r.NM) }}>{fmtMargin(r.NM)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-xs" style={{ color: "var(--app-text-very-muted)" }}>No races available.</div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Step 2: Year aggregation ── */}
      <div className="mb-7">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          Step 2 — Year Aggregation
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
          Weighted average of presidential NMs. Year weights: 2024 = 70% · 2020 = 20% · 2016 = 10%.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-xs">
            <thead>
              <tr style={{ borderBottom: "2px solid var(--app-text-primary)" }}>
                {(["Year", "Weight", "President NM", "Weighted"] as const).map((label) => (
                  <th
                    key={label}
                    className={`px-3 py-2.5 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap ${label === "Year" ? "text-left" : "text-right"}`}
                    style={{ color: label === "Weighted" ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedDistrictCalc.races.slice().reverse().map((r, i, arr) => {
                const w = G.DISTRICT_YEAR_WEIGHTS[r.year] ?? 0;
                const weighted = w * r.NM;
                return (
                  <tr key={r.year} style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--app-border)" : undefined }}>
                    <td className="px-3 py-2.5 font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{r.year}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-mono" style={{ color: "var(--app-text-muted)" }}>{(w * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: marginColor(r.NM) }}>{fmtMargin(r.NM)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: marginColor(weighted), background: marginBg(weighted) }}>{fmtMargin(weighted)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Step 3: District TPL card ── */}
      <div className="mb-7">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          Step 3 — Final Calculation
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--app-text-muted)" }}>
          District TPL = weighted average of presidential NMs. Centered District TPL subtracts the 435-district median.
        </p>

        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}>
          {/* Formula */}
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--app-text-very-muted)" }}>Formula</p>
            <div className="rounded-lg px-4 py-3 font-mono text-xs leading-relaxed" style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}>
              <div style={{ color: "var(--app-text-muted)" }}>District TPL =</div>
              {selectedDistrictCalc.races.slice().reverse().map((r, i) => {
                const w = G.DISTRICT_YEAR_WEIGHTS[r.year] ?? 0;
                return (
                  <div key={r.year} className="ml-4">
                    <span style={{ color: "var(--app-text-very-muted)" }}>{i === 0 ? "  " : "+ "}</span>
                    <span style={{ color: "var(--app-text-primary)" }}>{w.toFixed(2)}</span>
                    <span style={{ color: "var(--app-text-very-muted)" }}> × </span>
                    <span style={{ color: r.NM >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                      {r.NM >= 0 ? "R" : "D"}+{Math.abs(r.NM).toFixed(2)}
                    </span>
                    <span style={{ color: "var(--app-text-very-muted)" }}> ({r.year})</span>
                  </div>
                );
              })}
              <div className="mt-2" style={{ color: "var(--app-text-muted)" }}>Centered District TPL =</div>
              <div className="ml-4">
                <span style={{ color: marginColor(selectedDistrictCalc.tpl) }}>{fmtMargin(selectedDistrictCalc.tpl)}</span>
                <span style={{ color: "var(--app-text-very-muted)" }}> − median </span>
                <span style={{ color: marginColor(nationalDistrictTpl.medianTpl) }}>{fmtMargin(nationalDistrictTpl.medianTpl)}</span>
                <span style={{ color: "var(--app-text-very-muted)" }}> = </span>
                <span style={{ color: marginColor(centeredDistrictTpl) }}>{fmtMargin(centeredDistrictTpl)}</span>
              </div>
            </div>
          </div>

          {/* Result */}
          <div className="flex flex-col sm:flex-row gap-0">
            <div className="grid grid-cols-2 sm:w-[28rem] sm:shrink-0" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div
                className="flex flex-col items-center justify-center py-8 px-4"
                style={{ borderRight: "1px solid var(--app-border)", background: centeredDistrictTpl >= 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)" }}
              >
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-center" style={{ color: centeredDistrictTpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                  {selectedDistrictData?.code ?? "—"} Centered
                </div>
                <div className="text-4xl font-bold tabular-nums leading-none" style={{ color: centeredDistrictTpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                  {Math.abs(centeredDistrictTpl) < 0.05 ? "EVEN" : `${centeredDistrictTpl >= 0 ? "R" : "D"}+${Math.abs(centeredDistrictTpl).toFixed(1)}`}
                </div>
                <div className="text-[10px] mt-2" style={{ color: "var(--app-text-muted)" }}>vs. median district</div>
              </div>
              <div className="flex flex-col items-center justify-center py-8 px-4" style={{ background: selectedDistrictCalc.tpl >= 0 ? "var(--party-rep-subtle)" : "var(--party-dem-subtle)" }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2 text-center" style={{ color: selectedDistrictCalc.tpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                  {selectedDistrictData?.code ?? "—"} District TPL
                </div>
                <div className="text-4xl font-bold tabular-nums leading-none" style={{ color: selectedDistrictCalc.tpl >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                  {Math.abs(selectedDistrictCalc.tpl) < 0.05 ? "EVEN" : `${selectedDistrictCalc.tpl >= 0 ? "R" : "D"}+${Math.abs(selectedDistrictCalc.tpl).toFixed(1)}`}
                </div>
                <div className="text-[10px] mt-2" style={{ color: "var(--app-text-muted)" }}>Neutral partisan lean</div>
              </div>
            </div>

            <div className="flex-1 px-5 py-5 flex flex-col gap-3 text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
              <div>
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>435-district centering: </span>
                The median district TPL is {fmtMargin(nationalDistrictTpl.medianTpl)}. Centered District TPL subtracts this common baseline so the median district sits at EVEN.
              </div>
              <div style={{ color: "var(--app-text-very-muted)" }}>
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>No WA / FF: </span>
                Three-cycle presidential averaging already dampens wave effects, so the district model omits Wave Adjustment and Fundraising Factor entirely — NM = Raw Margin + Candidate Factor.
              </div>
            </div>
          </div>
        </div>
      </div>

      </>)}

      {/* ── Table ── */}
      {activeSubTab === "table" && (
        <div className="flex flex-col gap-4 pt-2">
        {renderSubTabRow()}
        <TplStateMap
          rows={allStateRows}
          onSelect={openStateTplFromTable}
        />
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-[11px] md:min-w-[720px] md:text-xs">
              <colgroup>
                <col className="w-[34%] md:w-1/4" />
                <col className="w-[22%] md:w-1/4" />
                <col className="w-[22%] md:w-1/4" />
                <col className="w-[22%] md:w-1/4" />
              </colgroup>
              <thead>
                <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                  <th
                    className="px-1 py-2.5 text-left text-[9px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap md:px-4 md:text-[10px]"
                    style={{ color: allStatesSort === "name" ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                    onClick={() => handleSortClick("name")}
                  >
                    State {allStatesSort === "name" ? (allStatesSortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  {([
                    [<><span className="md:hidden">Centered</span><span className="hidden md:inline">Centered TPL</span></>, "centeredTpl", "TPL minus 50-state median"],
                    ["TPL", "tpl", "Neutral partisan lean — Generic R vs Generic D with no wave"],
                    ["Competitive", "absCenteredTpl", "Sort by absolute TPL"],
                  ] as const).map(([label, col, tip]) => (
                    <th
                      key={col}
                      title={tip}
                      className="px-1 py-2.5 text-left text-[9px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap md:px-4 md:text-[10px]"
                      style={{ color: allStatesSort === col ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                      onClick={() => handleSortClick(col)}
                    >
                      {label} {allStatesSort === col ? (allStatesSortDir === "asc" ? "↑" : "↓") : "↕"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allStateRows.map((s, i) => (
                  <tr
                    key={s.abbr}
                    className="cursor-pointer"
                    style={{
                      background: s.abbr === selectedAbbr ? "var(--app-border)" : i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                    onClick={() => openStateTplFromTable(s.abbr)}
                  >
                    <td className="px-2 py-2 font-semibold break-words md:px-4" style={{ color: "var(--app-text-primary)" }}>
                      {s.name}
                      <span className="ml-1.5 text-[10px] font-mono" style={{ color: "var(--app-text-very-muted)" }}>{s.abbr}</span>
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-semibold md:px-4" style={{ color: marginColor(s.centeredTpl) }}>
                      {fmtMargin(s.centeredTpl)}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-bold md:px-4" style={{ color: marginColor(s.tpl), background: marginBg(s.tpl) }}>
                      {fmtMargin(s.tpl)}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono md:px-4" style={{ color: "var(--app-text-muted)" }}>
                      {Math.abs(s.tpl).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-[10px]" style={{ borderTop: "1px solid var(--app-border)", background: "var(--app-panel)", color: "var(--app-text-very-muted)" }}>
            Click a row or map state to open in State TPL. 50-state median TPL = {fmtMargin(nationalTpl.medianTpl)}.
          </div>
        </div>
        </div>
      )}


      {/* ── District Table ── */}
      {activeSubTab === "districtTable" && (
        <div className="flex flex-col gap-4 pt-2">
        {renderSubTabRow()}
        <TplDistrictMap
          rows={allDistrictRows}
          onSelect={openDistrictTplFromDistrictTable}
        />
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-[11px] md:min-w-[720px] md:text-xs">
              <colgroup>
                <col className="w-[34%] md:w-1/4" />
                <col className="w-[22%] md:w-1/4" />
                <col className="w-[22%] md:w-1/4" />
                <col className="w-[22%] md:w-1/4" />
              </colgroup>
              <thead>
                <tr style={{ background: "var(--app-panel)", borderBottom: "1px solid var(--app-border)" }}>
                  <th
                    className="px-1 py-2.5 text-left text-[9px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap md:px-4 md:text-[10px]"
                    style={{ color: allDistrictsSort === "district" ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                    onClick={() => handleDistrictSortClick("district")}
                  >
                    District {allDistrictsSort === "district" ? (allDistrictsSortDir === "asc" ? "↑" : "↓") : "↕"}
                  </th>
                  {([
                    [<><span className="md:hidden">Centered</span><span className="hidden md:inline">Centered TPL</span></>, "centeredTpl", "District TPL minus 435-district median"],
                    ["TPL", "tpl", "Neutral presidential lean — 2016/2020/2024 weighted average"],
                    ["Competitive", "absCenteredTpl", "Sort by absolute TPL"],
                  ] as const).map(([label, col, tip]) => (
                    <th
                      key={col}
                      title={tip}
                      className="px-1 py-2.5 text-left text-[9px] uppercase tracking-wider font-semibold cursor-pointer select-none whitespace-nowrap md:px-4 md:text-[10px]"
                      style={{ color: allDistrictsSort === col ? "var(--app-text-primary)" : "var(--app-text-muted)" }}
                      onClick={() => handleDistrictSortClick(col)}
                    >
                      {label} {allDistrictsSort === col ? (allDistrictsSortDir === "asc" ? "↑" : "↓") : "↕"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allDistrictRows.map((d, i) => (
                  <tr
                    key={d.id}
                    className="cursor-pointer"
                    style={{
                      background: d.id === selectedDistrictId ? "var(--app-border)" : i % 2 === 0 ? "var(--app-panel)" : "var(--app-bg)",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                    onClick={() => openDistrictTplFromDistrictTable(d.state, d.id)}
                  >
                    <td className="px-2 py-2 font-semibold break-words md:px-4" style={{ color: "var(--app-text-primary)" }}>
                      {d.code}
                      <span className="ml-1.5 text-[10px] font-mono" style={{ color: "var(--app-text-very-muted)" }}>{d.state}</span>
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-semibold md:px-4" style={{ color: marginColor(d.centeredTpl) }}>
                      {fmtMargin(d.centeredTpl)}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-bold md:px-4" style={{ color: marginColor(d.tpl), background: marginBg(d.tpl) }}>
                      {fmtMargin(d.tpl)}
                    </td>
                    <td className="px-2 py-2 text-left tabular-nums font-mono md:px-4" style={{ color: "var(--app-text-muted)" }}>
                      {Math.abs(d.tpl).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-[10px]" style={{ borderTop: "1px solid var(--app-border)", background: "var(--app-panel)", color: "var(--app-text-very-muted)" }}>
            Click a row or map district to open in District TPL. 435-district median TPL = {fmtMargin(nationalDistrictTpl.medianTpl)}.
          </div>
        </div>
        </div>
      )}

      {/* ── S modal ── */}
      {formulaOpen === "S" && (() => {
        const calc = STATE_S_CALCULATIONS[selectedAbbr];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setFormulaOpen(null)}
          >
            <div
              className="rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
              style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <div>
                  <span className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>S — {selectedStateName}</span>
                  <span className="ml-2 text-xs font-mono" style={{ color: "var(--app-text-muted)" }}>= {calc?.S ?? "—"}</span>
                </div>
                <button onClick={() => setFormulaOpen(null)} className="text-lg leading-none" style={{ color: "var(--app-text-muted)" }}>×</button>
              </div>
              <div className="px-5 py-3 text-xs" style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                <span className="font-mono" style={{ color: "var(--app-text-primary)" }}>S = avg( state_swing / national_swing )</span>
                <span className="ml-2">over cycles where |national swing| ≥ 1 pt</span>
              </div>
              {calc ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--app-bg)", borderBottom: "1px solid var(--app-border)" }}>
                      {["Cycle", "State Swing", "National Swing", "Ratio", ""].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-very-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calc.intervals.map((iv, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--app-border)", opacity: iv.ratio == null ? 0.5 : 1 }}>
                        <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color: "var(--app-text-muted)" }}>{iv.fromYear}→{iv.toYear}</td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: marginColor(iv.stateSwing) }}>{iv.stateSwing > 0 ? "+" : ""}{iv.stateSwing.toFixed(1)}</td>
                        <td className="px-4 py-2.5 tabular-nums font-semibold" style={{ color: marginColor(iv.nationalSwing) }}>{iv.nationalSwing > 0 ? "+" : ""}{iv.nationalSwing.toFixed(1)}</td>
                        <td className="px-4 py-2.5 tabular-nums font-mono" style={{ color: "var(--app-text-primary)" }}>{iv.ratio != null ? iv.ratio.toFixed(2) : "—"}</td>
                        <td className="px-4 py-2.5 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>{iv.ratio == null ? "excluded (|nat swing| < 1)" : "included"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--app-panel)" }}>
                      <td colSpan={3} className="px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-very-muted)" }}>Average of included ratios</td>
                      <td className="px-4 py-2.5 font-bold font-mono tabular-nums" style={{ color: "var(--app-text-primary)" }}>{calc.S.toFixed(2)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <div className="px-5 py-6 text-xs text-center" style={{ color: "var(--app-text-very-muted)" }}>No S data for {selectedStateName}.</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Formula modal ── */}
      {adjustedPopupIdx != null && (() => {
        const r = filteredRaces[adjustedPopupIdx];
        if (!r) return null;
        const raw = r.rawMargin;
        const adj = r.adjustedMargin;
        const capped = adj != null && raw != null && Math.abs(adj) === Math.abs(raw) && r.competitivenessAdjusted;

        const mc = (v: number | null) => (
          <span style={{ color: marginColor(v) }}>{fmtMargin(v)}</span>
        );

        const rows: { label: string; value: React.ReactNode; note?: string }[] = [];

        // Raw margin always first
        rows.push({ label: "Raw Margin", value: mc(raw) });

        if (r.blanketApplied) {
          rows.push({ label: "Method", value: `No valid prior data within current boundary vintage (boundary from ${r.minValidYear})` });
          rows.push({ label: "Adjusted = Raw × 0.8", value: <>{mc(raw)} × 0.8 = {mc(adj)}</> });
        } else {
          const hasContested = r.priorContestedMargin != null;
          const hasPres = r.presidentialBaselineMargin != null;
          const oneOnly = hasContested !== hasPres;

          rows.push({
            label: `Prior Contested${hasContested ? ` (${r.priorContestedYear})` : ""}`,
            value: hasContested ? mc(r.priorContestedMargin) : "—",
            note: !hasContested ? "No result < 50 pts within valid boundary window" : undefined,
          });
          rows.push({
            label: `Prior Presidential${hasPres ? ` (${r.presidentialBaselineYear})` : ""}`,
            value: hasPres ? mc(r.presidentialBaselineMargin) : "—",
            note: !hasPres ? "No presidential result within valid boundary window" : undefined,
          });

          if (oneOnly) {
            const available = hasContested ? r.priorContestedMargin! : r.presidentialBaselineMargin!;
            rows.push({ label: "One source missing — full weight on available", value: <>100% × {mc(available)} = {mc(available)}</> });
          } else {
            rows.push({
              label: "Blend (0.6 × Contested + 0.4 × Presidential)",
              value: <>0.6 × {mc(r.priorContestedMargin)} + 0.4 × {mc(r.presidentialBaselineMargin)}</>,
            });
          }

          if (capped) {
            rows.push({ label: "Cap applied (blend > raw)", value: <>Adjusted = Raw = {mc(raw)}</> });
          } else {
            rows.push({ label: "Adjusted Margin", value: mc(adj) });
          }
        }

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setAdjustedPopupIdx(null)}
          >
            <div
              className="rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
              style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <div>
                  <div className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>Adjusted Margin</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--app-text-muted)" }}>
                    {r.race} · {r.year}
                    {r.raceType === "H" && r.minValidYear > 0 && (
                      <span style={{ color: "var(--app-text-very-muted)" }}> · boundary from {r.minValidYear}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setAdjustedPopupIdx(null)} className="text-lg leading-none" style={{ color: "var(--app-text-muted)" }}>×</button>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--app-border)" }}>
                {rows.map((row, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text-very-muted)" }}>{row.label}</div>
                    <div className="font-mono text-xs font-semibold" style={{ color: "var(--app-text-primary)" }}>{row.value}</div>
                    {row.note && <div className="text-[11px] mt-1" style={{ color: "var(--app-text-muted)" }}>{row.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {formulaOpen && formulaOpen !== "S" && FORMULA_PANELS[formulaOpen] && (() => {
        const panel = FORMULA_PANELS[formulaOpen];
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setFormulaOpen(null)}
          >
            <div
              className="rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
              style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
                <span className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>{panel.title}</span>
                <button
                  onClick={() => setFormulaOpen(null)}
                  className="text-lg leading-none"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  ×
                </button>
              </div>
              {/* Rows */}
              <div className="divide-y" style={{ borderColor: "var(--app-border)" }}>
                {panel.rows.map((row, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--app-text-very-muted)" }}>
                      {row.label}
                    </div>
                    <div className="font-mono text-xs" style={{ color: "var(--app-text-primary)" }}>
                      {row.formula}
                    </div>
                    {row.note && (
                      <div className="text-[11px] mt-1" style={{ color: "var(--app-text-muted)" }}>
                        {row.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
