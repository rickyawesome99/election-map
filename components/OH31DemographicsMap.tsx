"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import type { GeoJsonProperties, Geometry } from "geojson";
import { DARK_THEME, LIGHT_THEME } from "@/components/ForecastMap";
import { useDarkMode } from "@/lib/useDarkMode";

const GEO_URL = "/oh31-demographics.geojson";

type DemoVarKey =
  | "pct_white"
  | "pct_black"
  | "pct_hispanic"
  | "pct_asian"
  | "med_hh_income"
  | "pct_bachelors_plus"
  | "pct_no_hs_diploma"
  | "pct_some_college"
  | "pct_18_34"
  | "pct_35_64"
  | "pct_65plus";

type DemoVar = {
  label: string;
  format: (v: number) => string;
  min: number;
  max: number;
  fromRgb: [number, number, number];
  toRgb: [number, number, number];
};

const DEMO_VARS: Record<DemoVarKey, DemoVar> = {
  pct_white:          { label: "% White",          format: v => `${v.toFixed(1)}%`,          min: 0,     max: 100,    fromRgb: [229, 231, 235], toRgb: [30,  58,  138] },
  pct_black:          { label: "% Black",           format: v => `${v.toFixed(1)}%`,          min: 0,     max: 65,     fromRgb: [254, 243, 199], toRgb: [76,  29,  149] },
  pct_hispanic:       { label: "% Hispanic",        format: v => `${v.toFixed(1)}%`,          min: 0,     max: 30,     fromRgb: [220, 252, 231], toRgb: [20,  83,  45]  },
  pct_asian:          { label: "% Asian",           format: v => `${v.toFixed(1)}%`,          min: 0,     max: 15,     fromRgb: [252, 231, 243], toRgb: [157, 23,  77]  },
  med_hh_income:      { label: "Median Income",     format: v => `$${Math.round(v / 1000)}k`, min: 30000, max: 120000, fromRgb: [220, 252, 231], toRgb: [21,  128, 61]  },
  pct_bachelors_plus: { label: "% College+",        format: v => `${v.toFixed(1)}%`,          min: 0,     max: 60,     fromRgb: [243, 232, 255], toRgb: [88,  28,  135] },
  pct_no_hs_diploma:  { label: "% No HS Diploma",   format: v => `${v.toFixed(1)}%`,          min: 0,     max: 25,     fromRgb: [254, 249, 195], toRgb: [154, 52,  18]  },
  pct_some_college:   { label: "% Some College",    format: v => `${v.toFixed(1)}%`,          min: 0,     max: 45,     fromRgb: [224, 242, 254], toRgb: [7,   89,  133] },
  pct_18_34:          { label: "% Age 18–34",       format: v => `${v.toFixed(1)}%`,          min: 0,     max: 35,     fromRgb: [240, 253, 244], toRgb: [20,  83,  45]  },
  pct_35_64:          { label: "% Age 35–64",       format: v => `${v.toFixed(1)}%`,          min: 0,     max: 55,     fromRgb: [255, 247, 237], toRgb: [124, 45,  18]  },
  pct_65plus:         { label: "% Age 65+",         format: v => `${v.toFixed(1)}%`,          min: 0,     max: 30,     fromRgb: [254, 249, 195], toRgb: [146, 64,  14]  },
};

const VAR_ORDER: DemoVarKey[] = [
  "pct_white", "pct_black", "pct_hispanic", "pct_asian",
  "med_hh_income", "pct_bachelors_plus", "pct_no_hs_diploma", "pct_some_college",
  "pct_18_34", "pct_35_64", "pct_65plus",
];

type PrecinctGeo = {
  rsmKey: string;
  properties?: GeoJsonProperties & {
    PRECNAME?: string;
    total_pop?: number;
    pct_white?: number;
    pct_black?: number;
    pct_hispanic?: number;
    pct_asian?: number;
    pct_native?: number;
    pct_multi?: number;
    med_hh_income?: number;
    pct_bachelors_plus?: number;
    pct_no_hs_diploma?: number;
    pct_some_college?: number;
    age_65plus?: number;
    age_under18?: number;
    age_18_34?: number;
    age_35_64?: number;
  };
  geometry?: Geometry;
};

function getSequentialColor(value: number | null | undefined, cfg: DemoVar): string {
  if (value == null || isNaN(value)) return "#9ca3af";
  const t = Math.max(0, Math.min(1, (value - cfg.min) / (cfg.max - cfg.min)));
  const [r1, g1, b1] = cfg.fromRgb;
  const [r2, g2, b2] = cfg.toRgb;
  return `rgb(${Math.round(r1 + t * (r2 - r1))},${Math.round(g1 + t * (g2 - g1))},${Math.round(b1 + t * (b2 - b1))})`;
}

function getPropValue(props: PrecinctGeo["properties"], key: DemoVarKey): number | null {
  if (!props) return null;
  const pop = Number(props.total_pop ?? 0);
  if (key === "pct_65plus") return pop > 0 ? (Number(props.age_65plus ?? 0) / pop) * 100 : null;
  if (key === "pct_18_34")  return pop > 0 ? (Number((props as Record<string,unknown>).age_18_34 ?? 0) / pop) * 100 : null;
  if (key === "pct_35_64")  return pop > 0 ? (Number((props as Record<string,unknown>).age_35_64 ?? 0) / pop) * 100 : null;
  const v = (props as Record<string, unknown>)[key];
  return v == null || v === "" ? null : Number(v);
}

function fmt(value: number | null, cfg: DemoVar): string {
  return value != null ? cfg.format(value) : "—";
}

export default function OH31DemographicsMap() {
  const [activeVar, setActiveVar] = useState<DemoVarKey>("pct_white");
  const darkMode = useDarkMode();
  const [hovered, setHovered] = useState<PrecinctGeo["properties"] | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mapSize, setMapSize] = useState({ w: 0, h: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [pinned, setPinned] = useState<{ props: PrecinctGeo["properties"]; pos: { x: number; y: number } } | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
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

  const t = darkMode ? DARK_THEME : LIGHT_THEME;
  const cfg = DEMO_VARS[activeVar];
  const displayProps = pinned?.props ?? hovered;
  const tooltipAnchor = pinned?.pos ?? mousePos;
  const tipW = 210;
  const tipH = 310;
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
    <div>
      {/* Variable selector */}
      <div className="flex flex-wrap gap-2 mb-3">
        {VAR_ORDER.map((key) => (
          <button
            key={key}
            onClick={() => setActiveVar(key)}
            className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
            style={
              activeVar === key
                ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }
                : { color: "var(--app-text-muted)", border: "1px solid var(--app-border)", background: "transparent" }
            }
          >
            {DEMO_VARS[key].label}
          </button>
        ))}
      </div>

      {/* Map */}
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
          <ZoomableGroup key={mapKey} onMoveEnd={() => setViewChanged(true)}>
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: PrecinctGeo[] }) =>
                geographies.map((geo) => {
                  const props = geo.properties;
                  const value = getPropValue(props, activeVar);
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
              {([
                ["% White",       "pct_white",          getPropValue(displayProps, "pct_white"),           DEMO_VARS.pct_white],
                ["% Black",       "pct_black",          getPropValue(displayProps, "pct_black"),           DEMO_VARS.pct_black],
                ["% Hispanic",    "pct_hispanic",       getPropValue(displayProps, "pct_hispanic"),        DEMO_VARS.pct_hispanic],
                ["% Asian",       "pct_asian",          getPropValue(displayProps, "pct_asian"),           DEMO_VARS.pct_asian],
                ["Age 18–34",     "pct_18_34",          getPropValue(displayProps, "pct_18_34"),           DEMO_VARS.pct_18_34],
                ["Age 35–64",     "pct_35_64",          getPropValue(displayProps, "pct_35_64"),           DEMO_VARS.pct_35_64],
                ["Age 65+",       "pct_65plus",         getPropValue(displayProps, "pct_65plus"),          DEMO_VARS.pct_65plus],
                ["Income",        "med_hh_income",      getPropValue(displayProps, "med_hh_income"),       DEMO_VARS.med_hh_income],
                ["College+",      "pct_bachelors_plus", getPropValue(displayProps, "pct_bachelors_plus"),  DEMO_VARS.pct_bachelors_plus],
                ["No HS Diploma", "pct_no_hs_diploma",  getPropValue(displayProps, "pct_no_hs_diploma"),   DEMO_VARS.pct_no_hs_diploma],
                ["Some College",  "pct_some_college",   getPropValue(displayProps, "pct_some_college"),    DEMO_VARS.pct_some_college],
              ] as [string, DemoVarKey, number | null, DemoVar][]).map(([label, key, val, varCfg]) => {
                const isActive = key === activeVar;
                return (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-2 rounded px-1 -mx-1"
                    style={isActive ? { background: "var(--app-border)" } : undefined}
                  >
                    <span className="text-[10px]" style={{ color: isActive ? t.textPrimary : t.textMuted, fontWeight: isActive ? 600 : undefined }}>
                      {label}
                    </span>
                    <span className="text-[11px] tabular-nums" style={{ color: t.textPrimary, fontWeight: isActive ? 700 : 600 }}>
                      {fmt(val, varCfg)}
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
              {([
                ["White",    getPropValue(displayProps, "pct_white"),    DEMO_VARS.pct_white],
                ["Black",    getPropValue(displayProps, "pct_black"),    DEMO_VARS.pct_black],
                ["Hispanic", getPropValue(displayProps, "pct_hispanic"), DEMO_VARS.pct_hispanic],
                ["Income",   getPropValue(displayProps, "med_hh_income"),DEMO_VARS.med_hh_income],
                ["College+", getPropValue(displayProps, "pct_bachelors_plus"), DEMO_VARS.pct_bachelors_plus],
              ] as [string, number | null, DemoVar][]).map(([label, val, varCfg]) => (
                <span key={label} className="text-[10px]" style={{ color: t.textMuted }}>
                  {label}: <span style={{ color: t.textPrimary, fontWeight: 600 }}>{fmt(val, varCfg)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
