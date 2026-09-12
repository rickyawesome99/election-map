#!/usr/bin/env node
/**
 * Builds data-entry/state-leg-district-structure/nh_house.json — the two facts about the NH House
 * that neither the boundary files nor Open States can supply.
 *
 * New Hampshire is the one chamber where "one polygon = one district" breaks down. Its 2022 map
 * has 203 districts electing 400 representatives, split into:
 *
 *   - 164 BASE districts (342 seats) — ordinary, non-overlapping polygons. These are what the
 *     boundary file (and TIGER/GRANIT before it) contains, and they are the only NH districts the
 *     app knew about until this script existed.
 *   - 39 FLOTERIAL districts (58 seats) — overlay districts that sit ON TOP of two or more base
 *     districts and elect additional representatives from their combined population. A voter votes
 *     in BOTH their base district and the floterial district covering it. Because they overlap the
 *     base layer by construction they cannot live in the same non-overlapping polygon set, so they
 *     are absent from the boundary file and every one of their 58 members was being dropped.
 *
 * Two upstream sources, cross-checked against each other and against the boundary file:
 *
 *   1. RSA 662:5 (as amended by 2022 ch. 9, the 2022 redistricting act) — the statute that lists
 *      every district, its component towns/wards, and THE NUMBER OF REPRESENTATIVES IT ELECTS.
 *      This is the authority for seat counts; nothing else in the pipeline has them, which is why
 *      a vacant seat was previously indistinguishable from a seat that does not exist.
 *   2. The Census Bureau RDO's NH floterial-to-component-district table, which says which base
 *      districts each floterial overlays. That mapping is what a district lookup needs in order to
 *      answer "which House seats does this address vote for?".
 *
 * The three sources agree exactly: RSA's 203 districts / 400 seats split 164+39 and 342+58; the
 * 164 RSA base districts are precisely the 164 in the boundary file (no district on either side
 * unmatched); and the 39 floterials RSA implies are precisely the 39 the Census table lists.
 * GRANIT's own floterial GIS layer (ElectoralDistricts/MapServer/9) also returns 39 real codes —
 * its 40th feature is a null-coded background polygon, which is the source of the widely repeated
 * "40 floterial districts" figure.
 *
 * Note the district count: 203, not the 204 commonly cited. 204 was the 2012 map.
 *
 * Usage: node scripts/build-nh-house-district-structure.mjs
 */

import { writeFileSync, mkdirSync } from "fs";

const RSA_URL = "https://gc.nh.gov/rsa/html/LXIII/662/662-5.htm";
const FLOTERIAL_CSV_URL =
  "https://www2.census.gov/programs-surveys/decennial/rdo/mapping-files/2023/2022-state-legislative-bef/NH_Floterial_2022.csv";
const OUT_DIR = "data-entry/state-leg-district-structure";
const OUT_FILE = `${OUT_DIR}/nh_house.json`;

/** RSA lists districts under county headings; the app's codes are county-abbreviation prefixed. */
const COUNTY_CODES = {
  Belknap: "BE", Carroll: "CA", Cheshire: "CH", Coos: "CO", Grafton: "GR",
  Hillsborough: "HI", Merrimack: "ME", Rockingham: "RO", Strafford: "ST", Sullivan: "SU",
};

const EXPECTED = { districts: 203, seats: 400, base: 164, baseSeats: 342, floterial: 39, floterialSeats: 58 };

/**
 * Hillsborough 3-9 are zero-padded in the boundary file ("HI03"-"HI09") while every other NH House
 * district, Hillsborough 1-2 and 10+ included, is not. That is an idiosyncrasy of NH's own official
 * numbering rather than a data artifact, and the same rule already lives in
 * scripts/build-state-leg-incumbents.mjs (NH_house in PEOPLE_CODE_OVERRIDES).
 */
function districtCode(countyCode, num) {
  const padded = countyCode === "HI" && num >= 3 && num <= 9;
  return `${countyCode}${padded ? String(num).padStart(2, "0") : String(num)}`;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} fetching ${url}`);
  return res.text();
}

/** RSA 662:5 -> { CODE: { seats, county, towns } } for all 203 districts. */
function parseRsa(html) {
  const txt = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#150;/g, "-")
    .replace(/&amp;/g, "&");

  // County sections run from one "<County> County" heading to the next, and the last to "Source.".
  const sections = Object.entries(COUNTY_CODES)
    .map(([name, code]) => ({ name, code, at: txt.indexOf(`${name} County`) }))
    .sort((a, b) => a.at - b.at);
  if (sections.some((s) => s.at < 0)) throw new Error("RSA 662:5: a county heading is missing");

  const districts = {};
  for (let i = 0; i < sections.length; i++) {
    const { name, code, at } = sections[i];
    const end = i + 1 < sections.length ? sections[i + 1].at : txt.indexOf("Source.");
    for (const chunk of txt.slice(at, end).split(/District No\.\s*/).slice(1)) {
      // Each entry reads "<number> <town> <town> ... <seats>". Town names can themselves end in a
      // number ("Manchester Ward 12"), so the seat count is the LAST number, not any number. Strip
      // the trailing roman numeral that starts the next county's heading before matching.
      const cleaned = chunk.replace(/\s+[IVX]+\.\s*$/, "").trim();
      const m = /^(\d+)\s+(.*?)\s+(\d+)$/s.exec(cleaned);
      if (!m) throw new Error(`RSA 662:5: unparsed ${name} entry: ${cleaned.slice(0, 80)}`);
      districts[districtCode(code, Number(m[1]))] = {
        seats: Number(m[3]),
        // How New Hampshire itself writes the district, and what the Census returns as its
        // BASENAME. The app's own code for it ("ME18") is an abbreviation that means nothing to a
        // reader, so this is what gets displayed.
        name: `${name} ${Number(m[1])}`,
        county: name,
        towns: splitTowns(m[2]),
      };
    }
  }
  return districts;
}

/** Census RDO table -> { FLOTERIAL_CODE: [base district codes it overlays] }. */
function parseFloterials(csv) {
  const byFloterial = {};
  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [floterial, , componentName] = line.split(",");
    // "State House District Belknap 03" -> "BE3"
    const m = /^State House District\s+([A-Za-z]+)\s+(\d+)$/.exec(componentName.trim());
    if (!m) throw new Error(`Floterial CSV: unparsed component "${componentName}"`);
    const code = COUNTY_CODES[m[1]];
    if (!code) throw new Error(`Floterial CSV: unknown county "${m[1]}"`);
    (byFloterial[floterial.trim()] ??= []).push(districtCode(code, Number(m[2])));
  }
  return byFloterial;
}

function main() {
  return Promise.all([fetchText(RSA_URL), fetchText(FLOTERIAL_CSV_URL)]).then(([html, csv]) => {
    const rsa = parseRsa(html);
    const floterials = parseFloterials(csv);

    // Cross-check the two sources against each other before writing anything.
    const unknownFloterial = Object.keys(floterials).filter((c) => !rsa[c]);
    if (unknownFloterial.length) throw new Error(`Floterials absent from RSA 662:5: ${unknownFloterial.join(" ")}`);
    const unknownComponent = Object.values(floterials).flat().filter((c) => !rsa[c]);
    if (unknownComponent.length) throw new Error(`Component districts absent from RSA 662:5: ${unknownComponent.join(" ")}`);

    const districts = {};
    let seats = 0, baseCount = 0, baseSeats = 0, floterialCount = 0, floterialSeats = 0;
    for (const code of Object.keys(rsa).sort(compareCodes)) {
      const { seats: n, name, county, towns } = rsa[code];
      const components = floterials[code];
      districts[code] = components
        ? { seats: n, name, overlay: true, components: components.slice().sort(compareCodes), county, towns }
        : { seats: n, name, county, towns };
      seats += n;
      if (components) { floterialCount++; floterialSeats += n; } else { baseCount++; baseSeats += n; }
    }

    const actual = { districts: Object.keys(districts).length, seats, base: baseCount, baseSeats, floterial: floterialCount, floterialSeats };
    for (const [k, want] of Object.entries(EXPECTED)) {
      if (actual[k] !== want) throw new Error(`Sanity check failed: ${k} = ${actual[k]}, expected ${want}`);
    }

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
      OUT_FILE,
      JSON.stringify(
        {
          _comment:
            "NH House district structure: seats per district, and which base districts each floterial overlay district covers. Auto-generated by scripts/build-nh-house-district-structure.mjs — do not edit by hand.",
          _sources: { seatsAndDistricts: RSA_URL, floterialComponents: FLOTERIAL_CSV_URL },
          _totals: actual,
          districts,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`${Object.keys(districts).length} districts, ${seats} seats ` +
      `(${baseCount} base / ${baseSeats} seats, ${floterialCount} floterial / ${floterialSeats} seats)`);
    console.log(`Wrote ${OUT_FILE}`);
  });
}

/**
 * Town lists are separated by runs of whitespace, but the statute's markup puts tags inside ward
 * names, so "Laconia Ward 1" can arrive already broken at "Laconia Ward" + "1". A fragment that is
 * nothing but a number is never a town — it is the tail of the ward name before it.
 */
function splitTowns(raw) {
  const parts = raw.split(/\s{2,}/).map((t) => t.trim()).filter(Boolean);
  const towns = [];
  for (const part of parts) {
    if (/^\d+$/.test(part) && towns.length > 0) towns[towns.length - 1] += ` ${part}`;
    else towns.push(part);
  }
  return towns.join("; ");
}

/** "BE1" < "BE2" < "BE10", and county groups stay together — a plain string sort scatters both. */
function compareCodes(a, b) {
  const [, ac, an] = /^([A-Za-z]+)0*(\d+)$/.exec(a) ?? [, a, "0"];
  const [, bc, bn] = /^([A-Za-z]+)0*(\d+)$/.exec(b) ?? [, b, "0"];
  return ac.localeCompare(bc) || Number(an) - Number(bn);
}

main();
