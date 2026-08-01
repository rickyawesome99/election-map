#!/usr/bin/env node
/**
 * TRUMP APPROVAL POLLS — CSV → TypeScript build script
 *
 * WORKFLOW:
 *   1. Drop the latest Trump approval poll export into data-entry/trump_approval_polls.csv
 *      (columns: Pollster,Date,Sample,Approve,Disapprove,Diff — Date is "M/D - M/D", Sample is
 *      "<size> <population>" or just "<population>" when no size is published)
 *   2. Run:  node data-entry/build-trump-approval.js
 *   3. Done — data/trumpApprovalPolls.ts is updated automatically
 *
 * All polls are assumed to fall within a single calendar year (ELECTION_YEAR below);
 * bump that constant once polling for the next cycle begins.
 */

const fs   = require("fs");
const path = require("path");

const SHEET_DIR = __dirname;
const OUT_PATH  = path.join(__dirname, "../data/trumpApprovalPolls.ts");
const YEAR = 2026;

function splitCSVLine(line) {
  const result = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function parseCSV(filename) {
  const full = path.join(SHEET_DIR, filename);
  const content = fs.readFileSync(full, "utf8").trim();
  const lines = content.split(/\r?\n/);
  const headers = splitCSVLine(lines[0]);
  return lines.slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const values = splitCSVLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h.trim()] = (values[i] ?? "").trim(); });
      return row;
    });
}

// "7/27 - 7/29" -> { startDate: "2026-07-27", endDate: "2026-07-29" }
function parseDateRange(raw) {
  const [startRaw, endRaw] = raw.split("-").map((s) => s.trim());
  const toISO = (md) => {
    const [m, d] = md.split("/").map((s) => parseInt(s, 10));
    return `${YEAR}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  return { startDate: toISO(startRaw), endDate: toISO(endRaw || startRaw) };
}

// "2617 LV" -> { sample: 2617, population: "LV" }; "RV" -> { sample: null, population: "RV" }
function parseSample(raw) {
  const parts = raw.trim().split(/\s+/);
  if (parts.length === 2) return { sample: parseInt(parts[0], 10), population: parts[1] };
  const n = parseInt(parts[0], 10);
  return isNaN(n) ? { sample: null, population: parts[0] } : { sample: n, population: null };
}

const rows = parseCSV("trump_approval_polls.csv");

const polls = rows.map((row) => {
  const { startDate, endDate } = parseDateRange(row.Date);
  const { sample, population } = parseSample(row.Sample);
  const approve = parseFloat(row.Approve);
  const disapprove = parseFloat(row.Disapprove);
  return {
    pollster: row.Pollster,
    startDate,
    endDate,
    sample,
    population,
    approve,
    disapprove,
    diff: parseFloat((disapprove - approve).toFixed(1)),
  };
}).sort((a, b) => a.endDate.localeCompare(b.endDate));

function serializePoll(p) {
  return `  { pollster: ${JSON.stringify(p.pollster)}, startDate: ${JSON.stringify(p.startDate)}, endDate: ${JSON.stringify(p.endDate)}, sample: ${p.sample === null ? "null" : p.sample}, population: ${p.population === null ? "null" : JSON.stringify(p.population)}, approve: ${p.approve}, disapprove: ${p.disapprove}, diff: ${p.diff} }`;
}

const output = `// ⚠️  AUTO-GENERATED — do not edit by hand.
// Edit data-entry/trump_approval_polls.csv, then run:
//   node data-entry/build-trump-approval.js

// Convention: diff = disapprove - approve. Positive = net underwater (disapprove leads).
export type TrumpApprovalPoll = {
  pollster: string;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;   // ISO yyyy-mm-dd
  sample: number | null;
  population: string | null; // "LV" | "RV" | "A" | etc — null when not published
  approve: number;
  disapprove: number;
  diff: number;
};

// Sorted oldest → newest by poll end date.
export const trumpApprovalPolls: TrumpApprovalPoll[] = [
${polls.map(serializePoll).join(",\n")}
];
`;

fs.writeFileSync(OUT_PATH, output);
console.log(`✓ Trump approval polls: ${polls.length}`);
console.log(`✅ data/trumpApprovalPolls.ts updated successfully.`);
