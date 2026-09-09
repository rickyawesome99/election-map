"use client";

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { getRaceColor } from "@/lib/colorScale";
import { APPROVE_COLOR, DISAPPROVE_COLOR } from "@/lib/trumpApprovalAverage";
import { filterMapZoomEvent } from "@/lib/mapZoom";
import { useDarkMode } from "@/lib/useDarkMode";
import { NationalLandMask, NationalLandMaskDefinition } from "./StateLandMask";
import { statesData } from "@/data/statesData";
import { TPL_GLOBAL_CONSTANTS as G } from "@/data/tplModelData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import {
  calculateStateModel,
  calculateDistrictModel,
  computeWarTable,
  getTplFit,
  incumbentAdvantage,
} from "@/lib/tplCompute";
import { ELIGIBILITY_LABELS } from "@/data/raceEligibility";

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
  { abbr: "⊘", term: "Imputed Race", desc: "An ineligible race (missing major-party nominee or same-party general): the margin is replaced by the seat's nearest presidential result and the row carries half weight in aggregation." },
  { abbr: "Centered TPL", term: "Centered True Partisan Lean", desc: "TPL minus the 50-state median TPL. Shows how a state compares to the typical state, with systematic model bias removed." },
  { abbr: "CQ", term: "Candidate Quality Factor", desc: "District TPL only — removed from the state model in the rebuild. Outlier candidates are handled by Huber downweighting in the fit instead, and quality becomes the WAR layer's output." },
  { abbr: "FF", term: "Fundraising Factor", desc: "Additive fundraising strip, −clamp(0.02 × money-gap%, ±2), from FEC/state receipts where both candidates are known. The TPL strips the full gap; WAR's expected margin uses only its structural part (see the WAR tab)." },
  { abbr: "IF", term: "Incumbency Points", desc: "Additive, party-signed strip subtracted in the incumbent party's direction. Senate and Governor values are estimated inside the joint fit (incumbent-held races vs lean + β*×E, with the fundraising strip already applied, so money and incumbency never double-count); House keeps a fixed 3. 0 for open seats, presidential races (E owns national approval effects) and legislature aggregates. Same table the forecast adds back." },

  { abbr: "E(y)", term: "Fitted National Environment", desc: "One number per year, 2016–2025 incl. odd years, estimated jointly with every state's lean from within-state changes — so which seats happen to be up cannot skew it. Positive = R-favored; centered so the period average is ≈ 0." },
  { abbr: "NM", term: "Neutralized Margin", desc: "Adjusted Margin + IF pts + FF pts − β*×E(y). Every strip is additive and applied exactly once." },
  { abbr: "PGSHL", term: "Race Type Codes", desc: "P = President, G = Governor, S = U.S. Senate, H = U.S. House, L = State Legislature." },
  { abbr: "β*", term: "Elasticity", desc: "The state's fitted sensitivity to the national environment, estimated from every office and year at once, then shrunk toward 1 (β* = 1 + 0.5(β̂ − 1)) and clamped to [0.5, 1.6]." },
  { abbr: "TPL", term: "True Partisan Lean", desc: "The state's neutral partisan composition — what a Generic R vs Generic D race in a neutral year would produce. Recency-weighted average of WRS scores, 2016–2025, odd years included." },
  { abbr: "ENV", term: "Environment Adjustment", desc: "−β* × E(y): strips the fitted national environment from the margin. Negative when a Republican-leaning year is being removed, positive when a Democratic-leaning year is." },
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
      { label: "Eligible race", formula: "Adjusted = Raw — a genuine (or caucus-aligned) nominee of each major party was on the ballot" },
      { label: "Ineligible race (⊘)", formula: "Missing major-party nominee, or a same-party general (CA/WA top-two, LA runoff) — the margin is not an R-vs-D measurement" },
      { label: "Imputation", formula: "Adjusted = the seat's nearest presidential result (district-level for House, restricted to the same boundary vintage)" },
      { label: "Aligned independents", formula: "Bernie Sanders and Angus King count as Democratic nominees; other independents do not", note: "Crosswalk lives in data/raceEligibility.ts." },
      { label: "Downstream", formula: "Imputed rows skip IF / CQ / FF / WA (NM = imputed lean) and carry half weight in aggregation" },
    ],
  },
  "IF ↗": {
    title: "Incumbency Points (IF)",
    rows: [
      { label: "Formula", formula: "IF pts = −pts if R incumbent · +pts if D incumbent · 0 if open seat" },
      { label: "Office values", formula: "House = 3 · Senate = 2 · Governor = 7   (shared with the forward projection)" },
      { label: "President", formula: "0 — national approval effects belong to the environment term E(y)" },
      { label: "State Legislature", formula: "0 — a chamber aggregate has no single incumbent to attribute" },
      { label: "Imputed rows", formula: "0 — the imputed value is already an incumbency-free lean" },
      { label: "Interpretation", formula: "Additive and symmetric: the same points are stripped whether the incumbent won or lost, and added back when forecasting." },
    ],
  },
  "FF ↗": {
    title: "Fundraising Points (FF)",
    rows: [
      { label: "Advantage in margin", formula: "clamp( k × moneyGapPct, ±cap )    moneyGapPct = (R$ − D$) ⁄ (R$ + D$) × 100" },
      { label: "Strip", formula: "FF pts = −(that advantage) — subtracted like IF and ENV" },
      { label: "Data", formula: "FEC candidate-committee total receipts per cycle, 2016–2026 (data/fundraisingData.ts)" },
      { label: "Coverage", formula: "House & Senate where both candidates' receipts are known. President excluded by design; Governor pending state-level filings; imputed rows carry no FF." },
      { label: "Endogeneity", formula: "Money follows lean, so k stays small and the cap tight — both harness-calibrated.", note: "$0 means the candidate never crossed the FEC's $5k filing threshold." },
    ],
  },
  "ENV ↗": {
    title: "Environment Adjustment (−β* × E)",
    rows: [
      { label: "Formula", formula: "ENV pts = −β*(state) × E(year)" },
      { label: "E(y)", formula: "Fitted national environment, one number per year 2016–2025 (odd years included), estimated jointly with all 50 state leans by Huber-weighted alternating least squares" },
      { label: "Why fitted, not the popular vote", formula: "E is identified from within-state changes — which Senate/Governor seats happen to be up, uncontested seats, and big-state swings cannot skew it" },
      { label: "β*", formula: "State elasticity: β* = clamp(1 + 0.5 × (β̂ − 1), 0.5, 1.6) — click the hero β* stat for this state's derivation and the full E table" },
      { label: "Imputed rows", formula: "Strip the environment of the SOURCE presidential year the value was imputed from" },
      { label: "Sign convention", formula: "Negative ENV = an R-leaning year is being removed. Positive = a D-leaning year is being removed." },
    ],
  },
  "NM ↗": {
    title: "Neutralized Margin (NM)",
    rows: [
      { label: "Formula", formula: "NM = Adjusted + IF pts + FF pts + ENV pts" },
      { label: "All additive", formula: "Every distortion is stripped exactly once, in points — no compounding, no double-counting" },
      { label: "Imputed rows", formula: "NM = imputed lean − β* × E(source year) · half weight in aggregation" },
      { label: "Candidate quality", formula: "Not a term: outlier candidates (Manchin, Scott, Hogan…) are downweighted by the Huber fit, and their residuals become WAR" },
      { label: "Purpose", formula: "NM is the stripped partisan signal: the race re-expressed as generic R vs generic D in a neutral national year." },
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

export default function TplModelPage({ initialSubTab }: { initialSubTab?: "state" | "district" | "table" | "districtTable" | "war" }) {
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
  // Step 1 is a single table; a non-null index opens that race's calculation in a modal.
  const [detailRaceIdx, setDetailRaceIdx] = useState<number | null>(null);
  const [allStatesSort, setAllStatesSort] = useState<"centeredTpl" | "tpl" | "absCenteredTpl" | "name">("centeredTpl");
  const [allStatesSortDir, setAllStatesSortDir] = useState<"asc" | "desc">("asc");

  // Esc closes the race calculation popup (innermost first, so a formula popup
  // opened from inside it closes before the race popup underneath).
  useEffect(() => {
    if (detailRaceIdx == null && adjustedPopupIdx == null && formulaOpen == null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (formulaOpen != null) setFormulaOpen(null);
      else if (adjustedPopupIdx != null) setAdjustedPopupIdx(null);
      else setDetailRaceIdx(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailRaceIdx, adjustedPopupIdx, formulaOpen]);

  // Sub-tab state
  const [activeSubTab, setActiveSubTab] = useState<"state" | "district" | "table" | "districtTable" | "war">(initialSubTab ?? "state");
  const [returnSubTab, setReturnSubTab] = useState<"table" | "districtTable" | null>(null);
  const [warOffice, setWarOffice] = useState<"All" | "P" | "S" | "G" | "H">("All");
  const [warParty, setWarParty] = useState<"All" | "D" | "R" | "I">("All");
  const [warYear, setWarYear] = useState<number | "All">("All");
  const [warQuery, setWarQuery] = useState("");
  const [warDir, setWarDir] = useState<"top" | "bottom" | "race">("top");

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

  const tplFit = getTplFit();
  const betaInfo = tplFit.beta[selectedAbbr];
  const beta = betaInfo?.shrunk ?? 1;

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

  const hasOddYears = allRaces.some((r) => G.YEAR_WEIGHTS[r.year] == null);

  // ── District TPL computed values ──────────────────────────────────────────

  const selectedDistrictCalc = useMemo(
    () => calculateDistrictModel(selectedDistrictId),
    [selectedDistrictId]
  );

  const warRows = useMemo(() => (activeSubTab === "war" ? computeWarTable().map((row, id) => ({ ...row, id })) : []), [activeSubTab]);
  const filteredWarRows = useMemo(() => {
    const terms = warQuery.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    const stateAbbreviations = new Set(statesData.map((state) => state.abbr.toLowerCase()));
    const rows = warRows.filter((r) =>
      (warOffice === "All" || r.office === warOffice) &&
      (warParty === "All" || (warParty === "I" ? r.party !== "D" && r.party !== "R" : r.party === warParty)) &&
      (warYear === "All" || r.year === warYear) &&
      terms.every((term) => {
        if (/^\d{4}$/.test(term)) return String(r.year) === term;
        if (stateAbbreviations.has(term)) return r.state.toLowerCase() === term;
        return r.candidate.toLowerCase().includes(term) ||
          r.race.toLowerCase().includes(term) ||
          RACE_TYPE_LABELS[r.office].toLowerCase().includes(term);
      })
    );
    if (warDir === "race") {
      return rows.sort((a, b) => b.year - a.year ||
        a.state.localeCompare(b.state) ||
        a.office.localeCompare(b.office) ||
        a.race.localeCompare(b.race, undefined, { numeric: true }) ||
        a.candidate.localeCompare(b.candidate));
    }
    return warDir === "top" ? rows : [...rows].reverse();
  }, [warRows, warOffice, warParty, warYear, warQuery, warDir]);

  // Keep the final race together when the display limit falls inside a group.
  let warDisplayLimit = 150;
  if (warDir === "race") {
    const last = filteredWarRows[warDisplayLimit - 1];
    while (last && filteredWarRows[warDisplayLimit] &&
      filteredWarRows[warDisplayLimit].year === last.year &&
      filteredWarRows[warDisplayLimit].state === last.state &&
      filteredWarRows[warDisplayLimit].office === last.office &&
      filteredWarRows[warDisplayLimit].race === last.race) warDisplayLimit++;
  }

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

  function handleSubTabClick(tab: "state" | "district" | "table" | "districtTable" | "war") {
    router.push(`/model/${tab}`);
    setReturnSubTab(null);
    setActiveSubTab(tab);
  }

  const SUB_TAB_LABELS = { state: "State TPL", district: "District TPL", table: "Table", districtTable: "District Table", war: "WAR" } as const;

  function renderSubTabRow() {
    return (
      <div className="flex h-5 justify-center">
        <div className="flex items-center leading-5" style={{ gap: "14px" }}>
          {(["state", "district", "table", "districtTable", "war"] as const).flatMap((tab, i) => {
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
    setDetailRaceIdx(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function openDistrictTplFromDistrictTable(state: string, id: string) {
    window.history.pushState({ tplModelReturnSubTab: "districtTable" }, "");
    setReturnSubTab("districtTable");
    setSelectedDistrictStateAbbr(state);
    setSelectedDistrictId(id);
    setActiveSubTab("district");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function handleReturnToTable() {
    if (returnSubTab) window.history.back();
  }

  const districtTableGridColumns = "grid grid-cols-[minmax(8rem,1.2fr)_3.5rem_5rem_5.5rem_4.5rem_4.5rem_5rem_5.25rem_3.5rem]";
  const raceTableGridColumns = "grid grid-cols-[minmax(8.5rem,1.4fr)_3.5rem_5rem_6.25rem_5.5rem_4.5rem_4.5rem_5rem_5.25rem_3.5rem]";

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
                  setDetailRaceIdx(null);
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
                True Partisan Lean · election data 2016&ndash;2025 · environment &amp; elasticity fitted jointly across all 50 states
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
                className="text-xl font-extrabold tabular-nums cursor-pointer underline decoration-dotted underline-offset-4"
                style={{ color: "var(--app-text-primary)" }}
                onClick={() => setFormulaOpen("BETA")}
                title="Click to see the elasticity derivation and fitted E table"
              >
                {beta.toFixed(2)}<span className="ml-0.5 text-xs opacity-50">ⓘ</span>
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Elasticity (β*)
              </div>
            </div>
            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-xl font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                {tplFit.years.length} yrs
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Fit Window {tplFit.years[0]}&ndash;{tplFit.years[tplFit.years.length - 1]}
              </div>
            </div>
            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-xl font-extrabold tabular-nums" style={{ color: allRaces.some((r) => r.imputed) ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                {allRaces.filter((r) => r.imputed).length}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Imputed Races (⊘)
              </div>
            </div>
            <div>
              <div className="text-xl font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{allRaces.length}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Races Loaded
              </div>
            </div>
          </div>
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
          <span className="block">NM = Adjusted Margin + IF pts + FF pts + ENV pts — every strip additive, applied once. Ineligible races (⊘) are imputed from the seat&apos;s nearest presidential result at half weight.</span>
          <span className="block">Click any race to open its full step-by-step calculation.</span>
        </p>

        <div className="mb-3" style={{ borderBottom: "1px solid var(--app-border)" }} />

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-3 mt-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-very-muted)" }}>Race</span>
            {["All", "P", "S", "G", "H", "L"].map((f) => (
              <button
                key={f}
                onClick={() => { setRaceFilter(f); setDetailRaceIdx(null); }}
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
              onClick={() => { setYearFilter("All"); setDetailRaceIdx(null); }}
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
                onClick={() => { setYearFilter(String(y)); setDetailRaceIdx(null); }}
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
        <div className="hidden min-w-0 md:block">
          <div className="h-[30rem] overflow-x-auto overflow-y-hidden">
            <table className="flex h-full w-full min-w-[59.5rem] flex-col text-xs">
              <thead
                className="block shrink-0"
                style={{ background: "var(--app-bg)", boxShadow: "inset 0 -2px 0 var(--app-text-primary)" }}
              >
                <tr className={raceTableGridColumns}>
                  {[
                    ["Race", "Race type and name"],
                    ["Year", "Election year — 2016–2025, odd-year governor races included"],
                    ["Raw", "Raw Margin = repPct − demPct. Positive = R wins. Live from site data."],
                    ["Adjusted ↗", "Adjusted Margin — equals Raw for eligible races. ⊘ = ineligible race (missing major-party nominee or same-party general): value imputed from the seat's nearest presidential result and given half weight in aggregation."],
                    ["Incumbent", "Incumbent party marker or Open. State Legislature = -."],
                    ["IF ↗", "Incumbency points, additive and party-signed, stripped in the incumbent party's direction. Senate/Governor fitted (see BETA popup), House fixed 3. 0 for P, Leg, open seats and imputed rows."],
                    ["FF ↗", "Fundraising strip = −clamp(k × money-gap%, ±cap), from FEC receipts. Applies where both candidates' receipts are known; Governor pending state filings."],
                    ["ENV ↗", "Environment adjustment = −β* × E(year). Strips the fitted national environment; imputed rows strip their source year's E."],
                    ["NM ↗", "Adjusted × (IF × CQ) + FF pts + WA."],
                    ["Wt", "Weight in aggregation: ×0.5 if imputed, × Huber factor min(1, 7 ⁄ |NM − fitted lean|) — crossover outliers count less."],
                  ].map(([label, tip], ci) => {
                    const isClickable = label in FORMULA_PANELS;
                    return (
                      <th
                        key={label}
                        title={isClickable ? `Click to see ${label} formula` : tip}
                        className={`px-1.5 py-2 text-[10px] uppercase tracking-wide font-semibold whitespace-nowrap text-left ${isClickable ? "cursor-pointer select-none" : ""}`}
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
                    onClick={() => setDetailRaceIdx(i)}
                    className={`${raceTableGridColumns} h-9 cursor-pointer hover:bg-[var(--app-tab-bg)] transition-colors`}
                    style={{
                      borderBottom: "1px solid var(--app-border)",
                      opacity: r.inAggregation ? 1 : 0.75,
                    }}
                  >
                    <td className="px-1.5 py-2 whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>
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
                    <td className="px-1.5 py-2 tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                      {r.year}{!r.inAggregation ? <span style={{ color: "var(--app-text-very-muted)" }}>*</span> : ""}
                    </td>
                    <td className="px-1.5 py-2 text-left tabular-nums font-semibold" style={{ color: marginColor(r.rawMargin) }}>
                      {fmtMargin(r.rawMargin)}
                    </td>
                    <td
                      className="px-1.5 py-2 text-left tabular-nums font-semibold"
                      style={{ color: marginColor(r.adjustedMargin) }}
                    >
                      {fmtMargin(r.adjustedMargin)}
                      {r.imputed && (
                        <span className="ml-0.5" style={{ color: "var(--app-text-very-muted)" }}>⊘</span>
                      )}
                    </td>
                    <td className="px-1.5 py-2 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>
                      {r.raceType === "P"
                        ? "-"
                        : r.incumbent === "R" && r.rawMargin != null
                        ? r.rawMargin > 0 ? "R won" : "R lost"
                        : r.incumbent === "D" && r.rawMargin != null
                        ? r.rawMargin < 0 ? "D won" : "D lost"
                        : r.incumbent}
                    </td>
                    <td className="px-1.5 py-2 text-left tabular-nums font-semibold" style={{ color: r.incumbencyPts != null && r.incumbencyPts !== 0 ? marginColor(r.incumbencyPts) : "var(--app-text-very-muted)" }}>
                      {r.incumbencyPts != null && r.incumbencyPts !== 0 ? (r.incumbencyPts > 0 ? "+" : "") + r.incumbencyPts.toFixed(0) : "—"}
                    </td>
                    <td className="px-1.5 py-2 text-left tabular-nums font-mono" style={{ color: r.FF_pts != null && r.FF_pts !== 0 ? marginColor(r.FF_pts) : "var(--app-text-very-muted)" }}>
                      {r.FF_pts != null && r.FF_pts !== 0 ? (r.FF_pts > 0 ? "+" : "") + r.FF_pts.toFixed(2) : "—"}
                    </td>
                    <td className="px-1.5 py-2 text-left tabular-nums font-mono" style={{ color: "var(--app-text-muted)" }}>
                      {r.envPts != null && r.envPts !== 0 ? (r.envPts > 0 ? "+" : "") + r.envPts.toFixed(2) : "—"}
                    </td>
                    <td
                      className="px-1.5 py-2 text-left tabular-nums font-bold"
                      style={{ color: marginColor(r.NM), background: marginBg(r.NM) }}
                    >
                      {fmtMargin(r.NM)}
                    </td>
                    <td className="px-1.5 py-2 text-left tabular-nums font-mono" style={{ color: r.aggWeight < 0.995 ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                      {r.aggWeight >= 0.995 ? "1.0" : r.aggWeight.toFixed(2)}
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
        </div>

        {/* Mobile race list — the desktop table is 12 columns wide, so small screens browse
            the same races through this compact list. Both open the same calculation modal. */}
        <div className="md:hidden">
          <div className="flex h-[30rem] min-w-0 flex-col overflow-hidden">
            <table className="w-full table-fixed text-xs">
              <colgroup>
                <col />
                <col className="w-12" />
                <col className="w-16" />
              </colgroup>
              <thead style={{ background: "var(--app-bg)" }}>
                <tr>
                  <th className="px-1.5 py-2 text-[10px] uppercase tracking-wide font-semibold text-left" style={{ color: "var(--app-text-muted)" }}>Race</th>
                  <th className="px-1.5 py-2 text-[10px] uppercase tracking-wide font-semibold text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>Year</th>
                  <th className="px-1.5 py-2 text-[10px] uppercase tracking-wide font-semibold text-right tabular-nums" style={{ color: "var(--app-text-primary)" }}>NM</th>
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
                      onClick={() => setDetailRaceIdx(i)}
                      className="h-9 cursor-pointer hover:bg-[var(--app-tab-bg)] transition-colors"
                      style={{ borderBottom: "1px solid var(--app-border)" }}
                    >
                      <td className="min-w-0 px-1.5 py-2" style={{ color: "var(--app-text-primary)" }}>
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>
                            {race.raceType}
                          </span>
                          <span className="min-w-0 truncate font-semibold" title={race.race}>{race.race}</span>
                        </span>
                      </td>
                      <td className="px-1.5 py-2 text-right tabular-nums" style={{ color: "var(--app-text-muted)" }}>{race.year}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums font-bold" style={{ color: marginColor(race.NM) }}>{fmtMargin(race.NM)}</td>
                    </tr>
                  ))}
                  {filteredRaces.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-xs" style={{ color: "var(--app-text-very-muted)" }}>
                        No races match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="pt-2 flex min-h-4 flex-wrap gap-x-5 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>
          {filteredRaces.some((r) => r.imputed) && (
            <span>⊘ Ineligible race (missing major-party nominee or same-party general) — Adjusted imputed from the seat&apos;s nearest presidential result, half weight in aggregation.</span>
          )}
          {hasOddYears && <span>* Race year outside the aggregation window.</span>}
          <span>Wt = aggregation weight: imputed rows ×0.5; every row × min(1, 7 ⁄ |NM − fitted lean|), so crossover outliers (Manchin, Scott…) can&apos;t drag the TPL.</span>
        </div>

        {/* Fitted environment strip */}
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          {tplFit.years.map((year) => {
            const e = tplFit.E[year] ?? 0;
            return (
              <span key={year} className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
                {year} E:{" "}
                <span className="font-semibold" style={{ color: e >= 0 ? "var(--party-rep)" : "var(--party-dem)" }}>
                  {e >= 0 ? "R" : "D"}+{Math.abs(e).toFixed(1)}
                </span>
              </span>
            );
          })}
          <span className="text-[11px]" style={{ color: "var(--app-text-very-muted)" }}>
            {selectedStateName} β*: <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>{beta.toFixed(2)}</span>
          </span>
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
          {[...G.YEARS].reverse().filter((year) => {
            const agg = yearAggregations.find((a) => a.year === year);
            return (agg?.racesPresent.length ?? 0) > 0;
          }).map((year, i, arr) => {
            const agg = yearAggregations.find((a) => a.year === year);
            const hasData = agg && agg.racesPresent.length > 0;
            const weight = (agg?.finalWeight ?? 0) * 100;
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
              {yearAggregations.filter((a) => a.racesPresent.length > 0).map((agg, i) => (
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
                const w = agg.finalWeight;
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
              <div>
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>Year weights: </span>
                Recency decay (0.87 per year, anchored to 2026) scaled by the base type-weight coverage of races
                present that year — so a sparse odd year cannot dominate through weight redistribution.
              </div>
              <div>
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>Pending: </span>
                FF is 0 for every race until the FEC fundraising pipeline lands (Phase 5). Type weights and decay
                are backtest-informed starting values, to be grid-searched through the holdout harness (Phase 4).
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
                  onChange={(e) => setSelectedDistrictId(e.target.value)}
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
                {selectedDistrictData?.stateName ?? selectedDistrictCalc.stateAbbr} · presidential results 2016&ndash;2024 on current boundaries + House races from the current boundary era · same additive pipeline as State TPL
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
              <div className="text-xl font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{selectedDistrictCalc.eraStart}&ndash;now</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Boundary Era
              </div>
            </div>
            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-xl font-extrabold" style={{ color: "var(--app-text-primary)" }}>
                {selectedDistrictCalc.races.some((r) => r.raceType === "H") ? "P + H" : "P only"}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Race Types
              </div>
            </div>
            <div className="pr-8" style={{ borderRight: "1px solid var(--app-border)" }}>
              <div className="text-xl font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                {(tplFit.beta[selectedDistrictCalc.stateAbbr]?.shrunk ?? 1).toFixed(2)}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Elasticity β* (state)
              </div>
            </div>
            <div>
              <div className="text-xl font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{selectedDistrictCalc.races.length}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--app-text-very-muted)" }}>
                Races Loaded
              </div>
            </div>
          </div>

          {!selectedDistrictCalc.races.some((r) => r.raceType === "H") && (
            <div className="mt-3 text-xs" style={{ color: "var(--app-text-very-muted)" }}>
              This district was redrawn for {selectedDistrictCalc.eraStart} — no House results exist on its current boundaries yet, so the lean is presidential-only until new-map races are held.
            </div>
          )}
        </div>
      </div>

      {/* ── Step 1: Per-race table ── */}
      <div className="mb-7">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          Step 1 — Per-Race Calculations
        </h3>
        <p className="text-xs mb-3 leading-4" style={{ color: "var(--app-text-muted)" }}>
          NM = Raw + IF pts + FF pts + ENV pts — the same strips as the state model, using the parent state&apos;s β*. Ineligible House races are skipped (the presidential rows already carry the district&apos;s lean).
        </p>
        <div className="mb-3" style={{ borderBottom: "1px solid var(--app-border)" }} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-xs" style={{ display: "block" }}>
            <thead className="block" style={{ background: "var(--app-bg)", boxShadow: "inset 0 -2px 0 var(--app-text-primary)" }}>
              <tr className={districtTableGridColumns}>
                {[
                  ["Race", "Race type and name"],
                  ["Year", "Election year"],
                  ["Raw", "Raw margin = repPct − demPct (two-party for presidential rows)"],
                  ["Incumbent", "Incumbent party, House rows only"],
                  ["IF ↗", "Additive incumbency points — House rows only"],
                  ["FF ↗", "Fundraising strip from FEC receipts — House rows only"],
                  ["ENV ↗", "Environment adjustment = −β*(state) × E(year)"],
                  ["NM ↗", "Neutralized Margin = Raw + IF + FF + ENV"],
                  ["Wt", "Aggregation weight: Huber factor vs the district's own aggregate"],
                ].map(([label, tip]) => {
                  const isClickable = label in FORMULA_PANELS;
                  return (
                    <th
                      key={label}
                      title={tip}
                      className={`px-1.5 py-2 text-left text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap ${isClickable ? "cursor-pointer select-none" : ""}`}
                      style={{ color: "var(--app-text-muted)" }}
                      onClick={isClickable ? () => setFormulaOpen(label) : undefined}
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="block">
              {selectedDistrictCalc.races.map((r, i) => (
                <tr key={`${r.race}-${r.year}-${i}`} className={`${districtTableGridColumns} h-9`} style={{ borderBottom: "1px solid var(--app-border)" }}>
                  <td className="px-1.5 py-2 whitespace-nowrap font-semibold overflow-hidden text-ellipsis" style={{ color: "var(--app-text-primary)" }}>
                    <span className="mr-1.5 px-1 py-0.5 rounded text-[9px] font-bold font-mono" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)" }}>{r.raceType}</span>
                    {r.race}
                  </td>
                  <td className="px-1.5 py-2 tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.year}</td>
                  <td className="px-1.5 py-2 text-left tabular-nums font-semibold" style={{ color: marginColor(r.rawMargin) }}>{fmtMargin(r.rawMargin)}</td>
                  <td className="px-1.5 py-2 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>
                    {r.raceType === "P" ? "-" : r.incumbent === "R" && r.rawMargin != null ? (r.rawMargin > 0 ? "R won" : "R lost") : r.incumbent === "D" && r.rawMargin != null ? (r.rawMargin < 0 ? "D won" : "D lost") : r.incumbent}
                  </td>
                  <td className="px-1.5 py-2 text-left tabular-nums font-semibold" style={{ color: r.incumbencyPts != null && r.incumbencyPts !== 0 ? marginColor(r.incumbencyPts) : "var(--app-text-very-muted)" }}>
                    {r.incumbencyPts != null && r.incumbencyPts !== 0 ? (r.incumbencyPts > 0 ? "+" : "") + r.incumbencyPts.toFixed(0) : "—"}
                  </td>
                  <td className="px-1.5 py-2 text-left tabular-nums font-mono" style={{ color: r.FF_pts != null && r.FF_pts !== 0 ? marginColor(r.FF_pts) : "var(--app-text-very-muted)" }}>
                    {r.FF_pts != null && r.FF_pts !== 0 ? (r.FF_pts > 0 ? "+" : "") + r.FF_pts.toFixed(2) : "—"}
                  </td>
                  <td className="px-1.5 py-2 text-left tabular-nums font-mono" style={{ color: "var(--app-text-muted)" }}>
                    {r.envPts != null && r.envPts !== 0 ? (r.envPts > 0 ? "+" : "") + r.envPts.toFixed(2) : "—"}
                  </td>
                  <td className="px-1.5 py-2 text-left tabular-nums font-bold" style={{ color: marginColor(r.NM), background: marginBg(r.NM) }}>{fmtMargin(r.NM)}</td>
                  <td className="px-1.5 py-2 text-left tabular-nums font-mono" style={{ color: r.aggWeight < 0.995 ? "var(--app-text-primary)" : "var(--app-text-very-muted)" }}>
                    {r.aggWeight >= 0.995 ? "1.0" : r.aggWeight.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Step 2: Year aggregation ── */}
      <div className="mb-7">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          Step 2 — Year-Level Aggregation
        </h3>
        <p className="text-xs mb-3 leading-4" style={{ color: "var(--app-text-muted)" }}>
          Type weights (P {G.RACE_TYPE_WEIGHTS.P} · H {G.RACE_TYPE_WEIGHTS.H}) redistributed among types present; year weight = recency decay × coverage.
        </p>
        <div className="flex flex-wrap gap-x-8 gap-y-4 mb-2" style={{ borderTop: "1px solid var(--app-border)", paddingTop: "1.1rem" }}>
          {selectedDistrictCalc.yearAggregations.filter((a) => a.racesPresent.length > 0).slice().reverse().map((agg, i, arr) => (
            <div key={agg.year} className={i < arr.length - 1 ? "pr-8" : undefined} style={i < arr.length - 1 ? { borderRight: "1px solid var(--app-border)" } : undefined}>
              <div className="text-xs font-bold" style={{ color: "var(--app-text-muted)" }}>{agg.year}</div>
              <div className="tabular-nums" style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 700, marginTop: "0.2rem", color: marginColor(agg.WRS) }}>
                {fmtMargin(agg.WRS)}
              </div>
              <div className="text-[10px] mt-1.5" style={{ color: "var(--app-text-very-muted)" }}>{(agg.finalWeight * 100).toFixed(0)}% of TPL</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Step 3: Final ── */}
      <div className="mb-7">
        <h3 className="text-sm font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--app-text-muted)" }}>
          Step 3 — District TPL
        </h3>
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}>
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--app-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--app-text-very-muted)" }}>Formula</p>
            <div className="rounded-lg px-4 py-3 font-mono text-xs leading-relaxed" style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}>
              <div style={{ color: "var(--app-text-muted)" }}>District TPL =</div>
              {selectedDistrictCalc.yearAggregations.filter((a) => a.racesPresent.length > 0).map((agg, i) => (
                <div key={agg.year} className="ml-4">
                  <span style={{ color: "var(--app-text-very-muted)" }}>{i === 0 ? "  " : "+ "}</span>
                  <span style={{ color: "var(--app-text-primary)" }}>{agg.finalWeight.toFixed(2)}</span>
                  <span style={{ color: "var(--app-text-very-muted)" }}> × </span>
                  <span style={{ color: marginColor(agg.WRS) }}>{fmtMargin(agg.WRS)}</span>
                  <span style={{ color: "var(--app-text-very-muted)" }}> ({agg.year})</span>
                </div>
              ))}
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
                <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>Same scale as State TPL: </span>
                Districts now share the state pipeline — additive IF/FF strips, the fitted environment E(y) with the parent state&apos;s β*, calibrated decay and Huber weighting — so House forecasts and Senate/Governor forecasts read off one consistent lean scale.
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
      {/* ── WAR ── */}
      {activeSubTab === "war" && (
        <div className="flex flex-col gap-4 pt-2">
          {renderSubTabRow()}
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--app-text-primary)" }}>Wins Above Replacement</h2>
            <p className="text-xs mt-1 max-w-3xl leading-5" style={{ color: "var(--app-text-muted)" }}>
              How much better (or worse) each candidate ran than a generic nominee of their party. Each race yields one residual
              (actual − expected margin, where expected = lean + β* × E(year) + incumbency + structural money), which is the net of the two
              candidates&apos; individual effects. Those effects are separated by ridge regression across every race a candidate has run
              (2016–2025, pooled across offices), estimated as of the race&apos;s year: the race itself carries full weight and the
              candidate&apos;s other races fade by 0.8 per year of distance (a race 4 years away counts 0.41). A candidate&apos;s Effect is that
              recency-weighted persistent part, and WAR = Effect + half of the race&apos;s unexplained leftover, so the two candidates&apos; WARs
              always sum to the residual without mirroring each other. Senate, Governor
              and President races score against the state&apos;s Huber-fitted lean; House races against their district&apos;s TPL; unopposed-class
              races (Osborn, McMullin) against their imputed presidential baseline.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select aria-label="Filter by race" value={warOffice} onChange={(e) => setWarOffice(e.target.value as typeof warOffice)}
              className="font-bold px-2.5 py-1 rounded-full cursor-pointer" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "none" }}>
              {(["All", "P", "S", "G", "H"] as const).map((o) => <option key={o} value={o}>{o === "All" ? "All Offices" : { P: "President", S: "Senate", G: "Governor", H: "House" }[o]}</option>)}
            </select>
            <select aria-label="Filter by party" value={warParty} onChange={(e) => setWarParty(e.target.value as typeof warParty)}
              className="font-bold px-2.5 py-1 rounded-full cursor-pointer" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "none" }}>
              {(["All", "D", "R", "I"] as const).map((o) => <option key={o} value={o}>{o === "All" ? "All Parties" : o}</option>)}
            </select>
            <select aria-label="Filter by year" value={String(warYear)} onChange={(e) => setWarYear(e.target.value === "All" ? "All" : Number(e.target.value))}
              className="font-bold px-2.5 py-1 rounded-full cursor-pointer" style={{ background: "var(--app-tab-bg)", color: "var(--app-text-muted)", border: "none" }}>
              <option value="All">All Years</option>
              {[2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              aria-label="Sort performances"
              value={warDir}
              onChange={(e) => setWarDir(e.target.value as typeof warDir)}
              className="font-bold px-2.5 py-1 rounded-full cursor-pointer"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "none" }}
            >
              <option value="top">▲ Overperformers</option>
              <option value="bottom">▼ Underperformers</option>
              <option value="race">Race (newest year first)</option>
            </select>
            <input
              value={warQuery}
              onChange={(e) => setWarQuery(e.target.value)}
              aria-label="Search performances"
              placeholder="Search year, state, race, candidate…"
              className="px-2.5 py-1 rounded-full text-xs"
              style={{ background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "none", minWidth: "14rem" }}
            />
            <span style={{ color: "var(--app-text-very-muted)" }}>
              {filteredWarRows.length.toLocaleString()} candidate-performances{filteredWarRows.length > warDisplayLimit ? ` · showing ${warDisplayLimit}` : ""}
            </span>
          </div>

          <div className="overflow-x-auto" style={{ borderTop: "2px solid var(--app-text-primary)" }}>
            <table className="w-full min-w-[920px] text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                  {["#", "Candidate", "Party", "Race", "Year", "Actual", "Expected", "Residual", "Effect", "WAR"].map((h) => (
                    <th key={h} className="px-2 py-2 text-left text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap" style={{ color: h === "WAR" ? "var(--app-text-primary)" : "var(--app-text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredWarRows.slice(0, warDisplayLimit).map((r, i) => {
                  const partyColor = r.party === "R" ? "var(--party-rep)" : r.party === "D" ? "var(--party-dem)" : "var(--app-text-primary)";
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--app-border)", background: i % 2 === 1 ? "var(--app-bg)" : "transparent" }}>
                      <td className="px-2 py-2 tabular-nums" style={{ color: "var(--app-text-very-muted)" }}>{i + 1}</td>
                      <td className="px-2 py-2 font-semibold whitespace-nowrap" style={{ color: "var(--app-text-primary)" }}>{r.candidate}</td>
                      <td className="px-2 py-2 font-bold" style={{ color: partyColor }}>{r.party}</td>
                      <td className="px-2 py-2 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{r.race} · {r.state}</td>
                      <td className="px-2 py-2 tabular-nums" style={{ color: "var(--app-text-muted)" }}>{r.year}</td>
                      <td className="px-2 py-2 tabular-nums font-semibold" style={{ color: marginColor(r.actual) }}>{fmtMargin(r.actual)}</td>
                      <td className="px-2 py-2 tabular-nums" style={{ color: marginColor(r.expected) }} title={`Structural money gap ${r.structuralGapPct >= 0 ? "R" : "D"}+${Math.abs(r.structuralGapPct).toFixed(0)}% → ${r.ffStructuralPts >= 0 ? "R" : "D"}+${Math.abs(r.ffStructuralPts).toFixed(2)} pts in Expected · actual gap ${r.moneyGapPct == null ? "unknown" : `${r.moneyGapPct >= 0 ? "R" : "D"}+${Math.abs(r.moneyGapPct).toFixed(0)}%`}`}>{fmtMargin(r.expected)}</td>
                      <td className="px-2 py-2 tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                        {r.residual >= 0 ? "+" : "−"}{Math.abs(r.residual).toFixed(1)}
                      </td>
                      <td className="px-2 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--app-text-muted)" }} title={`Effect as of ${r.year}, estimated from ${r.effectN} race${r.effectN === 1 ? "" : "s"} (${r.effectW.toFixed(2)} effective after recency weighting)`}>
                        {r.effect >= 0 ? "+" : "−"}{Math.abs(r.effect).toFixed(1)}
                        <span className="ml-1 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>n={r.effectN}</span>
                      </td>
                      <td className="px-2 py-2 tabular-nums font-bold" style={{ color: r.war > 0 ? APPROVE_COLOR : r.war < 0 ? DISAPPROVE_COLOR : "var(--app-text-primary)" }}>
                        {r.war >= 0 ? "+" : "−"}{Math.abs(r.war).toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
                {filteredWarRows.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-6 text-center" style={{ color: "var(--app-text-very-muted)" }}>No performances match the filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-[10px]" style={{ color: "var(--app-text-very-muted)" }}>
            <span>All three columns are signed toward the candidate: +5 = 5 pts better than a generic nominee of their party.</span>
            <span>Residual is the race&apos;s net result, so the two candidates&apos; residuals are mirror images; Effect and WAR are not.</span>
            <span>A one-race candidate (n=1) facing another one-race candidate gets exactly half the residual — with no other race to compare, the split is even. Track records before 2016 are not in the window.</span>
            <span>Effect is as of the race&apos;s year: the same candidate can carry a different Effect in each race, because their other races are weighted by recency (0.8 per year of distance).</span>
            <span>Money: only the structural part of the fundraising gap — what a generic pair would have given incumbency and the race&apos;s expected margin — is in Expected. Money a candidate raised beyond their situation stays in their WAR. Hover Expected for the split.</span>
            <span>House WAR uses the district&apos;s TPL as baseline, which the candidate&apos;s own races feed — large House WARs are slightly understated.</span>
            <span>Where FEC receipts are known, WAR reads as quality beyond fundraising.</span>
            <span>State Legislature races carry no candidate and are excluded.</span>
          </div>
        </div>
      )}

      {formulaOpen === "BETA" && (() => {
        const b = tplFit.beta[selectedAbbr];
        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
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
                  <span className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>Elasticity β* — {selectedStateName}</span>
                  <span className="ml-2 text-xs font-mono" style={{ color: "var(--app-text-muted)" }}>= {beta.toFixed(2)}</span>
                </div>
                <button onClick={() => setFormulaOpen(null)} className="text-lg leading-none" style={{ color: "var(--app-text-muted)" }}>×</button>
              </div>
              <div className="px-5 py-3 text-xs" style={{ borderBottom: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                <div>
                  <span className="font-mono" style={{ color: "var(--app-text-primary)" }}>β* = clamp(1 + 0.5 × (β̂ − 1), 0.5, 1.6)</span>
                </div>
                <div className="mt-1.5">
                  β̂ = <span className="font-mono" style={{ color: "var(--app-text-primary)" }}>{b ? b.raw.toFixed(2) : "—"}</span>, fit from{" "}
                  <span className="font-mono" style={{ color: "var(--app-text-primary)" }}>{b?.n ?? 0}</span> eligible races across every office and year,
                  jointly with the state&apos;s lean and each year&apos;s national environment E (Huber-weighted so crossover outliers don&apos;t drag the fit).
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "var(--app-bg)", borderBottom: "1px solid var(--app-border)" }}>
                    {["Year", "Fitted E", `${selectedAbbr} strip (−β* × E)`].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--app-text-very-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tplFit.years.map((y) => {
                    const e = tplFit.E[y] ?? 0;
                    const strip = -(beta * e);
                    return (
                      <tr key={y} style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td className="px-4 py-2 font-mono tabular-nums" style={{ color: "var(--app-text-muted)" }}>{y}</td>
                        <td className="px-4 py-2 tabular-nums font-semibold" style={{ color: marginColor(e) }}>{fmtMargin(e)}</td>
                        <td className="px-4 py-2 tabular-nums font-mono" style={{ color: "var(--app-text-primary)" }}>{strip > 0 ? "+" : ""}{strip.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── Formula modal ── */}
      {/* Race calculation — the former "Race Detail" tab, now a popup over the one table. */}
      {detailRaceIdx != null && (() => {
        const r = filteredRaces[detailRaceIdx];
        if (!r) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setDetailRaceIdx(null)}
          >
            <div
              className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl"
              style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={`${r.race} ${r.year} calculation`}
            >
              <div className="px-5 py-4">
                <button
                  onClick={() => setDetailRaceIdx(null)}
                  aria-label="Close"
                  className="float-right -mt-0.5 ml-3 text-lg leading-none"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  ×
                </button>
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
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <th className="px-1.5 py-2 text-[10px] uppercase tracking-wide font-semibold text-left" style={{ color: "var(--app-text-muted)" }}>Step</th>
                      <th className="px-1.5 py-2 text-[10px] uppercase tracking-wide font-semibold text-left" style={{ color: "var(--app-text-muted)" }}>Detail</th>
                      <th className="px-1.5 py-2 text-[10px] uppercase tracking-wide font-semibold text-right" style={{ color: "var(--app-text-muted)" }}>Factor</th>
                      <th className="px-1.5 py-2 text-[10px] uppercase tracking-wide font-semibold text-right" style={{ color: "var(--app-text-muted)" }}>Contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <td className="px-1.5 py-2 font-semibold" style={{ color: "var(--app-text-primary)" }}>Raw Margin</td>
                      <td className="px-1.5 py-2" style={{ color: "var(--app-text-muted)" }}>repPct − demPct, live from site data</td>
                      <td className="px-1.5 py-2 text-right" style={{ color: "var(--app-text-very-muted)" }}>—</td>
                      <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: marginColor(r.rawMargin) }}>{fmtMargin(r.rawMargin)}</td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <td
                        className={r.imputed ? "px-1.5 py-2 font-semibold cursor-pointer select-none" : "px-1.5 py-2 font-semibold"}
                        style={{ color: "var(--app-text-primary)" }}
                        onClick={r.imputed ? () => setAdjustedPopupIdx(detailRaceIdx) : undefined}
                      >
                        Adjusted{r.imputed && <span className="ml-1 opacity-50">ⓘ</span>}
                      </td>
                      <td className="px-1.5 py-2" style={{ color: "var(--app-text-muted)" }}>
                        {r.imputed
                          ? `⊘ ${ELIGIBILITY_LABELS[r.eligibility as keyof typeof ELIGIBILITY_LABELS] ?? "Ineligible race"} — imputed from ${r.imputedSourceDesc} (${r.imputedSourceYear})`
                          : "Unchanged — eligible race (both major parties on the ballot)"}
                      </td>
                      <td className="px-1.5 py-2 text-right" style={{ color: "var(--app-text-very-muted)" }}>—</td>
                      <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: marginColor(r.adjustedMargin) }}>{fmtMargin(r.adjustedMargin)}</td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <td
                        className="px-1.5 py-2 font-semibold cursor-pointer select-none"
                        style={{ color: "var(--app-text-primary)" }}
                        onClick={() => setFormulaOpen("IF ↗")}
                      >
                        Incumbency<span className="ml-1 opacity-50">ⓘ</span>
                      </td>
                      <td className="px-1.5 py-2" style={{ color: "var(--app-text-muted)" }}>
                        {r.imputed
                          ? "Imputed row — no incumbency to strip"
                          : r.incumbent === "R" || r.incumbent === "D"
                          ? `${r.incumbent} incumbent — ${(incumbentAdvantage()[r.raceType] ?? 0).toFixed(1)} pts stripped toward ${r.incumbent === "R" ? "D" : "R"}`
                          : r.raceType === "P"
                          ? "President — national approval effects live in E(y)"
                          : r.raceType === "L"
                          ? "Chamber aggregate — no single incumbent"
                          : "Open seat — no adjustment"}
                      </td>
                      <td className="px-1.5 py-2 text-right" style={{ color: "var(--app-text-very-muted)" }}>—</td>
                      <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: r.incumbencyPts != null && r.incumbencyPts !== 0 ? marginColor(r.incumbencyPts) : "var(--app-text-very-muted)" }}>
                        {r.incumbencyPts != null && r.incumbencyPts !== 0 ? (r.incumbencyPts > 0 ? "+" : "") + r.incumbencyPts.toFixed(0) : "—"}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--app-border)" }}>
                      <td
                        className="px-1.5 py-2 font-semibold cursor-pointer select-none"
                        style={{ color: "var(--app-text-primary)" }}
                        onClick={() => setFormulaOpen("FF ↗")}
                      >
                        Fundraising<span className="ml-1 opacity-50">ⓘ</span>
                      </td>
                      <td className="px-1.5 py-2" style={{ color: "var(--app-text-muted)" }}>
                        {r.ffDetail
                          ? `R $${(r.ffDetail.rep / 1e6).toFixed(2)}M vs D $${(r.ffDetail.dem / 1e6).toFixed(2)}M raised`
                          : "No receipts data (President, imputed, or pending)"}
                      </td>
                      <td className="px-1.5 py-2 text-right" style={{ color: "var(--app-text-very-muted)" }}>—</td>
                      <td className="px-1.5 py-2 text-right tabular-nums font-semibold" style={{ color: r.FF_pts != null && r.FF_pts !== 0 ? marginColor(r.FF_pts) : "var(--app-text-very-muted)" }}>
                        {r.FF_pts != null && r.FF_pts !== 0 ? (r.FF_pts > 0 ? "+" : "") + r.FF_pts.toFixed(2) : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td
                        className="px-1.5 py-2 font-semibold cursor-pointer select-none"
                        style={{ color: "var(--app-text-primary)" }}
                        onClick={() => setFormulaOpen("ENV ↗")}
                      >
                        Environment<span className="ml-1 opacity-50">ⓘ</span>
                      </td>
                      <td className="px-1.5 py-2" style={{ color: "var(--app-text-muted)" }}>
                        {(() => {
                          const envYear = r.imputed ? r.imputedSourceYear ?? r.year : r.year;
                          const e = tplFit.E[envYear] ?? 0;
                          return `−β* ${beta.toFixed(2)} × E(${envYear}) ${e >= 0 ? "R" : "D"}+${Math.abs(e).toFixed(1)}${r.imputed ? " (source year)" : ""}`;
                        })()}
                      </td>
                      <td className="px-1.5 py-2 text-right" style={{ color: "var(--app-text-very-muted)" }}>—</td>
                      <td className="px-1.5 py-2 text-right tabular-nums font-mono" style={{ color: "var(--app-text-muted)" }}>
                        {r.envPts != null && r.envPts !== 0 ? (r.envPts > 0 ? "+" : "") + r.envPts.toFixed(2) : "—"}
                      </td>
                    </tr>
                    <tr style={{ borderTop: "2px solid var(--app-text-primary)" }}>
                      <td colSpan={3} className="px-1.5 py-2.5 font-bold" style={{ color: "var(--app-text-primary)" }}>Neutralized Margin</td>
                      <td className="px-1.5 py-2.5 text-right tabular-nums font-bold" style={{ color: marginColor(r.NM), background: marginBg(r.NM) }}>{fmtMargin(r.NM)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {adjustedPopupIdx != null && (() => {
        const r = filteredRaces[adjustedPopupIdx];
        if (!r) return null;
        const raw = r.rawMargin;
        const adj = r.adjustedMargin;

        const mc = (v: number | null) => (
          <span style={{ color: marginColor(v) }}>{fmtMargin(v)}</span>
        );

        const rows: { label: string; value: React.ReactNode; note?: string }[] = [
          {
            label: "Stored Margin (not used)",
            value: mc(raw),
            note: "The as-reported result of the ineligible race — shown for reference only.",
          },
          {
            label: "Why ineligible",
            value: ELIGIBILITY_LABELS[r.eligibility as keyof typeof ELIGIBILITY_LABELS] ?? "Ineligible race",
            note: "Without a genuine nominee from each major party, the margin is not an R-vs-D measurement.",
          },
          {
            label: `Imputed from ${r.imputedSourceDesc ?? "presidential baseline"}${r.imputedSourceYear ? ` (${r.imputedSourceYear})` : ""}`,
            value: mc(adj),
            note: r.raceType === "H" ? "Restricted to the district's current boundary vintage." : undefined,
          },
          {
            label: "Downstream treatment",
            value: "IF / CQ / FF / WA skipped — NM = imputed lean · half weight in aggregation",
          },
        ];

        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
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

      {formulaOpen && formulaOpen !== "BETA" && FORMULA_PANELS[formulaOpen] && (() => {
        const panel = FORMULA_PANELS[formulaOpen];
        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
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
