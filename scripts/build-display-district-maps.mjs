#!/usr/bin/env node
/**
 * Builds every congressional-district boundary file the site DRAWS, clipped to the shoreline.
 *
 * Several of the source boundary files run coastal districts out to the edge of state waters
 * (Census TIGER, or a cartographic file whose simplification bloated the coast), so bays,
 * sounds, the Gulf and the Great Lakes were painted as land: FL/NC/LA on most vintages,
 * MA/RI/HI/DE/MD/NJ/CT/WI/AK/ME/WA on every pre-2026 one, OH on all of them. Clipping once
 * here replaces the runtime SVG land masks (StateLandMask/NationalLandMask), which were both
 * incomplete (OH/WI only) and the main cost of panning a district map.
 *
 * Shoreline: data-entry/shoreline/us-land-cb2024-500k.json = Census cb_2024_us_state_500k
 * dissolved (clipped at the coast and the Great Lakes shore). To rebuild it:
 *   curl -LO https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_state_500k.zip && unzip it, then
 *   npx mapshaper cb_2024_us_state_500k.shp -dissolve -rename-layers land \
 *     -o data-entry/shoreline/us-land-cb2024-500k.json format=topojson force
 *
 * Inputs (untrimmed; never overwritten here):
 *   data-entry/district-maps-untrimmed/congressional-districts-{2016,2018,pre2022,2022,2024}.json
 *   public/congressional-districts-2026.json — stays untrimmed on purpose: DistrictFinder looks
 *     addresses up in it (a 1:500k shoreline would drop some waterfront points) and the tract /
 *     demographics builders read it as source data.
 * Outputs (display only):
 *   public/congressional-districts-{2016,2018,pre2022,2022,2024}.json  (clipped in place)
 *   public/congressional-districts-2026-land.json                       (clipped 2026, full detail)
 *   public/state-congressional-districts-2026/{ST}.json                 (split of the clipped 2026)
 *   public/congressional-districts-2026-lite.json                       (clipped 2026, 20% simplified)
 *   public/congressional-districts-2026-lite-state-lines.json           (interior state borders of the lite file)
 *
 * Re-run after any 2026 line change (after public/congressional-districts-2026.json is spliced).
 * Usage: node scripts/build-display-district-maps.mjs
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const LAND = "data-entry/shoreline/us-land-cb2024-500k.json";
const FIPS_TO_ABBR = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC",
  "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS",
  "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
  "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY",
  "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC",
  "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
  "55": "WI", "56": "WY",
};

const run = (cmd) => execSync(`npx mapshaper ${cmd}`, { stdio: "pipe" });

// The shoreline is simplified before clipping, so a clipped coast carries about as much detail
// as the district lines around it: ~1 km for the coarse older eras and the national lite map
// (+3-16% file size), ~300 m for the 2026 file the state pages zoom into. Water-only "ZZ"
// districts clip to nothing and are dropped.
function clip(src, out, layer, shoreInterval, quantization) {
  const tmp = mkdtempSync(join(tmpdir(), "shore-"));
  const shore = join(tmp, "shore.json");
  run(`"${LAND}" -simplify interval=${shoreInterval} keep-shapes -o "${shore}" format=topojson force`);
  run(`"${src}" -clip "${shore}" -filter remove-empty -rename-layers "${layer}" -o "${out}" format=topojson quantization=${quantization} force`);
  rmSync(tmp, { recursive: true });
}

function featureIds(path) {
  const t = JSON.parse(readFileSync(path, "utf8"));
  return new Set(Object.values(t.objects)[0].geometries.map((g) => g.properties?.GEOID).filter((id) => /^\d{4}$/.test(id ?? "")));
}

// Every real district (4-digit GEOID, not ZZ) must survive the clip.
function assertSameDistricts(src, out) {
  const before = featureIds(src);
  const after = featureIds(out);
  const lost = [...before].filter((id) => !after.has(id) && !id.endsWith("ZZ"));
  if (lost.length) throw new Error(`${out}: clipping dropped districts ${lost.join(", ")}`);
  console.log(`  ${out}: ${after.size} districts`);
}

console.log("Older map eras (clipped in place)...");
for (const v of ["2016", "2018", "pre2022", "2022", "2024"]) {
  const src = `data-entry/district-maps-untrimmed/congressional-districts-${v}.json`;
  const out = `public/congressional-districts-${v}.json`;
  clip(src, out, `congressional-districts-${v}`, 1000, 3e4);
  assertSameDistricts(src, out);
}

console.log("2026 lines...");
const SRC_2026 = "public/congressional-districts-2026.json";
const LAND_2026 = "public/congressional-districts-2026-land.json";
clip(SRC_2026, LAND_2026, "congressional-districts-2026", 300, 1e5);
assertSameDistricts(SRC_2026, LAND_2026);

// Per-state split; each file's layer is named by its STATEFP (as scripts/split-national-maps.mjs did).
const splitTmp = mkdtempSync(join(tmpdir(), "cd-split-"));
run(`"${LAND_2026}" -split STATEFP apart -o "${splitTmp}/" format=topojson singles`);
const STATE_DIR = "public/state-congressional-districts-2026";
if (existsSync(STATE_DIR)) rmSync(STATE_DIR, { recursive: true });
mkdirSync(STATE_DIR);
for (const file of readdirSync(splitTmp)) {
  const abbr = FIPS_TO_ABBR[file.replace(/\.json$/, "")];
  if (!abbr) throw new Error(`unknown STATEFP in split: ${file}`);
  renameSync(join(splitTmp, file), join(STATE_DIR, `${abbr}.json`));
}
rmSync(splitTmp, { recursive: true });
console.log(`  ${STATE_DIR}/: ${readdirSync(STATE_DIR).length} states`);

// National hub maps (ForecastMap House view, TPL hub): clipped to the ~1 km shoreline, then 20%
// simplified — path size is what makes those maps lag on phones.
const LITE = "public/congressional-districts-2026-lite.json";
clip(SRC_2026, LITE, "congressional-districts-2026", 1000, 1e5);
run(`"${LITE}" -simplify 20% keep-shapes -o "${LITE}" format=topojson quantization=1e5 force`);
run(`public/congressional-districts-2026-lite.json -dissolve STATEFP -innerlines -rename-layers state-lines -o public/congressional-districts-2026-lite-state-lines.json format=topojson quantization=1e5 force`);
assertSameDistricts(SRC_2026, LITE);
console.log("Done.");
