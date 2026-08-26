#!/usr/bin/env node
/**
 * Splits the combined state-legislative-district source files (one FeatureCollection per
 * chamber, all 50 states) into per-state TopoJSON files for the browser to fetch.
 *
 * StateLegDistrictMap.tsx used to fetch the two combined national GeoJSON files on every state
 * page load (10.9 MB house / 6.5 MB senate) and filter client-side down to one state. This script
 * instead produces public/state-leg-districts/<chamber>/<ABBR>.json, so a state page only
 * downloads that state's own districts (tens of KB, as TopoJSON instead of GeoJSON).
 *
 * Source of truth stays data-entry/state-leg-districts-2026-source/state-{house,senate}-
 * districts-2026.json — build-state-leg-districts.mjs (new boundary sourcing) and
 * build-state-leg-incumbents.mjs (incumbent matching) both read/write that combined file; rerun
 * this script after either one touches it.
 *
 * Usage: node scripts/split-state-leg-districts.mjs
 */

import { execSync } from "child_process";
import { readdirSync, renameSync, rmSync, mkdtempSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const SOURCE_FILES = {
  house: "data-entry/state-leg-districts-2026-source/state-house-districts-2026.json",
  senate: "data-entry/state-leg-districts-2026-source/state-senate-districts-2026.json",
};
const OUT_DIRS = {
  house: "public/state-leg-districts/house",
  senate: "public/state-leg-districts/senate",
};

const FIPS_TO_ABBR = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE",
  "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS",
  "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
  "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY",
  "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC",
  "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
  "55": "WI", "56": "WY",
};

function splitChamber(chamber) {
  const srcPath = SOURCE_FILES[chamber];
  const outDir = OUT_DIRS[chamber];
  const tmpDir = mkdtempSync(join(tmpdir(), `state-leg-split-${chamber}-`));

  console.log(`Splitting ${srcPath}...`);
  execSync(`npx mapshaper "${srcPath}" -split STATEFP apart -o "${tmpDir}/" format=topojson singles`, { stdio: "pipe" });

  // Clear and repopulate the output dir so a state removed from the source doesn't leave a stale file.
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
  console.log(`  Wrote ${count} files to ${outDir}/`);
}

for (const chamber of ["house", "senate"]) {
  splitChamber(chamber);
}
