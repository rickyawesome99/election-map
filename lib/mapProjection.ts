import { geoMercator } from "d3-geo";

// Approximate bounding boxes [west, south, east, north] for each US state
const STATE_BBOX: Record<string, [number, number, number, number]> = {
  AL: [-88.47, 30.14, -84.89, 35.01],
  AK: [-168.00, 54.00, -130.00, 71.44],
  AZ: [-114.82, 31.33, -109.04, 37.00],
  AR: [-94.62, 33.00, -89.64, 36.50],
  CA: [-124.41, 32.53, -114.13, 42.01],
  CO: [-109.06, 36.99, -102.04, 41.00],
  CT: [-73.73, 40.95, -71.79, 42.05],
  DE: [-75.79, 38.45, -75.05, 39.84],
  FL: [-87.63, 24.52, -80.03, 31.00],
  GA: [-85.61, 30.36, -80.84, 35.00],
  HI: [-160.25, 18.91, -154.81, 22.24],
  ID: [-117.24, 41.99, -111.04, 49.00],
  IL: [-91.51, 36.97, -87.02, 42.51],
  IN: [-88.10, 37.77, -84.78, 41.77],
  IA: [-96.64, 40.38, -90.14, 43.50],
  KS: [-102.05, 36.99, -94.59, 40.00],
  KY: [-89.57, 36.50, -81.96, 39.15],
  LA: [-94.04, 28.93, -88.82, 33.02],
  ME: [-71.08, 43.06, -66.95, 47.46],
  MD: [-79.49, 37.91, -75.05, 39.72],
  MA: [-73.51, 41.24, -69.93, 42.89],
  MI: [-90.42, 41.70, -82.41, 48.19],
  MN: [-97.24, 43.50, -89.49, 49.38],
  MS: [-91.65, 30.17, -88.10, 34.99],
  MO: [-95.77, 35.99, -89.10, 40.61],
  MT: [-116.05, 44.36, -104.04, 49.00],
  NE: [-104.05, 40.00, -95.31, 43.00],
  NV: [-120.00, 35.00, -114.04, 42.00],
  NH: [-72.56, 42.70, -70.70, 45.31],
  NJ: [-75.56, 38.93, -73.89, 41.36],
  NM: [-109.05, 31.33, -103.00, 37.00],
  NY: [-79.76, 40.50, -71.86, 45.01],
  NC: [-84.32, 33.84, -75.46, 36.59],
  ND: [-104.05, 45.94, -96.55, 49.00],
  OH: [-84.82, 38.40, -80.52, 42.33],
  OK: [-103.00, 33.62, -94.43, 37.00],
  OR: [-124.57, 41.99, -116.46, 46.27],
  PA: [-80.52, 39.72, -74.69, 42.27],
  RI: [-71.91, 41.15, -71.12, 42.02],
  SC: [-83.36, 32.05, -78.54, 35.22],
  SD: [-104.06, 42.48, -96.44, 45.95],
  TN: [-90.31, 34.98, -81.65, 36.68],
  TX: [-106.65, 25.84, -93.51, 36.50],
  UT: [-114.05, 37.00, -109.04, 42.00],
  VT: [-73.44, 42.73, -71.46, 45.02],
  VA: [-83.68, 36.54, -75.17, 39.47],
  WA: [-124.74, 45.54, -116.92, 49.00],
  WV: [-82.64, 37.20, -77.72, 40.64],
  WI: [-92.89, 42.49, -86.81, 47.08],
  WY: [-111.06, 40.99, -104.05, 45.01],
};

export type ProjectionConfig = { center: [number, number]; scale: number };

export function fitStateProjection(
  stateAbbr: string,
  width: number,
  height: number,
  paddingFraction = 0.05
): ProjectionConfig | null {
  const bbox = STATE_BBOX[stateAbbr];
  if (!bbox || width <= 0 || height <= 0) return null;
  const [west, south, east, north] = bbox;
  const px = width * paddingFraction;
  const py = height * paddingFraction;
  const geojson = {
    type: "Feature" as const,
    geometry: {
      type: "MultiPoint" as const,
      coordinates: [
        [west, south],
        [east, north],
        [west, north],
        [east, south],
      ],
    },
    properties: null,
  };
  const proj = geoMercator().fitExtent(
    [[px, py], [width - px, height - py]],
    geojson
  );
  const scale = proj.scale();
  // invert finds the geographic coordinate that maps to the viewport center in this fitted projection
  const inverted = proj.invert!([width / 2, height / 2])!;
  const center: [number, number] = [inverted[0], inverted[1]];
  return { center, scale };
}
