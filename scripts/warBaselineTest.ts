// WAR on its two baselines, side by side (2026-11-23).
//   lean      lean + trend + E(year): a prediction of where the state or district should have landed
//   own-year  the state's (district's) own vote that year with the race left out (the live baseline)
// Both tables score the same races (statewide through WAR_STATEWIDE_LAST_YEAR, House through 2025).
// The statewide section compares lean with own-year; the House section compares own-year-statewide
// (House still modelled) with own-year, so each section isolates one change.
//
// Three readings, none of which is a forecast test (WAR is graded after the fact):
//   repeat        a candidate's score in one race against their score in their next race. Candidate
//                 quality should carry over; noise in the baseline pushes this toward zero.
//   ticket-mates  two same-party candidates in different races, same state and year. Different
//                 people should not score alike; a state-wide swing booked as quality makes them.
//   spread        the size of the scores.
//
//   npx tsx --conditions=react-server scripts/warBaselineTest.ts [--list]
import { computeWarTable, warCandidateKey, type WarRow, type WarBaseline } from "@/lib/tplCompute";

const LIST = process.argv.includes("--list");
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v: number[]) => { const mu = mean(v); return Math.sqrt(mean(v.map((x) => (x - mu) ** 2))); };
const corr = (x: number[], y: number[]) => { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : " n/a");
const sg = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(1);
const id = (r: WarRow) => `${r.state}|${r.year}|${r.office}|${r.race}|${r.party}|${r.candidate}`;

const tables: Record<"lean" | "own-year", Map<string, WarRow>> = { lean: new Map(), "own-year": new Map() };
for (const b of ["lean", "own-year"] as const satisfies readonly WarBaseline[]) for (const r of computeWarTable(b)) if (r.office !== "H") tables[b].set(id(r), r);
const ids = [...tables.lean.keys()].filter((k) => tables["own-year"].has(k));
type Pair = { lean: WarRow; own: WarRow; key: string };
const rows: Pair[] = ids.map((k) => ({ lean: tables.lean.get(k)!, own: tables["own-year"].get(k)!, key: warCandidateKey(tables.lean.get(k)!.state, tables.lean.get(k)!.party, tables.lean.get(k)!.candidate) }));
console.log(`statewide candidate rows ${rows.length}  (2026: ${rows.filter((r) => r.own.year === 2026).length})  by office`, Object.fromEntries(["S", "G", "P"].map((o) => [o, rows.filter((r) => r.own.office === o).length])));

// ── The fallback: how much of each baseline is the state's own vote ──
const thin = rows.filter((r) => r.own.party === "R" || !rows.some((x) => x.own.party === "R" && x.own.state === r.own.state && x.own.year === r.own.year && x.own.race === r.own.race)).filter((r) => r.own.genericWeight < 1);
console.log(`\nraces not wholly on the state's own vote: ${thin.length}`);
for (const r of thin.sort((a, b) => a.own.year - b.own.year || a.own.state.localeCompare(b.own.state))) console.log(`  ${r.own.year} ${r.own.state} ${r.own.race.padEnd(15)} own-vote share ${(r.own.genericWeight * 100).toFixed(0).padStart(3)}%  ${r.own.note}`);

// ── Level by office and year: mean R-positive (actual − expected) over races ──
console.log("\nmean of actual − expected over races, R-positive (a standing office gap shows here)");
const races = rows.filter((r) => r.own.party === "R");
for (const o of ["S", "G", "P"]) for (const kind of ["presidential", "midterm", "odd"] as const) {
  const set = races.filter((r) => r.own.office === o && (kind === "presidential" ? r.own.year % 4 === 0 : kind === "midterm" ? r.own.year % 4 === 2 : r.own.year % 2 === 1));
  if (!set.length) continue;
  console.log(`  ${o} ${kind.padEnd(12)} n ${String(set.length).padStart(3)}  lean ${sg(mean(set.map((r) => r.lean.actual - r.lean.expected)))}  own-year ${sg(mean(set.map((r) => r.own.actual - r.own.expected)))}   by year: ${[...new Set(set.map((r) => r.own.year))].sort().map((y) => `${y} ${sg(mean(set.filter((r) => r.own.year === y).map((r) => r.lean.actual - r.lean.expected)))}/${sg(mean(set.filter((r) => r.own.year === y).map((r) => r.own.actual - r.own.expected)))}`).join("  ")}`);
}

// ── Scores: the signed residual (before the opponent split and the incumbency credit) ──
const centred = (b: "lean" | "own") => { const m = new Map<Pair, number>(); const groups = new Map<string, Pair[]>(); for (const r of rows) { const k = `${r.own.year}|${r.own.office}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); } for (const g of groups.values()) { const mu = mean(g.filter((r) => r.own.party === "R").map((r) => r[b].actual - r[b].expected)); for (const r of g) m.set(r, (r.own.party === "R" ? 1 : -1) * (r[b].actual - r[b].expected - (Number.isFinite(mu) ? mu : 0))); } return m; };
const res = { lean: centred("lean"), own: centred("own") };
const by = new Map<string, Pair[]>(); for (const r of rows) (by.get(r.key) ?? by.set(r.key, []).get(r.key)!).push(r);
const consecutive: [Pair, Pair][] = []; for (const v of by.values()) { v.sort((a, b) => a.own.year - b.own.year); for (let i = 1; i < v.length; i++) if (v[i].own.year !== v[i - 1].own.year) consecutive.push([v[i - 1], v[i]]); }
const trim = (ps: [Pair, Pair][]) => ps.filter(([a, b]) => [a, b].every((r) => Math.abs(res.lean.get(r)!) < 25 && Math.abs(res.own.get(r)!) < 25));
const line = (label: string, ps: [Pair, Pair][]) => console.log(`  ${label.padEnd(44)} n ${String(ps.length).padStart(4)}   lean ${f2(corr(ps.map(([a]) => res.lean.get(a)!), ps.map(([, b]) => res.lean.get(b)!)))}   own-year ${f2(corr(ps.map(([a]) => res.own.get(a)!), ps.map(([, b]) => res.own.get(b)!)))}`);
const SG = (ps: [Pair, Pair][]) => ps.filter(([a, b]) => a.own.office !== "P" && b.own.office !== "P");
console.log("\nrepeat: a candidate's score against their next race's (correlation; scores beyond ±25 trimmed)");
line("Senate + governor, all", trim(SG(consecutive)));
line("Senate + governor, second race through 2024", trim(SG(consecutive).filter(([, b]) => b.own.year <= 2025)));
line("Senate + governor, second race 2026", trim(SG(consecutive).filter(([, b]) => b.own.year === 2026)));
line("Senate + governor, untrimmed", SG(consecutive));
line("president (same candidate, same state)", trim(consecutive.filter(([a, b]) => a.own.office === "P" && b.own.office === "P")));
const mates: [Pair, Pair][] = []; { const g = new Map<string, Pair[]>(); for (const r of rows) { const k = `${r.own.state}|${r.own.year}|${r.own.party}`; (g.get(k) ?? g.set(k, []).get(k)!).push(r); } for (const v of g.values()) for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (v[i].own.race !== v[j].own.race) mates.push([v[i], v[j]]); }
console.log("\nticket-mates: same party, state and year, different races (correlation; lower = less shared swing booked as quality)");
line("Senate + governor, all years", SG(mates));
line("Senate + governor, 2026", SG(mates).filter(([a]) => a.own.year === 2026));
line("Senate + governor, through 2024", SG(mates).filter(([a]) => a.own.year <= 2025));
line("president with Senate or governor", mates.filter(([a, b]) => (a.own.office === "P") !== (b.own.office === "P")));
console.log("\nspread of scores (sd, pts)");
for (const [label, set] of [["Senate + governor, all", rows.filter((r) => r.own.office !== "P")], ["Senate + governor, 2026", rows.filter((r) => r.own.office !== "P" && r.own.year === 2026)], ["Senate + governor, through 2024", rows.filter((r) => r.own.office !== "P" && r.own.year <= 2025)], ["president", rows.filter((r) => r.own.office === "P")]] as const)
  console.log(`  ${label.padEnd(44)} n ${String(set.length).padStart(4)}   lean ${f2(sd(set.map((r) => res.lean.get(r)!)))}   own-year ${f2(sd(set.map((r) => res.own.get(r)!)))}`);

// ── What moved ──
const moved = rows.map((r) => ({ r, d: r.own.war - r.lean.war })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
const abs = moved.map((m) => Math.abs(m.d)).sort((a, b) => a - b);
console.log(`\nWAR change, own-year − lean: median |Δ| ${f2(abs[Math.floor(abs.length / 2)])}, 90th pct ${f2(abs[Math.floor(abs.length * 0.9)])}; rows moved > 2: ${abs.filter((x) => x > 2).length}, > 5: ${abs.filter((x) => x > 5).length}`);
for (const y of [2016, 2018, 2020, 2022, 2024, 2026]) { const a = moved.filter((m) => m.r.own.year === y).map((m) => Math.abs(m.d)).sort((x, z) => x - z); if (a.length) console.log(`  ${y}: n ${a.length} median |Δ| ${f2(a[Math.floor(a.length / 2)])}`); }
console.log("largest moves:");
for (const { r, d } of moved.slice(0, LIST ? 60 : 20)) console.log(`  ${r.own.year} ${r.own.state} ${r.own.office} ${r.own.candidate.padEnd(24)} WAR ${sg(r.lean.war).padStart(6)} → ${sg(r.own.war).padStart(6)}  (${sg(d)})  expected ${sg(r.lean.expected)} → ${sg(r.own.expected)}`);
console.log("\nTexas and Georgia 2026:");
for (const r of rows.filter((x) => x.own.year === 2026 && (x.own.state === "TX" || x.own.state === "GA"))) console.log(`  ${r.own.state} ${r.own.office} ${r.own.candidate.padEnd(22)} actual ${sg(r.own.actual)}  state's vote without the race ${r.own.generic == null ? "n/a" : sg(r.own.generic)}  expected ${sg(r.lean.expected)} → ${sg(r.own.expected)}  WAR ${sg(r.lean.war)} → ${sg(r.own.war)}`);

// ══ House ══════════════════════════════════════════════════════════════════════════════════════
// modelled = District TPL + trend + shift + E(year); own-year = the district's own vote that year
// without the House race (President, Senate, governor, both legislative chambers), moved by how
// the state's other House races ran against theirs. --no-others leaves that last term out.
{
  const mod = new Map(computeWarTable("own-year-statewide").filter((r) => r.office === "H").map((r) => [id(r), r]));
  const own = new Map(computeWarTable(process.argv.includes("--no-others") ? "own-year-no-others" : "own-year").filter((r) => r.office === "H").map((r) => [id(r), r]));
  type HP = { m: WarRow; o: WarRow; key: string };
  const hp: HP[] = [...mod.keys()].filter((k) => own.has(k)).map((k) => ({ m: mod.get(k)!, o: own.get(k)!, key: warCandidateKey(mod.get(k)!.state, mod.get(k)!.party, mod.get(k)!.candidate) }));
  const oneSide = hp.filter((r, i, a) => a.findIndex((x) => x.o.state === r.o.state && x.o.race === r.o.race && x.o.year === r.o.year) === i);
  console.log(`\n\n══ House ══  candidate rows ${hp.length}, races ${oneSide.length}`);
  console.log(`  races wholly on the district's own vote ${oneSide.filter((r) => r.o.genericWeight >= 1).length} · part ${oneSide.filter((r) => r.o.genericWeight > 0 && r.o.genericWeight < 1).length} · modelled baseline only ${oneSide.filter((r) => r.o.genericWeight === 0).length}`);
  for (const y of [2016, 2018, 2020, 2022, 2024]) { const v = oneSide.filter((r) => r.o.year === y); console.log(`    ${y}: ${v.length} races · whole ${v.filter((r) => r.o.genericWeight >= 1).length} · part ${v.filter((r) => r.o.genericWeight > 0 && r.o.genericWeight < 1).length} · none ${v.filter((r) => r.o.genericWeight === 0).length}`); }
  const cen = (b: "m" | "o") => { const out = new Map<HP, number>(); for (const y of new Set(hp.map((r) => r.o.year))) { const g = hp.filter((r) => r.o.year === y); const mu = mean(g.filter((r) => r.o.party === "R").map((r) => r[b].actual - r[b].expected)); for (const r of g) out.set(r, (r.o.party === "R" ? 1 : -1) * (r[b].actual - r[b].expected - mu)); } return out; };
  const sc = { m: cen("m"), o: cen("o") };
  const both = (label: string, ps: [HP, HP][]) => console.log(`  ${label.padEnd(50)} n ${String(ps.length).padStart(4)}   modelled ${f2(corr(ps.map(([a]) => sc.m.get(a)!), ps.map(([, b]) => sc.m.get(b)!)))}   own-year ${f2(corr(ps.map(([a]) => sc.o.get(a)!), ps.map(([, b]) => sc.o.get(b)!)))}`);
  const tr = (ps: [HP, HP][]) => ps.filter(([a, b]) => [a, b].every((r) => Math.abs(sc.m.get(r)!) < 25 && Math.abs(sc.o.get(r)!) < 25));
  const byC = new Map<string, HP[]>(); for (const r of hp) (byC.get(r.key) ?? byC.set(r.key, []).get(r.key)!).push(r);
  const cons: [HP, HP][] = []; for (const v of byC.values()) { v.sort((a, b) => a.o.year - b.o.year); for (let i = 1; i < v.length; i++) if (v[i].o.year !== v[i - 1].o.year) cons.push([v[i - 1], v[i]]); }
  console.log("repeat: a candidate's score against their next race's");
  both("all", tr(cons)); both("second race 2018 or 2020", tr(cons.filter(([, b]) => b.o.year <= 2020))); both("second race 2022 or 2024", tr(cons.filter(([, b]) => b.o.year >= 2022)));
  // The same seat on unchanged lines in consecutive elections, by how many of the two candidates
  // are the same people. With neither the same there is no candidate quality in common: what
  // still repeats is the district.
  console.log("same seat, same lines in both elections, consecutive, R-slot score (a pure-district repeat should be near zero)");
  const seat = new Map<string, HP[]>(); for (const r of hp) if (r.o.party === "R") (seat.get(r.o.seatId ?? r.o.race) ?? seat.set(r.o.seatId ?? r.o.race, []).get(r.o.seatId ?? r.o.race)!).push(r);
  const demOf = new Map<string, string>(); for (const r of hp) if (r.o.party !== "R") demOf.set(`${r.o.seatId}|${r.o.year}`, r.key);
  const cat: Record<string, [HP, HP][]> = { both: [], one: [], none: [] };
  for (const v of seat.values()) { v.sort((a, b) => a.o.year - b.o.year); for (let i = 1; i < v.length; i++) { const a = v[i - 1], b = v[i]; if (b.o.year - a.o.year !== 2 || a.o.linesFrom !== b.o.linesFrom) continue; const dA = demOf.get(`${a.o.seatId}|${a.o.year}`), dB = demOf.get(`${b.o.seatId}|${b.o.year}`); const n = (a.key === b.key ? 1 : 0) + (dA && dA === dB ? 1 : 0); cat[n === 2 ? "both" : n === 1 ? "one" : "none"].push([a, b]); } }
  both("rematch: both candidates the same", tr(cat.both)); both("one candidate the same", tr(cat.one)); both("NEITHER candidate the same", tr(cat.none));
  const whole = (ps: [HP, HP][]) => ps.filter(([a, b]) => a.o.genericWeight >= 1 && b.o.genericWeight >= 1);
  console.log("  the same, only where BOTH races are wholly on the district's own vote:");
  both("  rematch", tr(whole(cat.both))); both("  one candidate the same", tr(whole(cat.one))); both("  NEITHER candidate the same", tr(whole(cat.none)));
  both("  NEITHER, second race 2018 or 2020", tr(whole(cat.none).filter(([, b]) => b.o.year <= 2020))); both("  NEITHER, second race 2022 or 2024", tr(whole(cat.none).filter(([, b]) => b.o.year >= 2022)));
  both("repeat, both races wholly on the district's vote", tr(whole(cons)));
  const share = (b: "m" | "o") => { const g = new Map<string, HP[]>(); for (const r of hp) { const k = `${r.o.state}|${r.o.year}|${r.o.party}`; (g.get(k) ?? g.set(k, []).get(k)!).push(r); } let between = 0, n = 0; for (const v of g.values()) { if (v.length < 3) continue; const mu = mean(v.map((r) => sc[b].get(r)!)); between += v.length * mu * mu; n += v.length; } return between / n / mean(hp.map((r) => sc[b].get(r)! ** 2)); };
  console.log(`share of score variance that is a state-party-year average (3+ seats): modelled ${f2(share("m"))}   own-year ${f2(share("o"))}`);
  console.log("spread of scores (sd, pts) by year: " + [2016, 2018, 2020, 2022, 2024].map((y) => { const v = hp.filter((r) => r.o.year === y); return `${y} ${sd(v.map((r) => sc.m.get(r)!)).toFixed(1)} → ${sd(v.map((r) => sc.o.get(r)!)).toFixed(1)}`; }).join(" · "));
  const mv = hp.map((r) => ({ r, d: r.o.war - r.m.war })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)); const ab = mv.map((x) => Math.abs(x.d)).sort((a, b) => a - b);
  console.log(`WAR change: median |Δ| ${f2(ab[Math.floor(ab.length / 2)])}, 90th pct ${f2(ab[Math.floor(ab.length * 0.9)])}; rows moved > 2: ${ab.filter((x) => x > 2).length}, > 5: ${ab.filter((x) => x > 5).length}, > 10: ${ab.filter((x) => x > 10).length}; WAR old against new r ${f2(corr(hp.map((r) => r.m.war), hp.map((r) => r.o.war)))}`);
  console.log("largest moves:");
  for (const { r, d } of mv.slice(0, LIST ? 60 : 15)) console.log(`  ${r.o.year} ${(r.o.seatId ?? "").toUpperCase().padEnd(6)} ${r.o.candidate.padEnd(26)} WAR ${sg(r.m.war).padStart(6)} → ${sg(r.o.war).padStart(6)}  (${sg(d)})  expected ${sg(r.m.expected)} → ${sg(r.o.expected)}  actual ${sg(r.o.actual)}`);
}
