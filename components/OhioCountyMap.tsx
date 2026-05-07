"use client";

import { useRef, useState, useEffect } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import type { GeoJsonProperties, Geometry } from "geojson";
import { getRaceColor } from "@/lib/colorScale";
import { ohioTreasurerByCounty, ohioTreasurerData } from "@/data/ohioTreasurerData";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";

const GEO_URL = "/ohio-counties.geojson";

type ViewMode = "current" | "projected";

type CountyFeature = {
  rsmKey: string;
  properties?: GeoJsonProperties & { NAME?: string };
  geometry?: Geometry;
};

interface HoveredCounty {
  name: string;
  // current
  winner: "Roegner" | "Edwards" | null;
  margin: number | null;
  voteTotal: number;
  reportingPct: number;
  // projected
  projectedMargin: number | null;
  projectedTotal: number | null;
}

const LEGEND = [
  { color: "#be1c29", label: "Safe Roegner (R+15+)" },
  { color: "#ff5864", label: "Likely Roegner (R+5–15)" },
  { color: "#ff8b98", label: "Lean Roegner (R+1–5)" },
  { color: "#cf8980", label: "Tilt Roegner (R+0–1)" },
  { color: "#959bb3", label: "Tilt Edwards (E+0–1)" },
  { color: "#8bafff", label: "Lean Edwards (E+1–5)" },
  { color: "#587ccc", label: "Likely Edwards (E+5–15)" },
  { color: "#1b408c", label: "Safe Edwards (E+15+)" },
];

// Projected margin formula:
// remaining fraction = 1 - reportingPct/100
// remaining votes have current margin shifted by biasInPP
// projectedMargin = margin + (1 - reportingPct/100) * biasInPP
function getProjectedMargin(margin: number, reportingPct: number, biasInPP: number): number {
  const remainingFrac = 1 - reportingPct / 100;
  return margin + remainingFrac * biasInPP;
}

export default function OhioCountyMap({
  darkMode,
  biasInPP,
}: {
  darkMode: boolean;
  biasInPP: number;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("current");
  const [hovered, setHovered] = useState<HoveredCounty | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [pinned, setPinned] = useState<{ county: HoveredCounty; pos: { x: number; y: number } } | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sync = () => {
      setIsMobile(
        window.matchMedia("(max-width: 767px)").matches &&
        window.matchMedia("(hover: none), (pointer: coarse)").matches
      );
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const tipW = 240;
  const tipH = 140;
  const offset = 16;
  const edgePad = 8;
  const mapHeight = isMobile ? 520 : "min(72vh, 520px)";

  const display = pinned?.county ?? hovered;
  const anchor  = pinned?.pos ?? mousePos;
  const legendHidden = isMobile && Boolean(display);

  let tipLeft = anchor.x + offset;
  let tipTop  = anchor.y + offset;
  if (tipLeft + tipW + edgePad > mapSize.w) tipLeft = anchor.x - tipW - offset;
  if (tipTop  + tipH + edgePad > mapSize.h) tipTop  = anchor.y - tipH - offset;
  if (tipLeft < edgePad) tipLeft = edgePad;
  if (tipTop  < edgePad) tipTop  = edgePad;

  function getCountyData(name: string): HoveredCounty | null {
    const r = ohioTreasurerByCounty[name];
    if (!r) return null;
    const projectedMargin = r.margin !== null
      ? getProjectedMargin(r.margin, r.reportingPct, biasInPP)
      : null;
    const projectedTotal = r.voteTotal > 0 && r.reportingPct > 0
      ? r.voteTotal / (r.reportingPct / 100)
      : null;
    return {
      name,
      winner: r.winner, margin: r.margin, voteTotal: r.voteTotal, reportingPct: r.reportingPct,
      projectedMargin, projectedTotal,
    };
  }

  // Recompute pinned data when biasInPP changes so projected tooltip stays fresh
  const display_ = display
    ? { ...display, ...(() => {
        const r = ohioTreasurerByCounty[display.name];
        if (!r || r.margin === null) return {};
        return {
          projectedMargin: getProjectedMargin(r.margin, r.reportingPct, biasInPP),
        };
      })() }
    : null;

  return (
    <>
      {/* View toggle */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>View</div>
        <div
          className="flex items-center gap-1 rounded-lg px-1 py-1"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-panel)" }}
        >
          {([
            { key: "current",   label: "Current Results" },
            { key: "projected", label: "Projected (100%)" },
          ] as { key: ViewMode; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              aria-pressed={viewMode === key}
              className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
              style={
                viewMode === key
                  ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                  : { color: "var(--app-text-muted)", border: "1px solid transparent" }
              }
            >
              {label}
            </button>
          ))}
        </div>
        {viewMode === "projected" && biasInPP !== 0 && (
          <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
            Remaining votes:{" "}
            <span style={{ color: biasInPP > 0 ? "var(--party-rep, #be1c29)" : "var(--party-dem, #1b408c)", fontWeight: 600 }}>
              {biasInPP > 0 ? "Roegner" : "Edwards"} +{Math.abs(biasInPP).toFixed(1)}pp
            </span>
            {" "}assumption
          </span>
        )}
        {viewMode === "projected" && biasInPP === 0 && (
          <span className="text-xs" style={{ color: "var(--app-text-muted)" }}>
            Remaining votes: <span style={{ fontWeight: 600 }}>mirrors reported</span> (adjust in extrapolator below)
          </span>
        )}
      </div>

      <div
        ref={mapRef}
        className="relative rounded-xl overflow-hidden"
        style={{
          border: "1px solid var(--app-border)",
          background: "var(--oh31-simple-map-bg)",
          height: mapHeight,
          zIndex: 0,
        }}
        onClick={() => { if (!isMobile) { setPinned(null); setHovered(null); } }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMapSize({ w: rect.width, h: rect.height });
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onMouseLeave={() => { if (!pinned) setHovered(null); }}
      >
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center: [-82.67, 40.35], scale: 5300 }}
          width={800}
          height={520}
          style={{ width: "100%", height: "100%" }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }: { geographies: CountyFeature[] }) =>
              geographies.map((geo) => {
                const name = geo.properties?.NAME ?? "";
                const r = ohioTreasurerByCounty[name];
                const hasData = r && r.winner !== null && r.voteTotal > 0;
                const isDisplay = display_?.name === name;

                let margin: number | null = null;
                if (hasData) {
                  if (viewMode === "current") {
                    margin = r!.margin;
                  } else {
                    margin = getProjectedMargin(r!.margin!, r!.reportingPct, biasInPP);
                  }
                }

                const fillColor = margin !== null
                  ? getRaceColor(-margin) // Edwards=D=blue, Roegner=R=red
                  : "var(--oh31-map-unfilled)";

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fillColor}
                    fillOpacity={hasData ? 1 : 0.55}
                    stroke={t.mapStroke}
                    strokeWidth={isDisplay ? 1.5 : 0.4}
                    style={{
                      default: { outline: "none" },
                      hover:   { outline: "none", opacity: 0.85 },
                      pressed: { outline: "none" },
                    }}
                    onMouseEnter={() => { if (!pinned) setHovered(getCountyData(name)); }}
                    onMouseLeave={() => { if (!pinned) setHovered(null); }}
                    onClick={(e: ReactMouseEvent<SVGPathElement>) => {
                      e.stopPropagation();
                      if (isMobile) return;
                      const rect = mapRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                      const county = getCountyData(name);
                      const isSame = pinned?.county.name === name;
                      setMapSize({ w: rect.width, h: rect.height });
                      setMousePos(pos);
                      if (isSame) { setPinned(null); setHovered(null); }
                      else if (county) { setHovered(county); setPinned({ county, pos }); }
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>

        {display_ && !isMobile && (
          <Tooltip county={display_} viewMode={viewMode} t={t} left={tipLeft} top={tipTop} width={tipW} />
        )}
        {display_ && isMobile && (
          <MobilePopup county={display_} viewMode={viewMode} t={t} />
        )}

        <div
          className="absolute bottom-3 left-3 right-3 md:bottom-4 md:right-3 md:left-auto z-[1] rounded-lg px-2 py-1.5 text-[10px] md:px-3 md:py-2 md:text-xs"
          style={{
            background: "var(--oh31-legend-bg)",
            border: "1px solid var(--app-border)",
            color: "var(--app-text-muted)",
            display: legendHidden ? "none" : undefined,
          }}
        >
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 md:block">
            {LEGEND.map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1 md:gap-1.5 md:mb-0.5">
                <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Tooltip({ county, viewMode, t, left, top, width }: {
  county: HoveredCounty;
  viewMode: ViewMode;
  t: typeof DARK_THEME;
  left: number; top: number; width: number;
}) {
  const isProjected = viewMode === "projected";
  const m = isProjected ? (county.projectedMargin ?? county.margin ?? 0) : (county.margin ?? 0);
  const totalVotes = isProjected && county.projectedTotal ? county.projectedTotal : county.voteTotal;
  const hasData = county.winner !== null && county.voteTotal > 0;

  const roePct = ((100 + m) / 2).toFixed(1);
  const edwPct = ((100 - m) / 2).toFixed(1);
  const roeVotes = Math.round(totalVotes * (100 + m) / 200);
  const edwVotes = Math.round(totalVotes * (100 - m) / 200);
  const winner = m > 0 ? "Roegner" : m < 0 ? "Edwards" : null;
  const winnerColor = winner === "Edwards" ? t.demText : winner === "Roegner" ? t.repText : t.textMuted;
  const marginAbs = Math.abs(m);
  const marginLabel = winner ? `${winner} +${marginAbs.toFixed(marginAbs % 1 === 0 ? 0 : 1)}pp` : "Even";
  const reportingStr = county.reportingPct === 97 ? ">95" : String(county.reportingPct);

  return (
    <div
      className="absolute pointer-events-none rounded-lg"
      style={{ left, top, width, padding: "12px", background: t.panel,
        border: "1px solid var(--app-border)", boxShadow: "0 4px 16px rgba(0,0,0,0.3)", zIndex: 1 }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-[12px] font-bold tracking-[0.04em] uppercase" style={{ color: t.textPrimary }}>
          {county.name}
        </div>
        {isProjected && (
          <span
            className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: "var(--app-tab-bg)", color: t.textMuted, border: "1px solid var(--app-border)" }}
          >
            Projected
          </span>
        )}
      </div>
      <div className="text-[11px] mb-3" style={{ color: t.textMuted }}>
        {hasData
          ? isProjected
            ? `~${Math.round(totalVotes).toLocaleString()} est. total · currently ${reportingStr}% in`
            : `${reportingStr}% reporting · ${county.voteTotal.toLocaleString()} votes`
          : "Not yet reporting"}
      </div>
      {hasData ? (
        <div className="inline-grid grid-cols-[auto_auto_auto] items-start gap-x-3">
          <div>
            <div className="text-[12px] font-semibold" style={{ color: t.repText }}>
              Roegner {roeVotes.toLocaleString()}
            </div>
            <div className="text-[11px]" style={{ color: t.repText, opacity: 0.85 }}>({roePct}%)</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold" style={{ color: t.demText }}>
              Edwards {edwVotes.toLocaleString()}
            </div>
            <div className="text-[11px]" style={{ color: t.demText, opacity: 0.85 }}>({edwPct}%)</div>
          </div>
          <div className="pt-[1px] text-[13px] leading-none font-bold whitespace-nowrap" style={{ color: winnerColor }}>
            {marginLabel}
          </div>
        </div>
      ) : (
        <div className="text-[11px]" style={{ color: t.textMuted }}>No data available</div>
      )}
    </div>
  );
}

function MobilePopup({ county, viewMode, t }: { county: HoveredCounty; viewMode: ViewMode; t: typeof DARK_THEME }) {
  const isProjected = viewMode === "projected";
  const m = isProjected ? (county.projectedMargin ?? county.margin ?? 0) : (county.margin ?? 0);
  const totalVotes = isProjected && county.projectedTotal ? county.projectedTotal : county.voteTotal;
  const hasData = county.winner !== null && county.voteTotal > 0;

  const roePct = ((100 + m) / 2).toFixed(1);
  const edwPct = ((100 - m) / 2).toFixed(1);
  const roeVotes = Math.round(totalVotes * (100 + m) / 200);
  const edwVotes = Math.round(totalVotes * (100 - m) / 200);
  const winner = m > 0 ? "Roegner" : m < 0 ? "Edwards" : null;
  const winnerColor = winner === "Edwards" ? t.demText : winner === "Roegner" ? t.repText : t.textMuted;
  const tag = winner ? `${winner === "Roegner" ? "ROE" : "EDW"} +${Math.abs(m).toFixed(1)}` : "—";

  return (
    <div
      className="absolute left-3 right-3 bottom-3 pointer-events-none rounded-lg"
      style={{ padding: "8px 10px", background: t.panel, border: "1px solid var(--app-border)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)", zIndex: 5 }}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <div className="text-[11px] font-semibold truncate" style={{ color: t.textPrimary }}>
          {county.name} County
        </div>
        {isProjected && (
          <span className="text-[9px] font-semibold uppercase tracking-wider px-1 py-0.5 rounded ml-1 shrink-0"
            style={{ background: "var(--app-tab-bg)", color: t.textMuted }}>Proj.</span>
        )}
      </div>
      {hasData ? (
        <div className="flex items-center gap-x-2 text-[10px] leading-none flex-wrap">
          <span style={{ color: t.textMuted }}>{Math.round(totalVotes).toLocaleString()} votes</span>
          <span className="font-semibold" style={{ color: t.repText }}>ROE {roeVotes.toLocaleString()} ({roePct}%)</span>
          <span className="font-semibold" style={{ color: t.demText }}>EDW {edwVotes.toLocaleString()} ({edwPct}%)</span>
          <span className="ml-auto text-[13px] font-semibold" style={{ color: winnerColor }}>{tag}</span>
        </div>
      ) : (
        <div className="text-[10px]" style={{ color: t.textMuted }}>Not yet reporting</div>
      )}
    </div>
  );
}
