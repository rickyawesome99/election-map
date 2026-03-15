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
  candidates?: { dem: Candidate; rep: Candidate };
  pastResults?: PastResult[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function h(p: number): { date: string; value: number }[] {
  const b = Math.round(p * 100);
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

function r(p: number): string {
  if (p >= 0.85) return "Safe D";
  if (p >= 0.70) return "Likely D";
  if (p >= 0.55) return "Lean D";
  if (p >= 0.45) return "Toss-up";
  if (p >= 0.30) return "Lean R";
  if (p >= 0.15) return "Likely R";
  return "Safe R";
}

function mk(
  id: string, name: string, state: string,
  type: RaceType, prob: number, margin: number
): RaceForecast {
  return { id, name, state, raceType: type, probability: prob, margin, rating: r(prob), history: h(prob) };
}

function senate(
  id: string, state: string,
  prob: number, margin: number,
  demName: string, demParty: "D" | "I", demInc: boolean,
  repName: string, repInc: boolean,
  past: PastResult[]
): RaceForecast {
  return {
    ...mk(id, state, state, "senate", prob, margin),
    candidates: {
      dem: { name: demName, party: demParty, incumbent: demInc },
      rep: { name: repName, party: "R", incumbent: repInc },
    },
    pastResults: past,
  };
}

// Shorthand for past results
function pr(year: number, demPct: number, repPct: number): PastResult {
  return { year, demPct, repPct };
}

// ── Senate 2026 (Class 2 + 2 specials: OH, FL) ───────────────────────────────
export const senateData: RaceForecast[] = [
  // ── Safe D ──
  senate("MA", "Massachusetts", 0.97, 28.5,
    "Ed Markey", "D", true, "Kevin O'Connor", false,
    [pr(2020, 66.3, 31.9), pr(2014, 61.1, 37.1), pr(2008, 65.8, 30.0)]),

  senate("RI", "Rhode Island", 0.96, 24.1,
    "Jack Reed", "D", true, "Allan Fung", false,
    [pr(2020, 68.8, 28.3), pr(2014, 70.5, 26.0), pr(2008, 73.4, 22.7)]),

  senate("DE", "Delaware", 0.92, 17.3,
    "Chris Coons", "D", true, "Lauren Witzke", false,
    [pr(2020, 62.1, 34.8), pr(2014, 66.2, 31.1), pr(2008, 64.7, 33.5)]),

  // IL: Durbin (Class 2) retiring — open seat
  senate("IL", "Illinois", 0.91, 14.2,
    "Alexi Giannoulias", "D", false, "Mark Kirk Jr.", false,
    [pr(2020, 53.9, 40.9), pr(2014, 52.9, 43.4), pr(2008, 67.8, 29.0)]),

  senate("OR", "Oregon", 0.91, 14.2,
    "Jeff Merkley", "D", true, "Jo Rae Perkins", false,
    [pr(2020, 56.9, 37.9), pr(2014, 55.7, 39.4), pr(2008, 48.9, 45.6)]),

  // NM: Luján is the Class 2 incumbent (not Heinrich)
  senate("NM", "New Mexico", 0.90, 13.5,
    "Ben Ray Luján", "D", true, "Mark Ronchetti", false,
    [pr(2020, 51.9, 44.8), pr(2014, 57.1, 40.4), pr(2008, 61.3, 35.3)]),

  senate("CO", "Colorado", 0.88, 10.2,
    "John Hickenlooper", "D", true, "Dave Williams", false,
    [pr(2020, 53.5, 44.2), pr(2014, 46.3, 49.0), pr(2008, 53.0, 43.0)]),

  senate("VA", "Virginia", 0.87, 9.8,
    "Mark Warner", "D", true, "Daniel Gade", false,
    [pr(2020, 56.2, 42.2), pr(2014, 49.1, 48.3), pr(2008, 65.0, 34.0)]),

  senate("NJ", "New Jersey", 0.86, 9.1,
    "Cory Booker", "D", true, "Rik Mehta", false,
    [pr(2020, 57.3, 40.4), pr(2014, 55.3, 43.0), pr(2008, 56.0, 41.0)]),

  senate("MN", "Minnesota", 0.83, 8.4,
    "Tina Smith", "D", true, "Jason Lewis", false,
    [pr(2020, 48.8, 43.5), pr(2014, 53.2, 41.9), pr(2008, 49.0, 43.0)]),

  senate("NH", "New Hampshire", 0.79, 6.2,
    "Jeanne Shaheen", "D", true, "Don Bolduc", false,
    [pr(2020, 55.7, 41.0), pr(2014, 51.6, 48.4), pr(2008, 52.0, 45.4)]),

  senate("MI", "Michigan", 0.74, 5.1,
    "Gary Peters", "D", true, "John James", false,
    [pr(2020, 52.0, 47.3), pr(2014, 46.4, 52.1), pr(2008, 59.4, 38.7)]),

  // ── Toss-up / Competitive ──
  senate("GA", "Georgia", 0.55, 1.4,
    "Jon Ossoff", "D", true, "Brian Kemp", false,
    [pr(2021, 50.5, 49.5), pr(2014, 45.2, 52.9), pr(2008, 46.2, 49.8)]),

  // OH: Special election for Vance's vacated Class 3 seat
  senate("OH", "Ohio", 0.44, -1.8,
    "Sherrod Brown", "D", false, "Matt Dolan", false,
    [pr(2022, 47.0, 53.0), pr(2016, 36.9, 58.1), pr(2010, 39.4, 56.7)]),

  senate("NC", "North Carolina", 0.38, -3.8,
    "Jeff Jackson", "D", false, "Thom Tillis", false,
    [pr(2020, 46.6, 48.7), pr(2014, 47.3, 45.2), pr(2008, 52.7, 44.9)]),

  senate("AK", "Alaska", 0.38, -4.1,
    "Mary Peltola", "D", false, "Dan Sullivan", true,
    [pr(2020, 38.5, 53.7), pr(2014, 45.6, 49.7), pr(2008, 37.6, 57.3)]),

  // ME: Collins (R) is the Class 2 incumbent — not Angus King (Class 1)
  senate("ME", "Maine", 0.37, -5.6,
    "Jared Golden", "D", false, "Susan Collins", true,
    [pr(2020, 42.4, 51.1), pr(2014, 31.5, 68.5), pr(2008, 38.7, 61.3)]),

  senate("IA", "Iowa", 0.32, -5.2,
    "Abby Finkenauer", "D", false, "Joni Ernst", false,
    [pr(2020, 44.4, 51.8), pr(2014, 43.7, 52.1), pr(2008, 63.2, 32.3)]),

  // FL: Special election for Rubio's vacated Class 3 seat
  senate("FL", "Florida", 0.25, -8.2,
    "Nikki Fried", "D", false, "Ashley Moody", true,
    [pr(2022, 41.3, 57.7), pr(2016, 44.3, 52.0), pr(2010, 20.0, 48.9)]),

  senate("MT", "Montana", 0.24, -8.3,
    "Monica Tranel", "D", false, "Steve Daines", false,
    [pr(2020, 40.5, 55.4), pr(2014, 40.6, 57.9), pr(2008, 48.0, 47.6)]),

  senate("TX", "Texas", 0.22, -9.3,
    "Colin Allred", "D", false, "John Cornyn", false,
    [pr(2020, 43.9, 53.5), pr(2014, 34.4, 61.6), pr(2008, 42.8, 54.8)]),

  // SC: Graham (Class 2) is the incumbent — not Tim Scott (Class 3)
  senate("SC", "South Carolina", 0.12, -15.1,
    "Joyce Dickerson", "D", false, "Lindsey Graham", true,
    [pr(2020, 44.2, 54.5), pr(2014, 40.9, 55.3), pr(2008, 43.6, 56.4)]),

  senate("SD", "South Dakota", 0.12, -14.7,
    "Shawn Bordeaux", "D", false, "Mike Rounds", false,
    [pr(2020, 31.5, 65.9), pr(2014, 28.4, 50.4), pr(2008, 36.8, 60.6)]),

  senate("KS", "Kansas", 0.09, -18.1,
    "Barbara Bollier", "D", false, "Roger Marshall", false,
    [pr(2020, 41.2, 53.6), pr(2014, 32.6, 60.6), pr(2008, 27.9, 68.0)]),

  senate("NE", "Nebraska", 0.08, -18.9,
    "Preston Love Jr.", "D", false, "Pete Ricketts", false,
    [pr(2020, 26.0, 62.7), pr(2014, 27.4, 65.9), pr(2008, 28.0, 67.1)]),

  senate("LA", "Louisiana", 0.08, -19.2,
    "Luke Mixon", "D", false, "Bill Cassidy", false,
    [pr(2020, 37.4, 59.6), pr(2014, 38.7, 56.1), pr(2008, 46.4, 53.1)]),

  senate("MS", "Mississippi", 0.07, -21.5,
    "Mike Espy", "D", false, "Cindy Hyde-Smith", false,
    [pr(2020, 38.7, 59.6), pr(2014, 37.4, 60.6), pr(2008, 38.8, 61.2)]),

  senate("AR", "Arkansas", 0.06, -22.4,
    "Natalie James", "D", false, "Tom Cotton", false,
    [pr(2020, 33.4, 66.6), pr(2014, 39.5, 56.5), pr(2008, 37.0, 58.7)]),

  senate("AL", "Alabama", 0.06, -23.1,
    "Will Boyd", "D", false, "Tommy Tuberville", false,
    [pr(2020, 32.1, 66.6), pr(2014, 25.4, 68.0), pr(2008, 37.2, 62.8)]),

  senate("OK", "Oklahoma", 0.05, -25.3,
    "Tom Guild", "D", false, "Markwayne Mullin", false,
    [pr(2022, 23.8, 74.0), pr(2016, 29.0, 67.6), pr(2010, 34.0, 65.7)]),

  // TN: Hagerty (Class 2) is the incumbent — not Blackburn (Class 1)
  senate("TN", "Tennessee", 0.06, -23.5,
    "Gloria Johnson", "D", false, "Bill Hagerty", true,
    [pr(2020, 32.2, 62.1), pr(2014, 30.3, 61.3), pr(2008, 32.1, 65.1)]),

  senate("ID", "Idaho", 0.04, -27.2,
    "David Roth", "D", false, "Jim Risch", false,
    [pr(2020, 29.3, 65.5), pr(2014, 30.5, 66.3), pr(2008, 23.7, 71.9)]),

  // WV: Capito (Class 2) is the incumbent — not Jim Justice (Class 1)
  senate("WV", "West Virginia", 0.06, -22.5,
    "Cathy Kunkel", "D", false, "Shelley Moore Capito", true,
    [pr(2020, 27.0, 65.3), pr(2014, 35.4, 62.1), pr(2008, 64.0, 36.0)]),

  senate("KY", "Kentucky", 0.05, -24.1,
    "Charles Booker", "D", false, "Andy Barr", false,
    [pr(2020, 38.5, 57.8), pr(2014, 40.7, 56.2), pr(2008, 40.6, 53.0)]),

  // WY: Lummis (Class 2) retiring — open seat
  senate("WY", "Wyoming", 0.04, -28.1,
    "Scott Morrow", "D", false, "Harriet Hageman", false,
    [pr(2020, 27.2, 72.8), pr(2014, 21.6, 72.5), pr(2008, 25.6, 73.1)]),
];

// ── Governor 2026 ────────────────────────────────────────────────────────────
export const governorData: RaceForecast[] = [
  mk("HI", "Hawaii",         "Hawaii",         "governor", 0.97, 28.1),
  mk("CA", "California",     "California",     "governor", 0.96, 24.8),
  mk("NY", "New York",       "New York",       "governor", 0.94, 19.2),
  mk("RI", "Rhode Island",   "Rhode Island",   "governor", 0.88, 11.9),
  mk("OR", "Oregon",         "Oregon",         "governor", 0.88, 11.3),
  mk("IL", "Illinois",       "Illinois",       "governor", 0.91, 14.5),
  mk("CT", "Connecticut",    "Connecticut",    "governor", 0.87, 10.8),
  mk("MA", "Massachusetts",  "Massachusetts",  "governor", 0.85,  9.4),
  mk("NM", "New Mexico",     "New Mexico",     "governor", 0.86, 10.1),
  mk("CO", "Colorado",       "Colorado",       "governor", 0.89, 12.1),
  mk("VT", "Vermont",        "Vermont",        "governor", 0.82,  8.1),
  mk("MN", "Minnesota",      "Minnesota",      "governor", 0.82,  7.9),
  mk("MI", "Michigan",       "Michigan",       "governor", 0.78,  6.3),
  mk("WI", "Wisconsin",      "Wisconsin",      "governor", 0.64,  3.2),
  mk("PA", "Pennsylvania",   "Pennsylvania",   "governor", 0.61,  2.4),
  mk("AZ", "Arizona",        "Arizona",        "governor", 0.58,  1.9),
  mk("NV", "Nevada",         "Nevada",         "governor", 0.57,  1.8),
  mk("NH", "New Hampshire",  "New Hampshire",  "governor", 0.53,  0.8),
  mk("NC", "North Carolina", "North Carolina", "governor", 0.48, -0.5),
  mk("GA", "Georgia",        "Georgia",        "governor", 0.41, -2.7),
  mk("KS", "Kansas",         "Kansas",         "governor", 0.37, -3.2),
  mk("AK", "Alaska",         "Alaska",         "governor", 0.38, -3.6),
  mk("OH", "Ohio",           "Ohio",           "governor", 0.34, -4.8),
  mk("IA", "Iowa",           "Iowa",           "governor", 0.28, -6.9),
  mk("NE", "Nebraska",       "Nebraska",       "governor", 0.24, -8.9),
  mk("UT", "Utah",           "Utah",           "governor", 0.22, -9.4),
  mk("FL", "Florida",        "Florida",        "governor", 0.22, -9.8),
  mk("TX", "Texas",          "Texas",          "governor", 0.18,-12.3),
  mk("SC", "South Carolina", "South Carolina", "governor", 0.12,-15.8),
  mk("SD", "South Dakota",   "South Dakota",   "governor", 0.09,-19.2),
  mk("AR", "Arkansas",       "Arkansas",       "governor", 0.07,-21.4),
  mk("AL", "Alabama",        "Alabama",        "governor", 0.05,-25.6),
  mk("OK", "Oklahoma",       "Oklahoma",       "governor", 0.06,-24.1),
  mk("TN", "Tennessee",      "Tennessee",      "governor", 0.08,-21.7),
  mk("ID", "Idaho",          "Idaho",          "governor", 0.05,-26.3),
  mk("WY", "Wyoming",        "Wyoming",        "governor", 0.04,-28.9),
];

// ── House 2026 — generated from per-state base probabilities ─────────────────
const stateInfo: [string, string, string, number, number][] = [
  ["01", "AL", "Alabama",        7,  0.22],
  ["02", "AK", "Alaska",         1,  0.36],
  ["04", "AZ", "Arizona",        9,  0.50],
  ["05", "AR", "Arkansas",       4,  0.18],
  ["06", "CA", "California",    52,  0.65],
  ["08", "CO", "Colorado",       8,  0.55],
  ["09", "CT", "Connecticut",    5,  0.65],
  ["10", "DE", "Delaware",       1,  0.70],
  ["12", "FL", "Florida",       28,  0.38],
  ["13", "GA", "Georgia",       14,  0.44],
  ["15", "HI", "Hawaii",         2,  0.82],
  ["16", "ID", "Idaho",          2,  0.15],
  ["17", "IL", "Illinois",      17,  0.60],
  ["18", "IN", "Indiana",        9,  0.28],
  ["19", "IA", "Iowa",           4,  0.35],
  ["20", "KS", "Kansas",         4,  0.25],
  ["21", "KY", "Kentucky",       6,  0.20],
  ["22", "LA", "Louisiana",      6,  0.22],
  ["23", "ME", "Maine",          2,  0.58],
  ["24", "MD", "Maryland",       8,  0.72],
  ["25", "MA", "Massachusetts",  9,  0.82],
  ["26", "MI", "Michigan",      13,  0.52],
  ["27", "MN", "Minnesota",      8,  0.52],
  ["28", "MS", "Mississippi",    4,  0.28],
  ["29", "MO", "Missouri",       8,  0.28],
  ["30", "MT", "Montana",        2,  0.30],
  ["31", "NE", "Nebraska",       3,  0.22],
  ["32", "NV", "Nevada",         4,  0.54],
  ["33", "NH", "New Hampshire",  2,  0.57],
  ["34", "NJ", "New Jersey",    12,  0.60],
  ["35", "NM", "New Mexico",     3,  0.66],
  ["36", "NY", "New York",      26,  0.62],
  ["37", "NC", "North Carolina",14,  0.46],
  ["38", "ND", "North Dakota",   1,  0.18],
  ["39", "OH", "Ohio",          15,  0.38],
  ["40", "OK", "Oklahoma",       5,  0.16],
  ["41", "OR", "Oregon",         6,  0.62],
  ["42", "PA", "Pennsylvania",  17,  0.52],
  ["44", "RI", "Rhode Island",   2,  0.80],
  ["45", "SC", "South Carolina", 7,  0.26],
  ["46", "SD", "South Dakota",   1,  0.20],
  ["47", "TN", "Tennessee",      9,  0.20],
  ["48", "TX", "Texas",         38,  0.34],
  ["49", "UT", "Utah",           4,  0.26],
  ["50", "VT", "Vermont",        1,  0.84],
  ["51", "VA", "Virginia",      11,  0.54],
  ["53", "WA", "Washington",    10,  0.60],
  ["54", "WV", "West Virginia",  2,  0.14],
  ["55", "WI", "Wisconsin",      8,  0.48],
  ["56", "WY", "Wyoming",        1,  0.08],
];

function generateHouseData(): RaceForecast[] {
  const result: RaceForecast[] = [];
  for (const [fips, abbr, fullName, numDistricts, base] of stateInfo) {
    for (let d = 1; d <= numDistricts; d++) {
      const distStr = numDistricts === 1 ? "00" : String(d).padStart(2, "0");
      const id = fips + distStr;
      const variation = Math.sin(d * 2.4 + parseInt(fips) * 0.3) * 0.26;
      const prob = Math.max(0.03, Math.min(0.97, base + variation));
      const margin = parseFloat(((prob - 0.5) * 42).toFixed(1));
      const distLabel = numDistricts === 1 ? `${abbr}-AL` : `${abbr}-${d}`;
      result.push(mk(id, distLabel, fullName, "house", parseFloat(prob.toFixed(2)), margin));
    }
  }
  return result;
}

export const houseData: RaceForecast[] = generateHouseData();
