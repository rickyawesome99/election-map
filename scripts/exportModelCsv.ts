// The live forecast for every seat on the ballot (House, Senate, Governor) as one reference
// spreadsheet: data-entry/model_forecast.csv. Each row carries the pieces of the projection —
// TPL, environment, incumbency, fundraising, candidates — then the model margin they sum to,
// the poll average it is blended with, the projected margin and the win probability.
// Margins and points are R-positive (negative = Democratic), as everywhere in the model.
// Run:  npm run export:model

import { writeFileSync } from "fs";
import { join } from "path";
import { senateForecasts, governorForecasts, houseForecasts, type ForecastedRace } from "@/lib/forecast";
import { calculateDistrictTpl, calculateStateTpl, effectiveEnvironment, computeIncumbentPts, raceMoneyTerm, raceFundraising2026, candidateQuality } from "@/lib/tplCompute";
import { alignedParty } from "@/data/raceEligibility";

const OFFICE_LABEL = { H: "House", S: "Senate", G: "Governor" } as const;
const PLACEHOLDER_NOMINEE = /^(Democratic|Republican) Candidate$/;

const round = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "" : String(Number(v.toFixed(d))));
const label = (m: number) => `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`;
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function row(r: ForecastedRace): Record<string, string | number> {
  const c = r.candidates;
  const incumbent = c ? [c.dem, c.rep].find((x) => x.incumbent) ?? null : null;
  const incumbentParty = incumbent ? alignedParty(incumbent) : null;
  const tpl = r.office === "H" ? calculateDistrictTpl(r.id) : calculateStateTpl(r.stateAbbr, r.state);
  const environment = effectiveEnvironment(r.stateAbbr);
  const incumbentPts = computeIncumbentPts(r.office, incumbentParty, incumbent?.appointed ?? false);
  const money = raceFundraising2026(r.raceType, r.id);
  const moneyTerm = raceMoneyTerm(r);
  const quality = candidateQuality(r);
  const sum = tpl + environment + incumbentPts + moneyTerm.pts + quality.pts;
  if (Math.abs(sum - r.model) > 1e-6) throw new Error(`${r.raceType} ${r.id}: components sum to ${sum}, model is ${r.model}`);

  const seatName = r.office === "H" ? r.name
    : `${r.stateAbbr} ${OFFICE_LABEL[r.office]}${r.electionType?.toLowerCase() === "special" ? " (Special)" : ""}`;
  const nominee = (x?: { name: string }) => (x && !PLACEHOLDER_NOMINEE.test(x.name.trim()) ? x.name : "");
  return {
    office: OFFICE_LABEL[r.office],
    race_id: r.id,
    seat_name: seatName,
    state_abbr: r.stateAbbr,
    state_name: r.state,
    election_type: r.electionType ?? "Regular",
    contest: r.contest,
    current_incumbent: r.seatHolder ?? "",
    inc_party: r.seatParty ?? "",
    dem_name: nominee(c?.dem),
    dem_party: c && nominee(c.dem) ? c.dem.party : "",
    rep_name: nominee(c?.rep),
    rep_party: c && nominee(c.rep) ? c.rep.party : "",
    incumbent_running: incumbentParty ?? (incumbent ? incumbent.party : "None"),
    incumbent_appointed: incumbent?.appointed ? "Y" : "",
    tpl: round(tpl),
    environment_pts: round(environment),
    incumbent_pts: round(incumbentPts),
    dem_raised: money ? Math.round(money.dem) : "",
    rep_raised: money ? Math.round(money.rep) : "",
    money_gap_pct: round(moneyTerm.gapPct, 1),
    fundraising_pts: round(moneyTerm.pts),
    dem_candidate_effect: round(quality.dem?.effect ?? quality.demPrior),
    rep_candidate_effect: round(quality.rep?.effect ?? quality.repPrior),
    candidates_pts: round(quality.pts),
    model_margin: round(r.model),
    poll_avg: round(r.pollMargin),
    poll_count: r.pollCount || "",
    poll_weight: r.pollCount ? round(r.pollWeight, 3) : "",
    proj_margin: round(r.margin),
    proj_margin_label: label(r.margin),
    proj_dem: round(50 - r.margin / 2),
    proj_rep: round(50 + r.margin / 2),
    sigma: round(r.sigma),
    prob_dem: round(r.probability, 3),
    prob_rep: round(1 - r.probability, 3),
    rating: r.rating,
  };
}

const byId = (a: ForecastedRace, b: ForecastedRace) => a.stateAbbr.localeCompare(b.stateAbbr) || a.name.localeCompare(b.name, undefined, { numeric: true });
const rows = [
  ...[...senateForecasts].sort(byId),
  ...[...governorForecasts].sort(byId),
  ...[...houseForecasts].sort(byId),
].map(row);

const header = Object.keys(rows[0]);
const out = join(process.cwd(), "data-entry", "model_forecast.csv");
writeFileSync(out, [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))].join("\n") + "\n");
console.log(`${rows.length} races → data-entry/model_forecast.csv`);
