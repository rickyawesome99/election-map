#!/usr/bin/env node
/**
 * Merges per-state state-legislative district GeoJSON (converted from Census TIGER SLDL/SLDU
 * shapefiles via ogr2ogr, or from a state's own GIS source when TIGER is stale) into the two
 * combined national source files: data-entry/state-leg-districts-2026-source/state-house-
 * districts-2026.json and state-senate-districts-2026.json.
 *
 * These combined files are the source of truth but aren't served directly — StateLegDistrictMap.tsx
 * fetches per-state TopoJSON from public/state-leg-districts/. After running this script, rerun
 * scripts/split-state-leg-districts.mjs to regenerate those per-state files.
 *
 * Usage: node scripts/build-state-leg-districts.mjs <manifest.json>
 * manifest.json: [{ "file": "path/to/state.geojson", "chamber": "house"|"senate", "stateFips": "39",
 *                    "source": "tiger" | "custom", "customFields"?: { geoidFrom: "Name", pad: 3 } }]
 *
 * Winding order is intentionally left as-is (RFC 7946 standard from ogr2ogr) — the renderer
 * normalizes it at render time via lib/geoWinding.ts, so no pre-processing is needed here.
 */

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { tmpdir } from "os";

const OUT_FILES = {
  house: "data-entry/state-leg-districts-2026-source/state-house-districts-2026.json",
  senate: "data-entry/state-leg-districts-2026-source/state-senate-districts-2026.json",
};

function normalizeFeature(feature, stateFips, source, customFields) {
  const props = feature.properties;

  if (source === "tiger") {
    const districtCode = props.SLDLST ?? props.SLDUST;
    return {
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        STATEFP: props.STATEFP,
        GEOID: props.GEOID,
        DISTRICT: String(parseInt(districtCode, 10)),
        NAMELSAD: props.NAMELSAD,
      },
    };
  }

  // Custom (non-TIGER) source — caller specifies which field holds the district identifier.
  // Usually numeric (padded into GEOID), but some states (e.g. NH's county-prefixed "BE1",
  // "CH14" county-legislative-district codes) use non-numeric identifiers — those pass through
  // as-is instead of being parsed/padded.
  const raw = String(props[customFields.geoidFrom]);
  const isNumeric = /^\d+$/.test(raw);
  const districtId = isNumeric ? String(parseInt(raw, 10)) : raw;
  const geoidSuffix = isNumeric ? districtId.padStart(customFields.pad ?? 3, "0") : raw;
  return {
    type: "Feature",
    geometry: feature.geometry,
    properties: {
      STATEFP: stateFips,
      GEOID: `${stateFips}${geoidSuffix}`,
      DISTRICT: districtId,
      NAMELSAD: customFields.namePrefix ? `${customFields.namePrefix} ${districtId}` : `District ${districtId}`,
    },
  };
}

function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error("Usage: node scripts/build-state-leg-districts.mjs <manifest.json>");
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const byChamber = { house: [], senate: [] };

  for (const entry of manifest) {
    const raw = JSON.parse(readFileSync(entry.file, "utf8"));
    const isZZZ = (f) => {
      const code = f.properties.SLDLST ?? f.properties.SLDUST ?? "";
      return String(code).includes("ZZ");
    };
    const features = raw.features
      .filter((f) => entry.source !== "tiger" || !isZZZ(f))
      .map((f) => normalizeFeature(f, entry.stateFips, entry.source, entry.customFields));
    console.log(`${entry.file}: ${features.length} districts -> ${entry.chamber}`);
    byChamber[entry.chamber].push(...features);
  }

  for (const chamber of ["house", "senate"]) {
    const newFeatures = byChamber[chamber];
    if (newFeatures.length === 0) continue;

    const outPath = OUT_FILES[chamber];
    const existing = JSON.parse(readFileSync(outPath, "utf8"));
    const newStateFips = new Set(newFeatures.map((f) => f.properties.STATEFP));
    const kept = existing.features.filter((f) => !newStateFips.has(f.properties.STATEFP));

    // Simplify the newly-added features with mapshaper before merging (existing/kept features
    // were already simplified in a prior run).
    // Distance-based (100 m, Visvalingam) rather than the original "-simplify 3%" (keep 3% of
    // vertices): a percentage is applied across the whole state, so small urban districts lost
    // nearly all of their vertices - Chicago's IL House districts collapsed to 5-point blobs with
    // ~35-50% area overlap against the real lines (found 2026-08-26 while overlaying precinct
    // results onto these polygons). interval=100 keep-shapes costs ~40% more bytes per state
    // (IL House TopoJSON 88 KB -> 124 KB) and keeps every district within IoU 0.97 of the source.
    const tmpIn = join(tmpdir(), `state-leg-${chamber}-raw.json`);
    const tmpOut = join(tmpdir(), `state-leg-${chamber}-simplified.json`);
    writeFileSync(tmpIn, JSON.stringify({ type: "FeatureCollection", features: newFeatures }));
    execSync(`npx mapshaper "${tmpIn}" -simplify interval=100 keep-shapes -o "${tmpOut}" format=geojson`, { stdio: "pipe" });
    const simplified = JSON.parse(readFileSync(tmpOut, "utf8"));

    const updated = { type: "FeatureCollection", features: [...kept, ...simplified.features] };
    writeFileSync(outPath, JSON.stringify(updated));
    console.log(`Wrote ${outPath}: ${updated.features.length} total features (${simplified.features.length} new)`);
  }
}

main();
