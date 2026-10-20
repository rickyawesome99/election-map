import "server-only";

import { stateLegFinance, type StateLegFinanceCandidate } from "@/data/stateLegFinance";
import { stateLegResults } from "@/data/stateLegResults";
import { stateLegCandidates2026 } from "@/data/stateLegCandidates2026";
import { electionYear } from "@/data/forecastData";
import type { Chamber } from "@/data/stateLegDistricts";
import { indexByNormalizedKey, lookupByDistrictCode } from "@/lib/stateLegDistrictKey";

/**
 * The money behind a state legislative race: each general-election candidate's cycle contributions
 * from data/stateLegFinance.ts, joined to the atlas's own candidate list for that district and
 * year (the 2026 field, or the result's candidates), and reduced to the two-party money gap the
 * forecast's money term uses: gap% = (R − D) / (R + D) × 100 over the Democratic and Republican
 * candidates' contributions.
 *
 * The join is by name: exact slug first, then first+last tokens (sources differ on middle names
 * and nicknames: TU "John Noah Spinner" is Ballotpedia's "J. Noah Spinner"), then surname alone
 * when it is unique within the party on both sides. A finance record that matches nobody is kept
 * as unmatched so the page can still show it; a candidate with no record has `contributions`
 * null, never zero — the filings may simply not be in the source yet.
 */

export type StateLegMoneyCandidate = {
  name: string;
  party: "D" | "R" | "O";
  /** The source's spelling, where it differs. */
  sourceName?: string;
  incumbent: boolean;
  contributions: number | null;
  expenditures: number | null;
  matched: boolean;
};

export type StateLegMoney = {
  year: number;
  source: string;
  dataThrough: string | null;
  candidates: StateLegMoneyCandidate[];
  /** Finance records that match no candidate on the atlas's list (a primary loser, a withdrawn filer). */
  unmatched: StateLegFinanceCandidate[];
  demTotal: number | null;
  repTotal: number | null;
  /** (R − D) / (R + D) × 100, or null unless both sides have a figure and together raised anything. */
  gapPct: number | null;
};

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const NICK: Record<string, string> = { bill: "william", will: "william", billy: "william", bob: "robert", rob: "robert", bobby: "robert", dick: "richard", rick: "richard", rich: "richard", jim: "james", jimmy: "james", mike: "michael", tom: "thomas", tommy: "thomas", dan: "daniel", danny: "daniel", dave: "david", joe: "joseph", joey: "joseph", chris: "christopher", steve: "steven", ed: "edward", eddie: "edward", ted: "edward", tony: "anthony", andy: "andrew", drew: "andrew", matt: "matthew", nick: "nicholas", ben: "benjamin", sam: "samuel", pat: "patrick", jack: "john", jon: "jonathan", ron: "ronald", don: "donald", ken: "kenneth", kenny: "kenneth", larry: "lawrence", jeff: "jeffrey", greg: "gregory", doug: "douglas", tim: "timothy", pete: "peter", frank: "francis", liz: "elizabeth", beth: "elizabeth", betsy: "elizabeth", kate: "katherine", kathy: "katherine", katie: "katherine", peggy: "margaret", sue: "susan", susie: "susan", debbie: "deborah", deb: "deborah", jen: "jennifer", jenny: "jennifer", becky: "rebecca", vicki: "victoria", chuck: "charles", charlie: "charles", al: "albert", fred: "frederick", gene: "eugene", hank: "henry", jerry: "gerald", ray: "raymond", russ: "russell", terry: "terrence", walt: "walter", abe: "abraham", alex: "alexander", maggie: "margaret", meg: "margaret", nate: "nathan", max: "maxwell", cathy: "catherine", trish: "patricia", patty: "patricia", kim: "kimberly", sandy: "sandra", mandy: "amanda", mel: "melissa", missy: "melissa", gabe: "gabriel", zach: "zachary", josh: "joshua", jake: "jacob", ike: "isaac", lou: "louis", vince: "vincent", wes: "wesley", phil: "philip", leo: "leonard", lenny: "leonard" };

function tokens(name: string): string[] {
  // FollowTheMoney writes "STEPHENS, JASON": put the surname back at the end.
  if (name.includes(",")) { const [last, rest] = name.split(",", 2); name = `${rest} ${last}`; }
  const s = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)|".*?"|'.*?'/g, " ").replace(/[^A-Za-z\s-]/g, " ").toLowerCase();
  return s.split(/[\s-]+/).filter((t) => t && !SUFFIXES.has(t));
}
const canon = (t: string) => NICK[t] ?? t;
/** The name keys the join compares, loosest last (also used by scripts/assign-state-leg-finance.ts). */
export function nameKeys(name: string): { full: string; loose: string; squash: string; last: string; initial: string } {
  const t = tokens(name);
  if (t.length === 0) return { full: "", loose: "", squash: "", last: "", initial: "" };
  const first = canon(t[0].length === 1 && t.length > 2 ? t[1] : t[0]);
  const last = t[t.length - 1];
  // "Dailey-Provost" vs a results file's "Daileyprovost": the surname parts run together.
  const squash = `${first} ${t.slice(1).filter((x) => x.length > 1 && canon(x) !== first).join("")}`;
  return { full: t.map(canon).join(" "), loose: `${first} ${last}`, squash, last, initial: `${first[0]} ${last}` };
}

type Target = { name: string; party: "D" | "R" | "O"; incumbent: boolean };

function match(targets: Target[], records: StateLegFinanceCandidate[]): { pairs: Map<number, number>; unmatched: StateLegFinanceCandidate[] } {
  const tk = targets.map((t) => nameKeys(t.name));
  const rk = records.map((r) => nameKeys(r.name));
  const pairs = new Map<number, number>();
  const used = new Set<number>();
  // A state-portal record the assign step already matched carries the atlas name it matched.
  targets.forEach((t, i) => {
    const hits = records.map((r, j) => j).filter((j) => !used.has(j) && records[j].candidate === t.name);
    if (hits.length === 1) { pairs.set(i, hits[0]); used.add(hits[0]); }
  });
  const tryKey = (k: keyof ReturnType<typeof nameKeys>, sameParty: boolean) => {
    targets.forEach((t, i) => {
      if (pairs.has(i) || !tk[i][k]) return;
      const hits = records.map((r, j) => j).filter((j) => !used.has(j) && rk[j][k] === tk[i][k] && (!sameParty || records[j].party === t.party || records[j].party === "O" || t.party === "O"));
      if (hits.length === 1) { pairs.set(i, hits[0]); used.add(hits[0]); }
    });
  };
  tryKey("full", false);
  tryKey("loose", false);
  tryKey("squash", false);
  tryKey("initial", true);
  tryKey("last", true);
  return { pairs, unmatched: records.filter((_, j) => !used.has(j)) };
}

const _cache = new Map<string, StateLegMoney | null>();

/** The atlas's candidate list for a district and year: the 2026 field, or the result's names. */
function targetsFor(abbr: string, chamber: Chamber, key: string, year: number): Target[] | null {
  if (year === electionYear) {
    const field = stateLegCandidates2026[abbr]?.[chamber]?.[key];
    return field ? field.candidates.filter((c) => !c.writeIn).map((c) => ({ name: c.name, party: c.party, incumbent: !!c.incumbent })) : null;
  }
  const block = stateLegResults[abbr]?.[String(year)]?.[chamber];
  if (!block) return null;
  const row = lookupByDistrictCode(indexByNormalizedKey(block.districts), abbr, chamber, key);
  return row?.candidates ? row.candidates.filter((c) => c.votes == null || c.votes > 0).map((c) => ({ name: c.name, party: c.party, incumbent: !!c.incumbent })) : null;
}

export function stateLegMoney(abbr: string, chamber: Chamber, key: string, year: number): StateLegMoney | null {
  const cacheKey = `${abbr}:${chamber}:${key}:${year}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey)!;
  const fin = stateLegFinance[abbr]?.[String(year)]?.[chamber];
  const district = fin ? lookupByDistrictCode(indexByNormalizedKey(fin), abbr, chamber, key) : undefined;
  if (!district) { _cache.set(cacheKey, null); return null; }
  const targets = targetsFor(abbr, chamber, key, year) ?? [];
  const { pairs, unmatched } = match(targets, district.candidates);
  const candidates: StateLegMoneyCandidate[] = targets.map((t, i) => {
    const j = pairs.get(i);
    const r = j == null ? null : district.candidates[j];
    return { name: t.name, party: t.party, sourceName: r && r.name !== t.name ? r.name : undefined, incumbent: t.incumbent || !!r?.incumbent, contributions: r?.contributions ?? null, expenditures: r?.expenditures ?? null, matched: r != null };
  });
  // With no atlas list at all, the source's own list stands in.
  if (targets.length === 0) for (const r of district.candidates) candidates.push({ name: r.name, party: r.party, incumbent: r.incumbent, contributions: r.contributions, expenditures: r.expenditures, matched: true });
  const side = (p: "D" | "R") => {
    const xs = candidates.filter((c) => c.party === p && (targets.length === 0 || c.matched));
    if (xs.length === 0 || xs.some((c) => c.contributions == null)) return null;
    return xs.reduce((s, c) => s + (c.contributions ?? 0), 0);
  };
  const demTotal = side("D"), repTotal = side("R");
  const gapPct = demTotal != null && repTotal != null && demTotal + repTotal > 0 ? ((repTotal - demTotal) / (repTotal + demTotal)) * 100 : null;
  const out: StateLegMoney = { year, source: district.source, dataThrough: district.dataThrough, candidates, unmatched: targets.length === 0 ? [] : unmatched, demTotal, repTotal, gapPct };
  _cache.set(cacheKey, out);
  return out;
}

/** Every cycle with money on file for a district, newest first. */
export function stateLegMoneyHistory(abbr: string, chamber: Chamber, key: string): StateLegMoney[] {
  const years = Object.keys(stateLegFinance[abbr] ?? {}).map(Number).sort((a, b) => b - a);
  return years.map((y) => stateLegMoney(abbr, chamber, key, y)).filter((m): m is StateLegMoney => m != null);
}

/** Coverage summary for the methodology tab and the audit page. */
export function stateLegMoneyCoverage(): { states: number; chamberCycles: number; districts: number; candidates: number; matched: number; byCycle: Record<string, { districts: number; matched: number; candidates: number }> } {
  let chamberCycles = 0, districts = 0, candidates = 0, matched = 0;
  const byCycle: Record<string, { districts: number; matched: number; candidates: number }> = {};
  for (const [abbr, cycles] of Object.entries(stateLegFinance)) {
    for (const [cycle, chambers] of Object.entries(cycles)) {
      for (const [chamber, block] of Object.entries(chambers)) {
        if (!block) continue;
        chamberCycles += 1;
        for (const key of Object.keys(block)) {
          const m = stateLegMoney(abbr, chamber as Chamber, key, Number(cycle));
          if (!m) continue;
          districts += 1;
          const bc = (byCycle[cycle] ??= { districts: 0, matched: 0, candidates: 0 });
          bc.districts += 1;
          for (const c of m.candidates) { candidates += 1; bc.candidates += 1; if (c.matched) { matched += 1; bc.matched += 1; } }
        }
      }
    }
  }
  return { states: Object.keys(stateLegFinance).length, chamberCycles, districts, candidates, matched, byCycle };
}
