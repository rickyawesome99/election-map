#!/usr/bin/env node
/**
 * Builds data/stateLegCalendar.ts - Phase 1 (election calendars) and Phase 2 (redistricting map
 * eras) of the state-leg historical results project, for all 99 chambers.
 *
 * Almost none of this is new research. Both halves are already implied by data in the repo:
 *
 *   Phase 1 comes from data-entry/state_leg.csv's `seats_up` / `total_seats` / `year` columns,
 *   filled during Objective 1 from Klarner's `seatsup`/`totalseats`. Which years a chamber appears
 *   in IS its calendar; seats_up < total_seats IS staggering; total_seats / seats_up * 2 IS the
 *   term length. Derived values are cross-checked against the independently written
 *   `electionFrequency` prose in data/stateLegMapInfo.ts and any disagreement is reported.
 *
 *   Phase 2 comes from data/stateLegMapInfo.ts's `firstCycle` - the first election on the CURRENT
 *   map - which makes every earlier election a prior era by definition. Two signals refine that:
 *
 *     1. A staggered chamber that puts EVERY seat up in one cycle has been redrawn - after a
 *        redistricting the whole chamber stands again and terms are re-staggered by lot. This
 *        detector finds the 2022 resets (AR/DE/FL/HI/IL/TX Senate) and, in FL Senate's case, an
 *        extra 2016 reset that is the mid-decade court-ordered redraw. It is the only purely
 *        empirical evidence of a map change available before boundary files exist for old eras.
 *     2. A chamber whose seat count changes between cycles has been redrawn. Wyoming is the live
 *        case: the 2020s map grew the House 60 -> 62 and the Senate 30 -> 31. Seat counts are
 *        therefore stored PER ERA, not per chamber.
 *
 * What is NOT derivable is a mid-decade redraw of a chamber that elects everyone every 2 years
 * anyway (every state House): nothing in the vote/seat data changes shape when its lines move.
 * Those come from MID_DECADE_ERAS below, and every era carries a `verified` flag so the audit page
 * can show exactly which boundaries are evidenced and which are assumed.
 *
 * Usage: node scripts/build-state-leg-calendar.mjs
 */

import { readFileSync, writeFileSync } from "fs";

const CSV = "data-entry/state_leg.csv";
const MAP_INFO_TS = "data/stateLegMapInfo.ts";
const STATES_TS = "data/statesData.ts";
const OUT_FILE = "data/stateLegCalendar.ts";

const FIRST_YEAR = 2016;
const LAST_YEAR = 2025;

/**
 * States whose legislature is elected in odd years, so their 2011-cycle map debuted in 2011
 * rather than 2012. Only affects the displayed start year of the pre-2020s era.
 */
const ODD_YEAR_STATES = new Set(["LA", "MS", "NJ", "VA"]);

/**
 * Chambers whose terms do not fit a single number. All three are 4-year terms nominally; the
 * pattern is how the decade's elections actually fall, so that a derived "term" of 4 does not
 * read as "every 4 years".
 */
const TERM_PATTERNS = {
  "IL|senate": "2-4-4 (each district's sequence set by lot after each redistricting)",
  "NJ|senate": "2-4-4 (the 2-year term is the first cycle of each decade)",
  "MN|senate": "4-4-2 (the 2-year term ends the decade so the next cycle follows redistricting)",
};

/**
 * Map eras BEFORE the current one that data/stateLegMapInfo.ts does not record, keyed
 * `ABBR|chamber`. `firstYear` is the first general election held on those lines.
 *
 * `verified` is the honest part of this table: true where the repo's own data forces the
 * conclusion (a staggered chamber standing every seat mid-decade cannot be anything else), false
 * where the boundary is assumed from the ordinary decennial pattern and has not been checked
 * against a source. The audit page reports the split rather than presenting all of it as fact.
 */
const NC_2018 = {
  enactedDate: "2018-01-21",
  source: "U.S. District Court remedial order (Covington v. North Carolina)",
  note:
    "A federal court found 9 Senate and 19 House districts of the 2011 maps to be racial gerrymanders. The legislature's 2017 remedial plans were rejected in part and the court modified them itself on 21 Jan 2018, for the 2018 election.",
  verified: true,
};

const NC_2020 = (bill) => ({
  enactedDate: "2019-09-17",
  source: `N.C. General Assembly 2019 remedial plan (${bill})`,
  note:
    "After the 2018 election, state courts found the 2017 plans to be illegal partisan and mid-decade gerrymanders; the legislature drew a further remedial set on 17 Sep 2019, used for the 2020 election.",
  verified: true,
});

const MID_DECADE_ERAS = {
  // Alabama elects only in gubernatorial years, so its single in-range 2010s election (2018) fell
  // entirely on the remedial map rather than the 2011 one.
  "AL|house": [
    {
      firstYear: 2018,
      enactedDate: "2017-10-23",
      source: "Alabama Legislature 2017 remedial plans (Ala. Legislative Black Caucus v. Alabama)",
      note:
        "A three-judge panel struck 12 districts of the 2011 legislative maps as racial gerrymanders. Remedial plans were signed in May 2017 and approved by the court on 23 Oct 2017 for the 2018 and 2020 elections.",
      verified: true,
    },
  ],
  "AL|senate": [
    {
      firstYear: 2018,
      enactedDate: "2017-10-23",
      source: "Alabama Legislature 2017 remedial plans (Ala. Legislative Black Caucus v. Alabama)",
      note:
        "Same remedial round as the House map; signed May 2017, approved 23 Oct 2017 for the 2018 and 2020 elections.",
      verified: true,
    },
  ],
  "FL|senate": [
    {
      firstYear: 2016,
      source: "League of Women Voters v. Detzner settlement map",
      note:
        "Court-approved mid-decade redraw of the Senate map. All 40 seats stood in 2016 and terms were re-staggered by lot, which is why the seats-up detector flags 2016 alongside the ordinary 2022 reset.",
      verified: true,
    },
  ],
  // North Carolina ran three different legislative maps across 2016-2020: the 2011 plan, the
  // court's own modification of the 2017 remedial plan, and a second remedial plan after the state
  // courts found the 2017 maps to be partisan gerrymanders as well.
  "NC|house": [
    { firstYear: 2018, ...NC_2018 },
    { firstYear: 2020, ...NC_2020("HB 1020") },
  ],
  "NC|senate": [
    { firstYear: 2018, ...NC_2018 },
    { firstYear: 2020, ...NC_2020("SB 692") },
  ],
  // Only the House of Delegates was redrawn; the Senate plan was challenged but upheld, so its
  // 2011 map ran all the way to the 2023 cycle.
  "VA|house": [
    {
      firstYear: 2019,
      enactedDate: "2019-02-14",
      source: "U.S. District Court remedial plan (Bethune-Hill v. Va. State Bd. of Elections)",
      note:
        "The 2011 HB 5005 House plan was struck down on 26 Jun 2018 for an unjustified predominant use of race; the court implemented its own remedial plan on 14 Feb 2019, used for the 2019 and 2021 elections.",
      verified: true,
    },
  ],
};

// ── inputs ────────────────────────────────────────────────────────────────────

function parseCsv(text) {
  const [head, ...lines] = text.trim().split("\n");
  const cols = head.split(",");
  return lines.map((line) => {
    // No quoted commas appear in the columns this script reads.
    const cells = line.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
  });
}

/**
 * data/stateLegMapInfo.ts is a plain object literal, so stripping its type-only syntax leaves
 * valid JS that can be imported directly. Evaluating it rather than regexing line by line means a
 * reformat of the file cannot silently yield a partial read.
 */
async function loadMapInfo() {
  const src = readFileSync(MAP_INFO_TS, "utf8")
    .replace(/^import type .*$/m, "")
    .replace(/export type ChamberMapInfo = \{[\s\S]*?\n\};/m, "")
    .replace(/export const stateLegMapInfo: [^=]*=/, "export const stateLegMapInfo =");
  const { stateLegMapInfo } = await import(
    `data:text/javascript;base64,${Buffer.from(src).toString("base64")}`
  );
  return stateLegMapInfo;
}

function loadStateAbbrs() {
  const out = new Map();
  const re = /name:\s*"([^"]+)",\s*abbr:\s*"([A-Z]{2})"/g;
  const text = readFileSync(STATES_TS, "utf8");
  for (const m of text.matchAll(re)) out.set(m[1], m[2]);
  return out;
}

// ── derivation ────────────────────────────────────────────────────────────────

const problems = [];

/** Nebraska's unicameral body is filed under `senate` in the boundary data but `House` in the CSV. */
const chamberKey = (abbr, type) => (abbr === "NE" ? "senate" : type === "Senate" ? "senate" : "house");

function deriveTerm(byYear, electionYears) {
  const entries = electionYears.map((y) => byYear[y]);
  const staggered = entries.some(([up, total]) => up < total);
  const gapsOf = () => electionYears.slice(1).map((y, i) => y - electionYears[i]);
  if (!staggered) {
    // Whole-chamber: the term is the spacing between elections. Take the COMMONEST gap rather
    // than the smallest - Minnesota and New Jersey each run one shortened term per decade so the
    // cycle lands after redistricting, and the short one must not be read as the nominal term.
    const gaps = gapsOf();
    if (!gaps.length) return { staggered: false, termYears: null };
    const counts = new Map();
    for (const g of gaps) counts.set(g, (counts.get(g) ?? 0) + 1);
    const termYears = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    return { staggered: false, termYears };
  }
  // Staggered: a chamber that renews 1/n of its seats each cycle runs terms n cycles long.
  // Median rather than mean, so a redistricting reset (every seat up) cannot drag it down.
  const ratios = entries.filter(([up, total]) => up < total).map(([up, total]) => total / up);
  ratios.sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];
  const gaps = gapsOf();
  const gap = gaps.length ? Math.min(...gaps) : 2;
  return { staggered: true, termYears: Math.round(median) * gap };
}

/** Cross-check a derived term/stagger against the prose written independently in stateLegMapInfo. */
function checkAgainstProse(label, prose, derived) {
  const proseTerm = prose.match(/([24])-year term/);
  const proseStaggered = /^Staggered/i.test(prose) || /staggered/i.test(prose.replace(/not staggered|no staggering/i, ""));
  if (proseTerm && derived.termYears !== Number(proseTerm[1])) {
    problems.push(`${label}: derived term ${derived.termYears}y but prose says ${proseTerm[1]}y — "${prose}"`);
  }
  if (!proseTerm) {
    const everyN = prose.match(/every (\d) years/);
    if (everyN && !derived.staggered && derived.termYears !== Number(everyN[1])) {
      problems.push(`${label}: derived term ${derived.termYears}y but prose says every ${everyN[1]} years — "${prose}"`);
    }
  }
  if (proseStaggered !== derived.staggered) {
    problems.push(`${label}: derived staggered=${derived.staggered} but prose says "${prose}"`);
  }
}

function buildEras(abbr, chamber, info, byYear, electionYears) {
  const key = `${abbr}|${chamber}`;
  const boundaries = [];

  // Oldest era in scope: the 2011-cycle map, debuting in the first election of that decade.
  boundaries.push({
    firstYear: ODD_YEAR_STATES.has(abbr) ? 2011 : 2012,
    source: "2011-cycle map",
    note: "Assumed decennial map preceding the current one; this project's data begins in 2016, so its earlier years are outside the checked range.",
    verified: false,
  });

  for (const era of MID_DECADE_ERAS[key] ?? []) boundaries.push({ ...era });

  // The 2020 census forced every state to redraw before its first election of the decade, so a
  // chamber that voted in 2022 or later but whose current map only took effect afterwards must
  // have used an intervening map. Deriving this matters: without it, Ohio's 2022 election would be
  // filed under the 2011 lines rather than the 2021 commission map that was later replaced.
  // The rule correctly stays silent where there was no such election - Kansas, New Mexico and
  // South Carolina's senates all elect on fours and simply skipped 2022.
  const superseded = electionYears.find((y) => y >= 2022 && y < info.firstCycle);
  if (superseded != null) {
    boundaries.push({
      firstYear: superseded,
      source: "2021-cycle map (superseded)",
      note:
        "The map drawn after the 2020 census and used for this chamber's first election of the decade, then replaced before the current one took effect. Its start year follows from the chamber having voted before stateLegMapInfo's firstCycle; the enacting instrument is not recorded here.",
      verified: true,
    });
  }

  boundaries.push({
    firstYear: info.firstCycle,
    enactedDate: info.enactedDate,
    source: info.source,
    note: info.note,
    verified: true,
  });

  boundaries.sort((a, b) => a.firstYear - b.firstYear);

  // A staggered chamber that suddenly stands far more seats than usual has been redrawn: after a
  // new map the whole chamber (or nearly all of it) stands again and terms are re-staggered by lot.
  // Test against the chamber's OWN median rather than for an exact all-seats-up cycle - Alaska put
  // up 19 of 20 in 2022, a redraw an exact test would miss. Every hit currently lands on a year
  // that already begins an era, which is the check: a hit that does not is an unrecorded redraw.
  if (electionYears.some((y) => byYear[y][0] < byYear[y][1])) {
    const ups = electionYears.map((y) => byYear[y][0]).sort((a, b) => a - b);
    const median = ups[Math.floor(ups.length / 2)];
    for (const y of electionYears) {
      const [up, total] = byYear[y];
      if (up <= median * 1.4) continue;
      if (!boundaries.some((b) => b.firstYear === y)) {
        problems.push(
          `${key}: ${up} of ${total} seats up in ${y} against a median of ${median}, but no map era begins that year — unrecorded redraw?`
        );
      }
    }
  }

  return boundaries
    .map((b, i) => {
      const next = boundaries[i + 1];
      const lastYear = next ? next.firstYear - 1 : null;
      const years = electionYears.filter((y) => y >= b.firstYear && (lastYear == null || y <= lastYear));
      // Seat counts are era-scoped: Wyoming's 2020s map grew both chambers.
      const seats = [...new Set(years.map((y) => byYear[y][1]))];
      if (seats.length > 1) problems.push(`${key}: era from ${b.firstYear} has inconsistent seat counts ${seats}`);
      return {
        firstYear: b.firstYear,
        lastYear,
        totalSeats: seats[0] ?? info.totalSeats,
        electionYears: years,
        enactedDate: b.enactedDate,
        source: b.source,
        note: b.note,
        verified: b.verified,
      };
    })
    // An era with no election in range and no future is not worth carrying; keep the current one
    // even when its firstCycle is still ahead of us (a map enacted but not yet used).
    .filter((e) => e.electionYears.length > 0 || e.lastYear == null);
}

// ── main ──────────────────────────────────────────────────────────────────────

const mapInfo = await loadMapInfo();
const abbrByName = loadStateAbbrs();

const rows = parseCsv(readFileSync(CSV, "utf8")).filter((r) => {
  const y = Number(r.year);
  if (!(y >= FIRST_YEAR && y <= LAST_YEAR)) return false;
  // Nebraska's "Senate" rows are intentional empty placeholders; its data lives in "House".
  return !(r.state_name === "Nebraska" && r.type === "Senate");
});

const byChamber = new Map();
for (const r of rows) {
  const abbr = abbrByName.get(r.state_name);
  if (!abbr) continue;
  const key = `${abbr}|${chamberKey(abbr, r.type)}`;
  const entry = byChamber.get(key) ?? {};
  entry[Number(r.year)] = [Number(r.seats_up), Number(r.total_seats)];
  byChamber.set(key, entry);
}

const data = {};
let eraCount = 0;
let unverified = 0;
for (const [key, byYear] of [...byChamber.entries()].sort()) {
  const [abbr, chamber] = key.split("|");
  const info = mapInfo[abbr]?.[chamber];
  if (!info) {
    problems.push(`${key}: no entry in stateLegMapInfo`);
    continue;
  }
  const electionYears = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const derived = deriveTerm(byYear, electionYears);
  checkAgainstProse(key, info.electionFrequency, derived);

  const eras = buildEras(abbr, chamber, info, byYear, electionYears);
  eraCount += eras.length;
  unverified += eras.filter((e) => !e.verified).length;

  (data[abbr] ??= {})[chamber] = {
    termYears: derived.termYears,
    termPattern: TERM_PATTERNS[key],
    staggered: derived.staggered,
    frequency: info.electionFrequency,
    electionYears,
    seatsUp: Object.fromEntries(electionYears.map((y) => [y, byYear[y][0]])),
    eras,
  };
}

const header = `import type { Chamber } from "./stateLegDistricts";

// Election calendar and redistricting map-era history for all 99 state legislative chambers.
// Auto-generated by scripts/build-state-leg-calendar.mjs - do not edit by hand, rerun the script.
// Derived from data-entry/state_leg.csv (which years each chamber elects, and how many of its
// seats) and data/stateLegMapInfo.ts (when the current map took effect); see that script's
// docstring for what is evidence and what is assumption.
//
// Covers ${FIRST_YEAR}-${LAST_YEAR}, the range the historical results project targets.

export type StateLegMapEra = {
  /** First general election held on these district lines. */
  firstYear: number;
  /** Last election year on them, or null for the era still in effect. */
  lastYear: number | null;
  /** Chamber size under this map - it can change across eras (Wyoming grew in 2022). */
  totalSeats: number;
  /** The elections in ${FIRST_YEAR}-${LAST_YEAR} that used this map. */
  electionYears: number[];
  enactedDate?: string;
  source?: string;
  note?: string;
  /**
   * Whether this era's start year is evidenced or assumed. The current map's is always true
   * (stateLegMapInfo records the enactment); the pre-2020s boundary is false unless a redraw left
   * a trace in the data, such as a staggered chamber standing all of its seats at once.
   */
  verified: boolean;
};

export type StateLegCalendar = {
  /** Nominal term length in years. */
  termYears: number | null;
  /** Set only where terms do not fall on a fixed interval, e.g. Illinois's 2-4-4 Senate. */
  termPattern?: string;
  /** True when only a fraction of the chamber stands in each cycle. */
  staggered: boolean;
  /** Human-readable summary carried through from data/stateLegMapInfo.ts. */
  frequency: string;
  /** Election years held in ${FIRST_YEAR}-${LAST_YEAR}. A chamber's off-years are simply absent. */
  electionYears: number[];
  /** Seats contested per election year - the redistricting resets are visible here. */
  seatsUp: Record<string, number>;
  /** Map eras in chronological order. */
  eras: StateLegMapEra[];
};

// state abbreviation -> chamber
export const stateLegCalendar: Record<string, Partial<Record<Chamber, StateLegCalendar>>> = `;

writeFileSync(OUT_FILE, `${header}${JSON.stringify(data, null, 1)};\n`);

const chambers = Object.values(data).reduce((n, c) => n + Object.keys(c).length, 0);
console.log(`wrote ${OUT_FILE}: ${chambers} chambers, ${eraCount} map eras (${unverified} with an unverified start year)`);
if (problems.length) {
  console.log(`\n${problems.length} check(s) to look at:`);
  for (const p of problems) console.log(`  - ${p}`);
} else {
  console.log("all derived values agree with stateLegMapInfo's prose; no unexplained redraws");
}
