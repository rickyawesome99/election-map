import "server-only";
/**
 * Every race a state-legislative district voted in, on TODAY's lines, 2016–2026: President, U.S. Senate
 * (and a same-day special), Governor, U.S. House and the chamber's own legislative race, summed from the
 * precinct returns (public/precincts/results/{ST}/{year}.json, all on the 2024 precinct layer;
 * scripts/precincts/). The input of the legislative-district TPL (lib/stateLegTpl.ts) and of the atlas's
 * comparison rows (lib/stateLegStatewide.ts).
 *
 * Placement:
 * - Past years: each precinct is divided among today's districts by its 2020 block population
 *   (data-entry/precincts/district-shares/{ST}-{chamber}.json, keyed by district GEOID). A year's own
 *   district labels are on that year's lines, so they are not used for placement.
 * - 2026, chamber on the ballot and its count reconciled: the precinct's own 2026 label, split precincts
 *   by each part's legislative votes; precincts with no race for the chamber by population.
 *
 * Coverage: the share of the row's votes cast in a Democrat-vs-Republican contest. U.S. House by
 * congressional district (who held each slot: data-entry/house_past_results.csv, results_2026_seats.csv),
 * the legislature by that year's own district (both parties with votes there). The uncontested part is
 * kept apart with its own presidential margin (nearest presidential year, ties to the later one) so the
 * model can impute it (user decision 2026-11-26: track coverage, impute the uncontested part).
 * Statewide offices are one contest: their eligibility is the state race's (County TPL's rule), applied
 * by the model, except where the precinct round differs from the site's row (SAME_PARTY_ROWS).
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { Chamber } from "../data/stateLegDistricts";
import { indexByNormalizedKey, lookupByDistrictCode, normalizeDistrictKey } from "./stateLegDistrictKey";
import { stateLegResults } from "../data/stateLegResults";

export type DistrictOffice = "PRES" | "USS" | "USSS" | "GOV" | "USH" | "L";
type Votes = { dem: number; rep: number; oth: number };
export type DistrictRaceRow = {
  year: number;
  office: DistrictOffice;
  /** Every vote placed in the district (slot / party convention of the precinct file). */
  all: Votes;
  /** The part cast in Democrat-vs-Republican contests (= all for a statewide race). */
  contested: Votes;
  /** Share of the row's votes that are in `contested`. */
  coverage: number;
  /** The uncontested part's own presidential margin (R − D, points of all votes) and its year; null with full coverage. */
  uncontestedPres: { year: number; margin: number } | null;
  /** Legislature: that year's seats the contested votes came from, by share (for the incumbency and money terms). */
  seats?: { code: string; share: number }[];
  /** Share of the district's votes handed over from precincts split with another district. */
  splitShare: number;
  basis: "votes" | "population";
  /** Share of the district (by votes in the year's other races) with no votes for this race on file. */
  missing: number;
  /** The D slot's party when it was not a Democrat ("I": King, Sanders, Osborn…); statewide only. */
  dLabel?: string;
  /** Both slots one party in the precinct round shown (CA Senate 2016/18, Alaska's 2022 final round). */
  sameParty?: boolean;
  /** Which round the precincts report, where it is not the plain November general. */
  note?: string;
};

type PrecinctFile = {
  offices: Record<string, [number, number, number][]>;
  districts: Record<string, string[]>;
  split?: Record<string, [number, string, number, number, number][]>;
};
type CovCell = { status?: string; d?: number; r?: number; stage?: string };
type Coverage = { states: Record<string, { years: Record<string, Record<string, CovCell>> }> };
export type RosterEntry = { number: string; geoid?: string; overlay?: boolean; components?: string[] };

const SHOWN = new Set(["reconciled", "explained"]);
/** A row is dropped when more than this share of the district has no votes for the race. */
export const MAX_MISSING = 0.5;

/** Which round a file holds where it is not the November general, or how its votes were counted. */
const NOTES: Record<string, string> = {
  "GA-2020-USS": "January runoff",
  "GA-2020-USSS": "January runoff",
  "GA-2022-USS": "December runoff",
  "MS-2018-USSS": "November runoff",
  "LA-2016-USS": "December runoff",
  "LA-2019-GOV": "November runoff",
  "LA-2023-GOV": "October all-party primary",
  "LA-2016-USH": "November all-party primary",
  "LA-2018-USH": "November all-party primary",
  "LA-2020-USH": "November all-party primary",
  "LA-2022-USH": "November all-party primary",
  "LA-2024-USH": "November all-party primary",
};
/** Statewide rows whose precinct round puts one party in both slots, unlike the site's own row: Alaska's
 * 2022 Senate final round was Murkowski v. Tshibaka (the site's row is the first round, Chesbro v. Murkowski). */
const SAME_PARTY_ROWS = new Set(["AK-2022-USS"]);
/** House districts decided by ranked choice whose precincts report first choices only. */
const FIRST_CHOICE_CDS = new Set(["ME-2018-02", "ME-2022-02", "ME-2024-02"]);

// ── the site's race rows: who sat in each slot ────────────────────────────────────────────────────

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const csv = (name: string) => parseCsv(readFileSync(join(process.cwd(), "data-entry", name), "utf8"));
const num = (s: string | undefined) => Number(String(s ?? "").replace(/,/g, "")) || 0;

/** A slot's party from a race row's candidate cell: blank = nobody, "Name (I)" = that tag, else the slot's own party. */
function slotParty(name: string | undefined, own: "D" | "R"): string | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  const tag = n.match(/\(([A-Z]{1,3})\)\s*$/);
  return tag ? tag[1] : own;
}

type SlotRow = { d: string | null; r: string | null; dVotes: number; rVotes: number };
let raceRows: { statewide: Map<string, SlotRow[]>; house: Map<string, SlotRow> } | null = null;

/** statewide: "ST-YEAR-OFFICE" → candidate rows; house: "ST-YEAR-NN" → row. */
function loadRaceRows() {
  if (raceRows) return raceRows;
  const statewide = new Map<string, SlotRow[]>();
  const house = new Map<string, SlotRow>();
  const push = (k: string, v: SlotRow) => statewide.set(k, [...(statewide.get(k) ?? []), v]);
  for (const r of csv("senate_past_results.csv"))
    push(`${r.state_abbr}-${r.year}-${r.type === "Special" ? "USSS" : "USS"}`, { d: slotParty(r.dem_candidate, "D"), r: slotParty(r.rep_candidate, "R"), dVotes: num(r.dem_votes), rVotes: num(r.rep_votes) });
  for (const r of csv("governor_past_results.csv"))
    push(`${r.state_abbr}-${r.year}-GOV`, { d: slotParty(r.dem_candidate, "D"), r: slotParty(r.rep_candidate, "R"), dVotes: num(r.dem_votes), rVotes: num(r.rep_votes) });
  for (const r of csv("house_past_results.csv")) {
    const cd = r.district_name.split("-")[1];
    house.set(`${r.state_abbr}-${r.year}-${cd}`, { d: slotParty(r.dem_candidate, "D"), r: slotParty(r.rep_candidate, "R"), dVotes: num(r.dem_votes), rVotes: num(r.rep_votes) });
  }
  for (const r of csv("results_2026_seats.csv")) {
    const d = r.dem_name ? (r.dem_party || "D") : null, rp = r.rep_name ? (r.rep_party || "R") : null;
    const row = { d, r: rp, dVotes: num(r.dem_votes), rVotes: num(r.rep_votes) };
    if (r.office === "house") house.set(`${r.state}-2026-${r.label.split("-")[1]}`, row);
    else push(`${r.state}-2026-${r.office === "senate" ? (r.special === "1" ? "USSS" : "USS") : "GOV"}`, row);
  }
  raceRows = { statewide, house };
  return raceRows;
}

/** The statewide race row a precinct file holds: the one whose slot totals are nearest the file's. */
function statewideRow(abbr: string, year: string, office: string, cell: CovCell): SlotRow | null {
  let rows = loadRaceRows().statewide.get(`${abbr}-${year}-${office}`) ?? [];
  // A special that was the state's only Senate race that year (AZ 2020) sits in the file as USS.
  if (!rows.length && office === "USS") rows = loadRaceRows().statewide.get(`${abbr}-${year}-USSS`) ?? [];
  let best: SlotRow | null = null, err = Infinity;
  for (const r of rows) {
    const e = Math.abs(r.dVotes - (cell.d ?? 0)) + Math.abs(r.rVotes - (cell.r ?? 0));
    if (e < err) { err = e; best = r; }
  }
  return best;
}

/** A House district label in a precinct file ("01", "1", "00", "AL", "AT-LARGE") as the race rows' "01". */
function cdKey(label: string): string | null {
  if (!label) return null;
  if (/^\d+$/.test(label)) return Number(label) === 0 ? "01" : String(Number(label)).padStart(2, "0");
  return /^(AL|AT-?LARGE)$/i.test(label) ? "01" : null;
}

// ── precinct placement ─────────────────────────────────────────────────────────────────────────────

let coverage: Coverage | null = null;
const fileCache = new Map<string, PrecinctFile | null>();
function precinctFile(abbr: string, year: string): PrecinctFile | null {
  const k = `${abbr}-${year}`;
  if (!fileCache.has(k)) {
    const p = join(process.cwd(), "public", "precincts", "results", abbr, `${year}.json`);
    fileCache.set(k, existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as PrecinctFile) : null);
  }
  return fileCache.get(k)!;
}

/** A precinct file's district label ("011", "10A") as an atlas key ("11"; Idaho's "10A" → "10"). */
function toKey(code: string, keys: Set<string>): string | null {
  const p = normalizeDistrictKey(code).replace(/^0+(?=\d)/, "");
  if (!p) return null;
  if (keys.has(p)) return p;
  const bare = p.replace(/[a-z]$/, "");
  return keys.has(bare) ? bare : null;
}

type Parts = Map<number, { key: string; share: number }[]>;

function populationParts(abbr: string, chamber: Chamber, byGeoid: Map<string, string>, keys: Set<string>): Parts | null {
  const path = join(process.cwd(), "data-entry", "precincts", "district-shares", `${abbr}-${chamber}.json`);
  if (!existsSync(path)) return null;
  const shares = (JSON.parse(readFileSync(path, "utf8")) as { shares: Record<string, [string, number][]> }).shares;
  const parts: Parts = new Map();
  for (const [i, ps] of Object.entries(shares)) {
    const mine = ps
      .map(([code, share]) => ({ key: byGeoid.get(code) ?? toKey(code, keys), share }))
      .filter((p): p is { key: string; share: number } => p.key != null);
    if (mine.length) parts.set(Number(i), mine);
  }
  return parts;
}

function labelParts(file: PrecinctFile, legOffice: string, keys: Set<string>): Parts {
  const parts: Parts = new Map();
  (file.districts[legOffice] ?? []).forEach((code, i) => { const key = toKey(code, keys); if (key) parts.set(i, [{ key, share: 1 }]); });
  const byPrecinct = new Map<number, { key: string; votes: number }[]>();
  for (const [i, code, d, r, o] of file.split?.[legOffice] ?? []) {
    const key = toKey(code, keys);
    if (key) byPrecinct.set(i, [...(byPrecinct.get(i) ?? []), { key, votes: d + r + o }]);
  }
  for (const [i, ps] of byPrecinct) {
    const total = ps.reduce((s, p) => s + p.votes, 0);
    if (total > 0) parts.set(i, ps.map((p) => ({ key: p.key, share: p.votes / total })));
  }
  return parts;
}

type To = "d" | "r" | "o";
/** How a precinct's votes for one race count: where each slot goes, whether the contest was D v R, and (legislature) its seat. */
type Route = { dTo: To; rTo: To; contested: boolean; seat?: string; firstChoice?: boolean; slate?: [number, number]; postScale?: [number, number] };

type Sum = {
  all: Votes; contested: Votes; split: number; weight: number; weightWith: number;
  unc: { i: number; share: number }[]; seats: Map<string, number>; firstChoice: number;
};
const zero = (): Votes => ({ dem: 0, rep: 0, oth: 0 });
const emptySum = (): Sum => ({ all: zero(), contested: zero(), split: 0, weight: 0, weightWith: 0, unc: [], seats: new Map(), firstChoice: 0 });
const margin = (v: Votes) => { const t = v.dem + v.rep + v.oth; return t > 0 ? ((v.rep - v.dem) / t) * 100 : 0; };
const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Every race row for every district of a chamber, keyed by normalized atlas district key, newest year
 * first. NH floterials sum their component districts.
 */
export function districtRaceRows(abbr: string, chamber: Chamber, roster: RosterEntry[]): Map<string, DistrictRaceRow[]> {
  const out = new Map<string, DistrictRaceRow[]>();
  const dir = join(process.cwd(), "public", "precincts", "results", abbr);
  if (!existsSync(dir)) return out;
  coverage ??= JSON.parse(readFileSync(join(process.cwd(), "data", "precincts", "coverage.json"), "utf8")) as Coverage;
  const keys = new Set(roster.filter((d) => !d.overlay).map((d) => normalizeDistrictKey(d.number)));
  const byGeoid = new Map(roster.filter((d) => d.geoid).map((d) => [d.geoid!, normalizeDistrictKey(d.number)]));
  const legOffice = chamber === "house" ? "SLDL" : "SLDU";
  const popParts = populationParts(abbr, chamber, byGeoid, keys);
  const years = readdirSync(dir).map((f) => f.match(/^(\d{4})\.json$/)?.[1]).filter((y): y is string => !!y).sort().reverse();
  const presYears = years.filter((y) => SHOWN.has(coverage!.states[abbr]?.years[y]?.PRES?.status ?? ""));
  const nearestPres = (y: number) => [...presYears].sort((a, b) => Math.abs(Number(a) - y) - Math.abs(Number(b) - y) || Number(b) - Number(a))[0];

  for (const year of years) {
    const cov = coverage.states[abbr]?.years[year] ?? {};
    const file = precinctFile(abbr, year);
    if (!file) continue;
    const labelled = year === "2026" && (file.districts[legOffice]?.length ?? 0) > 0 && cov[legOffice]?.status === "reconciled";
    let parts: Parts | null = popParts;
    if (labelled) {
      parts = labelParts(file, legOffice, keys);
      for (const [i, ps] of popParts ?? []) if (!parts.has(i)) parts.set(i, ps);
    }
    if (!parts) continue;

    const n = Object.values(file.offices)[0]?.length ?? 0;
    const weight = new Array<number>(n).fill(0);
    for (const rows of Object.values(file.offices)) rows.forEach(([d, r, o], i) => { weight[i] = Math.max(weight[i], d + r + o); });

    const offices: [DistrictOffice, string][] = [["PRES", "PRES"], ["USS", "USS"], ["USSS", "USSS"], ["GOV", "GOV"], ["USH", "USH"], ["L", legOffice]];
    for (const [office, fileOffice] of offices) {
      const votes = file.offices[fileOffice];
      const cell = cov[fileOffice];
      if (!votes || !SHOWN.has(cell?.status ?? "")) continue;
      const noteKey = `${abbr}-${year}-${office === "L" ? legOffice : office}`;
      // Alaska's ranked-choice races are final rounds since the CVR rebuild (scripts/precincts/build_alaska_rcv.py);
      // Maine's 2nd district (2018, 2022, 2024) still reports first choices by precinct.
      const firstChoiceAll = false;

      let dLabel: string | undefined;
      let sameParty = false;
      let route: (i: number) => Route;
      const plain: Route = { dTo: "d", rTo: "r", contested: true, firstChoice: firstChoiceAll };
      if (office === "USH") {
        const cds = file.districts.USH ?? [];
        const fileTotals = new Map<string, { d: number; r: number }>();
        votes.forEach(([d, r], i) => { const k = cdKey(cds[i] ?? ""); if (!k) return; const t = fileTotals.get(k) ?? { d: 0, r: 0 }; t.d += d; t.r += r; fileTotals.set(k, t); });
        const contest = new Map<string, Route>();
        for (const [k, t] of fileTotals) {
          const row = loadRaceRows().house.get(`${abbr}-${year}-${k}`);
          const dP = row ? row.d : t.d > 0 ? "D" : null, rP = row ? row.r : t.r > 0 ? "R" : null;
          const to = (p: string | null): To => (p === "D" ? "d" : p === "R" ? "r" : "o");
          contest.set(k, { dTo: to(dP), rTo: to(rP), contested: dP === "D" && rP === "R" && t.d > 0 && t.r > 0, firstChoice: FIRST_CHOICE_CDS.has(`${abbr}-${year}-${k}`) });
        }
        route = (i) => contest.get(cdKey(cds[i] ?? "") ?? "") ?? plain;
      } else if (office === "L") {
        // That year's own seats: contested when both parties drew votes in the seat.
        const labels = file.districts[fileOffice] ?? [];
        const seatTotals = new Map<string, { d: number; r: number }>();
        const addSeat = (code: string, d: number, r: number) => { if (!code) return; const t = seatTotals.get(code) ?? { d: 0, r: 0 }; t.d += d; t.r += r; seatTotals.set(code, t); };
        const splitRows = new Map<number, [string, number, number, number][]>();
        for (const [i, code, d, r, o] of file.split?.[fileOffice] ?? []) splitRows.set(i, [...(splitRows.get(i) ?? []), [code, d, r, o]]);
        votes.forEach(([d, r], i) => {
          const sp = splitRows.get(i);
          if (sp) for (const [code, sd, sr] of sp) addSeat(code, sd, sr);
          else addSeat(labels[i] ?? "", d, r);
        });
        // Contested = both parties on that seat's ballot, from the site's own result for the seat: a precinct
        // file's seat totals can carry a few stray votes for the absent party from split or spread precincts.
        // Without a site row: both parties with at least 5% of the seat's two-party vote.
        // A multi-member seat whose parties ran unequal slates (two Democrats and one Republican for two
        // seats) counts the average nominee of each party, as the frozen model's contestedMargin does: each
        // precinct's D and R votes are re-split by d/nD : r/nR, keeping their sum. A nominee on both major
        // lines (fusion) is no D-v-R contest.
        type SiteSeat = { demVotes: number; repVotes: number; candidates?: { name: string; party: string; votes?: number; winner?: boolean; post?: string }[] };
        const seatIndex = indexByNormalizedKey(((stateLegResults as unknown as Record<string, Record<string, Partial<Record<Chamber, { districts: Record<string, SiteSeat> }>>>>)[abbr]?.[year]?.[chamber]?.districts) ?? {});
        // Seats elected by position (Washington's 1 and 2, Idaho's A and B) are separate races summed in the
        // precinct file: only positions with a Democrat against a Republican count, by scaling each precinct's
        // D and R votes to the share of the seat's D and R votes cast in those positions.
        const seatInfo = new Map<string, { contested: boolean; slate?: [number, number]; postScale?: [number, number] }>();
        for (const [code, t] of seatTotals) {
          const site = lookupByDistrictCode(seatIndex, abbr, chamber, code) ?? lookupByDistrictCode(seatIndex, abbr, chamber, code.replace(/^0+(?=\d)/, ""));
          if (!site) { seatInfo.set(code, { contested: t.d > 0 && Math.min(t.d, t.r) >= 0.05 * (t.d + t.r) }); continue; }
          const cs = site.candidates ?? [];
          const fold = (n: string) => n.toLowerCase().replace(/[^a-z]/g, "");
          const dNames = new Set(cs.filter((c) => c.party === "D").map((c) => fold(c.name)));
          const fusion = cs.some((c) => c.party === "R" && dNames.has(fold(c.name)));
          const nD = cs.filter((c) => c.party === "D").length, nR = cs.filter((c) => c.party === "R").length;
          const multi = cs.filter((c) => c.winner).length > 1;
          if (cs.some((c) => c.post)) {
            const posts = new Map<string, typeof cs>();
            for (const c of cs) posts.set(c.post ?? "", [...(posts.get(c.post ?? "") ?? []), c]);
            let dIn = 0, rIn = 0, dAll = 0, rAll = 0;
            for (const pc of posts.values()) {
              const d = pc.filter((c) => c.party === "D").reduce((a, c) => a + (c.votes ?? 0), 0), r = pc.filter((c) => c.party === "R").reduce((a, c) => a + (c.votes ?? 0), 0);
              dAll += d; rAll += r;
              if (d > 0 && r > 0) { dIn += d; rIn += r; }
            }
            const ok = dIn > 0 && rIn > 0 && !fusion;
            seatInfo.set(code, { contested: ok, ...(ok && (dIn < dAll || rIn < rAll) ? { postScale: [dIn / dAll, rIn / rAll] as [number, number] } : {}) });
            continue;
          }
          seatInfo.set(code, { contested: site.demVotes > 0 && site.repVotes > 0 && !fusion, ...(multi && nD > 0 && nR > 0 && nD !== nR ? { slate: [nD, nR] as [number, number] } : {}) });
        }
        route = (i) => {
          const code = labels[i] ?? "";
          const info = seatInfo.get(code);
          return { dTo: "d", rTo: "r", contested: info?.contested ?? false, seat: code || undefined, firstChoice: firstChoiceAll, slate: info?.slate, postScale: info?.postScale };
        };
      } else {
        if (office !== "PRES") {
          const row = statewideRow(abbr, year, office, cell);
          sameParty = SAME_PARTY_ROWS.has(noteKey) || !!(row && row.d && row.r && row.d === row.r);
          if (row?.d && row.d !== "D" && !sameParty) dLabel = row.d;
        }
        route = () => (sameParty ? { ...plain, contested: false } : plain);
      }

      const sums = new Map<string, Sum>();
      votes.forEach(([d, r, o], i) => {
        const ps = parts!.get(i);
        if (!ps) return;
        const rt = route(i);
        const total = d + r + o;
        const v = { d, r, o };
        if (rt.postScale) { v.d = d * rt.postScale[0]; v.r = r * rt.postScale[1]; }
        if (rt.slate && d + r > 0) {
          const dBar = d / rt.slate[0], rBar = r / rt.slate[1];
          v.d = ((d + r) * dBar) / (dBar + rBar);
          v.r = d + r - v.d;
        }
        for (const p of ps) {
          const s = sums.get(p.key) ?? emptySum();
          const put = (into: Votes, to: To, x: number) => { const k = to === "d" ? "dem" : to === "r" ? "rep" : "oth"; into[k] += x * p.share; };
          put(s.all, rt.dTo, v.d); put(s.all, rt.rTo, v.r); put(s.all, "o", v.o);
          if (rt.contested) {
            put(s.contested, rt.dTo, v.d); put(s.contested, rt.rTo, v.r); put(s.contested, "o", v.o);
            if (rt.seat) s.seats.set(rt.seat, (s.seats.get(rt.seat) ?? 0) + total * p.share);
          } else if (total > 0) s.unc.push({ i, share: p.share });
          if (ps.length > 1) s.split += total * p.share;
          if (rt.firstChoice) s.firstChoice += total * p.share;
          s.weight += weight[i] * p.share;
          if (total > 0) s.weightWith += weight[i] * p.share;
          sums.set(p.key, s);
        }
      });

      // NH floterials: the sum of the base districts they sit on.
      for (const d of roster) {
        if (!d.overlay || !d.components?.length) continue;
        const s = emptySum();
        for (const c of d.components) {
          const b = sums.get(normalizeDistrictKey(c));
          if (!b) continue;
          for (const k of ["dem", "rep", "oth"] as const) { s.all[k] += b.all[k]; s.contested[k] += b.contested[k]; }
          s.split += b.split; s.weight += b.weight; s.weightWith += b.weightWith; s.firstChoice += b.firstChoice;
          s.unc.push(...b.unc);
          for (const [code, w] of b.seats) s.seats.set(code, (s.seats.get(code) ?? 0) + w);
        }
        if (s.weight > 0) sums.set(normalizeDistrictKey(d.number), s);
      }

      // The uncontested part's presidential margin: the same precincts and shares, nearest presidential year.
      const presYear = nearestPres(Number(year));
      const presVotes = presYear ? precinctFile(abbr, presYear)?.offices.PRES : undefined;

      for (const [key, s] of sums) {
        const total = s.all.dem + s.all.rep + s.all.oth;
        if (total <= 0) continue;
        const missing = s.weight > 0 ? 1 - s.weightWith / s.weight : 0;
        if (missing > MAX_MISSING) continue;
        const cTotal = s.contested.dem + s.contested.rep + s.contested.oth;
        let uncontestedPres: DistrictRaceRow["uncontestedPres"] = null;
        if (cTotal < total - 0.5 && presVotes) {
          const pv = zero();
          for (const { i, share } of s.unc) { const [d, r, o] = presVotes[i] ?? [0, 0, 0]; pv.dem += d * share; pv.rep += r * share; pv.oth += o * share; }
          if (pv.dem + pv.rep + pv.oth > 0) uncontestedPres = { year: Number(presYear), margin: round2(margin(pv)) };
        }
        const row: DistrictRaceRow = {
          year: Number(year), office,
          all: { dem: Math.round(s.all.dem), rep: Math.round(s.all.rep), oth: Math.round(s.all.oth) },
          contested: { dem: Math.round(s.contested.dem), rep: Math.round(s.contested.rep), oth: Math.round(s.contested.oth) },
          coverage: +(cTotal / total).toFixed(3),
          uncontestedPres,
          splitShare: +(s.split / total).toFixed(3),
          basis: labelled ? "votes" : "population",
          missing: +Math.max(0, missing).toFixed(3),
        };
        if (office === "L" && s.seats.size) {
          const w = [...s.seats.values()].reduce((a, b) => a + b, 0);
          row.seats = [...s.seats].map(([code, v]) => ({ code, share: +(v / w).toFixed(3) })).filter((x) => x.share >= 0.005).sort((a, b) => b.share - a.share);
        }
        if (dLabel) row.dLabel = dLabel;
        if (sameParty) row.sameParty = true;
        const note = NOTES[noteKey] ?? (s.firstChoice / total >= 0.005 ? "first choices (ranked choice)" : undefined);
        if (note) row.note = note;
        out.set(key, [...(out.get(key) ?? []), row]);
      }
    }
  }
  return out;
}

/** R − D margin of a vote split, points of all votes. */
export const voteMargin = margin;
