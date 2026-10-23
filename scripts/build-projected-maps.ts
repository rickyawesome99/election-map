// Pre-projects the national maps listed in lib/projectedMaps.ts into public/maps/: for each source
// file and frame, the SVG path of every feature exactly as react-simple-maps would draw it at
// runtime (same d3-geo and topojson-client copies, same geoAlbersUsa set-up), rounded to 0.1 of a
// frame unit. Run with `npm run projected-maps` after changing a frame or a source file.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PROJECTED_MAPS, projectedMapPath } from "../lib/projectedMaps";
import { normalizeGeographyWinding, type WindableGeography } from "../lib/geoWinding";

const root = process.cwd();
// react-simple-maps bundles its own d3-geo (v2); resolve from its directory so the paths match the
// ones it would compute in the browser.
const rsmRequire = createRequire(join(dirname(createRequire(join(root, "package.json")).resolve("react-simple-maps/package.json")), "index.js"));
const d3 = rsmRequire("d3-geo");
const topojson = rsmRequire("topojson-client");

type Feature = WindableGeography & { id?: string | number; properties?: Record<string, unknown> };

// 0.1 of a frame unit is ~0.13 px on a 1,280 px wide map and ~1 px at the maps' deepest zoom.
const round = (d: string) => d.replace(/-?\d+\.\d+/g, (n) => {
  const r = (+n).toFixed(1).replace(/\.0$/, "");
  return r === "-0" ? "0" : r;
});

async function loadSource(src: string): Promise<{ type: string; objects: Record<string, unknown> }> {
  if (src.startsWith("http")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(readFileSync(join(root, "public", src), "utf8"));
}

async function main() {
  const outDir = join(root, "public", "maps");
  mkdirSync(outDir, { recursive: true });
  const written = new Set<string>();
  const sources = new Map<string, Promise<{ type: string; objects: Record<string, unknown> }>>();
  for (const spec of PROJECTED_MAPS) {
    if (!sources.has(spec.src)) sources.set(spec.src, loadSource(spec.src));
    const topo = await sources.get(spec.src)!;
    if (topo.type !== "Topology") throw new Error(`${spec.src}: not TopoJSON`);
    // react-simple-maps reads the first object of a topology.
    let features: Feature[] = topojson.feature(topo, topo.objects[Object.keys(topo.objects)[0]]).features;
    if (spec.winding) features = features.map(normalizeGeographyWinding);
    const { width, height, scale } = spec.frame;
    const path = d3.geoPath().projection(d3.geoAlbersUsa().translate([width / 2, height / 2]).scale(scale));
    const out = features.map((f) => ({
      ...(f.id != null ? { id: f.id } : {}),
      ...(f.properties ? { properties: f.properties } : {}),
      svgPath: round(path(f) ?? ""),
    }));
    const file = projectedMapPath(spec);
    writeFileSync(join(root, "public", file), JSON.stringify(out));
    written.add(file.split("/").pop()!);
    console.log(`${file}  ${out.length} features`);
  }
  // Drop files no longer listed.
  for (const name of readdirSync(outDir)) if (!written.has(name)) { rmSync(join(outDir, name)); console.log(`removed /maps/${name}`); }
}

main().catch((e) => { console.error(e); process.exit(1); });
