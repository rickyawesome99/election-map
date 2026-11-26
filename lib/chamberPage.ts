import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { governorNoElection, senateData, senateHoldovers, senateNoElection, type NoElectionEntry, type RaceType } from "@/data/forecastData";
import { parseCsv } from "@/lib/turnout";
import { results2026Page } from "@/lib/results2026Page";
import type { ChamberPageData, ChamberPopularVote, ChamberSeat, SeatParty } from "@/lib/chamberPageTypes";

// ── The /house, /senate and /governor pages ───────────────────────────────────
// One row per seat in the chamber: who held it going into the 2026 election, the final forecast,
// and the counted result. Seats on the ballot come from the saved results file
// (data-entry/results_2026_seats.csv, see lib/resultsSnapshot.ts); Senate seats in the other two
// classes and governors mid-term come from forecastData's no-election tables. Nothing here reads
// the live feed or reruns the model.

const PLACEHOLDER = /^(Democratic|Republican) Candidate$/;
const num = (v: string) => Number(v) || 0;
const party = (v: string): SeatParty | null => (v === "D" || v === "R" || v === "I" ? v : null);

const TITLE: Record<RaceType, string> = { house: "U.S. House", senate: "U.S. Senate", governor: "Governors" };

function raceHref(office: RaceType, id: string, label: string): string {
  if (office === "house") return `/house/${label.toLowerCase()}`;
  return `/${office}/${id.toLowerCase().replace(/-2$/, "2")}`;
}

// A Senate class is the cycle its seat is regularly up in: class 2 in 2026, 3 in 2028, 1 in 2030.
const CLASS_BY_NEXT: Record<number, number> = { 2026: 2, 2028: 3, 2030: 1 };

function notUp(office: RaceType, e: NoElectionEntry, hrefSuffix: string): ChamberSeat {
  return {
    key: `${office}-${e.abbr}${hrefSuffix}-held`, label: e.state, stateAbbr: e.abbr, stateName: e.state, geoid: null,
    href: `/${office}/${e.abbr.toLowerCase()}${hrefSuffix}`, special: false, seatClass: office === "senate" ? CLASS_BY_NEXT[e.nextElection] ?? null : null, up: false, nextElection: e.nextElection,
    race: null, before: { name: e.incumbent, party: e.party }, projected: null, result: null, after: e.party, flip: false,
  };
}

const cache = new Map<RaceType, ChamberPageData>();

export function buildChamberPage(office: RaceType): ChamberPageData {
  const hit = cache.get(office);
  if (hit) return hit;

  const classById = new Map(senateData.map((s) => [s.id, s.seatClass ?? null]));
  let asOf = 0;
  const seats: ChamberSeat[] = [];
  // Votes over the races on the ballot, by the file's party columns (an independent standing in
  // for a Democrat with none opposite is already on the Democratic side there).
  const pv = { partyD: 0, partyR: 0, total: 0, races: 0 };
  for (const r of parseCsv(readFileSync(join(process.cwd(), "data-entry", "results_2026_seats.csv"), "utf8"))) {
    if (r.office !== office) continue;
    asOf = Math.max(asOf, Date.parse(r.fetched_at) || 0);
    const demParty = party(r.dem_party) ?? "D", repParty = party(r.rep_party) ?? "R";
    const total = num(r.total_votes), margin = total > 0 ? num(r.margin) : null;
    const called = r.called === "1";
    const unopposed = r.contest.startsWith("uncontested");
    // The margin is the Republican slot's votes less the Democratic slot's, so its sign names the slot ahead.
    const ahead: "dem" | "rep" | null = unopposed ? (PLACEHOLDER.test(r.dem_name) || !r.dem_name ? "rep" : "dem") : margin == null ? null : margin > 0 ? "rep" : "dem";
    const aheadParty = ahead === "dem" ? demParty : ahead === "rep" ? repParty : null;
    const winnerParty = called ? party(r.winner_party) ?? aheadParty : null;
    const before = party(r.seat_party) ?? "R";
    const after = winnerParty ?? aheadParty ?? before;
    if (total > 0) {
      pv.partyD += num(r.party_d_votes); pv.partyR += num(r.party_r_votes);
      pv.total += total; pv.races += 1;
    }
    const forecastMargin = num(r.forecast_margin);
    seats.push({
      key: `${office}-${r.race_id}`,
      label: office === "house" ? r.label : r.state_name,
      stateAbbr: r.state, stateName: r.state_name,
      geoid: office === "house" ? r.race_id : null,
      href: raceHref(office, r.race_id, r.label),
      special: r.special === "1", seatClass: office === "senate" ? classById.get(r.race_id) ?? null : null, up: true, nextElection: null,
      race: {
        dem: { name: r.dem_name, party: demParty, votes: num(r.dem_votes), incumbent: r.dem_incumbent === "1", placeholder: !r.dem_name || PLACEHOLDER.test(r.dem_name) },
        rep: { name: r.rep_name, party: repParty, votes: num(r.rep_votes), incumbent: r.rep_incumbent === "1", placeholder: !r.rep_name || PLACEHOLDER.test(r.rep_name) },
        total,
      },
      before: { name: r.seat_holder, party: before },
      projected: { margin: forecastMargin, rating: r.forecast_rating, party: forecastMargin > 0 ? repParty : demParty },
      result: {
        name: ahead ? r[`${ahead}_name`] : null,
        party: winnerParty ?? aheadParty,
        margin, called, unopposed,
        sameParty: r.contest.startsWith("same-party"),
      },
      after, flip: after !== before,
    });
  }
  if (office === "senate") {
    for (const e of senateNoElection) seats.push(notUp(office, e, ""));
    for (const e of senateHoldovers) seats.push(notUp(office, e, "2"));
  }
  if (office === "governor") for (const e of governorNoElection) seats.push(notUp(office, e, ""));

  seats.sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }) || Number(b.up) - Number(a.up) || Number(a.special) - Number(b.special));

  const count = (pick: (s: ChamberSeat) => SeatParty | null) => {
    const out = { dem: 0, rep: 0, oth: 0 };
    for (const s of seats) { const p = pick(s); if (p === "D") out.dem += 1; else if (p === "R") out.rep += 1; else if (p) out.oth += 1; }
    return out;
  };
  const up = seats.filter((s) => s.up);
  const margin = (d: number, r: number) => ((r - d) / pv.total) * 100;
  let popularVote: ChamberPopularVote | null = null;
  if (pv.total > 0) {
    if (office === "house") {
      // The House figures are the Results page's (lib/results2026Page.ts): the adjusted vote gives
      // every one-party seat a two-party race from its presidential vote.
      const gb = results2026Page().genericBallot;
      popularVote = {
        raw: { margin: gb.y2026.raw, votes: pv.total, races: pv.races, prev: gb.y2024.raw },
        adjusted: { margin: gb.y2026.imputed, prev: gb.y2024.imputed, note: `${gb.y2026.seatsFilled} one-party seats given a two-party race` },
      };
    } else {
      // Every Senate and governor's race had both sides on the ballot, so there is nothing to adjust.
      popularVote = { raw: { margin: margin(pv.partyD, pv.partyR), votes: pv.total, races: pv.races, prev: null }, adjusted: null };
    }
  }
  const data: ChamberPageData = {
    office, title: TITLE[office], asOf, seats,
    total: seats.length,
    majority: Math.floor(seats.length / 2) + 1,
    racesUp: up.length,
    uncalled: up.filter((s) => !s.result?.called).length,
    before: count((s) => s.before.party),
    projected: count((s) => s.projected?.party ?? s.before.party),
    after: count((s) => s.after),
    flips: { toD: up.filter((s) => s.flip && s.after === "D").length, toR: up.filter((s) => s.flip && s.after === "R").length },
    popularVote,
  };
  cache.set(office, data);
  return data;
}
