"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import type { GeoJsonProperties, Geometry } from "geojson";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";
import { useDarkMode } from "@/lib/useDarkMode";
import { avgAge, eduYears, popWeightedAvg, type DemoProps } from "@/lib/oh31Demographics";

const GEO_URL = "/oh31-demographics.geojson";

type DemoVarKey = "race" | "age" | "education" | "income";

type RgbColor = [number, number, number];

type DemoVar = {
  label: string;
  format: (v: number) => string;
  min: number;
  max: number;
  fromRgb: RgbColor;
  toRgb: RgbColor;
  getValue: (props: DemoProps) => number | null;
};

const DEMO_VARS: Record<DemoVarKey, DemoVar> = {
  race: {
    label: "% White",
    format: (v) => `${v.toFixed(1)}%`,
    min: 0,
    max: 100,
    fromRgb: [229, 231, 235],
    toRgb: [30, 58, 138],
    getValue: (props) => props.pct_white ?? null,
  },
  age: {
    label: "Avg. Age",
    format: (v) => `${v.toFixed(1)} yrs`,
    min: 30,
    max: 55,
    fromRgb: [224, 242, 254],
    toRgb: [7, 89, 133],
    getValue: avgAge,
  },
  education: {
    label: "Avg. Education",
    format: (v) => `${v.toFixed(1)} yrs`,
    min: 10,
    max: 17,
    fromRgb: [243, 232, 255],
    toRgb: [88, 28, 135],
    getValue: eduYears,
  },
  income: {
    label: "Median Income",
    format: (v) => `$${Math.round(v / 1000)}k`,
    min: 30000,
    max: 120000,
    fromRgb: [220, 252, 231],
    toRgb: [21, 128, 61],
    getValue: (props) => props.med_hh_income ?? null,
  },
};

const VAR_ORDER: DemoVarKey[] = ["race", "age", "education", "income"];

type PrecinctGeo = {
  rsmKey: string;
  properties?: GeoJsonProperties & DemoProps & { PRECNAME?: string };
  geometry?: Geometry;
};

function filterMapZoomEvent(event: { type?: string; ctrlKey?: boolean; button?: number }): boolean {
  return event.type !== "dblclick" && event.type !== "touchend" && (!event.ctrlKey || event.type === "wheel") && !event.button;
}

function getSequentialColor(value: number | null | undefined, cfg: DemoVar): string {
  if (value == null || isNaN(value)) return "#9ca3af";
  const t = Math.max(0, Math.min(1, (value - cfg.min) / (cfg.max - cfg.min)));
  const [r1, g1, b1] = cfg.fromRgb;
  const [r2, g2, b2] = cfg.toRgb;
  return `rgb(${Math.round(r1 + t * (r2 - r1))},${Math.round(g1 + t * (g2 - g1))},${Math.round(b1 + t * (b2 - b1))})`;
}

function fmt(value: number | null, cfg: DemoVar): string {
  return value != null ? cfg.format(value) : "—";
}

export default function OH31DemographicsMap() {
  const [activeVar, setActiveVar] = useState<DemoVarKey>("race");
  const darkMode = useDarkMode();
  const [hovered, setHovered] = useState<PrecinctGeo["properties"] | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [pinned, setPinned] = useState<{ props: PrecinctGeo["properties"]; pos: { x: number; y: number } } | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const [allPrecincts, setAllPrecincts] = useState<DemoProps[]>([]);
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncViewport = () => {
      const mobileViewport = window.matchMedia("(max-width: 767px)").matches;
      const coarsePointer = window.matchMedia("(hover: none), (pointer: coarse)").matches;
      setIsMobile(mobileViewport && coarsePointer);
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    fetch(GEO_URL)
      .then((r) => r.json())
      .then((geojson: { features: { properties: DemoProps }[] }) => {
        setAllPrecincts(geojson.features.map((f) => f.properties));
      });
  }, []);

  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const cfg = DEMO_VARS[activeVar];
  const totalValue = useMemo(() => popWeightedAvg(allPrecincts, cfg.getValue), [allPrecincts, cfg]);
  const displayProps = pinned?.props ?? hovered;
  const tooltipAnchor = pinned?.pos ?? mousePos;
  const tipW = 210;
  const tipH = 150;
  const offset = 16;
  const edgePad = 8;
  const mapHeight = isMobile ? 520 : "min(72vh, 520px)";
  const mapScale = isMobile ? 110000 : 65000;

  let tipLeft = tooltipAnchor.x + offset;
  let tipTop = tooltipAnchor.y + offset;
  if (tipLeft + tipW + edgePad > mapSize.w) tipLeft = tooltipAnchor.x - tipW - offset;
  if (tipTop + tipH + edgePad > mapSize.h) tipTop = tooltipAnchor.y - tipH - offset;
  if (tipLeft < edgePad) tipLeft = edgePad;
  if (tipTop < edgePad) tipTop = edgePad;

  return (
    <div style={{ color: t.textPrimary }}>
      <div
        className="overflow-hidden rounded-xl"
        style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)" }}
      >
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
          <div
            className="order-2 border-t p-2 md:p-3 lg:order-1 lg:border-t-0 lg:pr-1.5"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div
              ref={mapRef}
              className="relative rounded-xl overflow-hidden"
              style={{
                border: "1px solid var(--app-border)",
                background: "var(--oh31-simple-map-bg)",
                height: mapHeight,
                zIndex: 0,
              }}
              onClick={() => {
                if (!isMobile) {
                  setPinned(null);
                  setHovered(null);
                }
              }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setMapSize({ w: rect.width, h: rect.height });
                setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
              }}
              onMouseLeave={() => {
                if (!pinned) setHovered(null);
              }}
            >
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center: [-81.5692, 41.1295], scale: mapScale }}
          width={800}
          height={520}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup key={mapKey} filterZoomEvent={filterMapZoomEvent} onMoveEnd={() => setViewChanged(true)}>
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: PrecinctGeo[] }) =>
                geographies.map((geo) => {
                  const props = geo.properties;
                  const value = props ? cfg.getValue(props) : null;
                  const isHovered = displayProps?.PRECNAME === props?.PRECNAME;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getSequentialColor(value, cfg)}
                      stroke={t.mapStroke}
                      strokeWidth={isHovered ? 1.5 : 0.4}
                      style={{
                        default: { outline: "none" },
                        hover: { outline: "none", opacity: 0.85 },
                        pressed: { outline: "none" },
                      }}
                      onMouseEnter={() => {
                        if (!pinned && props) setHovered(props);
                      }}
                      onMouseLeave={() => {
                        if (!pinned) setHovered(null);
                      }}
                      onClick={(e: ReactMouseEvent<SVGPathElement>) => {
                        e.stopPropagation();
                        if (isMobile || !props) return;
                        const rect = mapRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                        const isSame = pinned?.props?.PRECNAME === props.PRECNAME;
                        setMapSize({ w: rect.width, h: rect.height });
                        setMousePos(pos);
                        if (isSame) {
                          setPinned(null);
                          setHovered(null);
                        } else {
                          setHovered(props);
                          setPinned({ props, pos });
                        }
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        {/* Reset zoom */}
        {viewChanged && (
          <button
            onClick={() => { setMapKey(k => k + 1); setViewChanged(false); }}
            className="absolute top-2 right-2 z-10 text-[10px] font-semibold px-2 py-1 rounded-md"
            style={{
              background: "var(--app-panel)",
              border: "1px solid var(--app-border)",
              color: "var(--app-text-muted)",
              opacity: 0.92,
            }}
          >
            Reset
          </button>
        )}

        {/* Color legend */}
        <div
          className="absolute bottom-2 left-2 z-10 rounded-md px-2 py-1.5"
          style={{ background: t.panel, border: "1px solid var(--app-border)", opacity: 0.92 }}
        >
          <div className="text-[9px] font-semibold mb-1" style={{ color: t.textMuted }}>
            {cfg.label}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px]" style={{ color: t.textMuted }}>{cfg.format(cfg.min)}</span>
            <div
              className="w-20 h-2 rounded-sm"
              style={{
                background: `linear-gradient(to right, rgb(${cfg.fromRgb.join(",")}), rgb(${cfg.toRgb.join(",")}))`,
              }}
            />
            <span className="text-[9px]" style={{ color: t.textMuted }}>{cfg.format(cfg.max)}</span>
          </div>
        </div>

        {/* Desktop tooltip */}
        {displayProps && !isMobile && (
          <div
            className="absolute pointer-events-none rounded-lg"
            style={{
              left: tipLeft,
              top: tipTop,
              width: tipW,
              padding: "12px",
              background: t.panel,
              border: "1px solid var(--app-border)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              zIndex: 1,
            }}
          >
            <div className="text-[12px] font-bold tracking-[0.04em] uppercase mb-2" style={{ color: t.textPrimary }}>
              {displayProps.PRECNAME}
            </div>
            <div className="text-[11px] mb-2" style={{ color: t.textMuted }}>
              Pop. {Number(displayProps.total_pop ?? 0).toLocaleString()}
            </div>
            <div className="space-y-1">
              {VAR_ORDER.map((key) => {
                const varCfg = DEMO_VARS[key];
                const isActive = key === activeVar;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 rounded px-1 -mx-1"
                    style={isActive ? { background: "var(--app-border)" } : undefined}
                  >
                    <span className="text-[10px]" style={{ color: isActive ? t.textPrimary : t.textMuted, fontWeight: isActive ? 600 : undefined }}>
                      {varCfg.label}
                    </span>
                    <span className="text-[11px] tabular-nums" style={{ color: t.textPrimary, fontWeight: isActive ? 700 : 600 }}>
                      {fmt(varCfg.getValue(displayProps), varCfg)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mobile tooltip */}
        {displayProps && isMobile && (
          <div
            className="absolute left-3 right-3 bottom-3 pointer-events-none rounded-lg"
            style={{
              padding: "8px 10px",
              background: t.panel,
              border: "1px solid var(--app-border)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
              zIndex: 5,
            }}
          >
            <div className="text-[11px] font-semibold mb-1 truncate" style={{ color: t.textPrimary }}>
              {displayProps.PRECNAME}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {VAR_ORDER.map((key) => {
                const varCfg = DEMO_VARS[key];
                return (
                  <span key={key} className="text-[10px]" style={{ color: t.textMuted }}>
                    {varCfg.label}: <span style={{ color: t.textPrimary, fontWeight: 600 }}>{fmt(varCfg.getValue(displayProps), varCfg)}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
            </div>
          </div>

          <div
            className="order-1 flex flex-col gap-3 p-2 md:p-3 lg:order-2 lg:border-l lg:pl-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <div>
              <div className="text-base font-bold leading-tight md:text-lg" style={{ color: "var(--app-text-primary)" }}>
                Demographics Map
              </div>
              <div className="mt-0.5 text-xs md:text-sm" style={{ color: "var(--app-text-muted)" }}>
                2020 Census & 2020-2024 ACS
              </div>
            </div>

            <div className="grid grid-cols-2 overflow-hidden rounded-lg text-right" style={{ border: "1px solid var(--app-border)" }}>
              <div className="px-2 py-1.5 text-left" style={{ borderRight: "1px solid var(--app-border)" }}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-text-very-muted)" }}>
                  Metric
                </div>
                <div className="mt-0.5 text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>
                  {cfg.label}
                </div>
              </div>
              <div className="px-2 py-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-text-very-muted)" }}>
                  Total
                </div>
                <div className="mt-0.5 text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>
                  {totalValue != null ? cfg.format(totalValue) : "—"}
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-text-very-muted)" }}>
                  Variable
                </div>
                <div
                  className="grid grid-cols-2 gap-1 rounded-lg p-1"
                  style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)" }}
                >
                  {VAR_ORDER.map((key) => (
                    <button
                      key={key}
                      onClick={() => setActiveVar(key)}
                      aria-pressed={activeVar === key}
                      className="min-h-8 rounded px-2 text-xs font-semibold transition-colors"
                      style={
                        activeVar === key
                          ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                          : { color: "var(--app-text-muted)", border: "1px solid transparent" }
                      }
                    >
                      {DEMO_VARS[key].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-2 text-xs md:text-sm" style={{ color: "var(--app-text-muted)" }}>
              <div>
                Showing precinct-level estimates for {cfg.label.toLowerCase()}.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
