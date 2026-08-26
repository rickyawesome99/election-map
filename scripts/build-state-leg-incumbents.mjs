#!/usr/bin/env node
/**
 * Regenerates data/stateLegDistricts.ts from:
 *   - data-entry/state-leg-incumbents/{abbr}_{chamber}.json      (raw Open States /people dumps)
 *   - data-entry/state-leg-party-overrides/{abbr}_{chamber}.json (optional: district -> party overrides)
 *   - data-entry/state-leg-election-years.mjs                    ("most recent regular election" rules)
 *   - data-entry/state-leg-districts-2026-source/state-house-districts-2026.json /
 *     state-senate-districts-2026.json (district list per state; combined source file — the
 *     browser instead fetches per-state splits from public/state-leg-districts/, see
 *     scripts/split-state-leg-districts.mjs)
 *
 * The boundary files are the source of truth for which districts exist in a state/chamber (so
 * a district with no matching incumbent — a vacancy — still gets a row with incumbent: null).
 * Only states with a data-entry/state-leg-incumbents/ file are included in the output; states not
 * yet sourced are simply absent, same as before (StateLegDistrictTable/Map already handle that).
 *
 * Party overrides exist for states where Open States' party field isn't useful for map coloring
 * (e.g. Nebraska's officially-nonpartisan Legislature, where Open States reports every senator as
 * "Nonpartisan") — the override file's per-district party (sourced from Ballotpedia/Wikipedia)
 * takes precedence over Open States' value.
 *
 * Usage: node scripts/build-state-leg-incumbents.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { electionYears } from "../data-entry/state-leg-election-years.mjs";

const INCUMBENTS_DIR = "data-entry/state-leg-incumbents";
const PARTY_OVERRIDES_DIR = "data-entry/state-leg-party-overrides";
// Per-incumbent lastElection override, keyed by district then person name — for the rare case
// where a single per-district year (from electionYears/resolveLastElection) would be wrong for
// one of a district's multiple incumbents. Currently only WV Senate: each numbered district's 2
// senators stagger WITHIN the shared boundary (one up each even year), so there's no single
// correct per-district year. See data-entry/state-leg-last-election-overrides/wv_senate.json.
const LAST_ELECTION_OVERRIDES_DIR = "data-entry/state-leg-last-election-overrides";
const BOUNDARY_FILES = {
  house: "data-entry/state-leg-districts-2026-source/state-house-districts-2026.json",
  senate: "data-entry/state-leg-districts-2026-source/state-senate-districts-2026.json",
};
const OUT_FILE = "data/stateLegDistricts.ts";

const ABBR_TO_FIPS = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11",
  FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21",
  LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30",
  NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39",
  OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47", TX: "48", UT: "49",
  VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56",
};

const FIPS_TO_ABBR = Object.fromEntries(Object.entries(ABBR_TO_FIPS).map(([abbr, fips]) => [fips, abbr]));

const PARTY_MAP = {
  Republican: "R",
  Democratic: "D",
  Independent: "I",
  Nonpartisan: "O",
};

function mapParty(raw) {
  return PARTY_MAP[raw] ?? "O";
}

function resolveLastElection(abbr, chamber, districtNumber) {
  const rule = electionYears[abbr]?.[chamber];
  if (rule == null) return null;
  // Rule functions get (parsedNumber, rawString) — most parity-check the numeric district
  // number (first arg), but some (Alaska Senate's lettered A-T districts) key off the raw string
  // (second arg) instead, since parsedNumber is NaN for those.
  if (typeof rule === "function") return rule(parseInt(districtNumber, 10), districtNumber);
  return rule;
}

// The boundary files' DISTRICT property was built with `String(parseInt(code, 10))`, which
// silently drops any alphabetic suffix or non-numeric code (e.g. Minnesota's paired House
// sub-districts "34A"/"34B", Alaska Senate's letter-only districts "A"-"T", or South/North
// Dakota's split "26A"/"26B"/"4A"/"4B" — see project_state_legislature_pages.md gotchas). That
// can collapse two real, distinct districts onto the same join key.
//
// NAMELSAD's last token often has the fuller code ("State House District 34A"), but NOT always
// usably so: NJ zero-pads ("Assembly District 09" vs DISTRICT "9" — same district, no extra
// info) and MA uses fully non-numeric named districts ("3rd Barnstable District" in NAMELSAD vs.
// Open States' "3rd Barnstable" — no shared numeric DISTRICT at all). So only prefer the
// NAMELSAD-derived code when it's a genuine alphabetic EXTENSION of the truncated DISTRICT number
// (i.e. matches `0*{DISTRICT}[A-Za-z]+`) — otherwise fall back to DISTRICT as-is. States whose
// Open States naming scheme doesn't correspond to DISTRICT at all get a per-state+chamber
// override in BOUNDARY_CODE_OVERRIDES.
//
// The mismatch can also run the other way: Open States can encode a SEAT designator that isn't a
// distinct boundary at all (Idaho House reports the two seats of shared Legislative District 16
// as districts "16A"/"16B", even though there's only one boundary "16" — unlike Minnesota, where
// "34A"/"34B" really are two separate boundaries). PEOPLE_CODE_OVERRIDES strips that back down to
// the boundary's key so both seats correctly group under one district row.
const BOUNDARY_CODE_OVERRIDES = {
  // MA districts are named ("3rd Suffolk"), not numbered — Open States uses that name directly;
  // NAMELSAD has the same name with a trailing "District" word tacked on. Confirmed exact-match
  // via research, 2026-08-26.
  MA_house: (properties) => properties.NAMELSAD.replace(/\s+District$/, ""),
  MA_senate: (properties) => properties.NAMELSAD.replace(/\s+District$/, ""),
  // AK Senate districts are lettered A-T, not numbered — TIGER's SLDUST encodes this as "00A" etc,
  // which parseInt truncates to DISTRICT "0" for every district. NAMELSAD's last token has the
  // real letter. Confirmed via research, 2026-08-26.
  AK_senate: (properties) => properties.NAMELSAD?.trim().split(/\s+/).pop(),
  // VT districts are named (like MA), not numbered — DISTRICT is "NaN" (parseInt failed on the
  // whole non-numeric code). NAMELSAD has the name plus a trailing literal phrase that Open States
  // doesn't include. Confirmed exact match (including compound names like "Addison-Rutland" and
  // "Chittenden Central") via research, 2026-08-26.
  VT_house: (properties) => properties.NAMELSAD?.replace(/\s+State House District$/, ""),
  VT_senate: (properties) => properties.NAMELSAD?.replace(/\s+Senatorial District$/, ""),
};

// NH House district-name -> boundary-code county abbreviations. The boundary file's DISTRICT
// values (e.g. "BE5") come from NH's own official county-prefixed numbering scheme, while Open
// States reports the full county name ("Belknap 5"). Confirmed via research, 2026-08-26.
const NH_HOUSE_COUNTY_CODES = {
  Belknap: "BE", Carroll: "CA", Cheshire: "CH", Coos: "CO", Grafton: "GR", Hillsborough: "HI",
  Merrimack: "ME", Rockingham: "RO", Strafford: "ST", Sullivan: "SU",
};

const PEOPLE_CODE_OVERRIDES = {
  // ID House: Open States reports each of the 2 shared-boundary seats as "16A"/"16B" — a seat
  // designator, not a distinct district (unlike MN, where the A/B suffix is a real separate
  // boundary). Strip it so both seats join to the one shared boundary "16". Confirmed via
  // research, 2026-08-26.
  ID_house: (raw) => raw.replace(/[A-Za-z]$/, ""),
  // NH House: convert "Belknap 5" -> "BE5" to match the boundary file's county-prefixed codes.
  // Hillsborough districts 3-9 are zero-padded in the boundary source ("HI03"-"HI09") while every
  // other NH House district (including Hillsborough 1-2 and 10+) is not — an idiosyncrasy of NH's
  // own official numbering, not a data artifact; confirmed against the full boundary code list.
  // Districts with no county match, or that are one of NH's ~40 floterial overlay districts
  // (excluded entirely from the boundary map, see project_state_legislature_pages memory), simply
  // won't match any boundary and are dropped, same as any other unmatched person. Confirmed via
  // research, 2026-08-26.
  NH_house: (raw) => {
    const m = /^([A-Za-z]+)\s+(\d+)$/.exec(raw);
    if (!m) return raw;
    const code = NH_HOUSE_COUNTY_CODES[m[1]];
    if (!code) return raw;
    const num = parseInt(m[2], 10);
    const numStr = code === "HI" && num >= 3 && num <= 9 ? String(num).padStart(2, "0") : String(num);
    return `${code}${numStr}`;
  },
};

// Used to join district identifiers that refer to the same district but are formatted
// differently between the boundary file and Open States — e.g. Massachusetts' multi-county
// Senate districts appear as "Norfolk-Worcester-Middlesex" (NAMELSAD, hyphen-joined) vs. "Norfolk,
// Worcester and Middlesex" (Open States, comma/and-joined). Plain numeric district codes are
// unaffected by this normalization (e.g. "34" stays "34").
function normalizeDistrictKey(s) {
  return s
    .toLowerCase()
    .replace(/\band\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}

function extractDistrictCode(abbr, chamber, properties) {
  const override = BOUNDARY_CODE_OVERRIDES[`${abbr}_${chamber}`];
  if (override) return override(properties);
  const { DISTRICT, NAMELSAD } = properties;
  const lastToken = NAMELSAD?.trim().split(/\s+/).pop();
  if (lastToken && DISTRICT && new RegExp(`^0*${DISTRICT}[A-Za-z]+$`).test(lastToken)) {
    return lastToken;
  }
  return DISTRICT;
}

function extractPeopleCode(abbr, chamber, rawDistrict) {
  const override = PEOPLE_CODE_OVERRIDES[`${abbr}_${chamber}`];
  return override ? override(String(rawDistrict)) : String(rawDistrict);
}

function loadBoundaryDistricts(chamber) {
  const raw = JSON.parse(readFileSync(BOUNDARY_FILES[chamber], "utf8"));
  const byFips = {};
  for (const f of raw.features) {
    const fips = f.properties.STATEFP;
    const abbr = FIPS_TO_ABBR[fips];
    (byFips[fips] ??= []).push({ district: extractDistrictCode(abbr, chamber, f.properties), label: f.properties.NAMELSAD });
  }
  return byFips;
}

function main() {
  const files = readdirSync(INCUMBENTS_DIR).filter((f) => f.endsWith(".json"));
  const byAbbrChamber = {}; // { OH: { house: [...people], senate: [...] } }
  for (const file of files) {
    const m = file.match(/^([a-z]{2})_(house|senate)\.json$/);
    if (!m) {
      console.warn(`Skipping unrecognized file: ${file}`);
      continue;
    }
    const abbr = m[1].toUpperCase();
    const chamber = m[2];
    const people = JSON.parse(readFileSync(`${INCUMBENTS_DIR}/${file}`, "utf8"));
    (byAbbrChamber[abbr] ??= {})[chamber] = people;
  }

  const boundaryByChamber = { house: loadBoundaryDistricts("house"), senate: loadBoundaryDistricts("senate") };

  const result = {};
  for (const [abbr, chambers] of Object.entries(byAbbrChamber)) {
    const fips = ABBR_TO_FIPS[abbr];
    if (!fips) {
      console.warn(`Unknown state abbreviation: ${abbr}`);
      continue;
    }
    result[abbr] = {};
    for (const [chamber, people] of Object.entries(chambers)) {
      const districts = boundaryByChamber[chamber][fips];
      if (!districts) {
        console.warn(`No boundary districts found for ${abbr} ${chamber} (fips ${fips})`);
        continue;
      }
      // A district can have more than one incumbent — some states elect multiple members
      // (usually 2, occasionally 3) from a single shared district boundary (e.g. AZ/WA House,
      // MD House, ID House, WV Senate). Group by district rather than overwrite.
      const peopleByDistrictNumber = {};
      for (const p of people) {
        const key = normalizeDistrictKey(extractPeopleCode(abbr, chamber, p.current_role.district));
        (peopleByDistrictNumber[key] ??= []).push(p);
      }

      const overridesPath = `${PARTY_OVERRIDES_DIR}/${abbr.toLowerCase()}_${chamber}.json`;
      const partyOverrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, "utf8")) : {};

      const lastElectionOverridesPath = `${LAST_ELECTION_OVERRIDES_DIR}/${abbr.toLowerCase()}_${chamber}.json`;
      const lastElectionOverrides = existsSync(lastElectionOverridesPath) ? JSON.parse(readFileSync(lastElectionOverridesPath, "utf8")) : {};

      const out = districts
        .map(({ district, label }) => {
          const peopleHere = (peopleByDistrictNumber[normalizeDistrictKey(district)] ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
          const override = partyOverrides[district];
          const perPersonLastElection = lastElectionOverrides[district] ?? {};
          const incumbents = peopleHere.map((p) => ({
            name: p.name,
            party: override ?? mapParty(p.party),
            // Omit entirely (rather than null) for the vast majority of incumbents with no
            // per-person override, to avoid bloating the generated file with a mostly-unused key.
            ...(perPersonLastElection[p.name] != null ? { lastElection: perPersonLastElection[p.name] } : {}),
          }));
          return {
            id: `${abbr.toLowerCase()}-${chamber}-${district}`,
            chamber,
            number: district,
            label: label ?? `District ${district}`,
            incumbents: incumbents.length > 0 ? incumbents : null,
            lastElection: resolveLastElection(abbr, chamber, district),
            margin: null,
            rating: null,
          };
        })
        .sort((a, b) => {
          const na = parseInt(a.number, 10);
          const nb = parseInt(b.number, 10);
          if (Number.isNaN(na) || Number.isNaN(nb)) return a.number.localeCompare(b.number);
          return na - nb || a.number.localeCompare(b.number);
        });
      result[abbr][chamber] = out;
      const totalIncumbents = out.reduce((sum, d) => sum + (d.incumbents?.length ?? 0), 0);
      console.log(`${abbr} ${chamber}: ${out.length} districts, ${totalIncumbents} incumbents total`);
    }
  }

  const header = `// Per-district state legislature data. Auto-generated by scripts/build-state-leg-incumbents.mjs
// from data-entry/state-leg-incumbents/*.json (Open States) + data-entry/state-leg-election-years.mjs
// (regular-election-year rules) + the national district boundary files. Do not edit by hand — rerun
// the build script instead. States not yet sourced are simply absent (map/table render an empty state).

export type Chamber = "house" | "senate";

export type Incumbent = {
  name: string;
  party: "D" | "R" | "I" | "O";
  // Per-incumbent override of the district's lastElection, only set where a single shared
  // district-level year would be wrong for one of its multiple incumbents — currently just WV
  // Senate, where each numbered district's 2 senators are staggered WITHIN the shared boundary
  // (one up each even year, not both together). Falls back to the district's lastElection when
  // absent.
  lastElection?: number | null;
};

export type StateLegDistrict = {
  id: string;                                          // e.g. "oh-house-12"
  chamber: Chamber;
  number: string;                                       // "12", "12A"
  label: string;                                        // "District 12"
  // Almost always one seat. Some states (AZ/WA House, MD House, ID House, WV Senate, ...) elect
  // more than one member from a single shared district boundary — those get multiple entries.
  incumbents?: Incumbent[] | null;
  lastElection?: number | null;                          // year of the seat's most recent regular election
  margin?: number | null;                                // most recent result margin, + = R, - = D
  rating?: string | null;
};

// Nebraska's Legislature is unicameral and officially nonpartisan.
export const UNICAMERAL_STATES: ReadonlySet<string> = new Set(["NE"]);

// Keyed by state abbreviation, then chamber.
export const stateLegDistricts: Record<string, Partial<Record<Chamber, StateLegDistrict[]>>> = `;

  writeFileSync(OUT_FILE, header + JSON.stringify(result, null, 2) + ";\n");
  console.log(`Wrote ${OUT_FILE}`);
}

main();
