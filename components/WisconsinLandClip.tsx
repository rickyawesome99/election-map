import { Geographies, Geography } from "react-simple-maps";

const COUNTIES_URL = "/us-counties.json";

type CountyGeometry = {
  rsmKey: string;
  id?: string | number;
};

export const WISCONSIN_LAND_CLIP_ID = "wisconsin-land-clip";

/** Clips Census district water boundaries back to Wisconsin's land shoreline. */
export function WisconsinLandClip() {
  return (
    <defs>
      <mask
        id={WISCONSIN_LAND_CLIP_ID}
        maskUnits="objectBoundingBox"
        maskContentUnits="userSpaceOnUse"
        x="-5%"
        y="-5%"
        width="110%"
        height="110%"
      >
        <Geographies geography={COUNTIES_URL}>
          {({ geographies }: { geographies: CountyGeometry[] }) =>
            geographies
              .filter((geo) => String(geo.id ?? "").padStart(5, "0").startsWith("55"))
              .map((geo) => (
                <Geography key={geo.rsmKey} geography={geo} fill="#fff" stroke="#fff" strokeWidth={2} />
              ))
          }
        </Geographies>
      </mask>
    </defs>
  );
}

export function WisconsinLandMask({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <g mask={enabled ? `url(#${WISCONSIN_LAND_CLIP_ID})` : undefined}>
      {children}
    </g>
  );
}
