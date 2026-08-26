import { Geographies, Geography } from "react-simple-maps";
import { FIPS_TO_STATE } from "@/lib/fips";

// Per-state TopoJSON, split from public/us-counties.json by scripts/split-national-maps.mjs.
const countiesUrl = (stateFips: string) => `/state-counties/${FIPS_TO_STATE[stateFips]?.abbr}.json`;
// Natural Earth Admin-1 lakes variant; kept local so the map has no runtime network dependency.
const OHIO_LAND_URL = "/ohio-land.json";
const US_LAND_URL = "/us-land.json";
const NATIONAL_LAND_MASK_ID = "national-land-mask";

type CountyGeometry = {
  rsmKey: string;
  id?: string | number;
};

const LAND_MASK_FIPS: Record<string, string> = {
  OH: "39",
  WI: "55",
};

export function getLandMaskFips(stateAbbr: string): string | null {
  return LAND_MASK_FIPS[stateAbbr] ?? null;
}

function maskId(stateFips: string): string {
  return `state-${stateFips}-land-mask`;
}

/** Clips Census district water boundaries back to the state's county-defined shoreline. */
export function StateLandMaskDefinition({ stateFips }: { stateFips: string }) {
  const geography = stateFips === "39" ? OHIO_LAND_URL : countiesUrl(stateFips);

  return (
    <defs>
      <mask
        id={maskId(stateFips)}
        maskUnits="objectBoundingBox"
        maskContentUnits="userSpaceOnUse"
        x="-5%"
        y="-5%"
        width="110%"
        height="110%"
      >
        <Geographies geography={geography}>
          {({ geographies }: { geographies: CountyGeometry[] }) =>
            geographies.map((geo) => (
              <Geography key={geo.rsmKey} geography={geo} fill="#fff" stroke="#fff" strokeWidth={2} />
            ))
          }
        </Geographies>
      </mask>
    </defs>
  );
}

export function StateLandMask({
  stateFips,
  children,
}: {
  stateFips: string | null;
  children: React.ReactNode;
}) {
  return <g mask={stateFips ? `url(#${maskId(stateFips)})` : undefined}>{children}</g>;
}

/** Removes Great Lakes and coastal water assignments from the national district layer. */
export function NationalLandMaskDefinition() {
  return (
    <defs>
      <mask
        id={NATIONAL_LAND_MASK_ID}
        maskUnits="objectBoundingBox"
        maskContentUnits="userSpaceOnUse"
        x="-5%"
        y="-5%"
        width="110%"
        height="110%"
      >
        <Geographies geography={US_LAND_URL}>
          {({ geographies }: { geographies: CountyGeometry[] }) =>
            geographies.map((geo) => (
              <Geography key={geo.rsmKey} geography={geo} fill="#fff" stroke="#fff" strokeWidth={0.5} />
            ))
          }
        </Geographies>
      </mask>
    </defs>
  );
}

export function NationalLandMask({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <g mask={enabled ? `url(#${NATIONAL_LAND_MASK_ID})` : undefined}>{children}</g>;
}
