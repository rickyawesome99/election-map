#!/usr/bin/env node
/**
 * ELECTION MAP — Spreadsheet → TypeScript build script
 *
 * WORKFLOW:
 *   1. Fill in your Google Sheets tabs
 *   2. For each tab: File → Download → Comma-separated values (.csv)
 *   3. Drop the downloaded CSV into this data-entry/ folder
 *      (replace the existing file with the same name)
 *   4. Run:  node data-entry/build.js
 *   5. Done — data/forecastData.ts is updated automatically
 *
 * Reads:
 *   data-entry/senate_seats.csv
 *   data-entry/senate_past_results.csv
 *   data-entry/governor_seats.csv
 *   data-entry/governor_past_results.csv
 *   data-entry/house_races.csv
 *   data-entry/presidential_2024.csv
 *
 * Writes:
 *   data/forecastData.ts  (replaces the existing file)
 */

const fs   = require("fs");
const path = require("path");

const DATA_DIR  = path.join(__dirname, "../data");
const SHEET_DIR = __dirname;

// ── Election year — change this one value to target a new cycle ───────────────
const ELECTION_YEAR = 2026;

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(filename) {
  const full = path.join(SHEET_DIR, filename);
  if (!fs.existsSync(full)) {
    console.error(`ERROR: Missing file: ${full}`);
    process.exit(1);
  }
  const content = fs.readFileSync(full, "utf8").trim();
  const lines   = content.split(/\r?\n/);
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

// ── Value helpers ─────────────────────────────────────────────────────────────

const num  = (v, def = 0) => { const n = parseFloat(v); return isNaN(n) ? def : n; };
const int2 = (v, def = 0) => { const n = parseInt(v);   return isNaN(n) ? def : n; };
// Handles TRUE/FALSE and Y/N
const bool = (v) => { const s = (v || "").trim().toUpperCase(); return s === "TRUE" || s === "Y" || s === "YES"; };
// Treats blank, "N/A", and "TBD" as missing
const has  = (v) => v != null && v.trim() !== "" && v.trim().toUpperCase() !== "N/A" && v.trim().toUpperCase() !== "TBD";

function rating(margin) {
  if (margin >= 15)  return "Safe D";
  if (margin >= 5)   return "Likely D";
  if (margin >= 1)   return "Lean D";
  if (margin >= 0)   return "Tilt D";
  if (margin > -1)   return "Tilt R";
  if (margin >= -5)  return "Lean R";
  if (margin >= -15) return "Likely R";
  return "Safe R";
}

// Build history array from spreadsheet row.
// Uses entered monthly values if present; otherwise derives from probability.
function buildHistory(row, prob01) {
  const KEYS  = ["history_sep","history_oct","history_nov","history_dec","history_jan","history_feb","history_mar"];
  const DATES = ["Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
  const anyFilled = KEYS.some((k) => has(row[k]));

  if (anyFilled) {
    const base = Math.round(prob01 * 100);
    return KEYS.map((k, i) => ({
      date: DATES[i],
      value: has(row[k]) ? num(row[k], base) : base,
    }));
  }

  // Derive (matches the original h() helper in forecastData.ts)
  const b = Math.round(prob01 * 100);
  return [
    { date: "Sep", value: Math.max(1, Math.min(99, b - 5)) },
    { date: "Oct", value: Math.max(1, Math.min(99, b - 3)) },
    { date: "Nov", value: Math.max(1, Math.min(99, b - 1)) },
    { date: "Dec", value: Math.max(1, Math.min(99, b)) },
    { date: "Jan", value: Math.max(1, Math.min(99, b)) },
    { date: "Feb", value: Math.max(1, Math.min(99, b)) },
    { date: "Mar", value: b },
  ];
}

// Build a RaceForecast object from a spreadsheet row + associated past results
function buildRaceForecast(row, raceType, id, name, state, pastRows) {
  // Probability — new format: prob_dem (0–1).  Old format: probability (0–100).
  const prob01 = has(row.prob_dem)
    ? Math.max(0, Math.min(1, num(row.prob_dem, 0.5)))
    : Math.max(0, Math.min(1, num(row.probability, 50) / 100));

  // Margin (internal convention: positive = Dem wins).
  // Prefer deriving from proj_dem - proj_rep.
  // Fall back to negating user's margin column (user convention: positive = Rep wins).
  let margin;
  if (has(row.proj_dem) && has(row.proj_rep)) {
    margin = parseFloat((num(row.proj_dem) - num(row.proj_rep)).toFixed(1));
  } else if (has(row.margin)) {
    margin = parseFloat((-num(row.margin)).toFixed(1));
  } else {
    margin = parseFloat(((prob01 - 0.5) * 42).toFixed(1));
  }

  const forecast = {
    id,
    name,
    state,
    raceType,
    probability: parseFloat(prob01.toFixed(2)),
    margin,
    rating:  rating(margin),
    history: buildHistory(row, prob01),
  };

  // termLength — governor only (optional)
  if (has(row.Term_Length)) forecast.termLength = int2(row.Term_Length);

  // senate-specific fields
  if (has(row.seat))       forecast.seat        = int2(row.seat);
  if (has(row['class']))   forecast.seatClass   = int2(row['class']);
  if (has(row.type))       forecast.electionType = row.type;

  // race description
  if (has(row.race_desc)) forecast.raceDesc = row.race_desc;

  // Prediction market / poll aggregate data (stored as 0–1 probability)
  if (has(row.kalshi_dem) && has(row.kalshi_rep)) {
    forecast.kalshiDem = num(row.kalshi_dem);
    forecast.kalshiRep = num(row.kalshi_rep);
  }
  if (has(row.rcp_dem) && has(row.rcp_rep)) {
    forecast.rcpDem = num(row.rcp_dem);
    forecast.rcpRep = num(row.rcp_rep);
  }
  if (has(row.poly_dem) && has(row.poly_rep)) {
    forecast.polyDem = num(row.poly_dem);
    forecast.polyRep = num(row.poly_rep);
  }

  // Candidates (optional — only include if dem_name or rep_name is filled)
  if (has(row.dem_name) || has(row.rep_name)) {
    forecast.candidates = {
      dem: {
        name:      has(row.dem_name) ? row.dem_name : "Democratic Candidate",
        party:     has(row.dem_party) ? row.dem_party.trim() : "D",
        incumbent: bool(row.dem_incumbent),
      },
      rep: {
        name:      has(row.rep_name) ? row.rep_name : "Republican Candidate",
        party:     "R",
        incumbent: bool(row.rep_incumbent),
      },
    };
  }

  // Past results (optional)
  if (pastRows && pastRows.length > 0) {
    forecast.pastResults = pastRows
      .map((r) => {
        const pr = { year: int2(r.year, 0), demPct: num(r.dem_pct), repPct: num(r.rep_pct) };
        if (has(r.dem_candidate)) pr.demCandidate = r.dem_candidate;
        if (has(r.rep_candidate)) pr.repCandidate = r.rep_candidate;
        // Vote counts — strip commas in case of formatted numbers like "412,961"
        const dv = parseInt((r.dem_votes || "").replace(/,/g, ""));
        const rv = parseInt((r.rep_votes || "").replace(/,/g, ""));
        const tv = parseInt((r.total_votes || "").replace(/,/g, ""));
        if (!isNaN(dv) && dv > 0) pr.demVotes = dv;
        if (!isNaN(rv) && rv > 0) pr.repVotes = rv;
        if (!isNaN(tv) && tv > 0) pr.totalVotes = tv;
        if (has(r.margin)) pr.margin = num(r.margin);
        if (has(r.seat)) pr.seat = int2(r.seat);
        if (has(r['class'])) pr.seatClass = int2(r['class']);
        if (has(r.type)) pr.electionType = r.type;
        if (has(r.dem_incumbent)) pr.demIncumbent = bool(r.dem_incumbent);
        if (has(r.rep_incumbent)) pr.repIncumbent = bool(r.rep_incumbent);
        return pr;
      })
      .filter((r) => r.year > 0)
      .sort((a, b) => b.year - a.year);
  }

  return forecast;
}

// Build a NoElectionEntry object
function buildNoElection(row, state, abbr, pastRows) {
  const entry = {
    state,
    abbr,
    incumbent:    has(row.incumbent) ? row.incumbent : "Incumbent TBD",
    party:        row.party || "R",
    nextElection: int2(row.next_election, 2028),
  };
  if (has(row.Term_Length)) entry.termLength = int2(row.Term_Length);
  if (has(row.race_desc))   entry.raceDesc   = row.race_desc;
  if (pastRows && pastRows.length > 0) {
    entry.pastResults = pastRows
      .map((r) => {
        const pr = { year: int2(r.year, 0), demPct: num(r.dem_pct), repPct: num(r.rep_pct) };
        if (has(r.dem_candidate)) pr.demCandidate = r.dem_candidate;
        if (has(r.rep_candidate)) pr.repCandidate = r.rep_candidate;
        const dv = parseInt((r.dem_votes || "").replace(/,/g, ""));
        const rv = parseInt((r.rep_votes || "").replace(/,/g, ""));
        const tv = parseInt((r.total_votes || "").replace(/,/g, ""));
        if (!isNaN(dv) && dv > 0) pr.demVotes = dv;
        if (!isNaN(rv) && rv > 0) pr.repVotes = rv;
        if (!isNaN(tv) && tv > 0) pr.totalVotes = tv;
        if (has(r.margin)) pr.margin = num(r.margin);
        if (has(r.seat)) pr.seat = int2(r.seat);
        if (has(r['class'])) pr.seatClass = int2(r['class']);
        if (has(r.type)) pr.electionType = r.type;
        if (has(r.dem_incumbent)) pr.demIncumbent = bool(r.dem_incumbent);
        if (has(r.rep_incumbent)) pr.repIncumbent = bool(r.rep_incumbent);
        return pr;
      })
      .filter((r) => r.year > 0)
      .sort((a, b) => b.year - a.year);
  }
  return entry;
}

// ── Procedural house generation (fallback for unfilled districts) ─────────────

const STATE_INFO = [
  ["01","AL","Alabama",7,0.22],["02","AK","Alaska",1,0.36],
  ["04","AZ","Arizona",9,0.50],["05","AR","Arkansas",4,0.18],
  ["06","CA","California",52,0.65],["08","CO","Colorado",8,0.55],
  ["09","CT","Connecticut",5,0.65],["10","DE","Delaware",1,0.70],
  ["12","FL","Florida",28,0.38],["13","GA","Georgia",14,0.44],
  ["15","HI","Hawaii",2,0.82],["16","ID","Idaho",2,0.15],
  ["17","IL","Illinois",17,0.60],["18","IN","Indiana",9,0.28],
  ["19","IA","Iowa",4,0.35],["20","KS","Kansas",4,0.25],
  ["21","KY","Kentucky",6,0.20],["22","LA","Louisiana",6,0.22],
  ["23","ME","Maine",2,0.58],["24","MD","Maryland",8,0.72],
  ["25","MA","Massachusetts",9,0.82],["26","MI","Michigan",13,0.52],
  ["27","MN","Minnesota",8,0.52],["28","MS","Mississippi",4,0.28],
  ["29","MO","Missouri",8,0.28],["30","MT","Montana",2,0.30],
  ["31","NE","Nebraska",3,0.22],["32","NV","Nevada",4,0.54],
  ["33","NH","New Hampshire",2,0.57],["34","NJ","New Jersey",12,0.60],
  ["35","NM","New Mexico",3,0.66],["36","NY","New York",26,0.62],
  ["37","NC","North Carolina",14,0.46],["38","ND","North Dakota",1,0.18],
  ["39","OH","Ohio",15,0.38],["40","OK","Oklahoma",5,0.16],
  ["41","OR","Oregon",6,0.62],["42","PA","Pennsylvania",17,0.52],
  ["44","RI","Rhode Island",2,0.80],["45","SC","South Carolina",7,0.26],
  ["46","SD","South Dakota",1,0.20],["47","TN","Tennessee",9,0.20],
  ["48","TX","Texas",38,0.34],["49","UT","Utah",4,0.26],
  ["50","VT","Vermont",1,0.84],["51","VA","Virginia",11,0.54],
  ["53","WA","Washington",10,0.60],["54","WV","West Virginia",2,0.14],
  ["55","WI","Wisconsin",8,0.48],["56","WY","Wyoming",1,0.08],
];

function proceduralHouseDistrict(fips, abbr, stateName, d, n, base) {
  const distStr  = n === 1 ? "00" : String(d).padStart(2, "0");
  const id       = fips + distStr;
  const name     = n === 1 ? `${abbr}-AL` : `${abbr}-${d}`;
  const variation = Math.sin(d * 2.4 + parseInt(fips) * 0.3) * 0.26;
  const prob     = Math.max(0.03, Math.min(0.97, base + variation));
  const margin   = parseFloat(((prob - 0.5) * 42).toFixed(1));
  return {
    id, name, state: stateName, raceType: "house",
    probability: parseFloat(prob.toFixed(2)),
    margin, rating: rating(margin), history: buildHistory({}, prob),
  };
}

// ── Load all CSVs ─────────────────────────────────────────────────────────────

console.log("Reading spreadsheet files…");
const senateRows    = parseCSV("senate_seats.csv");
const senatePast    = parseCSV("senate_past_results.csv");
const govRows       = parseCSV("governor_seats.csv");
const govPast       = parseCSV("governor_past_results.csv");
const houseRows     = parseCSV("house_races.csv");
const presRows      = parseCSV("presidential_2024.csv");

// ── Senate ────────────────────────────────────────────────────────────────────

// Index past results by "stateAbbr-seat"
const senatePastMap = {};
for (const r of senatePast) {
  const key = `${r.state_abbr}-${r.seat}`;
  (senatePastMap[key] = senatePastMap[key] || []).push(r);
}

const senateData       = [];
const senateNoElection = [];
const senateHoldovers  = [];

for (const row of senateRows) {
  const abbr  = row.state_abbr;
  const state = row.state_name;
  const seat  = parseInt(row.seat);
  const nextY = int2(row.next_election, 2028);

  if (nextY === ELECTION_YEAR) {
    // Active race — seat 1 uses abbr as id (e.g. "AK"), seat 2 uses "abbr-2" (e.g. "DE-2")
    const raceId = seat === 2 ? `${abbr}-2` : abbr;
    const past = senatePastMap[`${abbr}-${seat}`] || [];
    senateData.push(buildRaceForecast(row, "senate", raceId, state, state, past));
  } else if (seat === 1) {
    const past = senatePastMap[`${abbr}-${seat}`] || [];
    senateNoElection.push(buildNoElection(row, state, abbr, past));
  } else {
    const past = senatePastMap[`${abbr}-${seat}`] || [];
    senateHoldovers.push(buildNoElection(row, state, abbr, past));
  }
}

// Build senateCurrent from all senate rows grouped by state
const senateSeatsByState = {};
for (const row of senateRows) {
  const abbr = row.state_abbr;
  if (!senateSeatsByState[abbr]) senateSeatsByState[abbr] = {};
  senateSeatsByState[abbr][row.seat] = row.party || "R";
}

const senateCurrent = {};
for (const [abbr, seats] of Object.entries(senateSeatsByState)) {
  senateCurrent[abbr] = [seats["1"] || "R", seats["2"] || "R"];
}

// ── Governor ──────────────────────────────────────────────────────────────────

const govPastMap = {};
for (const r of govPast) {
  (govPastMap[r.state_abbr] = govPastMap[r.state_abbr] || []).push(r);
}

const governorData       = [];
const governorNoElection = [];

for (const row of govRows) {
  const abbr  = row.state_abbr;
  const state = row.state_name;
  const nextY = int2(row.next_election, 2028);

  if (nextY === ELECTION_YEAR) {
    const past = govPastMap[abbr] || [];
    governorData.push(buildRaceForecast(row, "governor", abbr, state, state, past));
  } else {
    governorNoElection.push(buildNoElection(row, state, abbr, govPastMap[abbr] || []));
  }
}

// ── House ─────────────────────────────────────────────────────────────────────

// Index entered house data by district_id
const houseEnteredMap = {};
for (const row of houseRows) {
  if (row.district_id) houseEnteredMap[row.district_id] = row;
}

const houseData = [];
for (const [fips, abbr, stateName, n, base] of STATE_INFO) {
  for (let d = 1; d <= n; d++) {
    const distStr = n === 1 ? "00" : String(d).padStart(2, "0");
    const id      = fips + distStr;
    const entered = houseEnteredMap[id];

    if (entered && has(entered.probability)) {
      // Use entered data
      houseData.push(buildRaceForecast(entered, "house", id,
        n === 1 ? `${abbr}-AL` : `${abbr}-${d}`, stateName, []));
    } else {
      // Fall back to procedural generation
      houseData.push(proceduralHouseDistrict(fips, abbr, stateName, d, n, base));
    }
  }
}

// ── Presidential 2024 ─────────────────────────────────────────────────────────

const pres2024 = {};
for (const row of presRows) {
  if (row.state_abbr && has(row.margin)) {
    pres2024[row.state_abbr] = num(row.margin, 0);
  }
}

// ── Output forecastData.ts ────────────────────────────────────────────────────

function j(v) { return JSON.stringify(v, null, 2); }

const output = `// ⚠️  AUTO-GENERATED — do not edit by hand.
// Edit your Google Sheets, export CSVs to data-entry/, then run:
//   node data-entry/build.js

export type RaceType = "house" | "senate" | "governor";

export type Candidate = {
  name: string;
  party: "D" | "R" | "I";
  incumbent: boolean;
};

export type PastResult = {
  year: number;
  demPct: number;
  repPct: number;
  demCandidate?: string;
  repCandidate?: string;
  demVotes?: number;
  repVotes?: number;
  totalVotes?: number;
  margin?: number;
  seat?: number;
  seatClass?: number;
  electionType?: string;
  demIncumbent?: boolean;
  repIncumbent?: boolean;
};

export type RaceForecast = {
  id: string;
  name: string;
  state: string;
  raceType: RaceType;
  probability: number;
  margin: number;
  rating: string;
  history: { date: string; value: number }[];
  termLength?: number;
  seat?: number;
  seatClass?: number;
  electionType?: string;
  raceDesc?: string;
  kalshiDem?: number;
  kalshiRep?: number;
  rcpDem?: number;
  rcpRep?: number;
  polyDem?: number;
  polyRep?: number;
  candidates?: { dem: Candidate; rep: Candidate };
  pastResults?: PastResult[];
};

export type NoElectionEntry = {
  state: string;
  abbr: string;
  incumbent: string;
  party: "D" | "R" | "I";
  nextElection: number;
  termLength?: number;
  raceDesc?: string;
  pastResults?: PastResult[];
};

export const senateData: RaceForecast[] = ${j(senateData)};

export const senateNoElection: NoElectionEntry[] = ${j(senateNoElection)};

export const senateHoldovers: NoElectionEntry[] = ${j(senateHoldovers)};

export const senateCurrent: Record<string, ["D" | "R" | "I", "D" | "R" | "I"]> = ${j(senateCurrent)};

export const governorData: RaceForecast[] = ${j(governorData)};

export const governorNoElection: NoElectionEntry[] = ${j(governorNoElection)};

export const houseData: RaceForecast[] = ${j(houseData)};

export const pres2024: Record<string, number> = ${j(pres2024)};

export const electionYear: number = ${ELECTION_YEAR};
`;

const outPath = path.join(DATA_DIR, "forecastData.ts");
fs.writeFileSync(outPath, output);

console.log(`\n✓ Senate races:      ${senateData.length}`);
console.log(`✓ Senate holdovers:  ${senateNoElection.length + senateHoldovers.length}`);
console.log(`✓ Governor races:    ${governorData.length}`);
console.log(`✓ Governor holdouts: ${governorNoElection.length}`);
console.log(`✓ House districts:   ${houseData.length}`);
console.log(`✓ Pres 2024 states:  ${Object.keys(pres2024).length}`);
console.log(`\n✅  data/forecastData.ts updated successfully.`);
