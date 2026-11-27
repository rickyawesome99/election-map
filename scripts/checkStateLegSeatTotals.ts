/**
 * Each precinct file's legislative seat totals against the site's certified seat results, through the same seat
 * resolver the model uses (lib/stateLegDistrictRows.ts resolveSiteSeats): seats more than 10% (and 300 votes) off,
 * and seat codes with no site seat. Seats elected by position (WA, ID) are compared per position against the whole
 * district, so they read "off" by about half; that is expected.
 *
 *   npx tsx --conditions=react-server scripts/checkStateLegSeatTotals.ts
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { stateLegResults } from "../data/stateLegResults";
import { resolveSiteSeats } from "../lib/stateLegDistrictRows";
type F = { offices: Record<string, [number, number, number][]>; districts: Record<string, string[]>; split?: Record<string, [number, string, number, number, number][]> };
const cov = JSON.parse(readFileSync("data/precincts/coverage.json", "utf8")).states;
const groups: Record<string, { n: number; off: number; unmatched: number; votesUnmatched: number; votesAll: number; ex: string[] }> = {};
for (const st of Object.keys(cov).sort()) for (const y of Object.keys(cov[st].years).sort()) {
  const p = join("public/precincts/results", st, `${y}.json`);
  if (!existsSync(p)) continue;
  const f = JSON.parse(readFileSync(p, "utf8")) as F;
  for (const [off, ch] of [["SLDU", "senate"], ["SLDL", "house"]] as const) {
    if (!["reconciled", "explained"].includes(cov[st].years[y][off]?.status) || !f.offices[off]) continue;
    const sd = (stateLegResults as any)[st]?.[y]?.[ch]?.districts as Record<string, { demVotes: number; repVotes: number }> | undefined;
    if (!sd) continue;
    const t = new Map<string, [number, number]>();
    const add = (c: string, d: number, r: number) => { const a = t.get(c) ?? [0, 0]; a[0] += d; a[1] += r; t.set(c, a); };
    const sp = new Map<number, [string, number, number][]>();
    for (const [i, c, d, r] of f.split?.[off] ?? []) sp.set(i, [...(sp.get(i) ?? []), [c, d, r]]);
    const lab = f.districts[off] ?? [];
    f.offices[off].forEach(([d, r], i) => { const s = sp.get(i); if (s) for (const [c, a, b] of s) add(c, a, b); else add(lab[i] ?? "", d, r); });
    const codes = new Map([...t].filter(([c]) => c).map(([c, [d, r]]) => [c, { d, r }]));
    const res = resolveSiteSeats(st, ch, codes, sd);
    const look = (c: string) => { const k = res.get(c); return k ? { key: k, row: sd[k] } : undefined; };
    const g = groups[`${st} ${y} ${off}`] ??= { n: 0, off: 0, unmatched: 0, votesUnmatched: 0, votesAll: 0, ex: [] };
    for (const [code, [d, r]] of t) {
      g.votesAll += d + r;
      if (!code) { g.votesUnmatched += d + r; continue; }
      const s = look(code);
      g.n++;
      if (!s) { g.unmatched++; g.votesUnmatched += d + r; if (g.ex.length < 3) g.ex.push(`no site seat for "${code}"`); continue; }
      const bad = [[d, s.row.demVotes], [r, s.row.repVotes]].some(([got, want]) => Math.abs(got - want) > Math.max(300, 0.1 * Math.max(want, 1)));
      if (bad) { g.off++; if (g.ex.length < 3) g.ex.push(`${code}: file D ${d} R ${r} | site ${s.key} D ${s.row.demVotes} R ${s.row.repVotes}`); }
    }
  }
}
const rows = Object.entries(groups).filter(([, g]) => g.off + g.unmatched > 0);
const tot = Object.values(groups).reduce((a, g) => [a[0] + g.n, a[1] + g.off, a[2] + g.unmatched], [0, 0, 0]);
console.log(`seats ${tot[0]}: off by >10% ${tot[1]}, no site seat ${tot[2]}`);
for (const [k, g] of rows.sort((a, b) => (b[1].off + b[1].unmatched) / b[1].n - (a[1].off + a[1].unmatched) / a[1].n).slice(0, 40))
  console.log(`  ${k}: off ${g.off}/${g.n}, unmatched ${g.unmatched} (${((100 * g.votesUnmatched) / g.votesAll).toFixed(0)}% votes) e.g. ${g.ex.join(" | ")}`);
