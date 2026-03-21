#!/usr/bin/env node
/**
 * Generates all CSV spreadsheet files for the election-map data-entry workflow.
 * Run: node data-entry/generate-sheets.js
 *
 * Output files (one per Google Sheet tab):
 *   senate_seats.csv         — all 100 senate seats (filter next_election=2026 for active races)
 *   senate_past_results.csv  — historical senate results, one row per year per seat
 *   governor_seats.csv       — all 50 governor seats (filter next_election=2026 for active races)
 *   governor_past_results.csv— historical governor results
 *   house_races.csv          — all 435 house districts
 *   presidential_2024.csv    — 2024 presidential results by state
 */

const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname);

// ── Helpers ──────────────────────────────────────────────────────────────────

function csv(headers, rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

function write(filename, headers, rows) {
  fs.writeFileSync(path.join(OUT, filename), csv(headers, rows));
  console.log(`✓ ${filename}  (${rows.length} rows)`);
}

// ── 1. senate_seats — ALL 100 senate seats ────────────────────────────────────
//
// seat = 1  →  URL: /senate/[abbr]      (Class 2 or primary tracked seat)
// seat = 2  →  URL: /senate/[abbr]-2    (the other senator, holdover)
//
// If next_election == 2026: fill in all forecast columns.
// If next_election != 2026: fill incumbent + party only; leave forecast columns blank.
//
// Column notes:
//   probability    — Dem win probability, 0–100  (e.g. 97)
//   margin         — positive = Dem advantage, negative = Rep advantage  (e.g. 28.5 or -8.2)
//   dem_party      — D or I  (Independents who caucus with Democrats)
//   dem_incumbent  — TRUE or FALSE
//   rep_incumbent  — TRUE or FALSE
//   rcp_dem/rep    — RCP poll average vote share (0–100 each, should sum to ~100)
//   kalshi_dem/rep — Kalshi win probability (0–100 each, should sum to ~100)
//   poly_dem/rep   — Polymarket win probability (0–100 each, should sum to ~100)
//   history_*      — monthly Dem win probability, 0–100, Sep through Mar

// Seat 1 rows:
//   35 states with a 2026 senate race  → next_election = 2026
//   15 states with no 2026 senate race → next_election = 2028
const SENATE_SEAT1 = [
  // ── 2026 races (Class 2 + specials) ──────────────────────────────
  { state_abbr: "AK", state_name: "Alaska",          seat: 1, next_election: 2026, party: "" },
  { state_abbr: "AL", state_name: "Alabama",          seat: 1, next_election: 2026, party: "" },
  { state_abbr: "AR", state_name: "Arkansas",         seat: 1, next_election: 2026, party: "" },
  { state_abbr: "CO", state_name: "Colorado",         seat: 1, next_election: 2026, party: "" },
  { state_abbr: "DE", state_name: "Delaware",         seat: 1, next_election: 2026, party: "" },
  { state_abbr: "FL", state_name: "Florida",          seat: 1, next_election: 2026, party: "" },
  { state_abbr: "GA", state_name: "Georgia",          seat: 1, next_election: 2026, party: "" },
  { state_abbr: "IA", state_name: "Iowa",             seat: 1, next_election: 2026, party: "" },
  { state_abbr: "ID", state_name: "Idaho",            seat: 1, next_election: 2026, party: "" },
  { state_abbr: "IL", state_name: "Illinois",         seat: 1, next_election: 2026, party: "" },
  { state_abbr: "KS", state_name: "Kansas",           seat: 1, next_election: 2026, party: "" },
  { state_abbr: "KY", state_name: "Kentucky",         seat: 1, next_election: 2026, party: "" },
  { state_abbr: "LA", state_name: "Louisiana",        seat: 1, next_election: 2026, party: "" },
  { state_abbr: "MA", state_name: "Massachusetts",    seat: 1, next_election: 2026, party: "" },
  { state_abbr: "ME", state_name: "Maine",            seat: 1, next_election: 2026, party: "" },
  { state_abbr: "MI", state_name: "Michigan",         seat: 1, next_election: 2026, party: "" },
  { state_abbr: "MN", state_name: "Minnesota",        seat: 1, next_election: 2026, party: "" },
  { state_abbr: "MS", state_name: "Mississippi",      seat: 1, next_election: 2026, party: "" },
  { state_abbr: "MT", state_name: "Montana",          seat: 1, next_election: 2026, party: "" },
  { state_abbr: "NC", state_name: "North Carolina",   seat: 1, next_election: 2026, party: "" },
  { state_abbr: "NE", state_name: "Nebraska",         seat: 1, next_election: 2026, party: "" },
  { state_abbr: "NH", state_name: "New Hampshire",    seat: 1, next_election: 2026, party: "" },
  { state_abbr: "NJ", state_name: "New Jersey",       seat: 1, next_election: 2026, party: "" },
  { state_abbr: "NM", state_name: "New Mexico",       seat: 1, next_election: 2026, party: "" },
  { state_abbr: "OH", state_name: "Ohio",             seat: 1, next_election: 2026, party: "" },
  { state_abbr: "OK", state_name: "Oklahoma",         seat: 1, next_election: 2026, party: "" },
  { state_abbr: "OR", state_name: "Oregon",           seat: 1, next_election: 2026, party: "" },
  { state_abbr: "RI", state_name: "Rhode Island",     seat: 1, next_election: 2026, party: "" },
  { state_abbr: "SC", state_name: "South Carolina",   seat: 1, next_election: 2026, party: "" },
  { state_abbr: "SD", state_name: "South Dakota",     seat: 1, next_election: 2026, party: "" },
  { state_abbr: "TN", state_name: "Tennessee",        seat: 1, next_election: 2026, party: "" },
  { state_abbr: "TX", state_name: "Texas",            seat: 1, next_election: 2026, party: "" },
  { state_abbr: "VA", state_name: "Virginia",         seat: 1, next_election: 2026, party: "" },
  { state_abbr: "WV", state_name: "West Virginia",    seat: 1, next_election: 2026, party: "" },
  { state_abbr: "WY", state_name: "Wyoming",          seat: 1, next_election: 2026, party: "" },
  // ── No 2026 race (seat 1 holdover, next election 2028) ───────────
  { state_abbr: "AZ", state_name: "Arizona",          seat: 1, next_election: 2028, party: "" },
  { state_abbr: "CA", state_name: "California",       seat: 1, next_election: 2028, party: "" },
  { state_abbr: "CT", state_name: "Connecticut",      seat: 1, next_election: 2028, party: "" },
  { state_abbr: "HI", state_name: "Hawaii",           seat: 1, next_election: 2028, party: "" },
  { state_abbr: "IN", state_name: "Indiana",          seat: 1, next_election: 2028, party: "" },
  { state_abbr: "MD", state_name: "Maryland",         seat: 1, next_election: 2028, party: "" },
  { state_abbr: "MO", state_name: "Missouri",         seat: 1, next_election: 2028, party: "" },
  { state_abbr: "NV", state_name: "Nevada",           seat: 1, next_election: 2028, party: "" },
  { state_abbr: "NY", state_name: "New York",         seat: 1, next_election: 2028, party: "" },
  { state_abbr: "ND", state_name: "North Dakota",     seat: 1, next_election: 2028, party: "" },
  { state_abbr: "PA", state_name: "Pennsylvania",     seat: 1, next_election: 2028, party: "" },
  { state_abbr: "UT", state_name: "Utah",             seat: 1, next_election: 2028, party: "" },
  { state_abbr: "VT", state_name: "Vermont",          seat: 1, next_election: 2028, party: "" },
  { state_abbr: "WA", state_name: "Washington",       seat: 1, next_election: 2028, party: "" },
  { state_abbr: "WI", state_name: "Wisconsin",        seat: 1, next_election: 2028, party: "" },
];

// Seat 2 rows: the other senator for every state (always a holdover, not up in 2026)
const SENATE_SEAT2 = [
  { state_abbr: "AL", state_name: "Alabama",          seat: 2, next_election: 2028, party: "" },
  { state_abbr: "AK", state_name: "Alaska",           seat: 2, next_election: 2028, party: "" },
  { state_abbr: "AZ", state_name: "Arizona",          seat: 2, next_election: 2028, party: "" },
  { state_abbr: "AR", state_name: "Arkansas",         seat: 2, next_election: 2028, party: "" },
  { state_abbr: "CA", state_name: "California",       seat: 2, next_election: 2030, party: "" },
  { state_abbr: "CO", state_name: "Colorado",         seat: 2, next_election: 2028, party: "" },
  { state_abbr: "CT", state_name: "Connecticut",      seat: 2, next_election: 2028, party: "" },
  { state_abbr: "DE", state_name: "Delaware",         seat: 2, next_election: 2028, party: "" },
  { state_abbr: "FL", state_name: "Florida",          seat: 2, next_election: 2028, party: "" },
  { state_abbr: "GA", state_name: "Georgia",          seat: 2, next_election: 2028, party: "" },
  { state_abbr: "HI", state_name: "Hawaii",           seat: 2, next_election: 2028, party: "" },
  { state_abbr: "ID", state_name: "Idaho",            seat: 2, next_election: 2028, party: "" },
  { state_abbr: "IL", state_name: "Illinois",         seat: 2, next_election: 2028, party: "" },
  { state_abbr: "IN", state_name: "Indiana",          seat: 2, next_election: 2028, party: "" },
  { state_abbr: "IA", state_name: "Iowa",             seat: 2, next_election: 2028, party: "" },
  { state_abbr: "KS", state_name: "Kansas",           seat: 2, next_election: 2028, party: "" },
  { state_abbr: "KY", state_name: "Kentucky",         seat: 2, next_election: 2028, party: "" },
  { state_abbr: "LA", state_name: "Louisiana",        seat: 2, next_election: 2028, party: "" },
  { state_abbr: "ME", state_name: "Maine",            seat: 2, next_election: 2030, party: "" },
  { state_abbr: "MD", state_name: "Maryland",         seat: 2, next_election: 2028, party: "" },
  { state_abbr: "MA", state_name: "Massachusetts",    seat: 2, next_election: 2030, party: "" },
  { state_abbr: "MI", state_name: "Michigan",         seat: 2, next_election: 2030, party: "" },
  { state_abbr: "MN", state_name: "Minnesota",        seat: 2, next_election: 2030, party: "" },
  { state_abbr: "MS", state_name: "Mississippi",      seat: 2, next_election: 2028, party: "" },
  { state_abbr: "MO", state_name: "Missouri",         seat: 2, next_election: 2028, party: "" },
  { state_abbr: "MT", state_name: "Montana",          seat: 2, next_election: 2030, party: "" },
  { state_abbr: "NE", state_name: "Nebraska",         seat: 2, next_election: 2028, party: "" },
  { state_abbr: "NV", state_name: "Nevada",           seat: 2, next_election: 2030, party: "" },
  { state_abbr: "NH", state_name: "New Hampshire",    seat: 2, next_election: 2028, party: "" },
  { state_abbr: "NJ", state_name: "New Jersey",       seat: 2, next_election: 2030, party: "" },
  { state_abbr: "NM", state_name: "New Mexico",       seat: 2, next_election: 2030, party: "" },
  { state_abbr: "NY", state_name: "New York",         seat: 2, next_election: 2028, party: "" },
  { state_abbr: "NC", state_name: "North Carolina",   seat: 2, next_election: 2028, party: "" },
  { state_abbr: "ND", state_name: "North Dakota",     seat: 2, next_election: 2028, party: "" },
  { state_abbr: "OH", state_name: "Ohio",             seat: 2, next_election: 2030, party: "" },
  { state_abbr: "OK", state_name: "Oklahoma",         seat: 2, next_election: 2030, party: "" },
  { state_abbr: "OR", state_name: "Oregon",           seat: 2, next_election: 2028, party: "" },
  { state_abbr: "PA", state_name: "Pennsylvania",     seat: 2, next_election: 2028, party: "" },
  { state_abbr: "RI", state_name: "Rhode Island",     seat: 2, next_election: 2030, party: "" },
  { state_abbr: "SC", state_name: "South Carolina",   seat: 2, next_election: 2028, party: "" },
  { state_abbr: "SD", state_name: "South Dakota",     seat: 2, next_election: 2030, party: "" },
  { state_abbr: "TN", state_name: "Tennessee",        seat: 2, next_election: 2030, party: "" },
  { state_abbr: "TX", state_name: "Texas",            seat: 2, next_election: 2030, party: "" },
  { state_abbr: "UT", state_name: "Utah",             seat: 2, next_election: 2028, party: "" },
  { state_abbr: "VT", state_name: "Vermont",          seat: 2, next_election: 2028, party: "" },
  { state_abbr: "VA", state_name: "Virginia",         seat: 2, next_election: 2028, party: "" },
  { state_abbr: "WA", state_name: "Washington",       seat: 2, next_election: 2028, party: "" },
  { state_abbr: "WV", state_name: "West Virginia",    seat: 2, next_election: 2028, party: "" },
  { state_abbr: "WI", state_name: "Wisconsin",        seat: 2, next_election: 2028, party: "" },
  { state_abbr: "WY", state_name: "Wyoming",          seat: 2, next_election: 2030, party: "" },
];

const SENATE_HEADERS = [
  // Identity (always fill)
  "state_abbr", "state_name",
  "seat",           // 1 or 2  (seat 1 = primary/Class-2; seat 2 = holdover)
  "next_election",  // year this seat is next contested (2026 = active race)
  "incumbent",      // current senator's full name
  "party",          // incumbent party: D, R, or I
  // ── Fill the columns below ONLY when next_election = 2026 ─────────
  "prob_dem",   // Dem win probability 0–1  (e.g. 0.97)
  "prob_rep",   // Rep win probability 0–1  (e.g. 0.03)
  "margin",     // positive = Rep wins, negative = Dem wins  (e.g. -28.5 or 8.2)
  "proj_dem",   // projected Dem vote share 0–100  (e.g. 64.3)
  "proj_rep",   // projected Rep vote share 0–100  (e.g. 35.7)
  "dem_name",
  "dem_party",      // D or I  (Independents caucusing with Dems)
  "dem_incumbent",  // Y or N
  "rep_name",
  "rep_incumbent",  // Y or N
  "rcp_dem", "rcp_rep",           // RCP poll average vote share (or N/A)
  "kalshi_dem", "kalshi_rep",     // Kalshi win probability (or N/A)
  "poly_dem", "poly_rep",         // Polymarket win probability (or N/A)
  // Monthly Dem win probability trend, 0–100 (optional — derived from prob_dem if blank)
  "history_sep", "history_oct", "history_nov",
  "history_dec", "history_jan", "history_feb", "history_mar",
];

// Merge seat1 + seat2, sort by state then seat number
const ALL_SENATE = [...SENATE_SEAT1, ...SENATE_SEAT2].sort((a, b) =>
  a.state_abbr.localeCompare(b.state_abbr) || a.seat - b.seat
);

write("senate_seats.csv", SENATE_HEADERS, ALL_SENATE);

// ── 2. senate_past_results ────────────────────────────────────────────────────
// One row per election year per seat.
// Use state_abbr + seat to match back to senate_seats.csv.

write("senate_past_results.csv", [
  "state_abbr",
  "seat",           // 1 or 2 — matches senate_seats.csv
  "year",
  "dem_pct",        // e.g. 66.3
  "rep_pct",        // e.g. 31.9
  "dem_votes",      // raw vote count (optional)
  "rep_votes",      // raw vote count (optional)
  "dem_candidate",
  "rep_candidate",
], []);  // user fills in rows

// ── 3. governor_seats — ALL 50 governor seats ─────────────────────────────────
//
// One row per state. next_election indicates when the next governor race is.
// If next_election == 2026: fill all forecast columns.
// If next_election != 2026: fill incumbent + party only.

const GOVERNOR_SEATS = [
  // ── 2026 races (36 states) ────────────────────────────────────────
  { state_abbr: "AK", state_name: "Alaska",          next_election: 2026 },
  { state_abbr: "AL", state_name: "Alabama",          next_election: 2026 },
  { state_abbr: "AR", state_name: "Arkansas",         next_election: 2026 },
  { state_abbr: "AZ", state_name: "Arizona",          next_election: 2026 },
  { state_abbr: "CA", state_name: "California",       next_election: 2026 },
  { state_abbr: "CO", state_name: "Colorado",         next_election: 2026 },
  { state_abbr: "CT", state_name: "Connecticut",      next_election: 2026 },
  { state_abbr: "FL", state_name: "Florida",          next_election: 2026 },
  { state_abbr: "GA", state_name: "Georgia",          next_election: 2026 },
  { state_abbr: "HI", state_name: "Hawaii",           next_election: 2026 },
  { state_abbr: "IA", state_name: "Iowa",             next_election: 2026 },
  { state_abbr: "ID", state_name: "Idaho",            next_election: 2026 },
  { state_abbr: "IL", state_name: "Illinois",         next_election: 2026 },
  { state_abbr: "KS", state_name: "Kansas",           next_election: 2026 },
  { state_abbr: "MA", state_name: "Massachusetts",    next_election: 2026 },
  { state_abbr: "MD", state_name: "Maryland",         next_election: 2026 },  // corrected from 2030
  { state_abbr: "ME", state_name: "Maine",            next_election: 2026 },  // corrected from 2030
  { state_abbr: "MI", state_name: "Michigan",         next_election: 2026 },
  { state_abbr: "MN", state_name: "Minnesota",        next_election: 2026 },
  { state_abbr: "NE", state_name: "Nebraska",         next_election: 2026 },
  { state_abbr: "NH", state_name: "New Hampshire",    next_election: 2026 },
  { state_abbr: "NM", state_name: "New Mexico",       next_election: 2026 },
  { state_abbr: "NV", state_name: "Nevada",           next_election: 2026 },
  { state_abbr: "NY", state_name: "New York",         next_election: 2026 },
  { state_abbr: "OH", state_name: "Ohio",             next_election: 2026 },
  { state_abbr: "OK", state_name: "Oklahoma",         next_election: 2026 },
  { state_abbr: "OR", state_name: "Oregon",           next_election: 2026 },
  { state_abbr: "PA", state_name: "Pennsylvania",     next_election: 2026 },
  { state_abbr: "RI", state_name: "Rhode Island",     next_election: 2026 },
  { state_abbr: "SC", state_name: "South Carolina",   next_election: 2026 },
  { state_abbr: "SD", state_name: "South Dakota",     next_election: 2026 },
  { state_abbr: "TN", state_name: "Tennessee",        next_election: 2026 },
  { state_abbr: "TX", state_name: "Texas",            next_election: 2026 },
  { state_abbr: "VT", state_name: "Vermont",          next_election: 2026 },
  { state_abbr: "WI", state_name: "Wisconsin",        next_election: 2026 },
  { state_abbr: "WY", state_name: "Wyoming",          next_election: 2026 },
  // ── No 2026 race (14 states) ──────────────────────────────────────
  { state_abbr: "DE", state_name: "Delaware",         next_election: 2028 },
  { state_abbr: "IN", state_name: "Indiana",          next_election: 2028 },
  { state_abbr: "KY", state_name: "Kentucky",         next_election: 2027 },
  { state_abbr: "LA", state_name: "Louisiana",        next_election: 2027 },
  { state_abbr: "MO", state_name: "Missouri",         next_election: 2028 },
  { state_abbr: "MS", state_name: "Mississippi",      next_election: 2027 },
  { state_abbr: "MT", state_name: "Montana",          next_election: 2028 },
  { state_abbr: "NC", state_name: "North Carolina",   next_election: 2028 },  // corrected from 2026
  { state_abbr: "ND", state_name: "North Dakota",     next_election: 2028 },
  { state_abbr: "NJ", state_name: "New Jersey",       next_election: 2029 },
  { state_abbr: "UT", state_name: "Utah",             next_election: 2028 },  // corrected from 2026
  { state_abbr: "VA", state_name: "Virginia",         next_election: 2029 },  // corrected from 2025
  { state_abbr: "WA", state_name: "Washington",       next_election: 2028 },
  { state_abbr: "WV", state_name: "West Virginia",    next_election: 2028 },
].sort((a, b) => a.state_abbr.localeCompare(b.state_abbr));

const GOV_HEADERS = [
  // Identity (always fill)
  "state_abbr", "state_name",
  "race_desc",      // narrative description shown in "About this Race" / "About this Office"
  "next_election",  // year of next governor race (2026 = active race)
  "incumbent",      // current governor's full name
  "party",          // incumbent party: D, R, or I
  "Term_Length",    // governor term length in years (typically 2 or 4)
  // ── Fill the columns below ONLY when next_election = 2026 ─────────
  "prob_dem",   // Dem win probability 0–1  (e.g. 0.71)
  "prob_rep",   // Rep win probability 0–1  (e.g. 0.29)
  "margin",     // positive = Rep wins, negative = Dem wins  (e.g. -3 or 10)
  "proj_dem",   // projected Dem vote share 0–100  (e.g. 51.5)
  "proj_rep",   // projected Rep vote share 0–100  (e.g. 48.5)
  "dem_name",
  "dem_incumbent",  // Y or N
  "rep_name",
  "rep_incumbent",  // Y or N
  "rcp_dem", "rcp_rep",         // RCP poll average vote share (or N/A)
  "kalshi_dem", "kalshi_rep",   // Kalshi win probability (or N/A)
  "poly_dem", "poly_rep",       // Polymarket win probability (or N/A)
];

write("governor_seats.csv", GOV_HEADERS, GOVERNOR_SEATS);

// ── 4. governor_past_results ──────────────────────────────────────────────────

write("governor_past_results.csv", [
  "state_abbr",
  "year",
  "dem_pct", "rep_pct",
  "dem_votes", "rep_votes",
  "dem_candidate", "rep_candidate",
], []);

// ── 5. house_races ────────────────────────────────────────────────────────────
// All 435 districts. Pre-populated with district IDs and names.
// Fill in probability, margin, candidates, etc. for each district.

const STATE_INFO = [
  ["01", "AL", "Alabama",         7],
  ["02", "AK", "Alaska",          1],
  ["04", "AZ", "Arizona",         9],
  ["05", "AR", "Arkansas",        4],
  ["06", "CA", "California",     52],
  ["08", "CO", "Colorado",        8],
  ["09", "CT", "Connecticut",     5],
  ["10", "DE", "Delaware",        1],
  ["12", "FL", "Florida",        28],
  ["13", "GA", "Georgia",        14],
  ["15", "HI", "Hawaii",          2],
  ["16", "ID", "Idaho",           2],
  ["17", "IL", "Illinois",       17],
  ["18", "IN", "Indiana",         9],
  ["19", "IA", "Iowa",            4],
  ["20", "KS", "Kansas",          4],
  ["21", "KY", "Kentucky",        6],
  ["22", "LA", "Louisiana",       6],
  ["23", "ME", "Maine",           2],
  ["24", "MD", "Maryland",        8],
  ["25", "MA", "Massachusetts",   9],
  ["26", "MI", "Michigan",       13],
  ["27", "MN", "Minnesota",       8],
  ["28", "MS", "Mississippi",     4],
  ["29", "MO", "Missouri",        8],
  ["30", "MT", "Montana",         2],
  ["31", "NE", "Nebraska",        3],
  ["32", "NV", "Nevada",          4],
  ["33", "NH", "New Hampshire",   2],
  ["34", "NJ", "New Jersey",     12],
  ["35", "NM", "New Mexico",      3],
  ["36", "NY", "New York",       26],
  ["37", "NC", "North Carolina", 14],
  ["38", "ND", "North Dakota",    1],
  ["39", "OH", "Ohio",           15],
  ["40", "OK", "Oklahoma",        5],
  ["41", "OR", "Oregon",          6],
  ["42", "PA", "Pennsylvania",   17],
  ["44", "RI", "Rhode Island",    2],
  ["45", "SC", "South Carolina",  7],
  ["46", "SD", "South Dakota",    1],
  ["47", "TN", "Tennessee",       9],
  ["48", "TX", "Texas",          38],
  ["49", "UT", "Utah",            4],
  ["50", "VT", "Vermont",         1],
  ["51", "VA", "Virginia",       11],
  ["53", "WA", "Washington",     10],
  ["54", "WV", "West Virginia",   2],
  ["55", "WI", "Wisconsin",       8],
  ["56", "WY", "Wyoming",         1],
];

const HOUSE_HEADERS = [
  "district_id",    // FIPS-based: "0101" (AL-01) or "0200" (AK-AL)
  "district_name",  // "AL-01" or "AK-AL"
  "state_abbr", "state_name",
  "probability",    // Dem win probability 0–100
  "margin",         // Dem+/Rep-
  "dem_name", "dem_incumbent",
  "rep_name", "rep_incumbent",
  "rcp_dem", "rcp_rep",
  "kalshi_dem", "kalshi_rep",
  "poly_dem", "poly_rep",
  "history_sep", "history_oct", "history_nov",
  "history_dec", "history_jan", "history_feb", "history_mar",
];

const houseRows = [];
for (const [fips, abbr, stateName, n] of STATE_INFO) {
  for (let d = 1; d <= n; d++) {
    const distStr = n === 1 ? "00" : String(d).padStart(2, "0");
    const distLabel = n === 1 ? `${abbr}-AL` : `${abbr}-${d}`;
    houseRows.push({
      district_id: fips + distStr,
      district_name: distLabel,
      state_abbr: abbr,
      state_name: stateName,
    });
  }
}

write("house_races.csv", HOUSE_HEADERS, houseRows);

// ── 6. presidential_2024 ──────────────────────────────────────────────────────

const ALL_STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],
  ["CA","California"],["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],
  ["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],
  ["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],
  ["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],
  ["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],
  ["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],
  ["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],
  ["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],
  ["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],
  ["WI","Wisconsin"],["WY","Wyoming"],
];

write("presidential_2024.csv", [
  "state_abbr", "state_name",
  "margin",     // positive = Harris, negative = Trump  (e.g. 20.0 or -5.5)
  "dem_pct",    // Harris %
  "rep_pct",    // Trump %
  "dem_votes",  // raw Harris votes
  "rep_votes",  // raw Trump votes
], ALL_STATES.map(([abbr, name]) => ({ state_abbr: abbr, state_name: name })));

// ── Cleanup: remove old split files that are now consolidated ─────────────────

const OLD_FILES = [
  "senate_races.csv",
  "senate_no_election.csv",
  "senate_holdovers.csv",
  "senate_current.csv",
  "governor_races.csv",
  "governor_no_election.csv",
];

for (const f of OLD_FILES) {
  const p = path.join(OUT, f);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log(`✗ removed ${f}  (consolidated into new files)`);
  }
}

console.log("\nAll spreadsheet CSVs written to data-entry/");
console.log("Import each file as a separate tab in Google Sheets.");
console.log("\nKey rule: next_election = 2026 → active race (fill all columns)");
console.log("          next_election ≠ 2026 → holdover (fill incumbent + party only)");
