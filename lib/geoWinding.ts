type Position = [number, number];
type PolygonCoordinates = Position[][];
type MultiPolygonCoordinates = PolygonCoordinates[];

export type WindableGeography = {
  geometry?: {
    type: "Polygon" | "MultiPolygon" | string;
    coordinates: PolygonCoordinates | MultiPolygonCoordinates;
  };
};

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

/** Some congressional-district topojson exports have inconsistent ring winding, which
 * makes react-simple-maps render holes as fills. Normalizes to the right-hand rule. */
export function normalizeGeographyWinding<T extends WindableGeography>(geo: T): T {
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
