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

const out: Tpl2026Inputs = { generatedAt: new Date().toISOString(), asOf, races, legislature, housePv };
const file = path.join(process.cwd(), "data", "generated", "tpl-inputs-2026.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out));
const el = (o: string) => races.filter((r) => r.office === o && r.eligibility === "eligible").length;
console.log(`tpl-inputs-2026: ${races.length} races (eligible S ${el("S")} · G ${el("G")} · H ${el("H")}), ${Object.keys(legislature).length} legislatures, House vote raw ${housePv.raw} · contested ${housePv.contested} · every seat contested ${housePv.imputed} (offset ${housePv.offset}, ${imputedSeats} seats filled) → ${path.relative(process.cwd(), file)}`);
