"use client";

import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { getRaceColor } from "@/lib/colorScale";

const DISTRICTS_URL = "/congressional-districts.json";

type DistrictGeometry = {
  rsmKey: string;
  properties?: {
    GEOID?: string;
  };
};

const STATE_PROJ: Record<string, [number, number, number]> = {
  AL: [-86.8, 32.8, 4800],  AK: [-153.0, 64.0, 900],   AZ: [-111.7, 34.3, 3600],
  AR: [-92.4, 34.9, 5500],  CA: [-119.5, 37.2, 2200],  CO: [-105.5, 39.0, 4200],
  CT: [-72.7, 41.6, 16000], DE: [-75.5, 39.0, 22000],  FL: [-81.5, 27.8, 3400],
  GA: [-83.4, 32.7, 4000],  HI: [-156.3, 20.3, 5500],  ID: [-114.5, 44.5, 3200],
  IL: [-89.2, 40.0, 3600],  IN: [-86.1, 40.2, 5500],   IA: [-93.5, 42.0, 5500],
  KS: [-98.4, 38.5, 4800],  KY: [-85.3, 37.5, 4400],   LA: [-92.4, 31.2, 5000],
  ME: [-69.3, 45.4, 4800],  MD: [-77.0, 38.8, 10000],  MA: [-71.5, 42.1, 11000],
  MI: [-85.6, 44.2, 3200],  MN: [-94.3, 46.4, 3600],   MS: [-89.7, 32.7, 4800],
  MO: [-92.5, 38.5, 4200],  MT: [-110.3, 46.9, 3000],  NE: [-99.9, 41.5, 4800],
  NV: [-116.5, 38.8, 3200], NH: [-71.6, 43.7, 9000],   NJ: [-74.5, 40.1, 11000],
  NM: [-106.1, 34.5, 3800], NY: [-75.5, 42.8, 3800],   NC: [-79.4, 35.5, 4400],
  ND: [-100.5, 47.5, 5200], OH: [-82.8, 40.4, 5000],   OK: [-97.5, 35.5, 4500],
  OR: [-120.5, 43.9, 3600], PA: [-77.2, 40.9, 5000],   RI: [-71.5, 41.7, 26000],
  SC: [-80.9, 33.8, 5800],  SD: [-100.2, 44.4, 5200],  TN: [-86.7, 35.9, 4600],
  TX: [-99.5, 31.5, 1700],  UT: [-111.5, 39.5, 4400],  VT: [-72.7, 44.0, 11000],
  VA: [-79.4, 37.5, 4400],  WA: [-120.5, 47.5, 4200],  WV: [-80.5, 38.9, 6000],
  WI: [-89.8, 44.6, 4200],  WY: [-107.5, 43.0, 4800],
};

export default function DistrictMiniMap({
  raceId,
  stateAbbr,
  margin,
}: {
  raceId: string;
  stateAbbr: string;
  margin: number;
}) {
  const proj = STATE_PROJ[stateAbbr] ?? [-96, 38, 800];
  const stateFips = raceId.slice(0, 2);
  // At-large districts are stored in the GeoJSON with GEOID ending "00", but our race IDs end "01"
  const targetGeoid = raceId.endsWith("01") ? raceId.slice(0, -2) + "00" : raceId;
  const highlightColor = getRaceColor(margin);
  // Use theme variables so fills update immediately with light/dark toggles.
  const mapStroke = "var(--app-bg)";
  const mutedFill = "var(--app-border)";

  return (
    <div style={{ height: "100%", minHeight: 180, background: "var(--app-bg)", borderRadius: 8, overflow: "hidden" }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: proj[2], center: [proj[0], proj[1]] }}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={DISTRICTS_URL}>
          {({ geographies }: { geographies: DistrictGeometry[] }) =>
            geographies
              .filter((geo) => {
                const geoid = geo.properties?.GEOID as string | undefined;
                return geoid?.startsWith(stateFips);
              })
              .map((geo) => {
                const geoid = geo.properties?.GEOID as string | undefined;
                const isTarget = geoid === raceId || geoid === targetGeoid;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    style={{
                      default: {
                        fill: isTarget ? highlightColor : mutedFill,
                        stroke: mapStroke,
                        strokeWidth: isTarget ? 0 : 0.5,
                        outline: "none",
                      },
                      hover: { fill: isTarget ? highlightColor : mutedFill, outline: "none" },
                      pressed: { fill: isTarget ? highlightColor : mutedFill, outline: "none" },
                    }}
                  />
                );
              })
          }
        </Geographies>
      </ComposableMap>
    </div>
  );
}
