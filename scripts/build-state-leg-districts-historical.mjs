#!/usr/bin/env node
/**
 * Builds the district boundaries for the SUPERSEDED map eras - the lines the 2016-2023 state
 * legislative elections were actually held on - so the year selector on a state legislature page
 * can show a historical result on the map that produced it.
 *
 * public/state-leg-districts/{chamber}/{ABBR}.json holds only the CURRENT map. Every era before
 * it (the 2011-cycle maps, the mid-decade court remedials in NC/VA/AL/FL, and the 2021-cycle maps
 * that were themselves redrawn after 2022) needs its own file, or a 2018 result gets painted onto
 * 2026 lines and district 12 is silently a different place.
 *
 * data/stateLegCalendar.ts already knows every era and which elections used it. One TIGER vintage
 * per era is enough because an era is by definition one set of lines; the vintage chosen is the
 * era's LAST election year, since TIGER for year Y is published in the August before that
 * November's election and so carries any plan enacted for it - confirmed against North Carolina,
 * whose three separate 2016/2018/2020 House maps each show up in that year's vintage (TIGER's own
 * LSY field does NOT track this: it still read 2018 in the 2020 files that carry the 2019
 * remedial's five changed districts).
 *
 * Output: public/state-leg-districts-historical/{chamber}/{ABBR}-{vintage}.json (TopoJSON), plus
 * data/stateLegHistoricalMaps.ts mapping each state/chamber/election-year to the file to fetch.
 * Kept out of public/state-leg-districts/ because split-state-leg-districts.mjs empties that
 * directory on every run.
 *
 * THREE ERAS CANNOT COME FROM TIGER - see ERA_SOURCE_OVERRIDES below. TIGER never ingested
 * Virginia's 2019 Bethune-Hill remedial (its VA House geometry is unchanged from 2016 through
 * 2021, then jumps at 2022) or North Carolina's 2019 remedial (every NC district differs from the
 * 2019 vintage by under 0.3%, which is the annual re-survey signature, not a redraw). Those three
 * come from the enacting body instead.
 *
 * Usage: node scripts/build-state-leg-districts-historical.mjs [--only AZ,VT] [--force]
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const CALENDAR_TS = "data/stateLegCalendar.ts";
const CACHE_DIR = "data-entry/tiger-state-leg-historical";
const OUT_ROOT = "public/state-leg-districts-historical";
const MAP_INDEX_TS = "data/stateLegHistoricalMaps.ts";

/**
 * Eras whose lines TIGER does not carry, keyed `${abbr}_${chamber}_${vintage}`. Each names the
 * archive to fetch from the body that enacted the plan, the attribute holding the district
 * number, and whether the source is one polygon per district or one per precinct - the Virginia
 * file is a precinct layer carrying each precinct's remedial district, so it has to be dissolved.
 *
 * All three are validated against the era before them by comparing per-district area: a real
 * remedial moves a large share of the districts, so if one of these ever silently reverts to the
 * previous plan, that check catches it (VA House moves 52 of 100, NC House 60 of 120, NC Senate
 * 15 of 50, each with an identical district roster and total area preserved to 1e-5).
 */
const ERA_SOURCE_OVERRIDES = {
  NC_house_2020: {
    url: "https://webservices.ncleg.gov/ViewBillDocument/2019/6563/0/HB%201020,%202nd%20Edition%20%E2%80%93%202019%20House%20Remedial%20Map_shp",
    file: "nc-house-2019-hb1020.zip",
    districtField: "DISTRICT",
    source: "N.C. General Assembly, HB 1020 2nd Edition (SL 2019-220), 2019 House Remedial Map",
  },
  NC_senate_2020: {
    url: "https://webservices.ncleg.gov/ViewBillDocument/2019/6588/0/SB%20692,%202nd%20Edition%20-%20Senate%20Consensus%20Nonpartisan%20Map%20v3_Shapefile",
    file: "nc-senate-2019-sb692.zip",
    districtField: "DISTRICT",
    source: "N.C. General Assembly, SB 692 2nd Edition, Senate Consensus Nonpartisan Map v3",
  },
  VA_house_2021: {
    url: "https://github.com/mggg-states/VA-shapefiles/raw/master/VA_precincts.zip",
    file: "va-precincts-mggg.zip",
    districtField: "HDIST_REM",
    dissolve: true,
    source: "MGGG / Princeton Gerrymandering Project VA precinct file, HDIST_REM (the 2019 Bethune-Hill court remedial plan)",
  },
};

const ABBR_TO_FIPS = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10",
  FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20",
  KY: "21", LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28",
  MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36",
  NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45",
  SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54",
  WI: "55", WY: "56",
};

/** Reads the generated calendar's object literal without needing a TS toolchain. */
function loadCalendar() {
  const src = readFileSync(CALENDAR_TS, "utf8");
  const marker = "stateLegCalendar: Record<string, Partial<Record<Chamber, StateLegCalendar>>> = ";
  const start = src.indexOf("{", src.indexOf(marker) + marker.length);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return JSON.parse(src.slice(start, i + 1));
  }
  throw new Error(`Could not find the object literal in ${CALENDAR_TS}`);
}

/**
 * Every (state, chamber, vintage) file the calendar implies, and the election years it serves.
 * The open-ended final era is skipped - that map is the one already in public/state-leg-districts.
 */
function plan(calendar) {
  const jobs = [];
  for (const [abbr, chambers] of Object.entries(calendar)) {
    for (const [chamber, cal] of Object.entries(chambers)) {
      for (const era of cal.eras) {
        if (era.lastYear === null || era.electionYears.length === 0) continue;
        jobs.push({
          abbr,
          chamber,
          vintage: Math.max(...era.electionYears),
          years: era.electionYears,
          totalSeats: era.totalSeats,
          source: era.source ?? "",
        });
      }
    }
  }
  return jobs.sort((a, b) => a.abbr.localeCompare(b.abbr) || a.chamber.localeCompare(b.chamber) || a.vintage - b.vintage);
}

function tigerUrl(abbr, chamber, vintage) {
  const layer = chamber === "house" ? "sldl" : "sldu";
  return `https://www2.census.gov/geo/tiger/TIGER${vintage}/${layer.toUpperCase()}/tl_${vintage}_${ABBR_TO_FIPS[abbr]}_${layer}.zip`;
}

function download(job) {
  const override = ERA_SOURCE_OVERRIDES[`${job.abbr}_${job.chamber}_${job.vintage}`];
  if (override) {
    const path = join(CACHE_DIR, override.file);
    if (!existsSync(path)) {
      execSync(`curl -sSL --fail --max-time 600 -o "${path}" "${override.url}"`, { stdio: "pipe" });
    }
    return path;
  }
  const layer = job.chamber === "house" ? "sldl" : "sldu";
  const zip = join(CACHE_DIR, `tl_${job.vintage}_${ABBR_TO_FIPS[job.abbr]}_${layer}.zip`);
  if (!existsSync(zip)) {
    execSync(`curl -sS --fail --max-time 300 -o "${zip}" "${tigerUrl(job.abbr, job.chamber, job.vintage)}"`, { stdio: "pipe" });
  }
  return zip;
}

/**
 * Same property normalization as build-state-leg-districts.mjs's tiger branch, so the historical
 * files answer to the same StateLegDistrictMap.extractDistrictCode as the current ones. The ZZ
 * pseudo-districts (TIGER's "not defined" water/unassigned areas) are dropped the same way.
 */
function convert(zip, job, outPath) {
  const work = join(tmpdir(), `tiger-hist-${job.abbr}-${job.chamber}-${job.vintage}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  execSync(`unzip -oq "${zip}" -d "${work}"`, { stdio: "pipe" });
  // __MACOSX holds AppleDouble stubs with the same names; they are not readable shapefiles.
  const shp = readdirSync(work, { recursive: true }).find((f) => f.endsWith(".shp") && !String(f).includes("__MACOSX"));
  if (!shp) throw new Error(`No .shp inside ${zip}`);

  const override = ERA_SOURCE_OVERRIDES[`${job.abbr}_${job.chamber}_${job.vintage}`];
  const geojsonPath = join(work, "raw.json");
  // Every non-TIGER source arrives in its own projection (NC's state plane, MGGG's Lambert), so
  // the reprojection is unconditional; TIGER is already EPSG:4269 and passes through unchanged.
  execSync(`ogr2ogr -t_srs EPSG:4326 -f GeoJSON "${geojsonPath}" "${join(work, shp)}"`, { stdio: "pipe" });

  if (override?.dissolve) {
    const dissolved = join(work, "dissolved.json");
    execSync(`npx mapshaper "${geojsonPath}" -dissolve "${override.districtField}" -o "${dissolved}" format=geojson`, { stdio: "pipe" });
    execSync(`cp "${dissolved}" "${geojsonPath}"`, { stdio: "pipe" });
  }
  const raw = JSON.parse(readFileSync(geojsonPath, "utf8"));

  const features = [];
  for (const f of raw.features) {
    if (override) {
      const value = f.properties[override.districtField];
      if (value == null || value === "") continue;
      const districtId = String(parseInt(value, 10));
      const fips = ABBR_TO_FIPS[job.abbr];
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          STATEFP: fips,
          GEOID: `${fips}${districtId.padStart(3, "0")}`,
          DISTRICT: districtId,
          NAMELSAD: `${job.chamber === "house" ? "State House" : "State Senate"} District ${districtId}`,
        },
      });
      continue;
    }
    const code = f.properties.SLDLST ?? f.properties.SLDUST ?? "";
    if (String(code).includes("ZZ")) continue;
    features.push({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        STATEFP: f.properties.STATEFP,
        GEOID: f.properties.GEOID,
        DISTRICT: String(parseInt(code, 10)),
        NAMELSAD: f.properties.NAMELSAD,
      },
    });
  }

  const simplifiedIn = join(work, "in.json");
  writeFileSync(simplifiedIn, JSON.stringify({ type: "FeatureCollection", features }));
  // interval=100 keep-shapes, matching build-state-leg-districts.mjs - a percentage simplification
  // collapses small urban districts, and these polygons have to stay joinable to results.
  execSync(`npx mapshaper "${simplifiedIn}" -simplify interval=100 keep-shapes -o "${outPath}" format=topojson`, { stdio: "pipe" });
  rmSync(work, { recursive: true, force: true });
  return features.length;
}

/**
 * Writes the index from every era whose file is present on disk, NOT from the jobs this run
 * happened to touch - a `--only NC` run must not drop the other 47 states out of the index and
 * silently send their past years back to the current-map boundaries.
 */
function writeIndex(allJobs) {
  const byState = {};
  for (const job of allJobs) {
    if (!existsSync(join(OUT_ROOT, job.chamber, `${job.abbr}-${job.vintage}.json`))) continue;
    const chambers = (byState[job.abbr] ??= {});
    const years = (chambers[job.chamber] ??= {});
    for (const y of job.years) years[y] = job.vintage;
  }
  const lines = [
    "// Which superseded district map each past state legislative election was held on.",
    "// Auto-generated by scripts/build-state-leg-districts-historical.mjs - do not edit by hand.",
    "//",
    "// state abbreviation -> chamber -> election year -> the vintage suffix of the boundary file at",
    "// public/state-leg-districts-historical/{chamber}/{ABBR}-{vintage}.json. An election year that",
    "// is ABSENT here was held on the current map, so it uses public/state-leg-districts/{chamber}/",
    "// {ABBR}.json like the present-day view does.",
    "",
    'import type { Chamber } from "./stateLegDistricts";',
    "",
    "export const stateLegHistoricalMaps: Record<string, Partial<Record<Chamber, Record<string, number>>>> =",
    `${JSON.stringify(byState, null, 1)};`,
    "",
  ];
  writeFileSync(MAP_INDEX_TS, lines.join("\n"));
  return allJobs.filter((j) => existsSync(join(OUT_ROOT, j.chamber, `${j.abbr}-${j.vintage}.json`))).length;
}

function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
  const force = args.includes("--force");

  mkdirSync(CACHE_DIR, { recursive: true });
  for (const chamber of ["house", "senate"]) mkdirSync(join(OUT_ROOT, chamber), { recursive: true });

  const allJobs = plan(loadCalendar());
  const jobs = allJobs.filter((j) => !only || only.has(j.abbr));
  console.log(`${jobs.length} historical era files to build`);

  const failures = [];
  for (const [i, job] of jobs.entries()) {
    const outPath = join(OUT_ROOT, job.chamber, `${job.abbr}-${job.vintage}.json`);
    const override = ERA_SOURCE_OVERRIDES[`${job.abbr}_${job.chamber}_${job.vintage}`];
    const label = `${job.abbr} ${job.chamber} ${job.vintage} (${job.years.join(", ")})${override ? " [not from TIGER]" : ""}`;
    try {
      if (existsSync(outPath) && !force) {
        console.log(`[${i + 1}/${jobs.length}] ${label} - already built`);
      } else {
        const n = convert(download(job), job, outPath);
        console.log(`[${i + 1}/${jobs.length}] ${label} - ${n} districts`);
      }
    } catch (err) {
      console.error(`[${i + 1}/${jobs.length}] ${label} - FAILED: ${err.message.split("\n")[0]}`);
      failures.push(label);
    }
  }

  const indexed = writeIndex(allJobs);
  console.log(`\nWrote ${MAP_INDEX_TS} covering ${indexed} era files present on disk`);
  if (failures.length) console.error(`${failures.length} FAILED:\n  ${failures.join("\n  ")}`);
}

main();
