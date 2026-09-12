#!/usr/bin/env node
/**
 * Regenerates data/stateLegDistricts.ts from:
 *   - data-entry/state-leg-incumbents/{abbr}_{chamber}.json      (raw Open States /people dumps)
 *   - data-entry/state-leg-party-overrides/{abbr}_{chamber}.json (optional: district -> party overrides)
 *   - data-entry/state-leg-incumbent-additions/{abbr}_{chamber}.json (optional: sitting members the
 *     Open States dump omits)
 *   - data-entry/state-leg-district-structure/{abbr}_{chamber}.json (optional: seats per district,
 *     and overlay districts that have no boundary of their own — see build-nh-house-district-structure.mjs)
 *   - data-entry/state-leg-election-years.mjs                    (per-seat "most recent regular
 *     election" rules, plus the per-chamber term lengths and off-cycle overrides used to derive
 *     each seat's NEXT regular election)
 *   - data-entry/state-leg-districts-2026-source/state-house-districts-2026.json /
 *     state-senate-districts-2026.json (district list per state; combined source file — the
 *     browser instead fetches per-state splits from public/state-leg-districts/, see
 *     scripts/split-state-leg-districts.mjs)
 *
 * The boundary files are the source of truth for which districts exist in a state/chamber (so
 * a district with no matching incumbent — a vacancy — still gets a row with incumbent: null). The
 * one exception is overlay districts, which by construction cannot be in a non-overlapping polygon
 * layer: NH's floterial districts sit on top of several base districts at once, so they come from
 * the district-structure file and are appended to whatever the boundary file provides.
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
import { electionYears, termYears, nextElectionOverrides } from "../data-entry/state-leg-election-years.mjs";

const INCUMBENTS_DIR = "data-entry/state-leg-incumbents";
const PARTY_OVERRIDES_DIR = "data-entry/state-leg-party-overrides";
// Per-incumbent lastElection override, keyed by district then person name — for the rare case
// where a single per-district year (from electionYears/resolveLastElection) would be wrong for
// one of a district's multiple incumbents. Currently only WV Senate: each numbered district's 2
// senators stagger WITHIN the shared boundary (one up each even year), so there's no single
// correct per-district year. See data-entry/state-leg-last-election-overrides/wv_senate.json.
const LAST_ELECTION_OVERRIDES_DIR = "data-entry/state-leg-last-election-overrides";
// Sitting members the Open States dump omits — merged in per district. Currently only ND House 11,
// whose appointed replacement Open States had still not picked up months after he took office.
const INCUMBENT_ADDITIONS_DIR = "data-entry/state-leg-incumbent-additions";
// Per-district structural facts the boundary files and Open States both lack: how many members a
// district elects, and (for NH's floterial overlay districts) which base districts it sits on top
// of. Currently only NH House — see scripts/build-nh-house-district-structure.mjs.
const DISTRICT_STRUCTURE_DIR = "data-entry/state-leg-district-structure";
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
  "Democratic-Farmer-Labor": "D",
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

// Next regular election for a seat: its last regular election plus the chamber's term length,
// except where nextElectionOverrides records a seat that is off its chamber's normal interval
// (a short unexpired term resyncing it to the regular cycle — currently only ND House 9 and 15).
//
// `lastElection` is passed in rather than re-derived so that a per-incumbent lastElection
// override (WV Senate, whose 2 senators per district stagger within the shared boundary) carries
// through to a per-incumbent nextElection.
function resolveNextElection(abbr, chamber, districtNumber, lastElection) {
  const override = nextElectionOverrides[`${abbr}|${chamber}|${districtNumber}`];
  if (override != null) return override;
  if (lastElection == null) return null;
  const term = termYears[abbr]?.[chamber];
  if (term == null) return null;
  return lastElection + term;
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

/**
 * District codes are usually plain numbers, sometimes a number with a letter suffix ("12A"), and in
 * New Hampshire a county prefix followed by a number ("BE1", "HI40"). Compare the alphabetic and
 * numeric parts separately so a chamber lists 2 before 10 and keeps NH's county groups together —
 * a plain string sort scatters both. Codes with no digits at all (Alaska Senate's "A"-"T") fall
 * back to a string compare, as they did before.
 */
function compareDistrictNumbers(a, b) {
  const pa = /^([A-Za-z]*)0*(\d+)(.*)$/.exec(a);
  const pb = /^([A-Za-z]*)0*(\d+)(.*)$/.exec(b);
  if (!pa || !pb) return a.localeCompare(b);
  return pa[1].localeCompare(pb[1]) || Number(pa[2]) - Number(pb[2]) || pa[3].localeCompare(pb[3]);
}

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
    (byFips[fips] ??= []).push({ district: extractDistrictCode(abbr, chamber, f.properties), label: f.properties.NAMELSAD, geoid: f.properties.GEOID });
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

      const additionsPath = `${INCUMBENT_ADDITIONS_DIR}/${abbr.toLowerCase()}_${chamber}.json`;
      const additions = existsSync(additionsPath) ? JSON.parse(readFileSync(additionsPath, "utf8")).districts ?? {} : {};
      for (const [district, people] of Object.entries(additions)) {
        const key = normalizeDistrictKey(district);
        // Shaped like an Open States person so it flows through the same party/grouping path.
        for (const p of people) (peopleByDistrictNumber[key] ??= []).push({ name: p.name, party: p.party });
      }

      const structurePath = `${DISTRICT_STRUCTURE_DIR}/${abbr.toLowerCase()}_${chamber}.json`;
      const structure = existsSync(structurePath) ? JSON.parse(readFileSync(structurePath, "utf8")).districts ?? {} : {};
      // Overlay districts have no polygon of their own by construction (a floterial district covers
      // several base districts, so it cannot belong to a non-overlapping layer). The boundary file
      // is still the source of truth for everything it DOES contain; these are appended to it.
      const overlayDistricts = Object.entries(structure)
        .filter(([code, d]) => d.overlay && !districts.some((x) => x.district === code))
        .map(([code]) => ({ district: code, label: null }));

      const out = [...districts, ...overlayDistricts]
        .map(({ district, label, geoid }) => {
          const peopleHere = (peopleByDistrictNumber[normalizeDistrictKey(district)] ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
          const override = partyOverrides[district];
          const perPersonLastElection = lastElectionOverrides[district] ?? {};
          const incumbents = peopleHere.map((p) => {
            const personLast = perPersonLastElection[p.name];
            return {
              name: p.name,
              party: override ?? mapParty(p.party),
              // Omit entirely (rather than null) for the vast majority of incumbents with no
              // per-person override, to avoid bloating the generated file with a mostly-unused key.
              // lastElection and nextElection travel together: an incumbent off the district's
              // shared cycle is off it for both.
              ...(personLast != null
                ? {
                    lastElection: personLast,
                    nextElection: resolveNextElection(abbr, chamber, district, personLast),
                  }
                : {}),
            };
          });
          const lastElection = resolveLastElection(abbr, chamber, district);
          // Where a chamber has no single per-district cycle (WV Senate, whose 2 senators per
          // boundary alternate even years), the district-level next election is the EARLIEST of
          // its seats' — i.e. the next year anything on these lines is on the ballot, which is
          // what a district lookup should report.
          const perPersonNext = incumbents.map((i) => i.nextElection).filter((y) => y != null);
          const nextElection =
            resolveNextElection(abbr, chamber, district, lastElection) ??
            (perPersonNext.length > 0 ? Math.min(...perPersonNext) : null);
          const shape = structure[district];
          return {
            id: `${abbr.toLowerCase()}-${chamber}-${district}`,
            chamber,
            number: district,
            // The structure file's name wins where it exists: New Hampshire's own "Merrimack 18"
            // says more than the boundary file's "District ME18", and matches what the Census
            // returns for the same district.
            label: structure[district]?.name ?? label ?? `District ${district}`,
            // TIGER's own GEOID for the polygon, which is what an address lookup gets back from
            // the Census geocoder — the exact join key for the district finder, and far safer than
            // the district code, which several states spell differently on each side.
            ...(geoid ? { geoid } : {}),
            incumbents: incumbents.length > 0 ? incumbents : null,
            lastElection,
            nextElection,
            // Only present where a chamber's seat counts have been sourced; absent means unknown,
            // NOT one seat. Without it a vacancy is indistinguishable from a seat that doesn't exist.
            ...(shape?.seats != null ? { seats: shape.seats } : {}),
            ...(shape?.overlay ? { overlay: true, components: shape.components } : {}),
            margin: null,
            rating: null,
          };
        })
        .sort((a, b) => compareDistrictNumbers(a.number, b.number));
      result[abbr][chamber] = out;
      const totalIncumbents = out.reduce((sum, d) => sum + (d.incumbents?.length ?? 0), 0);
      console.log(`${abbr} ${chamber}: ${out.length} districts, ${totalIncumbents} incumbents total`);
    }
  }

  const header = `// Per-district state legislature data. Auto-generated by scripts/build-state-leg-incumbents.mjs
// from data-entry/state-leg-incumbents/*.json (Open States) + data-entry/state-leg-election-years.mjs
// (regular-election-year + term-length rules) + the national district boundary files. Do not edit
// by hand — rerun
// the build script instead. States not yet sourced are simply absent (map/table render an empty state).

export type Chamber = "house" | "senate";

export type Incumbent = {
  name: string;
  party: "D" | "R" | "I" | "O";
  // Per-incumbent override of the district's lastElection/nextElection, only set where a single
  // shared district-level year would be wrong for one of its multiple incumbents — currently just
  // WV Senate, where each numbered district's 2 senators are staggered WITHIN the shared boundary
  // (one up each even year, not both together). Fall back to the district's values when absent.
  lastElection?: number | null;
  nextElection?: number | null;
};

export type StateLegDistrict = {
  id: string;                                          // e.g. "oh-house-12"
  chamber: Chamber;
  number: string;                                       // "12", "12A"
  label: string;                                        // "District 12"
  // TIGER GEOID for this district's polygon, e.g. "39071" / "25D01" / "2734A". The join key the
  // district finder uses, since the Census geocoder returns the same id for a looked-up address.
  // Absent on overlay districts, which have no polygon of their own. New Hampshire's are
  // synthesized (STATEFP + the state's own code) and do NOT match the Census's — see
  // lib/districtLookup.ts, which falls back to the district name there.
  geoid?: string;
  // Almost always one seat. Some states (AZ/WA House, MD House, ID House, WV Senate, ...) elect
  // more than one member from a single shared district boundary — those get multiple entries.
  incumbents?: Incumbent[] | null;
  lastElection?: number | null;                          // year of the seat's most recent regular election
  // Year of the seat's next regular election — lastElection + the chamber's term length, except
  // for seats resyncing to their cycle after a short unexpired term (see nextElectionOverrides in
  // data-entry/state-leg-election-years.mjs). Where a district's seats are on different cycles
  // (WV Senate) this is the earliest of them; per-seat years live on each Incumbent.
  nextElection?: number | null;
  // How many members the district elects. Only present where a chamber's seat counts have been
  // sourced (currently NH House, from RSA 662:5) — absent means unknown, not one. It is what makes
  // a vacancy visible: a district with 2 seats and 1 incumbent is down a member, not a 1-seat
  // district. See data-entry/state-leg-district-structure/.
  seats?: number;
  // True for an overlay district: one that has no boundary of its own because it sits on top of
  // several ordinary districts, whose voters elect its members in ADDITION to their own district's.
  // New Hampshire's 39 floterial districts (58 of its 400 House seats) are the only ones in the
  // country. The components field lists the base districts an overlay covers.
  overlay?: boolean;
  components?: string[];
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
