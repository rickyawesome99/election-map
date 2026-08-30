#!/usr/bin/env node
/**
 * Joins every sourced chamber-year of district RESULTS to the boundary file the map will paint it
 * on, and reports the district codes that fail to match.
 *
 * This is the check that makes the year selector honest: a result key with no polygon is a
 * district the map silently drops, and a polygon with no result is a district that silently falls
 * through to the "no data" fill. Both are reported per chamber-year.
 *
 * Boundaries come from data/stateLegHistoricalMaps.ts for a superseded era, else from the current
 * public/state-leg-districts/. Codes are extracted with the SAME rules as
 * StateLegDistrictMap.extractDistrictCode - keep the two in sync.
 *
 * Usage: node scripts/verify-state-leg-historical-maps.mjs [--only AZ,VT] [--verbose]
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const RESULTS_DIR = "data-entry/state-leg-results";
const HIST_INDEX = "data/stateLegHistoricalMaps.ts";
const HIST_ROOT = "public/state-leg-districts-historical";
const CURRENT_ROOT = "public/state-leg-districts";

function loadObjectLiteral(path, marker) {
  const src = readFileSync(path, "utf8");
  const start = src.indexOf("{", src.indexOf(marker) + marker.length);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return JSON.parse(src.slice(start, i + 1));
  }
  throw new Error(`Could not find the object literal in ${path}`);
}

const BOUNDARY_CODE_OVERRIDES = {
  MA_house: (p) => p.NAMELSAD?.replace(/\s+District$/, ""),
  MA_senate: (p) => p.NAMELSAD?.replace(/\s+District$/, ""),
  AK_senate: (p) => p.NAMELSAD?.trim().split(/\s+/).pop(),
  NH_house: (p) => {
    const parts = p.NAMELSAD?.match(/District\s+(\S+)\s+County\s+No\.\s*(\d+)$/);
    return parts ? `${parts[1].slice(0, 2).toUpperCase()}${Number(parts[2])}` : undefined;
  },
  VT_house: (p) => p.NAMELSAD?.replace(/\s+(State\s+)?House\s+District$/, ""),
  VT_senate: (p) => p.NAMELSAD?.replace(/\s+((State\s+)?Senate|Senatorial)\s+District$/, ""),
};

// Same join rules the map uses at render time - see lib/stateLegDistrictKey.ts, which this
// duplicates because that module is TypeScript and this script runs on bare node.
const normalizeDistrictKey = (code) => code.toLowerCase().replace(/\band\b/g, "").replace(/[^a-z0-9]/g, "");
const DISTRICT_KEY_ALIASES = {
  MA_senate: { firstplymouthbristol: "plymouthbristol1", secondplymouthbristol: "plymouthbristol2" },
  VT_senate: { grandislechittenden: "grandisle" },
};
// The alias is a FALLBACK, matching lib/stateLegDistrictKey.ts: it applies only where the
// polygon's own code matches no result, so it can never displace a direct hit.
const joinKey = (abbr, chamber, code, resultCodes) => {
  const normalized = normalizeDistrictKey(code);
  if (resultCodes.has(normalized)) return normalized;
  return DISTRICT_KEY_ALIASES[`${abbr}_${chamber}`]?.[normalized] ?? normalized;
};

function extractDistrictCode(abbr, chamber, p) {
  const overridden = BOUNDARY_CODE_OVERRIDES[`${abbr}_${chamber}`]?.(p);
  if (overridden) return overridden;
  const { DISTRICT, NAMELSAD } = p;
  const lastToken = NAMELSAD?.trim().split(/\s+/).pop();
  if (lastToken && DISTRICT && new RegExp(`^0*${DISTRICT}[A-Za-z]+$`).test(lastToken)) return lastToken;
  return DISTRICT;
}

/** Boundary codes in a TopoJSON file - the arcs are irrelevant here, only the properties. */
function boundaryCodes(path, abbr, chamber, resultCodes) {
  if (!existsSync(path)) return null;
  const topo = JSON.parse(readFileSync(path, "utf8"));
  const codes = new Set();
  for (const obj of Object.values(topo.objects ?? {})) {
    for (const geom of obj.geometries ?? []) {
      const code = extractDistrictCode(abbr, chamber, geom.properties ?? {});
      if (code != null) codes.add(joinKey(abbr, chamber, String(code), resultCodes));
    }
  }
  return codes;
}

function main() {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
  const verbose = args.includes("--verbose");
  const histIndex = loadObjectLiteral(
    HIST_INDEX,
    "stateLegHistoricalMaps: Record<string, Partial<Record<Chamber, Record<string, number>>>> ="
  );

  const rows = [];
  for (const file of readdirSync(RESULTS_DIR).sort()) {
    const m = file.match(/^([A-Z]{2})-(\d{4})\.json$/);
    if (!m) continue;
    const [, abbr, yearStr] = m;
    if (only && !only.has(abbr)) continue;
    const year = Number(yearStr);
    const byChamber = JSON.parse(readFileSync(join(RESULTS_DIR, file), "utf8"));

    for (const [chamber, block] of Object.entries(byChamber)) {
      const resultCodes = new Set(Object.keys(block.districts ?? {}).map(normalizeDistrictKey));
      const vintage = histIndex[abbr]?.[chamber]?.[year];
      const path = vintage
        ? join(HIST_ROOT, chamber, `${abbr}-${vintage}.json`)
        : join(CURRENT_ROOT, chamber, `${abbr}.json`);
      const codes = boundaryCodes(path, abbr, chamber, resultCodes);
      if (codes === null) {
        rows.push({ abbr, chamber, year, vintage: vintage ?? "current", status: "NO BOUNDARY FILE", resultCodes: resultCodes.size, matched: 0, unmatchedResults: [...resultCodes], unmatchedPolys: [] });
        continue;
      }
      const unmatchedResults = [...resultCodes].filter((c) => !codes.has(c));
      const unmatchedPolys = [...codes].filter((c) => !resultCodes.has(c));
      rows.push({
        abbr, chamber, year,
        vintage: vintage ?? "current",
        // A polygon with no result is EXPECTED and not a defect: a staggered chamber only elects
        // part of itself each cycle, so the rest of the map is correctly blank that year. A RESULT
        // with no polygon is the real problem - that district's figures cannot be drawn at all.
        status: unmatchedResults.length > 0 ? "GAPS" : "OK",
        resultCodes: resultCodes.size,
        matched: resultCodes.size - unmatchedResults.length,
        unmatchedResults, unmatchedPolys,
      });
    }
  }

  const bad = rows.filter((r) => r.status !== "OK");
  const unpainted = bad.reduce((n, r) => n + r.unmatchedResults.length, 0);
  console.log(
    `${rows.length} chamber-years checked - ${rows.length - bad.length} paint every sourced district, ` +
    `${bad.length} do not (${unpainted} district results with no polygon)\n`
  );
  for (const r of bad.sort((a, b) => a.abbr.localeCompare(b.abbr) || a.chamber.localeCompare(b.chamber) || a.year - b.year)) {
    console.log(
      `${r.abbr} ${r.chamber} ${r.year} [${r.vintage}] ${r.matched}/${r.resultCodes} results painted; ` +
      `${r.unmatchedResults.length} result keys have no polygon, ${r.unmatchedPolys.length} polygons had no election`
    );
    if (verbose) {
      if (r.unmatchedResults.length) console.log(`    results: ${r.unmatchedResults.slice(0, 25).join(", ")}${r.unmatchedResults.length > 25 ? " ..." : ""}`);
      if (r.unmatchedPolys.length) console.log(`    polygons: ${r.unmatchedPolys.slice(0, 25).join(", ")}${r.unmatchedPolys.length > 25 ? " ..." : ""}`);
    }
  }
}

main();
