"use client";

import { memo, useMemo, useState } from "react";
import { ComposableMap, Geography } from "react-simple-maps";
import Geographies from "@/components/maps/Geographies";
import { FlipPatternDefs, flipFill } from "@/components/FlipStripes";
import { DARK_THEME, LIGHT_THEME, type Theme } from "@/components/ForecastMap";
import { useDarkMode } from "@/lib/useDarkMode";
import { getRaceColor } from "@/lib/colorScale";
import { isCongressionalDistrictGeoid } from "@/lib/congressionalDistricts";
import { fmtInt, marginSideColor, partyColor, fmtCall, callSideColor } from "@/lib/resultsFormat";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { lastName } from "@/lib/personName";
import type { ResultsRow } from "@/components/results/ResultsPage";
import type { ResultsOffice } from "@/lib/resultsTypes";

// The national results map: states (Senate, governor) or districts (House) grey until votes are
// in, then painted by the margin — the counted margin or the needle's projected one. A called
// flip is hatched. Drawn from the pre-projected files ForecastMap uses (same frame).

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const HOUSE_URL = "/congressional-districts-2026-lite.json";
const HOUSE_LINES_URL = "/congressional-districts-2026-lite-state-lines.json";

/** status: called races in the party's Safe colour, races still counting in the leader's Likely
 *  colour (the convention of results maps); current: the counted margin on the rating scale;
 *  projected: the needle's margin on the same scale. */
export type MapMode = "status" | "current" | "projected";

/** The fill for a race on the map, before any flip hatching; null with nothing counted. */
function fillFor(row: ResultsRow, mode: MapMode): string | null {
  const { prior, live, proj } = row;
  if (!live || live.total <= 0) return null;
  if (mode === "status") {
    if (proj.locked && proj.winner) return getRaceColor(proj.winner === prior.dem.party && proj.winner !== prior.rep.party ? -20 : proj.winner === prior.rep.party ? 20 : proj.winner === "D" ? -20 : 20);
    return proj.currentMargin == null ? null : getRaceColor(proj.currentMargin > 0 ? 10 : -10);
  }
  const m = mode === "current" ? proj.currentMargin : proj.margin;
  return m == null ? null : getRaceColor(m);
}

const isCalledFlip = (row: ResultsRow) => row.proj.locked && !!row.proj.winner && !!row.prior.seatParty && row.proj.winner !== row.prior.seatParty;
type GeoFeature = { rsmKey: string; properties?: Record<string, unknown> };

// Same frame and theme as ForecastMap: borders are gaps in the page background, as on every national map.
const Layer = memo(function Layer({ geographies, office, rows, mode, selected, t, onHover, onSelect }: {
  geographies: GeoFeature[]; office: ResultsOffice; rows: ResultsRow[]; mode: MapMode; selected: string | null; t: Theme;
  onHover: (row: ResultsRow | null) => void; onSelect: (row: ResultsRow) => void;
}) {
  const isHouse = office === "house";
  const byId = useMemo(() => new Map(rows.map((r) => [r.prior.id, r])), [rows]);
  const byState = useMemo(() => new Map(rows.map((r) => [r.prior.stateName, r])), [rows]);
  const find = (geo: GeoFeature): ResultsRow | undefined => {
    if (isHouse) {
      const g = geo.properties?.GEOID as string | undefined;
      if (!g) return undefined;
      return byId.get(g) ?? (g.endsWith("00") ? byId.get(g.slice(0, -2) + "01") : undefined);
    }
    return byState.get((geo.properties?.name as string) ?? "");
  };
  return (
    <>
      {geographies.map((geo) => {
        if (isHouse && !isCongressionalDistrictGeoid(geo.properties?.GEOID as string | undefined)) return null;
        const row = find(geo);
        const base = row ? fillFor(row, mode) ?? t.mapUnfilled : t.noElection;
        const flipped = !!row && isCalledFlip(row);
        const fill = flipped ? flipFill(base) : base;
        const isSel = !!row && selected === `${row.prior.office}-${row.prior.id}`;
        return (
          <Geography key={geo.rsmKey} geography={geo}
            onMouseEnter={() => onHover(row ?? null)}
            onMouseLeave={() => onHover(null)}
            onClick={() => row && onSelect(row)}
            style={{
              default: { fill, stroke: isSel ? t.hoverStroke : t.mapStroke, strokeWidth: isSel ? (isHouse ? 2 : 3.5) : isHouse ? 0.4 : 1.0, outline: "none" },
              hover: { fill, stroke: t.hoverStroke, strokeWidth: isHouse ? 0.7 : 1.5, outline: "none", cursor: row ? "pointer" : "default" },
              pressed: { fill, stroke: t.hoverStroke, strokeWidth: isHouse ? 2 : 3.5, outline: "none" },
            }} />
        );
      })}
    </>
  );
});

export default function ResultsMap({ office, rows, mode, selected, onSelect }: { office: ResultsOffice; rows: ResultsRow[]; mode: MapMode; selected: string | null; onSelect: (row: ResultsRow) => void }) {
  const [hover, setHover] = useState<ResultsRow | null>(null);
  const tip = useMapTooltip(16, 8);
  const t = useDarkMode() ? DARK_THEME : LIGHT_THEME;
  const flipColors = useMemo(() => Array.from(new Set(rows.filter(isCalledFlip).map((r) => fillFor(r, mode)).filter((c): c is string => !!c))), [rows, mode]);
  const isHouse = office === "house";
  return (
    <div className="relative" onMouseMove={tip.onMouseMove}>
      <div className="h-[300px] sm:h-[440px]">
        <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1200 }} width={960} height={600} style={{ width: "100%", height: "100%" }}>
          <FlipPatternDefs colors={flipColors} />
          <Geographies geography={isHouse ? HOUSE_URL : STATES_URL}>
            {({ geographies }: { geographies: GeoFeature[] }) => <Layer geographies={geographies} office={office} rows={rows} mode={mode} selected={selected} t={t} onHover={setHover} onSelect={onSelect} />}
          </Geographies>
          {isHouse && (
            <Geographies geography={HOUSE_LINES_URL}>
              {({ geographies }: { geographies: GeoFeature[] }) => geographies.map((geo) => (
                <Geography key={geo.rsmKey} geography={geo} style={{ default: { fill: "none", stroke: t.mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" }, hover: { fill: "none", stroke: t.mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" }, pressed: { fill: "none", stroke: t.mapStroke, strokeWidth: 1.5, outline: "none", pointerEvents: "none" } }} />
              ))}
            </Geographies>
          )}
        </ComposableMap>
      </div>
      <MapLegend mode={mode} office={office} t={t} />
      {hover && <ResultTooltip row={hover} boxRef={tip.tooltipRef} />}
    </div>
  );
}

// The hover box: the site's map tooltip chrome and type (components/CountyTooltip's box, name
// line, serif headline and small-caps labels) around the race's counted margin, votes and feed
// reporting, its projected margin with sigma, and the forecast.
const tipLabel = "text-[10px] font-semibold uppercase tracking-[0.06em]";

function ResultTooltip({ row, boxRef }: { row: ResultsRow; boxRef: (node: HTMLDivElement | null) => void }) {
  const { prior, live, proj } = row;
  const office = prior.office === "house" ? "House" : prior.office === "senate" ? `Senate${prior.special ? " special" : ""}` : "Governor";
  const title = prior.office === "house" ? prior.label : `${prior.stateName} · ${office}`;
  const hasVotes = !!live && live.total > 0;
  const box = { width: hasVotes ? 244 : 228, padding: "10px 12px", background: "var(--app-panel)", border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)", color: "var(--app-text-primary)" };
  const muted = { color: "var(--app-text-muted)" }, veryMuted = { color: "var(--app-text-very-muted)" };
  const head = (
    <div className="flex items-baseline justify-between gap-2">
      <div className="min-w-0 truncate text-[10.5px] font-bold uppercase tracking-[0.07em]">{title}</div>
      {proj.locked && proj.winner && <span className={tipLabel} style={{ color: marginSideColor(proj.winner === "R" ? 1 : -1) }}>Called</span>}
    </div>
  );
  if (!hasVotes || !live) {
    return (
      <div ref={boxRef} className="pointer-events-none absolute z-20 hidden rounded-lg md:block" style={box}>
        {head}
        <div className="mt-px text-[10px]" style={veryMuted}>No votes in</div>
        <div className="mt-2 flex items-baseline justify-between border-t pt-2 text-[12px] tabular-nums" style={{ borderColor: "var(--app-border)" }}>
          <span className={tipLabel} style={muted}>Forecast</span>
          <span style={{ color: callSideColor(prior.forecast.margin, prior) }}>{fmtCall(prior.forecast.margin, prior)} <span style={veryMuted}>· {prior.forecast.rating}</span></span>
        </div>
      </div>
    );
  }
  const PARTY_ABBR: Record<string, string> = { D: "Dem.", R: "Rep.", I: "Ind." };
  const leader = live.dem >= live.rep ? prior.dem.party : prior.rep.party;
  const rows = [
    { key: "d", name: prior.dem.name, party: prior.dem.party as string | null, inc: prior.dem.incumbent, votes: live.dem },
    { key: "r", name: prior.rep.name, party: prior.rep.party as string | null, inc: prior.rep.incumbent, votes: live.rep },
    ...(live.oth > 0 ? [{ key: "o", name: "Other", party: null, inc: false, votes: live.oth }] : []),
  ].sort((x, y) => (x.party && y.party ? y.votes - x.votes : x.party ? -1 : 1));
  const anyInc = rows.some((r) => r.inc);
  // Last names only, so the name column sizes to its content and the box stays narrow.
  const grid = { gridTemplateColumns: "minmax(0,1fr) auto auto 3.2em" };
  const fig = (label: string, value: React.ReactNode) => (
    <div className="min-w-0 last:text-right">
      <div className={tipLabel} style={muted}>{label}</div>
      <div className="mt-0.5 text-[13px] font-bold tabular-nums">{value}</div>
    </div>
  );
  return (
    <div ref={boxRef} className="pointer-events-none absolute z-20 hidden rounded-lg md:block" style={box}>
      {head}
      <div className={`mt-2 grid gap-x-2 pb-1 ${tipLabel}`} style={{ ...grid, ...muted, borderBottom: "1px solid var(--app-border)" }}>
        <span>Candidate</span><span>Party</span><span className="text-right">Votes</span><span className="text-right">Pct</span>
      </div>
      {rows.map((r) => {
        const color = r.party ? partyColor(r.party as "D" | "R" | "I") : "var(--app-text-very-muted)";
        const won = !!proj.locked && !!proj.winner && r.party === proj.winner && r.key !== "o";
        const lead = !proj.locked && r.party === leader && r.key !== "o";
        const text = won ? "#ffffff" : undefined;
        return (
          <div key={r.key} className="-mx-1.5 mt-[3px] grid items-baseline gap-x-2 rounded px-1.5 py-[3px] text-[12px] tabular-nums"
            style={{ ...grid, background: won ? color : lead ? `color-mix(in srgb, ${color} 12%, transparent)` : undefined }}>
            <span className="truncate" style={{ color: text ?? color, fontWeight: r.party ? (won ? 700 : 600) : 500 }}>{r.party ? lastName(r.name) : r.name}{r.inc ? "*" : ""}{won ? " ✓" : ""}</span>
            <span className="text-[11px]" style={text ? { color: text, opacity: 0.85 } : veryMuted}>{r.party ? PARTY_ABBR[r.party] ?? r.party : ""}</span>
            <span className="text-right text-[11px]" style={text ? { color: text, opacity: 0.9 } : veryMuted}>{fmtInt(r.votes)}</span>
            <span className="text-right" style={{ color: text ?? color, fontWeight: r.party ? 700 : 500 }}>{((r.votes / live.total) * 100).toFixed(1)}%</span>
          </div>
        );
      })}
      <div className="mt-2 flex justify-between gap-2 border-t pt-2" style={{ borderColor: "var(--app-border)" }}>
        {fig("Margin", <span style={{ color: callSideColor(proj.currentMargin, prior) }}>{fmtCall(proj.currentMargin, prior)}</span>)}
        {fig("Projected", <><span style={{ color: callSideColor(proj.margin, prior) }}>{fmtCall(proj.margin, prior)}</span><span className="text-[10px] font-normal" style={veryMuted}> ±{proj.sigma.toFixed(1)}</span></>)}
        {fig("Forecast", <span style={{ color: callSideColor(prior.forecast.margin, prior) }}>{fmtCall(prior.forecast.margin, prior)}</span>)}
      </div>
      <div className="mt-1.5 flex justify-between gap-2 text-[10px] tabular-nums" style={veryMuted}>
        <span>{Math.round(proj.countedShare * 100)}% of expected vote in · feed {Math.round(live.percentReporting)}%</span>
        {anyInc && <span>*Incumbent</span>}
      </div>
    </div>
  );
}

function MapLegend({ mode, office, t }: { mode: MapMode; office: ResultsOffice; t: Theme }) {
  const sw = (bg: string) => <i className="inline-block h-2.5 w-4" style={{ background: bg }} />;
  const item = (key: string, swatches: React.ReactNode, text: string) => <span key={key} className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--app-text-muted)" }}>{swatches}{text}</span>;
  const flip = item("flip", <i className="inline-block h-2.5 w-4" style={{ background: `repeating-linear-gradient(45deg, rgba(255,255,255,0.75) 0 1.5px, transparent 1.5px 4px), ${getRaceColor(-20)}` }} />, "Called flip");
  const none = item("none", sw(t.mapUnfilled), "No votes yet");
  const noRace = item("noRace", sw(t.noElection), "No election");
  const items = mode === "status"
    ? [item("lead", <>{sw(getRaceColor(-10))}{sw(getRaceColor(10))}</>, "Leading"), item("called", <>{sw(getRaceColor(-20))}{sw(getRaceColor(20))}</>, "Called"), flip, none, ...(office === "house" ? [] : [noRace])]
    : [...["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"].map((label, i) => item(label, sw(getRaceColor([-20, -10, -3, -0.5, 0.5, 3, 10, 20][i])), label.replace("Safe", "15+").replace("Likely", "5–15").replace("Lean", "1–5").replace("Tilt", "<1"))), flip, none, ...(office === "house" ? [] : [noRace])];
  return <div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>{items}</div>;
}
