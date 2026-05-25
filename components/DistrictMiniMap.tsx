"use client";

import { useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { getRaceColor } from "@/lib/colorScale";

const DISTRICTS_URL = "/congressional-districts.json";

function getGeoUrlForYear(year: number): string {
  if (year >= 2026) return "/congressional-districts.json";
  if (year >= 2024) return "/congressional-districts-2024.json";
  if (year >= 2022) return "/congressional-districts-2022.json";
  if (year >= 2020) return "/congressional-districts-pre2022.json";
  if (year >= 2018) return "/congressional-districts-2018.json";
  return "/congressional-districts-2016.json";
}

type DistrictGeometry = {
  rsmKey: string;
  properties?: {
    GEOID?: string;
  };
  geometry?: {
    type: "Polygon" | "MultiPolygon" | string;
    coordinates: PolygonCoordinates | MultiPolygonCoordinates;
  };
};

type Position = [number, number];
type PolygonCoordinates = Position[][];
type MultiPolygonCoordinates = PolygonCoordinates[];

function ringArea(ring: Position[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j];
    const [x2, y2] = ring[i];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function normalizePolygonRings(coordinates: PolygonCoordinates): PolygonCoordinates {
  return coordinates.map((ring, index) => {
    const area = ringArea(ring);
    const shouldReverse = index === 0 ? area > 0 : area < 0;
    return shouldReverse ? [...ring].reverse() : ring;
  });
}

function normalizeDistrictGeography(geo: DistrictGeometry): DistrictGeometry {
  if (geo.geometry?.type === "Polygon") {
    return {
      ...geo,
      geometry: {
        ...geo.geometry,
        coordinates: normalizePolygonRings(geo.geometry.coordinates as PolygonCoordinates),
      },
    };
  }

  if (geo.geometry?.type === "MultiPolygon") {
    return {
      ...geo,
      geometry: {
        ...geo.geometry,
        coordinates: (geo.geometry.coordinates as MultiPolygonCoordinates).map(normalizePolygonRings),
      },
    };
  }

  return geo;
}

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
  NV: [-116.5, 38.8, 3200], NH: [-71.6, 44.1, 8200],   NJ: [-74.5, 40.1, 11000],
  NM: [-106.1, 34.5, 3800], NY: [-75.5, 42.8, 3800],   NC: [-79.4, 35.5, 4400],
  ND: [-100.5, 47.5, 5200], OH: [-82.8, 40.4, 5000],   OK: [-97.5, 35.5, 4500],
  OR: [-120.5, 43.9, 3600], PA: [-77.2, 40.9, 5000],   RI: [-71.5, 41.7, 26000],
  SC: [-80.9, 33.8, 5800],  SD: [-100.2, 44.4, 5200],  TN: [-86.7, 35.9, 4600],
  TX: [-99.5, 31.5, 1700],  UT: [-111.5, 39.5, 4400],  VT: [-72.7, 44.0, 11000],
  VA: [-79.4, 37.5, 4400],  WA: [-120.5, 47.5, 4200],  WV: [-80.5, 38.9, 6000],
  WI: [-89.8, 44.6, 4200],  WY: [-107.5, 43.0, 4800],
};

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute top-2 right-2 z-10 text-[10px] font-semibold px-2 py-1 rounded-md"
      style={{ background: "var(--app-panel)", border: "1px solid var(--app-border)", color: "var(--app-text-muted)", opacity: 0.92 }}
    >
      Reset
    </button>
  );
}

export default function DistrictMiniMap({
  raceId,
  stateAbbr,
  margin,
  boundaryYears,
}: {
  raceId: string;
  stateAbbr: string;
  margin: number;
  boundaryYears?: number[];
}) {
  const [mapKey, setMapKey] = useState(0);
  const [viewChanged, setViewChanged] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(boundaryYears?.[0] ?? null);

  const proj = STATE_PROJ[stateAbbr] ?? [-96, 38, 800];
  const stateFips = raceId.slice(0, 2);
  const targetGeoid = raceId.endsWith("01") ? raceId.slice(0, -2) + "00" : raceId;
  const highlightColor = getRaceColor(margin);
  const mapStroke = "var(--app-bg)";
  const mutedFill = "var(--app-border)";
  const geoUrl = selectedYear ? getGeoUrlForYear(selectedYear) : DISTRICTS_URL;

  const showYearToggle = boundaryYears && boundaryYears.length > 1;

  return (
    <div style={{ position: "relative", height: "100%", minHeight: 180, background: "var(--app-bg)", borderRadius: 8, overflow: "hidden" }}>
      {/* Year toggle — top left */}
      {showYearToggle && (
        <div className="absolute top-2 left-2 z-10 flex rounded-md overflow-hidden" style={{ border: "1px solid var(--app-border)", opacity: 0.92 }}>
          {boundaryYears.map(year => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className="text-[10px] font-semibold px-2 py-1 transition-colors"
              style={
                year === selectedYear
                  ? { background: "var(--app-tab-bg)", color: "var(--app-text-primary)" }
                  : { background: "var(--app-panel)", color: "var(--app-text-muted)" }
              }
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {viewChanged && <ResetButton onClick={() => { setMapKey(k => k + 1); setViewChanged(false); }} />}

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: proj[2], center: [proj[0], proj[1]] }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup key={mapKey} onMoveEnd={() => setViewChanged(true)}>
          <Geographies
            key={geoUrl}
            geography={geoUrl}
            parseGeographies={(geographies: DistrictGeometry[]) => geographies.map(normalizeDistrictGeography)}
          >
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
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
