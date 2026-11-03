"use client";

import { useMemo } from "react";
import { feature } from "topojson-client";
import { geoAlbersUsa, geoPath } from "d3-geo";
import type { Topology, GeometryCollection } from "topojson-specification";
import { useTopo } from "@/lib/useTopology";
import { ABBR_TO_FIPS } from "@/lib/fips";

// A small silhouette of one state, for the poll-closing list (ResultsPage ClosingTable). Every
// state is drawn once in one Albers USA frame from the same us-atlas file the results map loads
// (cached by loadTopo), then each glyph crops the frame to its state's bounds.

const STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

type Glyph = { d: string; viewBox: string };
let built: { topo: object; glyphs: Map<string, Glyph> } | null = null;

function glyphsFor(topo: object): Map<string, Glyph> {
  if (built?.topo === topo) return built.glyphs;
  const t = topo as Topology;
  const fc = feature(t, t.objects.states as GeometryCollection);
  const path = geoPath(geoAlbersUsa().scale(1000).translate([480, 300]));
  const glyphs = new Map<string, Glyph>();
  for (const f of fc.features) {
    const d = path(f);
    if (!d) continue;
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const pad = Math.max(x1 - x0, y1 - y0) * 0.04;
    glyphs.set(String(f.id).padStart(2, "0"), { d, viewBox: `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}` });
  }
  built = { topo, glyphs };
  return glyphs;
}

export default function StateGlyph({ state, className = "" }: { state: string; className?: string }) {
  const topo = useTopo(STATES_URL);
  const glyph = useMemo(() => (topo ? glyphsFor(topo).get(ABBR_TO_FIPS[state]) ?? null : null), [topo, state]);
  return (
    <svg viewBox={glyph?.viewBox ?? "0 0 1 1"} preserveAspectRatio="xMidYMid meet" className={`rc-glyph ${className}`} aria-hidden="true">
      {glyph && <path d={glyph.d} fill="color-mix(in srgb, var(--app-text-primary) 16%, transparent)" stroke="color-mix(in srgb, var(--app-text-primary) 30%, transparent)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
    </svg>
  );
}
