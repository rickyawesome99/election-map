import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { statesData } from "@/data/statesData";
import { stateLegDistricts, UNICAMERAL_STATES, type Chamber } from "@/data/stateLegDistricts";
import { houseVoteForYear } from "@/lib/genericBallotPopularVote";
import { raceHref } from "@/lib/raceLinks";
import { house2024Baselines, slotCandidate } from "@/lib/resultsSnapshot";
import { districtResults2026 } from "@/lib/stateLegResults2026";
import { chamberDistrictHref } from "@/lib/statePageLinks";
import { tplInputs2026 } from "@/lib/tpl2026Inputs";
import { parseCsv } from "@/lib/turnout";
import type { R26Certification, R26CloseRace, R26County, R26CountySlice, R26Office, R26Race, R26Recount, R26StateRow, R26Votes, Results2026Data } from "@/lib/results2026Types";

// ── The 2026 Results page (/results) ──────────────────────────────────────────
// Everything the page shows, from files already on disk; nothing here reads a feed or the clock.
//   2026 counts      data-entry/results_2026_seats.csv (`npm run results-snapshot`), the county sums in
//                    data/generated/tpl-inputs-2026.json, state legislatures via lib/stateLegResults2026.ts
//   baselines        2024 president by state (president_past_results.csv), by 2026 House district
//                    (house_pres_2026_dist.csv) and by county (data/countyPresidentialData.ts); each
//                    seat's last election (house/senate/governor_past_results.csv)
//   certification    data-entry/certification_2026.csv and recounts_2026.csv, kept by hand: update
//                    them and CERTIFICATION_AS_OF together.
// Every path is spelled out in literals (Vercel's file tracing, see lib/stateLegResults2026.ts).

/** The day the certification and recount files were last checked against their sources. */
export const CERTIFICATION_AS_OF = "2026-11-25";

const num = (v: string | undefined) => Number(String(v ?? "").replace(/,/g, "")) || 0;
const pct = (d: number, r: number, t: number) => (t > 0 ? ((r - d) / t) * 100 : 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const votes = (d: number, r: number, total: number): R26Votes => ({ d, r, total, margin: r2(pct(d, r, total)) });

const seatsCsv = () => parseCsv(readFileSync(join(process.cwd(), "data-entry", "results_2026_seats.csv"), "utf8"));

// ── Baselines ─────────────────────────────────────────────────────────────────

function presByState(): Map<string, R26Votes> {
  const out = new Map<string, R26Votes>();
  for (const r of parseCsv(readFileSync(join(process.cwd(), "data-entry", "president_past_results.csv"), "utf8"))) {
    if (r.year === "2024" && r.state_abbr.length === 2) out.set(r.state_abbr, votes(num(r.dem_votes), num(r.rep_votes), num(r.total_votes)));
  }
  return out;
}

function presByDistrict(): Map<string, R26Votes> {
  return new Map(parseCsv(readFileSync(join(process.cwd(), "data-entry", "house_pres_2026_dist.csv"), "utf8")).map((r) => [r.code, votes(num(r.pres24_dem), num(r.pres24_rep), num(r.pres24_total))]));
}

type Prev = NonNullable<R26Race["prev"]>;

/** The seat's own last election: the latest earlier row of the seat's class (a special counts). */
function senatePrev(): (state: string, special: boolean) => Prev | null {
  const rows = parseCsv(readFileSync(join(process.cwd(), "data-entry", "senate_past_results.csv"), "utf8")).filter((r) => Number(r.year) < 2026);
  // The seats up in 2026 are Class 2; the two specials (Florida, Ohio) fill Class 3 seats.
  return (state, special) => {
    const own = rows.filter((r) => r.state_abbr === state && r.class === (special ? "3" : "2")).sort((a, b) => Number(b.year) - Number(a.year))[0];
    return own ? statewidePrev(own, own.type === "Special") : null;
  };
}

function governorPrev(): (state: string) => Prev | null {
  const rows = parseCsv(readFileSync(join(process.cwd(), "data-entry", "governor_past_results.csv"), "utf8")).filter((r) => Number(r.year) < 2026 && !/recall/i.test(r.type));
  return (state) => {
    const own = rows.filter((r) => r.state_abbr === state).sort((a, b) => Number(b.year) - Number(a.year))[0];
    return own ? statewidePrev(own, /special/i.test(own.type)) : null;
  };
}

function statewidePrev(row: Record<string, string>, special: boolean): Prev {
  const d = num(row.dem_votes), r = num(row.rep_votes), total = num(row.total_votes);
  const dem = slotCandidate(row.dem_candidate), rep = slotCandidate(row.rep_candidate);
  const dRan = d > 0 && !!dem.name && dem.party == null, rRan = r > 0 && !!rep.name && rep.party == null;
  return { year: Number(row.year), special, d: dRan ? d : 0, r: rRan ? r : 0, total, dRan, rRan, margin: dRan && rRan ? r2(pct(d, r, total)) : null, estimated: false, moved: false };
}

/** Each district's 2024 House race. A seat whose lines moved keeps its 2024 votes off the table
 *  (`moved`) and takes house2024Baselines' estimated margin; see lib/resultsSnapshot.ts. */
function housePrev(): Map<string, Prev> {
  const base = house2024Baselines();
  const out = new Map<string, Prev>();
  for (const row of parseCsv(readFileSync(join(process.cwd(), "data-entry", "house_past_results.csv"), "utf8"))) {
    if (row.year !== "2024") continue;
    const dem = slotCandidate(row.dem_candidate), rep = slotCandidate(row.rep_candidate);
    const dv = num(row.dem_votes), rv = num(row.rep_votes);
    // A same-party final's second finalist sits in the other slot with their true party.
    const d = (dem.name && dem.party == null ? dv : 0) + (rep.party === "D" ? rv : 0);
    const r = (rep.name && rep.party == null ? rv : 0) + (dem.party === "R" ? dv : 0);
    const b = base.get(row.district_name);
    out.set(row.district_name, { year: 2024, special: false, d, r, total: num(row.total_votes), dRan: d > 0, rRan: r > 0, margin: b ? r2(b.margin) : null, estimated: !!b?.estimated, moved: !!b?.estimated });
  }
  return out;
}

/** Districts whose lines really moved between the 2024 and 2026 maps: the presidential total differs. */
function movedDistricts(): Set<string> {
  const redrawn = new Set(parseCsv(readFileSync(join(process.cwd(), "data-entry", "house_redistrict.csv"), "utf8")).filter((r) => r.new_26 === "Yes").map((r) => r.district_name));
  const presOld = new Map(parseCsv(readFileSync(join(process.cwd(), "data-entry", "pres_by_boundary_vintage.csv"), "utf8")).filter((r) => r.boundary_year === "2024" && r.pres_year === "2024").map((r) => [r.district_name, num(r.total_votes)]));
  const moved = new Set<string>();
  for (const [code, p] of presByDistrict()) if (redrawn.has(code) && presOld.has(code) && presOld.get(code) !== p.total) moved.add(code);
  return moved;
}

// ── Races ─────────────────────────────────────────────────────────────────────

function buildRaces(rows: Record<string, string>[]): R26Race[] {
  const presState = presByState(), presDist = presByDistrict(), sPrev = senatePrev(), gPrev = governorPrev(), hPrev = housePrev(), moved = movedDistricts();
  return rows.map((r): R26Race => {
    const office = r.office as R26Office, special = r.special === "1";
    const total = num(r.total_votes), d = num(r.party_d_votes), rep = num(r.party_r_votes);
    const slotD = r.dem_party === "D" || r.rep_party === "D", slotR = r.rep_party === "R" || r.dem_party === "R";
    const twoParty = r.contest === "contested" && r.dem_party === "D" && r.rep_party === "R" && total > 0;
    const dRan = total > 0 && slotD && d > 0 && r.contest !== "same-party-R";
    const rRan = total > 0 && slotR && rep > 0 && (r.contest === "contested" || r.contest === "same-party-R");
    const note = twoParty ? undefined
      : total <= 0 ? "no count printed"
      : r.contest === "same-party-D" ? "two Democrats" : r.contest === "same-party-R" ? "two Republicans"
      : r.contest === "uncontested-D" ? "no Republican" : r.contest === "uncontested-R" ? "no Democrat"
      : r.dem_party !== "D" ? "independent vs. Republican" : "Democrat vs. independent";
    const prev0 = office === "house" ? hPrev.get(r.label) ?? null : office === "senate" ? sPrev(r.state, special) : gPrev(r.state);
    const prev = prev0 && office === "house" ? { ...prev0, moved: moved.has(r.label) } : prev0;
    const winner = r.winner_party === "D" || r.winner_party === "R" ? r.winner_party : r.winner_party ? "I" : null;
    return {
      office, id: r.race_id, label: r.label, state: r.state, stateName: r.state_name,
      href: raceHref(office, { name: r.label, id: r.race_id }),
      mapKey: office === "house" ? String(parseInt(r.race_id, 10)) : r.state_name,
      demName: r.dem_name, repName: r.rep_name,
      d: dRan ? d : 0, r: rRan ? rep : 0, total,
      margin: total > 0 ? r2(pct(num(r.dem_votes), num(r.rep_votes), total)) : null,
      twoParty, dRan, rRan, note,
      called: r.called === "1", winner,
      pres: (office === "house" ? presDist.get(r.label) : presState.get(r.state)) ?? null,
      prev,
    };
  });
}

// ── Counties ──────────────────────────────────────────────────────────────────

/** Counties where part of the House vote is a seat with no D-vs-R race, so the county's summed
 *  House margin covers only part of it: left off the map. */
function partialHouseCounties(eligible: Set<string>): Set<string> {
  const sum = new Map<string, { ok: number; other: number; blank: boolean }>();
  for (const r of parseCsv(readFileSync(join(process.cwd(), "data-entry", "results-2026", "house_district_county_results_2026.csv"), "utf8"))) {
    const s = sum.get(r.county_fips) ?? { ok: 0, other: 0, blank: false };
    const total = num(r.total);
    if (eligible.has(`${r.state}-${r.district.padStart(2, "0")}`)) s.ok += total;
    else if (total > 0) s.other += total;
    else s.blank = true;
    sum.set(r.county_fips, s);
  }
  return new Set([...sum].filter(([, s]) => s.blank || s.other > 0.02 * (s.ok + s.other)).map(([f]) => f));
}

let countyCache: R26CountySlice | null = null;
export function results2026Counties(): R26CountySlice {
  if (countyCache) return countyCache;
  const inputs = tplInputs2026();
  const races = buildRaces(seatsCsv());
  // A statewide race with no Democrat-versus-Republican margin (an independent in a party's place) has no county swing.
  const offState = (office: R26Office) => new Set(races.filter((r) => r.office === office && !r.twoParty).map((r) => r.state));
  const skipSenate = offState("senate"), skipGovernor = offState("governor");
  const eligible = new Set(inputs.races.filter((r) => r.office === "H" && r.eligibility === "eligible").map((r) => r.label));
  const partial = partialHouseCounties(eligible);
  const out: R26CountySlice = { senate: [], governor: [], house: [] };
  for (const [fips, c] of Object.entries(inputs.counties)) {
    const p = countyPresidentialData[fips];
    if (!p) continue;
    const pres = p.years[2024]?.margin ?? null;
    const row = (v: [number, number, number] | undefined): R26County | null => (v && v[2] > 0 ? [fips, p.countyName, p.state, v[0], v[1], v[2], pres] : null);
    const s = skipSenate.has(p.state) ? null : row(c.S ?? c.SS);
    const g = skipGovernor.has(p.state) ? null : row(c.G);
    const h = inputs.countyHouseIneligible[fips] || partial.has(fips) ? null : row(c.H);
    if (s) out.senate.push(s);
    if (g) out.governor.push(g);
    if (h) out.house.push(h);
  }
  return (countyCache = out);
}

// ── The House vote by state, every seat contested ─────────────────────────────

/** 2026 by state on three bases, the way scripts/buildTplInputs2026.ts counts the national vote:
 *  a seat with no Democrat-versus-Republican race is filled with its 2024 presidential margin plus
 *  the year's contested House-minus-president offset, at the state's median contested turnout. */
function houseVote2026(rows: Record<string, string>[]) {
  const house = rows.filter((r) => r.office === "house");
  const isContested = (r: Record<string, string>) => r.contest === "contested" && r.dem_party === "D" && (r.rep_party === "R" || r.rep_name === "Kevin Kiley") && num(r.dem_votes) > 0 && num(r.rep_votes) > 0;
  const seatTotal = (r: Record<string, string>) => Math.max(num(r.total_votes), num(r.dem_votes) + num(r.rep_votes));
  const presOf = (r: Record<string, string>) => districtPresidentialData[String(parseInt(r.race_id, 10))];
  let offNum = 0, offDen = 0;
  for (const r of house) {
    const p = presOf(r);
    if (!isContested(r) || !p) continue;
    const t = seatTotal(r);
    offNum += (pct(num(r.dem_votes), num(r.rep_votes), t) - p.pres24Margin) * t; offDen += t;
  }
  const offset = offDen > 0 ? offNum / offDen : 0;
  const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const sums = { raw: [0, 0, 0], contested: [0, 0, 0], imputed: [0, 0, 0] };
  let seatsFilled = 0;
  const states = new Map<string, { raw: number; imputed: number; seats: number; dropped: string[] }>();
  for (const s of statesData) {
    const sr = house.filter((r) => r.state === s.abbr);
    if (!sr.length) continue;
    const med = median(sr.filter(isContested).map(seatTotal));
    const raw = [0, 0, 0], imp = [0, 0, 0], dropped: string[] = [];
    for (const r of sr) {
      const pd = num(r.party_d_votes), pr = num(r.party_r_votes), total = num(r.total_votes);
      raw[0] += pd; raw[1] += pr; raw[2] += total;
      if (isContested(r)) {
        const d = num(r.dem_votes), rr = num(r.rep_votes);
        sums.contested[0] += d; sums.contested[1] += rr; sums.contested[2] += total;
        imp[0] += d; imp[1] += rr; imp[2] += total;
        continue;
      }
      dropped.push(r.label);
      const p = presOf(r);
      if (!p) { imp[0] += pd; imp[1] += pr; imp[2] += total; continue; }
      seatsFilled += 1;
      const m = Math.max(-95, Math.min(95, p.pres24Margin + offset));
      const v = med || total || 250000;
      imp[0] -= (v * m) / 200; imp[1] += (v * m) / 200; imp[2] += v;
    }
    for (let i = 0; i < 3; i++) { sums.raw[i] += raw[i]; sums.imputed[i] += imp[i]; }
    states.set(s.abbr, { raw: r2(pct(raw[0], raw[1], raw[2])), imputed: r2(pct(imp[0], imp[1], imp[2])), seats: sr.length, dropped });
  }
  const m = (v: number[]) => r2(pct(v[0], v[1], v[2]));
  return { national: { raw: m(sums.raw), contested: m(sums.contested), imputed: m(sums.imputed), seatsFilled }, states };
}

// ── Closest races ─────────────────────────────────────────────────────────────

const PARTY_LETTER: Record<string, string> = { Democratic: "D", Republican: "R" };
/** "Mary Peltola (Democratic) 144486; Dan Sullivan (Republican) 131965" → candidates, most votes first. */
function parseField(cell: string) {
  return cell.split("; ").map((c) => /^(.*) \(([^)]*)\) (\d+)$/.exec(c.trim())).filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ name: m[1], party: PARTY_LETTER[m[2]] ?? "I", votes: Number(m[3]) })).sort((a, b) => b.votes - a.votes);
}

const CHAMBER_NAME = (abbr: string, chamber: Chamber) => (UNICAMERAL_STATES.has(abbr) ? "Legislature" : chamber === "house" ? "House" : "Senate");

function closeRaces(rows: Record<string, string>[], recounts: R26Recount[]): R26CloseRace[] {
  const out: R26CloseRace[] = [];
  // A recount row tags a race only on an exact seat: "MN-01" for the U.S. House, "HD-27" / "SD-4" /
  // "HD-32A" for a legislature. Seats the file names by town (New Hampshire, Massachusetts) or by a
  // multi-post district (Washington, Arizona) are listed in the certification section only.
  const seatKey = (s: string) => s.replace(/^0+/, "").toUpperCase();
  const recounted = (office: string, state: string, seat: string) => recounts.some((x) => {
    if (x.state !== state || x.office !== office) return false;
    if (office === "senate" || office === "governor") return !/precinct/i.test(x.seat);
    const m = office === "house" ? /^[A-Z]{2}-(\d+)$/.exec(x.seat) : /^(?:HD|SD)-?(\d+[A-Z]?)$/.exec(x.seat);
    return !!m && seatKey(m[1]) === seatKey(seat);
  });
  for (const r of rows) {
    const total = num(r.total_votes);
    // Louisiana's two uncalled seats go to a December runoff: November's count decided nothing.
    if (total <= 0 || r.contest.startsWith("uncontested") || (r.called !== "1" && r.state === "LA")) continue;
    const field = parseField(r.candidates);
    if (field.length < 2) continue;
    const office = r.office as R26Office;
    out.push({
      office, state: r.state, label: office === "house" ? r.label : `${r.state_name} ${office === "senate" ? "Senate" : "governor"}${r.special === "1" ? " (special)" : ""}`,
      href: raceHref(office, { name: r.label, id: r.race_id }),
      first: field[0], second: field[1], votes: field[0].votes - field[1].votes, pct: r2(((field[0].votes - field[1].votes) / total) * 100), total,
      called: r.called === "1", recount: recounted(office, r.state, office === "house" ? r.label.slice(3) : "") || undefined,
    });
  }
  for (const s of statesData) {
    for (const chamber of ["house", "senate"] as Chamber[]) {
      const roster = new Map((stateLegDistricts[s.abbr]?.[chamber] ?? []).map((d) => [d.number, d.label]));
      for (const [key, res] of districtResults2026(s.abbr, chamber)) {
        for (const race of res.races) {
          const field = race.candidates.filter((c) => c.votes != null);
          if (race.total <= 0 || field.length <= race.seats) continue;
          const last = field[race.seats - 1], next = field[race.seats];
          const lead = (last.votes ?? 0) - (next.votes ?? 0);
          const letter = (p: string) => (p === "O" ? "I" : p);
          const office = chamber === "house" ? "state_house" as const : "state_senate" as const;
          out.push({
            office, state: s.abbr,
            label: `${s.abbr} ${CHAMBER_NAME(s.abbr, chamber)} ${(roster.get(key) ?? key).replace(/^(State )?(House|Senate|Assembly|Legislative) /i, "").replace(/\s*(State )?(House|Senate|Senatorial|Legislative|Assembly) (District|Subdistrict)$/i, "")}${race.post && !race.special ? ` (${/^\d+$/.test(race.post) ? "Pos." : "Seat"} ${race.post})` : ""}${race.special ? " (special)" : ""}`,
            href: chamberDistrictHref(s.id, chamber, key),
            first: { name: last.name, party: letter(last.party) }, second: { name: next.name, party: letter(next.party) },
            votes: lead, pct: r2((lead / race.total) * 100), total: race.total, called: race.called,
            seats: race.seats > 1 ? race.seats : undefined, recount: recounted(office, s.abbr, key) || undefined,
          });
        }
      }
    }
  }
  // Ship each office's closest: its 60 narrowest by share of the vote and its 60 narrowest in votes.
  const keep = new Set<R26CloseRace>();
  for (const office of ["senate", "governor", "house", "state_senate", "state_house"]) {
    const own = out.filter((x) => x.office === office);
    [...own].sort((a, b) => a.pct - b.pct).slice(0, 60).forEach((x) => keep.add(x));
    [...own].sort((a, b) => a.votes - b.votes).slice(0, 60).forEach((x) => keep.add(x));
  }
  return [...keep].sort((a, b) => a.pct - b.pct);
}

// ── Certification ─────────────────────────────────────────────────────────────

function readRecounts(): R26Recount[] {
  return parseCsv(readFileSync(join(process.cwd(), "data-entry", "recounts_2026.csv"), "utf8")).map((r) => ({
    state: r.state, office: r.office, seat: r.seat, candidates: r.candidates, marginVotes: r.margin_votes === "" ? null : num(r.margin_votes),
    type: r.type, status: r.status, statusDate: r.status_date, result: r.result, source: r.source_url, note: r.note,
  }));
}

function certification(recounts: R26Recount[]): R26Certification[] {
  const rows = new Map(parseCsv(readFileSync(join(process.cwd(), "data-entry", "certification_2026.csv"), "utf8")).map((r) => [r.state, r]));
  return statesData.map((s) => {
    const r = rows.get(s.abbr);
    return {
      abbr: s.abbr, name: s.name, href: `/states/${s.id}`,
      status: r?.status === "certified" ? "certified" : "pending",
      date: r?.date ?? "", dateKind: (r?.date_kind || "deadline") as R26Certification["dateKind"], source: r?.source_url ?? "", note: r?.note ?? "",
      recounts: recounts.filter((x) => x.state === s.abbr),
    };
  });
}

// ── The page ──────────────────────────────────────────────────────────────────

let cache: Results2026Data | null = null;
export function results2026Page(): Results2026Data {
  if (cache) return cache;
  const rows = seatsCsv();
  const races = buildRaces(rows);
  const now = houseVote2026(rows), then = houseVoteForYear(2024);
  const thenByState = new Map(then.states.map((s) => [s.abbr, s]));
  const moved = movedDistricts();
  const statewide = (office: R26Office, abbr: string) => races.find((r) => r.office === office && r.state === abbr && r.twoParty && !r.label.includes("special"))?.margin ?? null;
  const pres = presByState();
  const states: R26StateRow[] = [];
  for (const s of statesData) {
    const n = now.states.get(s.abbr), t = thenByState.get(s.abbr), p = pres.get(s.abbr);
    if (!n || !t || !p) continue;
    states.push({
      abbr: s.abbr, name: s.name, href: `/states/${s.id}`, pres: p.margin,
      senate: statewide("senate", s.abbr), governor: statewide("governor", s.abbr),
      house: n.imputed, house24: t.imputed, houseRaw: n.raw, houseRaw24: t.raw, seats: n.seats,
      dropped: n.dropped, dropped24: t.dropped.map((d) => d.code),
      redrawn: [...moved].some((code) => code.startsWith(`${s.abbr}-`)),
    });
  }
  const recounts = readRecounts();
  let asOf = 0;
  for (const r of rows) asOf = Math.max(asOf, Date.parse(r.fetched_at) || 0);
  cache = {
    asOf, certificationAsOf: CERTIFICATION_AS_OF, races, states,
    genericBallot: { y2024: { raw: then.raw, contested: then.contested, imputed: then.imputed, seatsFilled: then.imputedSeats }, y2026: now.national },
    closest: closeRaces(rows, recounts),
    certification: certification(recounts),
  };
  return cache;
}
