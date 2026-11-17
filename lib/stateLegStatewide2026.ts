import "server-only";
/**
 * How each state-legislative district voted in the 2026 statewide races (US Senate, Governor),
 * summed from the 2026 precinct returns (public/precincts/results/{ST}/2026.json, written by
 * scripts/precincts/build_results_medsl.py). Each precinct carries the district its own legislative
 * race was counted in; a precinct split between districts hands its statewide votes to each part in
 * proportion to that part's legislative votes (the file's `split` block), so those votes are estimates.
 *
 * Display only: the atlas lists these as rows under the structural lean, and they are NOT part of
 * the lean (lib/stateLegForecast.ts never reads them).
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Chamber } from "../data/stateLegDistricts";
import { normalizeDistrictKey } from "./stateLegDistrictKey";

export type StatewideOffice2026 = "USS" | "GOV";
export type StatewideDistrictVote2026 = {
  office: StatewideOffice2026;
  dem: number;
  rep: number;
  oth: number;
  /** R − D, points of all votes cast (the presidential rows' convention). */
  margin: number;
  /** Share of the district's votes handed over from precincts split with another district. */
  splitShare: number;
  /** How split precincts divide: by the legislative race's votes, or (chamber not on the ballot) by 2020 population. */
  basis: "votes" | "population";
};

type PrecinctFile = {
  offices: Record<string, [number, number, number][]>;
  districts: Record<string, string[]>;
  split?: Record<string, [number, string, number, number, number][]>;
};
type Coverage = { states: Record<string, { years: Record<string, Record<string, { status?: string }>> }> };

const OFFICES: StatewideOffice2026[] = ["USS", "GOV"];
/** States shown so far (user, 2026-11-16: South Carolina's House). AZ, GA, ID, MN and NC have files that would also work. */
const STATES = new Set(["SC"]);

/** A precinct file's district label ("011", "10A") as the atlas key ("11"; Idaho's "10A" → "10"). */
function toKey(code: string, keys: Set<string>): string | null {
  const p = normalizeDistrictKey(code).replace(/^0+(?=\d)/, "");
  if (!p) return null;
  if (keys.has(p)) return p;
  const bare = p.replace(/[a-z]$/, "");
  return keys.has(bare) ? bare : null;
}

let coverage: Coverage | null = null;

/** Every district's 2026 Senate / Governor vote, keyed by atlas district key (normalized). Empty where there is no file. */
export function statewideByDistrict2026(abbr: string, chamber: Chamber, districtKeys: string[]): Map<string, StatewideDistrictVote2026[]> {
  const out = new Map<string, StatewideDistrictVote2026[]>();
  const path = join(process.cwd(), "public", "precincts", "results", abbr, "2026.json");
  if (!STATES.has(abbr) || !existsSync(path)) return out;
  coverage ??= JSON.parse(readFileSync(join(process.cwd(), "data", "precincts", "coverage.json"), "utf8")) as Coverage;
  const legOffice = chamber === "house" ? "SLDL" : "SLDU";
  const cov = coverage.states[abbr]?.years["2026"] ?? {};
  const file = JSON.parse(readFileSync(path, "utf8")) as PrecinctFile;
  const keys = new Set(districtKeys.map(normalizeDistrictKey));
  const labels = file.districts[legOffice] ?? [];

  // How each precinct divides among districts. A precinct whose legislative race was counted in two
  // districts splits by each part's legislative votes (the file's `split` block); the rest sit in their
  // labelled district. That needs the legislative count to agree with the official totals. A chamber not
  // on this ballot has no labels: precincts divide by 2020 block population instead
  // (data-entry/precincts/district-shares/, scripts/precincts/build_district_shares.py).
  const parts = new Map<number, { key: string; share: number }[]>();
  const sharesPath = join(process.cwd(), "data-entry", "precincts", "district-shares", `${abbr}-${chamber}.json`);
  const labelled = labels.length > 0 && cov[legOffice]?.status === "reconciled";
  if (labelled) {
    const byPrecinct = new Map<number, { key: string; votes: number }[]>();
    for (const [i, code, d, r, o] of file.split?.[legOffice] ?? []) {
      const key = toKey(code, keys);
      if (!key) continue;
      byPrecinct.set(i, [...(byPrecinct.get(i) ?? []), { key, votes: d + r + o }]);
    }
    for (const [i, ps] of byPrecinct) {
      const total = ps.reduce((s, p) => s + p.votes, 0);
      if (total > 0) parts.set(i, ps.map((p) => ({ key: p.key, share: p.votes / total })));
    }
  } else if (labels.length === 0 && existsSync(sharesPath)) {
    const shares = (JSON.parse(readFileSync(sharesPath, "utf8")) as { shares: Record<string, [string, number][]> }).shares;
    for (const [i, ps] of Object.entries(shares)) {
      const mine = ps.map(([code, share]) => ({ key: toKey(code, keys), share })).filter((p): p is { key: string; share: number } => p.key != null);
      if (mine.length) parts.set(Number(i), mine);
    }
  } else return out;

  for (const office of OFFICES) {
    const votes = file.offices[office];
    if (!votes || cov[office]?.status !== "reconciled") continue;
    const sums = new Map<string, { d: number; r: number; o: number; split: number }>();
    const add = (key: string, d: number, r: number, o: number, split: boolean) => {
      const s = sums.get(key) ?? { d: 0, r: 0, o: 0, split: 0 };
      s.d += d; s.r += r; s.o += o;
      if (split) s.split += d + r + o;
      sums.set(key, s);
    };
    votes.forEach(([d, r, o], i) => {
      const split = parts.get(i);
      if (split) { for (const p of split) add(p.key, d * p.share, r * p.share, o * p.share, split.length > 1); return; }
      const key = toKey(labels[i] ?? "", keys);
      if (key) add(key, d, r, o, false);
    });
    for (const [key, s] of sums) {
      const total = s.d + s.r + s.o;
      if (total <= 0) continue;
      out.set(key, [...(out.get(key) ?? []), {
        office,
        dem: Math.round(s.d), rep: Math.round(s.r), oth: Math.round(s.o),
        margin: +(((s.r - s.d) / total) * 100).toFixed(2),
        splitShare: +(s.split / total).toFixed(3),
        basis: labelled ? "votes" : "population",
      }]);
    }
  }
  return out;
}
