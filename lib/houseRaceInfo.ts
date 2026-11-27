import "server-only";
/**
 * Who held each U.S. House seat going into each election, by state, year and district number: the
 * incumbent column of data-entry/house_past_results.csv (the column the House district TPL's pastResults
 * read, data-entry/build.js) and, for 2026, data-entry/results_2026_seats.csv. Used for the U.S. House rows'
 * candidate terms in the county and legislative-district TPLs (lib/tplCompute.ts, lib/stateLegTpl.ts).
 * Plain data, no TPL code, so the TPL hub can import it without a cycle.
 */
import { readFileSync } from "fs";
import { join } from "path";

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

export type HouseSeatInfo = { incumbent: "D" | "R" | "Open"; name: string; dVotes: number; rVotes: number; total: number };
const num = (x: string | undefined) => Number(String(x ?? "").replace(/,/g, "")) || 0;
let cache: Map<string, HouseSeatInfo> | null = null;

function load(): Map<string, HouseSeatInfo> {
  if (cache) return cache;
  const out = new Map<string, HouseSeatInfo>();
  for (const r of parseCsv(readFileSync(join(process.cwd(), "data-entry", "house_past_results.csv"), "utf8"))) {
    const [st, cd] = r.district_name.split("-");
    if (!st || !cd) continue;
    const inc = r.incumbent === "D" ? "D" : r.incumbent === "R" ? "R" : "Open";
    out.set(`${st}-${Number(r.year)}-${Number(cd)}`, { incumbent: inc, name: r.district_name, dVotes: num(r.dem_votes), rVotes: num(r.rep_votes), total: num(r.total_votes) });
  }
  for (const r of parseCsv(readFileSync(join(process.cwd(), "data-entry", "results_2026_seats.csv"), "utf8"))) {
    if (r.office !== "house") continue;
    const [st, cd] = r.label.split("-");
    if (!st || !cd) continue;
    const inc = r.dem_incumbent === "1" ? "D" : r.rep_incumbent === "1" ? "R" : "Open";
    out.set(`${st}-2026-${Number(cd)}`, { incumbent: inc, name: r.label, dVotes: num(r.dem_votes), rVotes: num(r.rep_votes), total: num(r.total_votes) });
  }
  cache = out;
  return out;
}

/** The seat's incumbent party and race name ("OH-09") for that election, or null when the site has no row. */
export function houseSeatInfo(stateAbbr: string, year: number, district: number): HouseSeatInfo | null {
  return load().get(`${stateAbbr}-${year}-${district}`) ?? null;
}

export type CountyHousePiece = { district: number; dem: number; gop: number; oth: number; total: number };
let pieces: Map<string, CountyHousePiece[]> | null = null;

/** A county's U.S. House vote by district for one year ("fips-year"), 2016–2024 from
 * data-entry/house_district_county_results.csv and 2026 from data-entry/results-2026/house_district_county_results_2026.csv. */
export function countyHousePieces(fips: string, year: number): CountyHousePiece[] {
  if (!pieces) {
    pieces = new Map();
    const add = (rows: Record<string, string>[]) => {
      for (const r of rows) {
        if (!r.county_fips || !r.district) continue;
        const k = `${r.county_fips}-${Number(r.year)}`;
        const list = pieces!.get(k) ?? [];
        list.push({ district: Number(r.district), dem: num(r.dem), gop: num(r.gop), oth: num(r.oth), total: num(r.total) });
        pieces!.set(k, list);
      }
    };
    add(parseCsv(readFileSync(join(process.cwd(), "data-entry", "house_district_county_results.csv"), "utf8")));
    add(parseCsv(readFileSync(join(process.cwd(), "data-entry", "results-2026", "house_district_county_results_2026.csv"), "utf8")));
  }
  return pieces.get(`${fips}-${year}`) ?? [];
}
