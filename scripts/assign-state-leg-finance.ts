/**
 * Places the state-portal fundraising records on their districts. The state campaign-finance
 * portals (scripts/fetch-state-leg-finance-{ut,...}.py) list every committee that filed in a cycle,
 * often with no district (Utah's CSV has the name only) or with an office code of their own, and
 * with primary losers, county candidates and statewide candidates mixed in. This script keeps the
 * records that belong to a GENERAL-election legislative candidate of that cycle and files each one
 * under the candidate's district, so the result has the FollowTheMoney shape the build reads.
 *
 *   npx tsx --conditions=react-server scripts/assign-state-leg-finance.ts [ST ...]
 *
 * Reads  data-entry/state-leg-finance/portal-raw/{ST}-{cycle}.json
 *          { state, cycle, source, dataThrough, candidates: [{ name, party?, chamber?, district?, contributions, expenditures? }] }
 * Writes data-entry/state-leg-finance/state/{ST}-{cycle}.json
 *          { state, cycle, source, dataThrough, house: { "<district>": [ {name, party, incumbent, contributions, expenditures} ] }, senate }
 *
 * Matching (lib/stateLegMoney.ts nameKeys): the candidate pool is that cycle's general-election
 * candidates (stateLegResults; the Ballotpedia 2026 field for the current cycle). A record with a
 * chamber + district looks inside that district first, where the surname alone may decide (also as a
 * word of a committee name); without
 * one, it needs a unique statewide hit on the full name, then first + last, then initial + surname
 * (same party when the record has one). Ambiguous and unmatched records are dropped and counted.
 * Two records on one candidate (a renamed committee) keep the larger figure, never the sum.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { stateLegResults } from "@/data/stateLegResults";
import { stateLegCandidates2026 } from "@/data/stateLegCandidates2026";
import { electionYear } from "@/data/forecastData";
import type { Chamber } from "@/data/stateLegDistricts";
import { nameKeys } from "@/lib/stateLegMoney";
import { normalizeDistrictKey } from "@/lib/stateLegDistrictKey";

const RAW = "data-entry/state-leg-finance/portal-raw";
const OUT = "data-entry/state-leg-finance/state";

type RawRecord = { name: string; party?: string | null; chamber?: Chamber | null; district?: string | null; contributions: number | null; expenditures?: number | null };
type Raw = { state: string; cycle: number; source: string; dataThrough: string | null; candidates: RawRecord[] };
type PoolEntry = { chamber: Chamber; district: string; name: string; party: "D" | "R" | "O"; incumbent: boolean; k: ReturnType<typeof nameKeys> };

const PARTY_LABEL = { D: "Democratic", R: "Republican", O: "Other" } as const;
const partyOf = (p: string | null | undefined): "D" | "R" | "O" | null => {
  const s = (p ?? "").toLowerCase();
  if (!s) return null;
  // Fusion labels ("Democratic/Progressive") count as their first party.
  const d = s.search(/\bdem/), r = s.search(/\brep/);
  if (d >= 0 && (r < 0 || d < r)) return "D";
  if (r >= 0) return "R";
  return "O";
};

/** "01" and "1" are the same district. */
const districtKey = (d: string) => normalizeDistrictKey(/^\d+$/.test(d.trim()) ? String(Number(d)) : d);

function pool(abbr: string, cycle: number): PoolEntry[] {
  const out: PoolEntry[] = [];
  for (const chamber of ["house", "senate"] as Chamber[]) {
    if (cycle === electionYear) {
      for (const [district, d] of Object.entries(stateLegCandidates2026[abbr]?.[chamber] ?? {})) {
        for (const c of d.candidates) if (!c.writeIn) out.push({ chamber, district, name: c.name, party: c.party, incumbent: !!c.incumbent, k: nameKeys(c.name) });
      }
      continue;
    }
    const block = stateLegResults[abbr]?.[String(cycle)]?.[chamber];
    for (const [district, d] of Object.entries(block?.districts ?? {})) {
      for (const c of d.candidates ?? []) if (c.votes == null || c.votes > 0) out.push({ chamber, district, name: c.name, party: c.party, incumbent: !!c.incumbent, k: nameKeys(c.name) });
    }
  }
  // A candidate on two ballot lines (or a write-in tally) appears twice in a district: keep one.
  const seen = new Set<string>();
  return out.filter((p) => {
    const key = `${p.chamber}:${p.district}:${p.k.full}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assign(file: string) {
  const raw: Raw = JSON.parse(readFileSync(`${RAW}/${file}`, "utf8"));
  const people = pool(raw.state, raw.cycle);
  if (people.length === 0) { console.log(`${raw.state} ${raw.cycle}: no general-election candidates on file, skipped`); return; }
  const byDistrict = new Map<string, PoolEntry[]>();
  for (const p of people) {
    const key = `${p.chamber}:${districtKey(p.district)}`;
    byDistrict.set(key, [...(byDistrict.get(key) ?? []), p]);
  }
  const hits = new Map<PoolEntry, RawRecord>();
  let ambiguous = 0, unmatched = 0;
  for (const r of raw.candidates) {
    const rk = nameKeys(r.name);
    const rp = partyOf(r.party);
    const partyOk = (p: PoolEntry) => !rp || rp === "O" || p.party === "O" || rp === p.party;
    let found: PoolEntry | null = null;
    let tie = false;
    const pick = (cands: PoolEntry[], k: keyof typeof rk) => {
      if (found || !rk[k]) return;
      const xs = cands.filter((p) => p.k[k] === rk[k] && (k === "full" || k === "loose" || k === "squash" || partyOk(p)));
      if (xs.length === 1) found = xs[0];
      else if (xs.length > 1) tie = true;
    };
    if (r.chamber && r.district) {
      const local = byDistrict.get(`${r.chamber}:${districtKey(String(r.district))}`) ?? [];
      for (const k of ["full", "loose", "squash", "initial", "last"] as const) pick(local, k);
      // A committee name ("Friends for Pete Schwartzkopf", "Smith for State Rep"): the one
      // candidate in the district whose surname is a word of it.
      if (!found && !tie) {
        const words = new Set(r.name.toLowerCase().normalize("NFKD").replace(/[^a-z\s-]/g, " ").split(/[\s-]+/));
        const xs = local.filter((p) => p.k.last.length > 2 && words.has(p.k.last) && partyOk(p));
        if (xs.length === 1) found = xs[0];
      }
    }
    if (!found) {
      const scope = r.chamber ? people.filter((p) => p.chamber === r.chamber) : people;
      tie = false;
      for (const k of ["full", "loose", "squash", "initial"] as const) pick(scope, k);
    }
    if (!found) { if (tie) ambiguous += 1; else unmatched += 1; continue; }
    const prev = hits.get(found);
    if (!prev || (r.contributions ?? -1) > (prev.contributions ?? -1)) hits.set(found, r);
  }
  const out: Record<string, unknown> = { state: raw.state, cycle: raw.cycle, source: raw.source, dataThrough: raw.dataThrough };
  for (const [p, r] of hits) {
    const ch = ((out[p.chamber] as Record<string, unknown[]>) ??= {});
    (ch[p.district] ??= []).push({ name: r.name, party: PARTY_LABEL[p.party], incumbent: p.incumbent, contributions: r.contributions, expenditures: r.expenditures ?? null });
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${file}`, JSON.stringify(out, null, 1));
  const covered = new Set([...hits.keys()].map((p) => `${p.chamber}:${p.district}`)).size;
  console.log(`${raw.state} ${raw.cycle}: ${hits.size}/${people.length} general-election candidates matched (${covered}/${byDistrict.size} districts); ${raw.candidates.length} records, ${unmatched} unmatched, ${ambiguous} ambiguous`);
}

const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()));
const files = existsSync(RAW) ? readdirSync(RAW).filter((f) => /^[A-Z]{2}-\d{4}\.json$/.test(f) && (only.size === 0 || only.has(f.slice(0, 2)))).sort() : [];
for (const f of files) assign(f);
