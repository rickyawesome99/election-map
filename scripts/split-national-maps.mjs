#!/usr/bin/env node
/**
 * Optimizes the national county + current-cycle (2026) congressional-district GeoJSON files
 * for the two ways they're consumed:
 *
 *  - True national consumers (NationalCountyMap, ForecastMap, TplModelPage, DistrictFinderMap)
 *    render every state/district at once and need the whole file — these keep fetching
 *    public/us-counties.json and public/congressional-districts-2026.json under their existing
 *    filenames, just converted to TopoJSON in place (arc-sharing + quantization, no geometry
 *    loss; ~70-80% smaller).
 *  - Single-state consumers (StateCountyMap, StateDistrictMap, StateLandMask's per-state mask,
 *    DistrictMiniMap for 2026 boundaries) previously fetched one of those same national files
 *    and filtered client-side down to one state. They now fetch a per-state TopoJSON split
 *    instead: public/state-counties/{ABBR}.json and public/state-congressional-districts-2026/
 *    {ABBR}.json.
 *
 * The 5 older congressional-district year files (2016/2018/pre2022/2022/2024) are converted to
 * TopoJSON in place too, but NOT split — they're only fetched when a user manually selects a
 * past redistricting cycle (DistrictMiniMap's year toggle, HousePastMap/PastElectionsMap), too
 * low-traffic to justify 50 more files per year. See project memory for the write-up.
 *
 * Usage: node scripts/split-national-maps.mjs
 */

import { execSync } from "child_process";
import { readdirSync, renameSync, rmSync, mkdtempSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const FIPS_TO_ABBR = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC",
  "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS",
  "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
  "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY",
  "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC",
  "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
  "55": "WI", "56": "WY",
};

// county features carry state only as the leading 2 digits of the top-level GeoJSON `id`
// (e.g. "39033"), not as a STATEFP property, so a STATEFP field is derived before splitting.
const DERIVE_STATEFP_FROM_ID = `-each 'STATEFP=FID.toString().padStart(5,"0").slice(0,2)'`;

function splitByState(srcPath, outDir, deriveExpr = "") {
  const tmpDir = mkdtempSync(join(tmpdir(), "map-split-"));
  execSync(`npx mapshaper "${srcPath}" ${deriveExpr} -split STATEFP apart -o "${tmpDir}/" format=topojson singles`, { stdio: "pipe" });

  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  execSync(`mkdir -p "${outDir}"`);

  let count = 0;
  for (const file of readdirSync(tmpDir)) {
    const fips = file.replace(/\.json$/, "");
    const abbr = FIPS_TO_ABBR[fips];
    if (!abbr) {
      console.warn(`  Skipping unknown STATEFP ${fips} (${file})`);
      continue;
    }
    renameSync(join(tmpDir, file), join(outDir, `${abbr}.json`));
    count++;
  }
  rmSync(tmpDir, { recursive: true });
  console.log(`  Wrote ${count} per-state files to ${outDir}/`);
}

function convertInPlaceToTopoJSON(path) {
  execSync(`npx mapshaper "${path}" -o "${path}" format=topojson force`, { stdio: "pipe" });
  console.log(`  Converted ${path} to TopoJSON in place`);
}

console.log("Counties...");
splitByState("public/us-counties.json", "public/state-counties", DERIVE_STATEFP_FROM_ID);
convertInPlaceToTopoJSON("public/us-counties.json");

console.log("Congressional districts (2026, current cycle)...");
splitByState("public/congressional-districts-2026.json", "public/state-congressional-districts-2026");
convertInPlaceToTopoJSON("public/congressional-districts-2026.json");

console.log("Older congressional-district year files (national only, not split)...");
for (const year of ["2016", "2018", "pre2022", "2022", "2024"]) {
  convertInPlaceToTopoJSON(`public/congressional-districts-${year}.json`);
}
