import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { governorNoElection, senateHoldovers, senateNoElection, type NoElectionEntry, type RaceType } from "@/data/forecastData";
import { parseCsv } from "@/lib/turnout";
import type { ChamberPageData, ChamberSeat, SeatParty } from "@/lib/chamberPageTypes";

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

function notUp(office: RaceType, e: NoElectionEntry, hrefSuffix: string): ChamberSeat {
  return {
    key: `${office}-${e.abbr}${hrefSuffix}-held`, label: e.state, stateAbbr: e.abbr, stateName: e.state, geoid: null,
    href: `/${office}/${e.abbr.toLowerCase()}${hrefSuffix}`, special: false, up: false, nextElection: e.nextElection,
    before: { name: e.incumbent, party: e.party }, projected: null, result: null, after: e.party, flip: false,
  };
}

const cache = new Map<RaceType, ChamberPageData>();

export function buildChamberPage(office: RaceType): ChamberPageData {
  const hit = cache.get(office);
  if (hit) return hit;

  let asOf = 0;
  const seats: ChamberSeat[] = [];
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
    const forecastMargin = num(r.forecast_margin);
    seats.push({
      key: `${office}-${r.race_id}`,
      label: office === "house" ? r.label : r.state_name,
      stateAbbr: r.state, stateName: r.state_name,
      geoid: office === "house" ? r.race_id : null,
      href: raceHref(office, r.race_id, r.label),
      special: r.special === "1", up: true, nextElection: null,
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
  };
  cache.set(office, data);
  return data;
}
