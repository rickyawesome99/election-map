"use client";

// The national view of /precincts: the same inset-style US map as the Historical tab (Albers, with
// Alaska and Hawaii tucked under the Southwest), one shape per state coloured by its statewide result.
// Clicking a state hands over to the precinct map. Drawn from the pre-projected states file
// (lib/projectedMaps COUNTY frame), so nothing is projected in the browser.

import { useState } from "react";
import { ComposableMap, Geography } from "react-simple-maps";
import Geographies from "@/components/maps/Geographies";
import { STATES_10M_URL } from "@/lib/projectedMaps";
import { getRaceColor } from "@/lib/colorScale";
import CountyTooltip from "@/components/CountyTooltip";
import { useMapTooltip } from "@/lib/useMapTooltip";
import { usePageBg } from "@/lib/useDarkMode";
import { resultCard } from "./cards";
import { marginOf, type Office, type StateShell } from "./types";

type Geo = { rsmKey: string; id?: string | number; properties?: { name?: string } };

export default function NationalMap({ states, year, office, darkMode, onPick }: {
  states: StateShell[];
  year: number;
  office: Office;
  darkMode: boolean;
  onPick: (abbr: string) => void;
}) {
  const [hover, setHover] = useState<StateShell | null>(null);
  const tip = useMapTooltip(14, 8);
  const byFips = new Map(states.map((s) => [s.fips, s]));
  const neutral = darkMode ? "#39424f" : "#c9ced6";
  const pageBg = usePageBg();
  const stroke = darkMode ? pageBg : "#faf9f6";
  const marginFor = (s: StateShell) => {
    const sum = s.years[String(year)]?.[office];
    return sum ? marginOf([sum.d, sum.r, sum.o]) : null;
  };

  return (
    // Fills the explorer's map box (the same box as the state map); the map scales to fit, centred.
    <div className="relative h-full w-full" onMouseMove={tip.onMouseMove} onMouseLeave={() => setHover(null)}>
      <ComposableMap width={975} height={610} projection="geoAlbersUsa" projectionConfig={{ scale: 1200 }} style={{ width: "100%", height: "100%", display: "block" }}>
        <Geographies geography={STATES_10M_URL}>
          {({ geographies }: { geographies: never[] }) =>
            (geographies as unknown as Geo[]).map((geo) => {
              const shell = byFips.get(String(geo.id).padStart(2, "0"));
              if (!shell) return null;
              const m = marginFor(shell);
              const fill = m === null ? neutral : getRaceColor(m);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  tabIndex={0}
                  role="button"
                  aria-label={`${shell.name}: open precincts`}
                  onClick={() => onPick(shell.abbr)}
                  onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(shell.abbr); } }}
                  onMouseEnter={() => setHover(shell)}
                  style={{
                    default: { fill, stroke, strokeWidth: 0.9, outline: "none", cursor: "pointer" },
                    hover: { fill, stroke: darkMode ? "#ffffff" : "#111111", strokeWidth: 1.8, outline: "none", cursor: "pointer" },
                    pressed: { fill, stroke: darkMode ? "#ffffff" : "#111111", strokeWidth: 1.8, outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      {hover && (() => {
        const sum = hover.years[String(year)]?.[office];
        return <CountyTooltip {...resultCard(hover.name, `${hover.n.toLocaleString()} precincts · click to open`, sum ? [sum.d, sum.r, sum.o] : undefined, office)} boxRef={tip.tooltipRef} className="absolute z-20 hidden md:block" />;
      })()}
    </div>
  );
}
