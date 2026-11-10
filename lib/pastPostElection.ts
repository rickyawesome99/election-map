import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyEligibility } from "@/data/raceEligibility";
import { pastElectionHref, type PastElectionOffice } from "@/lib/pastElections";
import { houseNationalPopularVote, houseStatePopularVote, slotCandidate } from "@/lib/resultsSnapshot";
import { parseCsv } from "@/lib/turnout";
import type { LegChamberResult, LegSeats, PostElectionRow } from "@/lib/postElectionTypes";
import type { Party } from "@/lib/resultsTypes";

// A past year on /analysis/post-election, in the 2026 page's shapes, from the historical results
// files the past-election pages are built on: data-entry/{house,senate,governor,president}_past_results.csv
// and state_leg.csv. Every race is final, so each is called for its winner. A flip is a seat won by a
// party other than the one that won it last time (the same district number for the House).

export type PastPostElection = { year: number; rows: PostElectionRow[]; legislature: Record<string, LegChamberResult[]>; housePvPrev: Record<string, number>; nationalPvPrev: number | null };

/** Who ran a chamber going into the year's election where its seats say otherwise: Alaska's
 *  bipartisan coalitions (null), and New York's Senate, which Republicans ran with a Democrat's vote
 *  though Democrats held 32 of 63 seats. */
const PRIOR_CONTROL: Record<number, Record<string, "D" | "R" | null>> = {
  2018: { "AK-house": null, "NY-senate": "R" },
  2020: { "AK-house": null },
  2022: { "AK-house": null },
  2024: { "AK-house": null, "AK-senate": null },
};

const num = (v: string | undefined) => Number((v ?? "").replace(/,/g, "")) || 0;
// Each path spelled out at its call: Vercel's file tracing follows only a literal
// join(process.cwd(), ...), and a computed file name ships all of data-entry/ (5 GB) with the function.
const read = (path: string) => parseCsv(readFileSync(path, "utf8"));

type Slots = { dem: { name: string; party: Party }; rep: { name: string; party: Party } };

/** "Angus King (I)" in the D slot: the candidate's true party, else the slot's. */
function slots(r: Record<string, string>): Slots {
  const d = slotCandidate(r.dem_candidate), rp = slotCandidate(r.rep_candidate);
  return { dem: { name: d.name ?? "", party: (d.party ?? "D") as Party }, rep: { name: rp.name ?? "", party: (rp.party ?? "R") as Party } };
}

/** The winner's party: the slot ahead on the R-positive margin, or the only candidate in a race with no votes reported. */
function winnerOf(r: Record<string, string>, s: Slots): Party {
  const margin = num(r.margin);
  if (margin !== 0) return margin > 0 ? s.rep.party : s.dem.party;
  return s.rep.name && !s.dem.name ? s.rep.party : s.dem.party;
}

function contestOf(s: Slots, r: Record<string, string>): PostElectionRow["prior"]["forecast"]["contest"] {
  if (!s.dem.name) return "uncontested-R";
  if (!s.rep.name) return "uncontested-D";
  if (s.dem.party === s.rep.party) return s.dem.party === "R" ? "same-party-R" : "same-party-D";
  return num(r.total_votes) > 0 ? "contested" : s.dem.party === "D" ? "uncontested-D" : "uncontested-R";
}

function row(office: PostElectionRow["prior"]["office"], id: string, label: string, state: string, stateName: string, special: boolean, r: Record<string, string>, prev: { year: number; margin: number; party: Party } | null, href: string | null, housePrev: PostElectionRow["housePrev"] = null): PostElectionRow {
  const s = slots(r);
  const dem = num(r.dem_votes), rep = num(r.rep_votes), total = Math.max(num(r.total_votes), dem + rep);
  const margin = num(r.margin);
  const winner = winnerOf(r, s);
  return {
    prior: {
      office, id, label, state, stateName, special, seatParty: prev?.party ?? null,
      dem: { name: s.dem.name, party: s.dem.party, incumbent: r.incumbent === s.dem.party && !!s.dem.name },
      rep: { name: s.rep.name, party: s.rep.party, incumbent: r.incumbent === s.rep.party && !!s.rep.name },
      forecast: { margin: 0, rating: "", contest: contestOf(s, r) },
    },
    live: total > 0 ? { dem, rep, oth: total - dem - rep, total } : null,
    proj: { locked: true, winner, currentMargin: total > 0 ? ((rep - dem) / total) * 100 : margin, margin, countedShare: 1, projectedTotal: total },
    housePrev,
    past: { href, prev: prev ? { year: prev.year, margin: prev.margin } : null },
  };
}

/** The latest result before `year` among `list`, as a seat's previous winner. */
function previous(list: Record<string, string>[], year: number) {
  const r = list.filter((x) => num(x.year) < year).sort((a, b) => num(b.year) - num(a.year))[0];
  return r ? { year: num(r.year), margin: num(r.margin), party: winnerOf(r, slots(r)) } : null;
}

function href(office: PastElectionOffice, ids: string[], year: number): string | null {
  for (const id of ids) { const h = pastElectionHref(office, id, year); if (h) return h; }
  return null;
}

/** Each district's House margin two years before `year`, to swing from, by label. A district whose
 *  lines moved for `year` (its presidential total differs between the two maps) is estimated as the
 *  2026 page does: the old margin less the change in one presidential margin between the maps (the
 *  latest election the file has on both), or with no D vs R race before, the presidential margin on
 *  the new lines alone. */
function houseBaselines(year: number, house: Record<string, string>[]): Map<string, NonNullable<PostElectionRow["housePrev"]>> {
  const vintage = read(join(process.cwd(), "data-entry", "pres_by_boundary_vintage.csv"));
  const presYears = (boundary: number) => new Set(vintage.filter((r) => num(r.boundary_year) === boundary).map((r) => num(r.pres_year)));
  const onBoth = [...presYears(year)].filter((p) => presYears(year - 2).has(p));
  const presYear = onBoth.length ? Math.max(...onBoth) : null;
  const pres = (boundary: number) => new Map(vintage.filter((r) => num(r.boundary_year) === boundary && num(r.pres_year) === presYear).map((r) => [r.district_name, { margin: num(r.margin), total: num(r.total_votes) }]));
  const presOld = pres(year - 2), presNew = pres(year);
  const out = new Map<string, NonNullable<PostElectionRow["housePrev"]>>();
  for (const r of house) {
    if (num(r.year) !== year - 2) continue;
    const s = slots(r);
    const contested = classifyEligibility({ demPct: num(r.dem_pct), repPct: num(r.rep_pct), demCandidate: s.dem.name || undefined, repCandidate: s.rep.name || undefined, demParty: s.dem.party, repParty: s.rep.party }, r.state_abbr) === "eligible";
    const onOld = presOld.get(r.district_name), onNew = presNew.get(r.district_name);
    if (onOld && onNew && onOld.total !== onNew.total) out.set(r.district_name, { margin: contested ? num(r.margin) - (onOld.margin - onNew.margin) : onNew.margin, estimated: true });
    else if (contested) out.set(r.district_name, { margin: num(r.margin), estimated: false });
  }
  return out;
}

function legislature(year: number, abbrOf: Map<string, string>, governors: Record<string, string>[]): Record<string, LegChamberResult[]> {
  const byChamber = new Map<string, Record<string, string>[]>();
  for (const r of read(join(process.cwd(), "data-entry", "state_leg.csv"))) {
    const abbr = abbrOf.get(r.state_name);
    if (!abbr || !r.total_seats || num(r.year) > year) continue;
    const k = `${abbr}-${r.type === "Senate" ? "senate" : "house"}`;
    byChamber.set(k, [...(byChamber.get(k) ?? []), r]);
  }
  const seatsOf = (r: Record<string, string>): LegSeats => ({ dem: num(r.dem_seats), rep: num(r.rep_seats), oth: num(r.oth_seats) });
  const out: Record<string, LegChamberResult[]> = {};
  for (const abbr of [...new Set(abbrOf.values())].sort()) {
    const gov = previous(governors.filter((g) => g.state_abbr === abbr), year + 1);
    const chambers = (["house", "senate"] as const).flatMap((chamber): LegChamberResult[] => {
      const list = (byChamber.get(`${abbr}-${chamber}`) ?? []).sort((a, b) => num(b.year) - num(a.year));
      if (!list.length) return [];
      const [latest] = list;
      const seats = seatsOf(latest);
      const empty = { dem: 0, rep: 0, oth: 0 };
      const base = { chamber, total: num(latest.total_seats), leading: empty, incumbentGovernor: gov?.party ?? "" };
      if (num(latest.year) !== year) return [{ ...base, up: 0, calledSeats: 0, noElection: true, seats, flipped: empty, net: empty, priorControl: seats.dem > seats.rep ? "D" : seats.rep > seats.dem ? "R" : null }];
      // With no earlier election in the file (most chambers before 2016), there's no change to show.
      const noPrior = !list[1];
      const before = list[1] ? seatsOf(list[1]) : seats;
      const net = { dem: seats.dem - before.dem, rep: seats.rep - before.rep, oth: seats.oth - before.oth };
      const k = `${abbr}-${chamber}`;
      const priorControl = PRIOR_CONTROL[year] && k in PRIOR_CONTROL[year] ? PRIOR_CONTROL[year][k] : before.dem > before.rep ? "D" : before.rep > before.dem ? "R" : null;
      // The files hold each chamber's seats after each election, not the seats that changed hands, so
      // a party's net gain stands in for its flips.
      const flipped = { dem: Math.max(0, net.dem), rep: Math.max(0, net.rep), oth: Math.max(0, net.oth) };
      return [{ ...base, up: num(latest.seats_up), calledSeats: num(latest.seats_up), noElection: false, seats, flipped, net, priorControl, noPrior }];
    });
    if (chambers.length) out[abbr] = chambers;
  }
  return out;
}

export function readPastPostElection(year: number): PastPostElection {
  // The House file names the 50 states plainly (the presidential one has "Nebraska AL").
  const house = read(join(process.cwd(), "data-entry", "house_past_results.csv"));
  const stateName = new Map(house.map((r) => [r.state_abbr, r.state_name]));
  const abbrOf = new Map([...stateName].map(([abbr, name]) => [name, abbr]));
  const rows: PostElectionRow[] = [];

  const baselines = houseBaselines(year, house);
  const houseBefore = new Map(house.filter((r) => num(r.year) === year - 2).map((r) => [r.district_name, r]));
  for (const r of house) {
    if (num(r.year) !== year || !stateName.has(r.state_abbr)) continue;
    const before = houseBefore.get(r.district_name);
    const s = slots(r);
    const housePrev = s.dem.party === "D" && s.rep.party === "R" && s.dem.name && s.rep.name && num(r.total_votes) > 0 ? baselines.get(r.district_name) ?? null : null;
    rows.push(row("house", r.district_name, r.district_name, r.state_abbr, stateName.get(r.state_abbr)!, false, r, before ? previous([before], year) : null,
      href("house", [r.district_name.toLowerCase(), r.district_name.replace(/-01$/, "-AL").toLowerCase()], year), housePrev));
  }

  const senate = read(join(process.cwd(), "data-entry", "senate_past_results.csv"));
  for (const r of senate) {
    if (num(r.year) !== year || !stateName.has(r.state_abbr)) continue;
    const special = r.type === "Special";
    const abbr = r.state_abbr, lower = abbr.toLowerCase();
    const ids = r.seat === "2" ? [`${lower}2`, lower] : [lower, `${lower}2`];
    rows.push(row("senate", `${abbr}${special ? "-S" : ""}`, abbr, abbr, stateName.get(abbr)!, special, r, previous(senate.filter((x) => x.state_abbr === abbr && x.class === r.class), year), href("senate", ids, year)));
  }

  const governors = read(join(process.cwd(), "data-entry", "governor_past_results.csv"));
  for (const r of governors) {
    if (num(r.year) !== year || !stateName.has(r.state_abbr)) continue;
    rows.push(row("governor", r.state_abbr, r.state_abbr, r.state_abbr, stateName.get(r.state_abbr)!, false, r, previous(governors.filter((x) => x.state_abbr === r.state_abbr), year), href("governor", [r.state_abbr.toLowerCase()], year)));
  }

  const president = read(join(process.cwd(), "data-entry", "president_past_results.csv"));
  for (const r of president) {
    if (num(r.year) !== year || !stateName.has(r.state_abbr)) continue;
    rows.push(row("president", r.state_abbr, r.state_abbr, r.state_abbr, stateName.get(r.state_abbr)!, false, r, previous(president.filter((x) => x.state_abbr === r.state_abbr), year), href("president", [r.state_abbr.toLowerCase()], year)));
  }

  return { year, rows, legislature: legislature(year, abbrOf, governors), housePvPrev: houseStatePopularVote(year - 2), nationalPvPrev: houseNationalPopularVote(year - 2) };
}
