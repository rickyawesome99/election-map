#!/usr/bin/env node
/**
 * RACE POLLS — CSV → TypeScript build script (Phase 5 of the forecast revamp)
 *
 *   1. Edit data-entry/race_polls.csv
 *      (office, state, race, pollster, partisan, start, end, sample, population, dem, rep)
 *      office H/S/G · race "Senate" / "Senate Special" / "Governor" / "House NY-01"
 *      (the past-results race labels) · partisan D/R when the pollster is a party
 *      or campaign pollster · start/end ISO dates · population lv/rv/a/v · dem/rep = %.
 *      Seeded from the polling tables on the Wikipedia election pages; add new polls
 *      by hand or re-run the scrape.
 *      EXCEPTION — Alaska Senate (S,AK,Senate) is hand-entered and holds ONLY each poll's
 *      ranked-choice FINAL ROUND (Sullivan v Peltola); never first-choice, head-to-head or
 *      party-summed numbers, and a re-scrape must not overwrite those rows.
 *      The CSV is the full archive; only polls that went into the field on or after
 *      EARLIEST_START are emitted (see below), so off-year polls of the 2026 races are kept
 *      on file but never reach an average or a race page.
 *   2. Run:  node data-entry/build-race-polls.js
 *   3. data/racePolls.ts is regenerated
 *
 * Feeds lib/racePollAverage.ts (the per-race weighted average and its evidence
 * weight) and, through it, computeProjectedMargin in lib/tplCompute.ts.
 */

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "race_polls.csv");
const OUT = path.join(__dirname, "../data/racePolls.ts");

// Cycle window: a poll counts only if it was in the field on or after this date. Polls of the
// 2026 races taken in 2023–25 are readings of a race whose candidates, and often whose national
// environment, no longer exist; recency weighting already made them nearly weightless, but they
// still filled the per-race table and could carry a race that has no 2026 polling at all.
const EARLIEST_START = "2026-01-01";

function splitCSVLine(line) {
  const out = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const lines = fs.readFileSync(SRC, "utf8").split(/\r?\n/).filter((l) => l.trim());
const header = splitCSVLine(lines[0]);
const col = (row, name) => (row[header.indexOf(name)] ?? "").trim();
const BIPARTISAN = /^(Beacon Research.*Shaw|Fabrizio.*(Impact Research|GBAO|David Binder|Hart Research)|Hart Research.*Public Opinion Strategies)/i;
const byRace = new Map();
let skipped = 0;
for (const line of lines.slice(1)) {
  const row = splitCSVLine(line);
  if (col(row, "start") < EARLIEST_START) { skipped++; continue; }
  const key = `${col(row, "office")}:${col(row, "state")}:${col(row, "race")}`;
  const sample = col(row, "sample");
  const poll = {
    pollster: col(row, "pollster"),
    // a bipartisan pair — "Beacon Research (D)/Shaw & Co. Research" (the Fox News poll), "Fabrizio Ward (R)/Impact
    // Research" (AARP) — is not a partisan poll, whichever firm's party label the scrape picked up
    partisan: BIPARTISAN.test(col(row, "pollster")) ? null : col(row, "partisan") || null,
    startDate: col(row, "start"),
    endDate: col(row, "end"),
    sample: sample ? Number(sample) : null,
    population: col(row, "population") ? col(row, "population").toUpperCase() : null,
    dem: Number(col(row, "dem")),
    rep: Number(col(row, "rep")),
  };
  poll.diff = Math.round((poll.rep - poll.dem) * 10) / 10;
  (byRace.get(key) ?? byRace.set(key, []).get(key)).push(poll);
}
for (const polls of byRace.values()) polls.sort((a, b) => a.endDate.localeCompare(b.endDate));

const keys = [...byRace.keys()].sort();
let ts = `// ⚠️  AUTO-GENERATED — do not edit by hand.\n// Edit data-entry/race_polls.csv, then run:\n//   node data-entry/build-race-polls.js\n\n`;
ts += `// Key: "{H|S|G}:{ST}:{race label}" — the past-results race label ("Senate", "Senate Special",\n// "Governor", "House NY-01"). diff = rep − dem (R-positive). Sorted oldest → newest.\n`;
ts += `// Only polls in the field on or after ${EARLIEST_START} are emitted; earlier polls of these\n// races stay in data-entry/race_polls.csv as archive.\n`;
ts += `export type RacePoll = {\n  pollster: string;\n  partisan: "D" | "R" | null;\n  startDate: string;\n  endDate: string;\n  sample: number | null;\n  population: string | null;\n  dem: number;\n  rep: number;\n  diff: number;\n};\n\n`;
ts += `export const racePolls: Record<string, RacePoll[]> = {\n`;
for (const k of keys) {
  ts += `  ${JSON.stringify(k)}: [\n`;
  for (const p of byRace.get(k)) ts += `    ${JSON.stringify(p)},\n`;
  ts += `  ],\n`;
}
ts += `};\n`;
fs.writeFileSync(OUT, ts);
const kept = lines.length - 1 - skipped;
console.log(`Wrote ${OUT}: ${keys.length} races, ${kept} polls (${skipped} skipped: started before ${EARLIEST_START})`);
