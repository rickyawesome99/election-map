// The 2026 election, as counted so far, in the shape the TPL model reads a past election.
//
//   npm run tpl-inputs-2026      (part of prebuild / predev; ~2 s)
//
// Writes data/generated/tpl-inputs-2026.json:
//   races        every Senate, governor and U.S. House race in data-entry/results_2026_seats.csv,
//                with its margin (R − D, percent of the full total), nominees, incumbent and the
//                model's eligibility class
//   legislature  each state's corrected chamber margins for 2026 (lib/stateLegResults2026.ts),
//                the same contested / unopposed / not-up pools the model reads for other years
//   counties     each county's 2026 Senate, Senate special, governor and summed U.S. House votes
//                (data-entry/results-2026/), for County TPL; countyHouseIneligible marks a
//                county whose House pieces are all uncontested, same-party or party-mislabelled
//   housePv      the national U.S. House vote on three bases: every vote, contested seats only,
//                and every seat contested (the uncontested and same-party seats filled as
//                lib/genericBallotPopularVote.ts fills them for 2016–2024)
//
// The counts are NOT final. The file follows the results CSVs, which are refreshed by hand
// (`npm run results-snapshot`, scripts/fetch-nyt-state-leg-results.py); rerun this afterwards.
// Once 2026 is certified and merged into the *_past_results.csv files, the model should read it
// from there and this overlay (and TPL_2026 in lib/tplCompute.ts) goes away.

import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "@/lib/turnout";
import { statesData } from "@/data/statesData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { classifyEligibility } from "@/data/raceEligibility";
import { chamberMargins2026 } from "@/lib/stateLegResults2026";
import type { Tpl2026Inputs, Tpl2026Race } from "@/lib/tpl2026Inputs";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const num = (v: string | undefined) => Number(String(v ?? "").replace(/,/g, "")) || 0;
const PLACEHOLDER = /^(Democratic|Republican) Candidate$/i;

const appointedSenators = new Set(
  parseCsv(read("data-entry/senate_seats.csv"))
    .filter((r) => r.next_election === "2026" && /\*$/.test(r.incumbent ?? ""))
    .map((r) => `${r.state_abbr}|${r.type === "Special" ? "Special" : "Regular"}`),
);
const rows = parseCsv(read("data-entry/results_2026_seats.csv"));
const races: Tpl2026Race[] = [];
let asOf = "";
for (const r of rows) {
  if (r.fetched_at > asOf) asOf = r.fetched_at;
  const office = r.office === "senate" ? "S" : r.office === "governor" ? "G" : "H";
  const total = num(r.total_votes), dem = num(r.dem_votes), rep = num(r.rep_votes);
  const demName = PLACEHOLDER.test(r.dem_name) ? "" : r.dem_name;
  const repName = PLACEHOLDER.test(r.rep_name) ? "" : r.rep_name;
  const demPct = total > 0 ? (dem / total) * 100 : 0, repPct = total > 0 ? (rep / total) * 100 : 0;
  // No count on file (Florida prints no votes for an unopposed seat) is not a result: unopposed.
  const eligibility = total <= 0 || !demName || !repName
    ? (!demName ? "no-dem" : !repName ? "no-rep" : "unopposed")
    : classifyEligibility({ demPct, repPct, demCandidate: demName, repCandidate: repName, demParty: r.dem_party !== "D" ? r.dem_party : undefined, repParty: r.rep_party !== "R" ? r.rep_party : undefined }, r.state);
  races.push({
    office, abbr: r.state, id: r.race_id, label: r.label, special: r.special === "1",
    districtId: office === "H" ? String(parseInt(r.race_id, 10)) : undefined,
    demPct: +demPct.toFixed(4), repPct: +repPct.toFixed(4), demVotes: dem, repVotes: rep, totalVotes: total,
    demCandidate: demName || undefined, repCandidate: repName || undefined,
    demParty: r.dem_party !== "D" ? r.dem_party : undefined, repParty: r.rep_party !== "R" ? r.rep_party : undefined,
    incumbent: r.rep_incumbent === "1" ? "R" : r.dem_incumbent === "1" ? "D" : "Open",
    // Appointed senators on the 2026 ballot, from the seat file's "R*" / "D*" incumbent marker:
    // Moody (FL) and Husted (OH) in special elections, and Darline Graham (SC), appointed in July
    // 2026 to a seat that was up in the regular election. Until 2026-11-24 only a special election
    // set the flag, so Graham carried a full incumbency advantage she had never earned.
    appointed: office === "S" && (r.rep_incumbent === "1" || r.dem_incumbent === "1") && appointedSenators.has(`${r.state}|${r.special === "1" ? "Special" : "Regular"}`),
    eligibility,
    countedShare: Number(r.counted_share) || 0,
    called: r.called === "1",
  });
}

const legislature: Tpl2026Inputs["legislature"] = {};
for (const { abbr } of statesData) {
  const cm = chamberMargins2026(abbr);
  if (cm) legislature[abbr] = cm;
}

// National House vote. "Every vote" credits each slot's votes to the party actually in it
// (party_d_votes / party_r_votes), so a same-party final counts once for its party.
const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const house = rows.filter((r) => r.office === "house");
const isContested = (r: Record<string, string>) => r.contest === "contested" && r.dem_party === "D" && (r.rep_party === "R" || r.rep_name === "Kevin Kiley") && num(r.dem_votes) > 0 && num(r.rep_votes) > 0;
let offNum = 0, offDen = 0;
for (const r of house) {
  const d = districtPresidentialData[String(parseInt(r.race_id, 10))];
  if (!isContested(r) || !d) continue;
  // Both sides as share of the total vote (pres24Margin is), weighted by the seat's total.
  const t = Math.max(num(r.total_votes), num(r.dem_votes) + num(r.rep_votes));
  offNum += (((num(r.rep_votes) - num(r.dem_votes)) / t) * 100 - d.pres24Margin) * t; offDen += t;
}
const offset = offDen > 0 ? offNum / offDen : 0;
const medTurnout = new Map(statesData.map((s) => [s.abbr, median(house.filter((r) => r.state === s.abbr && isContested(r)).map((r) => Math.max(num(r.total_votes), num(r.dem_votes) + num(r.rep_votes))))]));
let rawD = 0, rawR = 0, rawT = 0, cD = 0, cR = 0, cT = 0, iD = 0, iR = 0, iT = 0, imputedSeats = 0;
for (const r of house) {
  const pd = num(r.party_d_votes), pr = num(r.party_r_votes), total = num(r.total_votes);
  rawD += pd; rawR += pr; rawT += total;
  if (isContested(r)) { const d = num(r.dem_votes), rr = num(r.rep_votes); cD += d; cR += rr; cT += total; iD += d; iR += rr; iT += total; continue; }
  const d = districtPresidentialData[String(parseInt(r.race_id, 10))];
  if (!d) { iD += pd; iR += pr; iT += total; continue; }
  imputedSeats += 1;
  const m = Math.max(-95, Math.min(95, d.pres24Margin + offset));
  const v = medTurnout.get(r.state) || total || 250000;
  iD -= (v * m) / 200; iR += (v * m) / 200; iT += v; // D−R gap = m% of the filled seat's total
}
const pct = (d: number, r: number, t: number) => (t > 0 ? +(((r - d) / t) * 100).toFixed(2) : 0);
// Every basis is share of the total vote, like the 2016–2024 column in
// data-entry/national_environment_history.csv (lib/genericBallotPopularVote.ts).
const housePv = { raw: pct(rawD, rawR, rawT), contested: pct(cD, cR, cT), imputed: pct(iD, iR, iT), offset: +offset.toFixed(2), imputedSeats, seats: house.length };

// County results, for County TPL: the official-results county files (data-entry/results-2026/,
// `npm run results-2026`), party sums per county. A county the source has no row for (Le Flore
// OK, St. Joseph IN on 2026-11-25) is simply absent and gets no 2026 row.
//
// House: a county's row is the sum of its district pieces, as data/countyHouseData.ts is for
// other years, but 2026 has the per-district breakdown, so only districts the state model counts
// as a D-vs-R race ("eligible" above) are summed. A same-party final, an unopposed seat or an
// independent in a major-party slot (AK-01: a nonpartisan runner-up, with the Democrat at 8%)
// would otherwise put a one-sided or mislabelled margin into every county it touches. A county
// with no eligible piece keeps its full sum and the class of its largest piece
// (`countyHouseIneligible`); the model imputes it like any uncontested county House year.
//
// The site's county data still carries Alaska's Valdez-Cordova census area (02261); the 2026
// files report its two successors, Chugach (02063) and Copper River (02066), which are summed.
const COUNTY_FIPS_MERGE: Record<string, string> = { "02063": "02261", "02066": "02261" };
const siteFips = (raw: string | undefined) => { const id = String(raw ?? "").padStart(5, "0"); return COUNTY_FIPS_MERGE[id] ?? id; };
const validFips = (fips: string) => /^\d{5}$/.test(fips) && fips !== "00000";
type Votes = [number, number, number];
const addVotes = (a: Votes | undefined, d: number, r: number, t: number): Votes => [(a?.[0] ?? 0) + d, (a?.[1] ?? 0) + r, (a?.[2] ?? 0) + t];
const counties: Tpl2026Inputs["counties"] = {};
for (const [key, file] of [["S", "county_senate_results_2026.csv"], ["SS", "county_senate_special_results_2026.csv"], ["G", "county_governor_results_2026.csv"]] as const) {
  for (const r of parseCsv(read(`data-entry/results-2026/${file}`))) {
    const fips = siteFips(r.county_id), total = num(r.total_2026);
    if (!validFips(fips) || total <= 0) continue;
    (counties[fips] ??= {})[key] = addVotes(counties[fips][key], num(r.dem_2026), num(r.gop_2026), total);
  }
}
// A slot candidate who is not of the slot's party but whom the state model still counts there
// (CA-06: Kevin Kiley, on the ballot with no party, is its Republican) has no votes in the party
// sums. Those districts take the two slot candidates' own county votes from counties.csv.
const surname = (n: string) => n.toLowerCase().replace(/[^a-z ]/g, "").trim().split(/\s+/).filter((w) => !/^(jr|sr|ii|iii|iv)$/.test(w)).pop() ?? "";
const slotRaces = new Map(races.filter((r) => r.office === "H" && r.eligibility === "eligible" && (r.demParty || r.repParty)).map((r) => [`${r.abbr}|${parseInt(r.id.slice(2), 10) || 1}`, r]));
const slotVotes = new Map<string, Votes>(); // "ST|district|fips" → [dem slot, rep slot, total]
if (slotRaces.size > 0) {
  for (const r of parseCsv(read("data-entry/results-2026/counties.csv"))) {
    if (r.office !== "house") continue;
    const key = `${r.state}|${parseInt(r.seat, 10) || 1}`, race = slotRaces.get(key);
    if (!race) continue;
    const v = num(r.votes), who = surname(r.candidate);
    const k = `${key}|${siteFips(r.county_fips)}`;
    slotVotes.set(k, addVotes(slotVotes.get(k), who === surname(race.demCandidate ?? "") ? v : 0, who === surname(race.repCandidate ?? "") ? v : 0, v));
  }
}
const houseClass = new Map(races.filter((r) => r.office === "H").map((r) => [`${r.abbr}|${parseInt(r.id.slice(2), 10) || 1}`, r.eligibility]));
const housePieces = new Map<string, { eligible?: Votes; all?: Votes; top: { votes: number; cls: Tpl2026Race["eligibility"] } }>();
for (const r of parseCsv(read("data-entry/results-2026/house_district_county_results_2026.csv"))) {
  const fips = siteFips(r.county_fips), total = num(r.total);
  const cls = houseClass.get(`${r.state}|${parseInt(r.district, 10) || 1}`);
  if (!validFips(fips) || total <= 0 || !cls) continue;
  const c = housePieces.get(fips) ?? { top: { votes: 0, cls } };
  const slot = slotVotes.get(`${r.state}|${parseInt(r.district, 10) || 1}|${fips}`);
  const [dem, gop] = slot ?? [num(r.dem), num(r.gop)];
  c.all = addVotes(c.all, dem, gop, total);
  if (cls === "eligible") c.eligible = addVotes(c.eligible, dem, gop, total);
  else if (total > c.top.votes) c.top = { votes: total, cls };
  housePieces.set(fips, c);
}
const countyHouseIneligible: Tpl2026Inputs["countyHouseIneligible"] = {};
for (const [fips, c] of housePieces) {
  (counties[fips] ??= {}).H = c.eligible ?? c.all;
  if (!c.eligible) countyHouseIneligible[fips] = c.top.cls;
}

const out: Tpl2026Inputs = { generatedAt: new Date().toISOString(), asOf, races, legislature, housePv, counties, countyHouseIneligible };
const file = path.join(process.cwd(), "data", "generated", "tpl-inputs-2026.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out));
const el = (o: string) => races.filter((r) => r.office === o && r.eligibility === "eligible").length;
console.log(`tpl-inputs-2026: ${races.length} races (eligible S ${el("S")} · G ${el("G")} · H ${el("H")}), ${Object.keys(legislature).length} legislatures, House vote raw ${housePv.raw} · contested ${housePv.contested} · every seat contested ${housePv.imputed} (offset ${housePv.offset}, ${imputedSeats} seats filled), ${Object.keys(counties).length} counties → ${path.relative(process.cwd(), file)}`);
