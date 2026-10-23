"use client";

import { forwardRef, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { Geographies as RsmGeographies, MapContext } from "react-simple-maps";
import { PROJECTED_MAPS, findProjectedMap, type ProjectedFeature } from "@/lib/projectedMaps";

// Drop-in for react-simple-maps' <Geographies>: for a national map listed in lib/projectedMaps.ts
// it draws from the pre-projected file (finished SVG paths) instead of projecting the TopoJSON in
// the browser, and skips the two border meshes react-simple-maps also builds and projects for every
// file (none of our maps use them). Anything else — a state map's fitted projection, an inline
// geography object, a frame not in the list — goes to react-simple-maps unchanged.

type Projected = ProjectedFeature & { rsmKey: string };
type Props = {
  geography: string | object;
  parseGeographies?: (features: never[]) => unknown[];
  className?: string;
  children: (args: { geographies: never[]; path: unknown; projection: unknown }) => ReactNode;
};

// Module-level, so a map remounted by a tab switch or a client navigation draws at once.
const loading = new Map<string, Promise<Projected[] | null>>();
const loaded = new Map<string, Projected[]>();
const listeners = new Set<() => void>();
const subscribe = (onChange: () => void) => { listeners.add(onChange); return () => { listeners.delete(onChange); }; };

function load(url: string): Promise<Projected[] | null> {
  let p = loading.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<ProjectedFeature[]>) : null))
      // rsmKey matches react-simple-maps' own ("geo-<index>"), so keys are stable across the swap.
      .then((fs) => (fs ? fs.map((f, i) => ({ ...f, rsmKey: `geo-${i}` })) : null))
      .then((fs) => { if (fs) { loaded.set(url, fs); listeners.forEach((l) => l()); } return fs; })
      .catch(() => null);
    loading.set(url, p);
  }
  return p;
}

const KNOWN_SOURCES = new Set(PROJECTED_MAPS.map((m) => m.src));
const warned = new Set<string>();

type D3Projection = { scale?: () => number; translate?: () => [number, number] };

const Geographies = forwardRef<SVGGElement, Props>(function Geographies({ geography, parseGeographies, children, className = "", ...rest }, ref) {
  const { projection, path } = useContext(MapContext) as { projection: D3Projection; path: unknown };
  const url = typeof geography === "string" && projection?.scale && projection.translate
    ? findProjectedMap(geography, projection.scale(), projection.translate())
    : null;
  if (url) {
    return <ProjectedGeographies ref={ref} url={url} path={path} projection={projection} className={className} rest={rest}>{children}</ProjectedGeographies>;
  }
  if (process.env.NODE_ENV !== "production" && typeof geography === "string" && KNOWN_SOURCES.has(geography) && !warned.has(geography)) {
    warned.add(geography);
    console.warn(`[maps] ${geography} has no pre-projected file for this map's frame; projecting at runtime. Add the frame to lib/projectedMaps.ts and run \`npm run projected-maps\`.`);
  }
  return <RsmGeographies ref={ref} geography={geography} parseGeographies={parseGeographies} className={className} {...rest}>{children}</RsmGeographies>;
});

const ProjectedGeographies = forwardRef<SVGGElement, {
  url: string; path: unknown; projection: unknown; className: string; rest: object; children: Props["children"];
}>(function ProjectedGeographies({ url, path, projection, className, rest, children }, ref) {
  useEffect(() => { void load(url); }, [url]);
  // Empty on the server and at hydration, as react-simple-maps' own first render is; from then on
  // the session cache, so a remounted map draws in its first frame.
  const geographies = useSyncExternalStore(subscribe, () => loaded.get(url) ?? null, () => null);
  return (
    <g ref={ref} className={`rsm-geographies ${className}`} {...rest}>
      {geographies && geographies.length > 0 && children({ geographies: geographies as never[], path, projection })}
    </g>
  );
});

export default Geographies;
