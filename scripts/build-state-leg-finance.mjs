#!/usr/bin/env node
/**
 * Regenerates data/stateLegFinance.ts from the per-source fundraising files:
 *   data-entry/state-leg-finance/tu/{ST}-{cycle}.json   Transparency USA (25 states, 2017/2018–2026;
 *                                                        scripts/fetch-state-leg-finance-tu.py)
 *   data-entry/state-leg-finance/ftm/{ST}-{cycle}.json  FollowTheMoney (the other states, 2016–2024;
 *                                                        scripts/fetch-state-leg-finance-ftm.py) — when present
 *   data-entry/state-leg-finance/state/{ST}-{cycle}.json the states' own campaign-finance portals
 *                                                        (scripts/fetch-state-leg-finance-{ut,...}.py, then
 *                                                        scripts/assign-state-leg-finance.ts places each
 *                                                        filer on a district); never overrides another source
 * One record per candidate per district per cycle, GENERAL-election candidates only, with the
 * source's own name and party spelling; the join to the atlas's candidate names happens in
 * lib/stateLegMoney.ts so this module stays a faithful copy of the filings.
 *
 * Usage: node scripts/build-state-leg-finance.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";

const SRC = "data-entry/state-leg-finance";
const OUT_FILE = "data/stateLegFinance.ts";

const PARTY = (p) => {
  const s = (p || "").toLowerCase();
  if (s.startsWith("dem")) return "D";
  if (s.startsWith("rep")) return "R";
  return "O";
};

const data = {};
let candidates = 0, districts = 0, chamberCycles = 0;
const dataThrough = {};

function add(abbr, cycle, chamber, district, record, source, through) {
  const st = (data[abbr] ??= {});
  const yr = (st[cycle] ??= {});
  const ch = (yr[chamber] ??= {});
  const d = (ch[district] ??= { source, dataThrough: through, candidates: [] });
  d.candidates.push(record);
  candidates += 1;
}

// Transparency USA
const tuDir = `${SRC}/tu`;
for (const file of existsSync(tuDir) ? readdirSync(tuDir).filter((f) => /^[A-Z]{2}-\d{4}\.json$/.test(f)).sort() : []) {
  const parsed = JSON.parse(readFileSync(`${tuDir}/${file}`, "utf8"));
  const { state: abbr, cycle } = parsed;
  const seen = new Set();
  for (const race of parsed.races) {
    if (!race.district) continue;
    const general = race.elections.find((e) => /^general/i.test(e.label));
    if (!general) continue;
    for (const c of general.candidates) {
      add(abbr, cycle, race.chamber, race.district, {
        name: c.name, party: PARTY(c.party), partyLabel: c.party, incumbent: !!c.incumbent,
        contributions: c.contributions, expenditures: c.expenditures, status: c.status || undefined, ...(race.post ? { post: race.post } : {}),
      }, "Transparency USA (state filings, total contributions)", race.dataThrough ?? parsed.dataThrough);
    }
    seen.add(`${race.chamber}:${race.district}`);
  }
  districts += seen.size;
  chamberCycles += new Set(parsed.races.map((r) => r.chamber)).size;
  dataThrough[`${abbr}-${cycle}`] = parsed.dataThrough;
}

// FollowTheMoney, same shape when the fetcher has run
const ftmDir = `${SRC}/ftm`;
for (const file of existsSync(ftmDir) ? readdirSync(ftmDir).filter((f) => /^[A-Z]{2}-\d{4}\.json$/.test(f)).sort() : []) {
  const parsed = JSON.parse(readFileSync(`${ftmDir}/${file}`, "utf8"));
  const { state: abbr, cycle } = parsed;
  const seen = new Set();
  for (const chamber of ["house", "senate"]) {
    for (const [district, cands] of Object.entries(parsed[chamber] ?? {})) {
      for (const c of cands) {
        add(abbr, cycle, chamber, district, { name: c.name, party: PARTY(c.party), partyLabel: c.party, incumbent: !!c.incumbent, contributions: c.contributions, expenditures: c.expenditures ?? null, status: c.status || undefined }, "FollowTheMoney (state filings, total contributions)", parsed.dataThrough ?? null);
      }
      seen.add(`${chamber}:${district}`);
    }
  }
  districts += seen.size;
  chamberCycles += ["house", "senate"].filter((c) => parsed[c]).length;
}

// State portals (portal-raw → assign-state-leg-finance.ts), same shape as FTM plus a per-file source.
// A district-cycle another source already has stays with that source: one race, one source.
const stDir = `${SRC}/state`;
for (const file of existsSync(stDir) ? readdirSync(stDir).filter((f) => /^[A-Z]{2}-\d{4}\.json$/.test(f)).sort() : []) {
  const parsed = JSON.parse(readFileSync(`${stDir}/${file}`, "utf8"));
  const { state: abbr, cycle } = parsed;
  let seen = 0;
  for (const chamber of ["house", "senate"]) {
    for (const [district, cands] of Object.entries(parsed[chamber] ?? {})) {
      if (data[abbr]?.[cycle]?.[chamber]?.[district]) continue;
      for (const c of cands) {
        add(abbr, cycle, chamber, district, { name: c.name, ...(c.candidate && c.candidate !== c.name ? { candidate: c.candidate } : {}), party: PARTY(c.party), partyLabel: c.party, incumbent: !!c.incumbent, contributions: c.contributions, expenditures: c.expenditures ?? null }, parsed.source, parsed.dataThrough ?? null);
      }
      seen += 1;
    }
  }
  districts += seen;
  chamberCycles += ["house", "senate"].filter((c) => parsed[c]).length;
}

const header = `import type { Chamber } from "./stateLegDistricts";

// State legislative candidate fundraising, per district and cycle: each general-election
// candidate's total contributions and expenditures per the state's own filings, as republished by
// Transparency USA (25 states), FollowTheMoney and the states' own portals. Auto-generated by
// scripts/build-state-leg-finance.mjs from data-entry/state-leg-finance/{tu,ftm,state}/; do not edit by
// hand. Names and parties are the SOURCE's spelling; lib/stateLegMoney.ts joins them to the atlas's
// candidates. A current cycle's figures are to-date (see dataThrough) and keep growing.
//
// SERVER-ONLY: pages read what lib/stateLegMoney.ts derives.

export type StateLegFinanceCandidate = {
  name: string;
  party: "D" | "R" | "O";
  partyLabel: string;
  incumbent: boolean;
  /** Total contributions for the cycle, in dollars; null where the source shows no figure. */
  contributions: number | null;
  expenditures: number | null;
  /** The source's ballot status ("On the Ballot", "Won", "Lost"). */
  status?: string;
  /** Washington's position 1/2, Idaho's seat A/B. */
  post?: string;
  /** The atlas candidate scripts/assign-state-leg-finance.ts matched a state-portal record to, where the record's own name differs (a committee name). */
  candidate?: string;
};

export type StateLegFinanceDistrict = { source: string; dataThrough: string | null; candidates: StateLegFinanceCandidate[] };

// state abbreviation -> cycle (election year) -> chamber -> district key
export const stateLegFinance: Record<string, Record<string, Partial<Record<Chamber, Record<string, StateLegFinanceDistrict>>>>> = `;

writeFileSync(OUT_FILE, `${header}${JSON.stringify(data, null, 1)};\n`);
console.log(`wrote ${OUT_FILE}: ${Object.keys(data).length} states, ${chamberCycles} chamber-cycles, ${districts} district-cycles, ${candidates} general-election candidates`);
