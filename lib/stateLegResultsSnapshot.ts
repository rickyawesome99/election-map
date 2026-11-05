import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stateLegComposition } from "@/data/stateLegComposition";
import { officeholders } from "@/data/officeholders";
import { stateLegDistricts, type Chamber, type StateLegDistrict } from "@/data/stateLegDistricts";
import { parseCsv } from "@/lib/turnout";
import type { LegChamberResult, LegSeats } from "@/lib/postElectionTypes";

// The state legislative seats behind /analysis/post-election: data-entry/results_2026_state_leg.csv
// and its chambers file, written by hand-run scripts/fetch-nyt-state-leg-results.py. A chamber with
// only specials on the ballot counts as having no 2026 election and shows its pre-election seats.
//
// A flip is a called seat won by a party other than the one that held it (data/stateLegDistricts.ts,
// or the party of the member who left, for a seat a special is filling). The feed's incumbent on the
// ballot overrides our party for the seat, and a seat with no known holder never counts as a flip.
// An uncalled race whose only candidates left are of one party counts
// as called: the seat's party is settled.

export type StateLegSnapshot = { asOf: number; byState: Record<string, LegChamberResult[]> };
type Bucket = keyof LegSeats;
type Pick = { name: string; bucket: Bucket };

const empty = (): LegSeats => ({ dem: 0, rep: 0, oth: 0 });
const bucket = (party: string): Bucket => (party === "D" ? "dem" : party === "R" ? "rep" : "oth");

/** Parse "Name (D); Name (R)", or the candidates column's "Name (D) 123". A name can hold parentheses of its own. */
function parseList(list: string): (Pick & { party: string })[] {
  if (!list) return [];
  return list.split("; ").map((e) => {
    const text = e.replace(/ \d+$/, "");
    const at = text.lastIndexOf("(");
    const party = text.slice(at + 1, -1);
    return { name: text.slice(0, at).trim(), party, bucket: bucket(party) };
  });
}

/** Seats vacant in our incumbent data, by the party that last won them (data/stateLegResults.ts). */
const VACANT_SEAT_PRIOR: Record<string, Bucket> = {
  "FL-house-113": "rep", "GA-senate-12": "dem", "GA-senate-7": "dem", "GA-house-177": "dem", "MA-house-17th Middlesex": "dem", "MA-house-1st Franklin": "dem",
  "MO-senate-10": "rep", "MO-house-110": "rep", "MO-house-114": "rep", "MO-house-149": "rep", "MO-house-160": "rep", "MO-house-95": "rep", "OK-house-99": "dem",
};

/** Chambers no party ran going into 2026, though one had more seats: Alaska's bipartisan coalitions and Minnesota's tied House (67-67, one seat vacant in our count). */
const NO_PRIOR_CONTROL = new Set(["AK-house", "AK-senate", "MN-house"]);

const GENERIC_WRITE_IN = /^(total )?write-ins?$/i;
const NH_COUNTY: Record<string, string> = { Belknap: "BE", Carroll: "CA", Cheshire: "CH", Coos: "CO", Grafton: "GR", Hillsborough: "HI", Merrimack: "ME", Rockingham: "RO", Strafford: "ST", Sullivan: "SU" };
const ORDINAL: Record<string, string> = { first: "1st", second: "2nd", third: "3rd", fourth: "4th", fifth: "5th", sixth: "6th", seventh: "7th", eighth: "8th", ninth: "9th", tenth: "10th", eleventh: "11th", twelfth: "12th", thirteenth: "13th", fourteenth: "14th", fifteenth: "15th", sixteenth: "16th", seventeenth: "17th", eighteenth: "18th", nineteenth: "19th" };
/** A Massachusetts district's words in any order ("First Bristol and Plymouth" = "1st Bristol & Plymouth"). */
const maKey = (s: string) => s.toLowerCase().replace(/[,&-]/g, " ").split(/\s+/).filter((w) => w && w !== "and").map((w) => ORDINAL[w] ?? w).sort().join(" ");

/** Our district for the feed's seat label. */
function findDistrict(state: string, chamber: Chamber, seat: string): StateLegDistrict | undefined {
  const list = stateLegDistricts[state]?.[chamber] ?? [];
  if (state === "MA") return list.find((d) => maKey(d.number) === maKey(seat));
  let number = seat.replace(/^(District|Position) /, "");
  if (state === "ID") number = number.replace(/[AB]$/, "");
  if (state === "WA") number = number.replace(/ - Position \d$/, "");
  if (state === "VT") return list.find((d) => d.number.replace(/[ -]/g, "").toLowerCase() === number.replace(/[ -]/g, "").toLowerCase());
  if (state === "NH" && chamber === "house") {
    const m = seat.match(/^(\w+) District (\d+)$/);
    if (m) return list.find((d) => d.number.replace(/\d+$/, (n) => String(Number(n))) === `${NH_COUNTY[m[1]]}${m[2]}`);
  }
  return list.find((d) => d.number === number);
}

/** The party of the member who left a seat a special is filling, from the specials file's vacancy note. */
function specialPriors(): Map<string, Bucket> {
  const rows = parseCsv(readFileSync(join(process.cwd(), "data-entry", "state-leg-specials-2026.csv"), "utf8"));
  const m = new Map<string, Bucket>();
  for (const r of rows) {
    const party = r.vacancy.match(/\(([DRI])\)/)?.[1];
    if (party) m.set(`${r.state}-${r.chamber}-${r.district}`, bucket(party));
  }
  return m;
}

/** Nebraska isn't in the feed's party tally: its seats not up are from our incumbents. */
function nebraskaNotUp(): LegSeats {
  const seats = empty();
  for (const d of stateLegDistricts.NE?.senate ?? []) {
    if (d.nextElection === 2026) continue;
    for (const i of d.incumbents ?? []) seats[bucket(i.party)]++;
  }
  return seats;
}

export function readStateLegSnapshot(): StateLegSnapshot {
  const races = parseCsv(readFileSync(join(process.cwd(), "data-entry", "results_2026_state_leg.csv"), "utf8"));
  const chambers = parseCsv(readFileSync(join(process.cwd(), "data-entry", "results_2026_state_leg_chambers.csv"), "utf8"));
  const key = (state: string, chamber: string) => `${state}-${chamber}`;
  const notUp = new Map(chambers.map((c) => [key(c.state, c.chamber), { dem: Number(c.not_up_dem), rep: Number(c.not_up_rep), oth: Number(c.not_up_oth) }]));
  const regular = new Set(races.filter((r) => r.race_type === "General").map((r) => key(r.state, r.chamber)));
  const specials = specialPriors();
  let asOf = 0;
  for (const r of races) asOf = Math.max(asOf, Date.parse(r.fetched_at) || 0);

  const byState: Record<string, LegChamberResult[]> = {};
  for (const [state, list] of Object.entries(stateLegComposition)) {
    const incumbentGovernor = officeholders[state]?.governor.party ?? "";
    byState[state] = (["house", "senate"] as Chamber[]).flatMap((chamber): LegChamberResult[] => {
      const now = list[chamber];
      if (!now) return [];
      const priorControl = NO_PRIOR_CONTROL.has(key(state, chamber)) ? null : now.dem > now.rep ? "D" : now.rep > now.dem ? "R" : null;
      if (!regular.has(key(state, chamber))) {
        return [{ chamber, total: now.total, up: 0, calledSeats: 0, noElection: true, seats: { dem: now.dem, rep: now.rep, oth: now.oth }, leading: empty(), flipped: empty(), net: empty(), incumbentGovernor, priorControl }];
      }
      const seats = notUp.get(key(state, chamber)) ?? (state === "NE" ? nebraskaNotUp() : empty());
      const leading = empty(), called = empty(), flipped = empty(), net = empty();
      // Every race in one district, so a multi-member district's seats are held against its members together.
      const rows = races.filter((r) => r.state === state && r.chamber === chamber && r.in_party_control === "1");
      const priors = new Map<StateLegDistrict | string, Bucket[]>();
      let up = 0;
      for (const r of rows) {
        const seatCount = Number(r.seats);
        up += seatCount;
        const winners = parseList(r.winners);
        const leaders = parseList(r.leaders);
        const left = parseList(r.candidates).filter((c) => !GENERIC_WRITE_IN.test(c.name) && !winners.some((w) => w.name === c.name));
        const sameParty = leaders.length > 0 && left.every((c) => c.party === left[0].party) && (left[0].party === "D" || left[0].party === "R");
        const settled = sameParty ? [...winners, ...leaders] : winners;
        for (const w of settled) called[w.bucket]++;
        if (!sameParty) for (const l of leaders) leading[l.bucket]++;

        const district = findDistrict(state, chamber, r.seat);
        const unit = district ?? r.seat;
        if (!priors.has(unit)) {
          const members = (district?.incumbents ?? []).filter((i) => r.race_type !== "General" || (i.nextElection ?? district?.nextElection) === 2026);
          const vacated = specials.get(`${state}-${chamber}-${district?.number ?? r.seat.replace(/^District /, "")}`);
          priors.set(unit, r.race_type !== "General" && vacated ? [vacated] : members.length ? members.map((i) => bucket(i.party)) : vacated ? [vacated] : []);
        }
        const prior = priors.get(unit)!;
        if (!prior.length && district) {
          const vacant = VACANT_SEAT_PRIOR[`${state}-${chamber}-${district.number}`];
          if (vacant) prior.push(vacant);
        }
        const onBallot = parseList(r.incumbents);
        const incumbents = new Set(onBallot.map((i) => i.name));
        // A single-seat race's incumbent says who holds it, whatever our data has for the seat.
        if (seatCount === 1 && onBallot.length === 1) {
          const at = prior.indexOf(onBallot[0].bucket);
          if (at >= 0) prior.splice(at, 1);
          else prior.shift();
          prior.unshift(onBallot[0].bucket);
        }
        // Incumbents first: they hold their seats, so the rest are measured against who's left.
        for (const w of [...settled].sort((a, b) => Number(incumbents.has(b.name)) - Number(incumbents.has(a.name)))) {
          if (incumbents.has(w.name)) {
            const at = prior.indexOf(w.bucket);
            prior.splice(at >= 0 ? at : 0, 1);
            continue;
          }
          const at = prior.indexOf(w.bucket);
          if (at >= 0) { prior.splice(at, 1); continue; }
          const from = prior.shift();
          if (!from) continue;
          flipped[w.bucket]++;
          net[w.bucket]++;
          net[from]--;
        }
      }
      return [{
        chamber, total: now.total, up, calledSeats: called.dem + called.rep + called.oth, noElection: false,
        seats: { dem: seats.dem + called.dem, rep: seats.rep + called.rep, oth: seats.oth + called.oth }, leading, flipped, net, incumbentGovernor, priorControl,
      }];
    });
  }
  return { asOf, byState };
}
