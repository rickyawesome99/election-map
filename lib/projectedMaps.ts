// Pre-projected national maps. Every national map draws with react-simple-maps' geoAlbersUsa, and
// turning the TopoJSON into SVG paths (spherical projection, clipping, resampling) was the largest
// single piece of main-thread work on the site's map pages — over a second on a mid-range phone for
// the county map. scripts/build-projected-maps.ts runs that step once per (file, frame) below and
// writes the finished path strings to public/maps/; components/maps/Geographies.tsx draws from
// them, and falls back to projecting at runtime for any pair that is not listed here.
//
// A frame is a ComposableMap's width × height and projectionConfig.scale (the projection's
// translate is always the frame's center). It must match the component's ComposableMap exactly:
// the lookup is by the live projection's scale and translate, so a frame changed on one side only
// falls back to runtime projection (with a console warning in development) rather than misdrawing.
// Re-run `npm run projected-maps` after changing a frame here or any source file below.

export type MapFrame = { width: number; height: number; scale: number };

export const STATES_10M_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
export const COUNTIES_10M_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";

const FORECAST: MapFrame = { width: 960, height: 600, scale: 1200 }; // components/ForecastMap
const COUNTY: MapFrame = { width: 975, height: 610, scale: 1200 }; // components/NationalCountyMap
const OVERVIEW: MapFrame = { width: 800, height: 600, scale: 1120 }; // components/OverviewEditorial
const LEGISLATURES: MapFrame = { width: 975, height: 610, scale: 1100 }; // components/LegislatureControlMap
const STATES_OVERVIEW: MapFrame = { width: 800, height: 600, scale: 1100 }; // components/StatesOverviewMap
const TPL: MapFrame = { width: 800, height: 600, scale: 1000 }; // components/tpl/TplMaps DEFAULT_FRAME
const WIDE: MapFrame = { width: 800, height: 480, scale: 1000 }; // TplMaps WIDE_FRAME, components/turnout/TurnoutMap

// The district files by map era (lib/congressionalDistricts getCongressionalDistrictsGeoUrl), drawn
// with their rings rewound (lib/geoWinding) as both maps that use them do.
const DISTRICT_ERAS = [
  "/congressional-districts-2016.json", "/congressional-districts-2018.json", "/congressional-districts-pre2022.json",
  "/congressional-districts-2022.json", "/congressional-districts-2024.json", "/congressional-districts-2026-land.json",
];
const CD_LITE = "/congressional-districts-2026-lite.json";
const CD_LITE_LINES = "/congressional-districts-2026-lite-state-lines.json";

export type ProjectedMapSpec = { src: string; frame: MapFrame; winding?: boolean };

export const PROJECTED_MAPS: ProjectedMapSpec[] = [
  ...[FORECAST, COUNTY, OVERVIEW, LEGISLATURES, STATES_OVERVIEW, TPL, WIDE].map((frame) => ({ src: STATES_10M_URL, frame })),
  ...[FORECAST, TPL, WIDE].flatMap((frame) => [{ src: CD_LITE, frame }, { src: CD_LITE_LINES, frame }]),
  { src: "/us-counties.json", frame: COUNTY },
  { src: COUNTIES_10M_URL, frame: WIDE },
  ...[COUNTY, WIDE].flatMap((frame) => DISTRICT_ERAS.map((src) => ({ src, frame, winding: true }))),
];

/** The public path of one pre-projected file: /maps/<source name>-<w>x<h>-s<scale>.json. */
export function projectedMapPath({ src, frame }: ProjectedMapSpec): string {
  const name = src.split("/").pop()!.replace(/\.json$/, "");
  return `/maps/${name}-${frame.width}x${frame.height}-s${frame.scale}.json`;
}

/** The pre-projected file for `src` drawn by a projection with this scale and translate, if one is built. */
export function findProjectedMap(src: string, scale: number, translate: [number, number]): string | null {
  const spec = PROJECTED_MAPS.find((m) => m.src === src && m.frame.scale === scale
    && m.frame.width / 2 === translate[0] && m.frame.height / 2 === translate[1]);
  return spec ? projectedMapPath(spec) : null;
}

/** One feature of a pre-projected file: rsm's feature fields, with the SVG path already drawn. */
export type ProjectedFeature = { id?: string | number; properties?: Record<string, unknown>; svgPath: string };
