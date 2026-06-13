"use client";

import { useGeographies } from "react-simple-maps";

const CURRENT_DISTRICTS_URL = "/congressional-districts-2026.json";

type LandGeometry = {
  rsmKey: string;
  svgPath?: string;
  properties?: {
    GEOID?: string;
  };
};

export default function StateLandClipPath({
  clipPathId,
  stateFips,
}: {
  clipPathId: string;
  stateFips: string;
}) {
  const { geographies } = useGeographies({ geography: CURRENT_DISTRICTS_URL }) as {
    geographies: LandGeometry[];
  };
  const landGeographies = geographies.filter(
    (geo) => geo.properties?.GEOID?.startsWith(stateFips) && geo.svgPath
  );

  return (
    <defs>
      <clipPath id={clipPathId} clipPathUnits="userSpaceOnUse">
        {landGeographies.length === 0 ? (
          <rect x="-10000" y="-10000" width="20000" height="20000" />
        ) : (
          landGeographies.map((geo) => (
            <path key={`clip-${geo.rsmKey}`} d={geo.svgPath} />
          ))
        )}
      </clipPath>
    </defs>
  );
}
