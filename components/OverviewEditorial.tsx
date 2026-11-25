"use client";

// The Overview's lower half, rendered by app/overview/layout.tsx so it stays put while the post-election
// analysis above it switches years (/overview ↔ /overview/[year], user 2026-11-17): the results-page
// box and the State TPL map. The forecast's national outlook moved to the Forecast tab (ForecastOutlook.tsx).

import Link from "next/link";
import { useState } from "react";
import { ComposableMap, Geography } from "react-simple-maps";
import Geographies from "@/components/maps/Geographies";
import CountyTooltip from "@/components/CountyTooltip";
import { fmt1, marginColor } from "@/components/tpl/format";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { formatProjectedMargin, getRaceColor } from "@/lib/colorScale";
import { statesData } from "@/data/statesData";
import { useSiteTheme } from "./ForecastMap";
import { PAGE_CONTAINER } from "@/lib/pageLayout";

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
type GeoFeature = { rsmKey: string; id?: string | number; properties?: Record<string, string | undefined> };

/** Computed by app/overview/layout.tsx on the server. */
export type OverviewData = {
  /** State name → state TPL (R-positive). */
  stateMargins: Record<string, number>;
};

export default function OverviewEditorial({ data }: { data: OverviewData }) {
  const t = useSiteTheme();
  const { stateMargins } = data;
  // Desktop hover box on the State TPL map — the TPL hub's figure tooltip.
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const { onMouseMove: onTipMove, tooltipRef } = useMapTooltip(14, 8);

  return (
    <div className={`${PAGE_CONTAINER} pb-6 sm:pb-8`}>
        <div className="grid gap-8">
          {/* The results page (live on election night, an archive of the count since Nov 16), boxed at the top (user, 2026-10-25). */}
          <Link prefetch={false} href="/results" className="group flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3 transition-colors hover:bg-[color-mix(in_srgb,var(--app-text-primary)_5%,transparent)]" style={{ border: `2px solid ${t.textPrimary}` }}>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em]">Election Night Results</div>
              <div className="mt-1 text-sm" style={{ color: t.textMuted }}>How the count came in for every Senate, governor and House race, 6 PM ET November 3 to November 16, against the forecast and the projected final margin.</div>
            </div>
            <span className="text-sm font-semibold underline decoration-dotted underline-offset-4 group-hover:decoration-solid">Open the results page →</span>
          </Link>
          <section>
            <div className="flex items-baseline justify-between gap-4 border-b-2 pb-2" style={{ borderColor: t.textPrimary }}>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em]">State TPL</div>
              <div className="text-[11px]" style={{ color: t.textMuted }}>Click to view a state</div>
            </div>
            <div className="relative h-[310px] sm:h-[420px]" onMouseMove={onTipMove}>
              {hoveredState && stateMargins[hoveredState] != null && (
                <CountyTooltip kind="figure" title={hoveredState} label="TPL" value={fmt1(stateMargins[hoveredState])} valueColor={marginColor(stateMargins[hoveredState])} boxRef={tooltipRef} className="absolute z-20 hidden md:block" />
              )}
              <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1120 }} style={{ width: "100%", height: "100%" }}>
                <Geographies geography={STATES_URL}>{({ geographies }: { geographies: GeoFeature[] }) => geographies.map((geo) => {
                  const state = geo.properties?.name as string;
                  const margin = stateMargins[state];
                  const stateSlug = statesData.find((entry) => entry.name === state)?.id;
                  return <Geography key={geo.rsmKey} geography={geo} onMouseEnter={() => setHoveredState(state)} onMouseLeave={() => setHoveredState(null)} onClick={() => { if (stateSlug) window.location.assign(`/states/${stateSlug}`); }} aria-label={`${state}${margin == null ? "" : ` ${formatProjectedMargin(margin)}`}`} style={{ default: { fill: margin == null ? t.mapUnfilled : getRaceColor(margin), stroke: t.mapStroke, strokeWidth: 1.2, outline: "none" }, hover: { fill: margin == null ? t.hoverUnfilled : getRaceColor(margin), stroke: t.hoverStroke, strokeWidth: 1.7, outline: "none", cursor: "pointer" }, pressed: { fill: margin == null ? t.mapUnfilled : getRaceColor(margin), stroke: t.hoverStroke, strokeWidth: 2, outline: "none" } }} />;
                })}</Geographies>
              </ComposableMap>
            </div>
            <div className="-mt-3 flex flex-wrap gap-x-4 gap-y-2">{["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"].map((label, i) => <span key={label} className="flex items-center gap-1.5 text-[9px]" style={{ color: t.textMuted }}><i className="h-2.5 w-4" style={{ background: ["#1a4480", "#4275b5", "#82b4f0", "#aecef5", "#f5aeae", "#f08282", "#c04040", "#8b1a1a"][i] }} />{label}</span>)}</div>
          </section>
        </div>
    </div>
  );
}
