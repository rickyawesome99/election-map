// How a race's result is split between its two candidates (2026-11-24): the ridge the WAR table
// used against attribution by record (allocateByRecord), and the fit of its two constants.
//
// The yardstick is held out by construction: a candidate's RECORD in a race is built only from
// their other races, so record(R) − record(D) is a prediction of r that never saw r. A split rule
// that books surprises to the right candidate makes records that predict other races better.
//
//   npx tsx --conditions=react-server scripts/warAttributionTest.ts
import { allocateByRecord, computeWarTable, recencyDecayFor, solveCandidateEffects, warCandidateKey, WAR_LAMBDA, type EffectRace, type WarRow } from "@/lib/tplCompute";

const rows = computeWarTable();
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sg = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(1);
type Race = EffectRace & { label: string; names: { R?: string; D?: string } };
const byRace = new Map<string, Race>();
for (const r of rows) {
  const k = `${r.state}|${r.office}|${r.race}|${r.year}`;
  const rc = byRace.get(k) ?? byRace.set(k, { r: r.actual - r.expected, year: r.year, office: r.office, w: r.boundaryWeight ?? 1, label: `${r.year} ${r.state} ${r.office === "H" ? r.race.replace("House ", "") : r.office}`, names: {} }).get(k)!;
  const side = r.party === "R" ? "R" : "D";
  rc[side] = warCandidateKey(r.state, r.party, r.candidate); rc.names[side] = r.candidate;
  if (r.electedIncumbent) rc.inc = side;
}
const races = [...byRace.values()];
console.log(`races ${races.length}`);

// Truly held out: the race is REMOVED and its candidates' strengths in their other races are solved
// without it (inside the race's connected group of candidates, the only races that can change),
// then their records for the removed race are built from those. Leaving the race in would leak its
// result into the other races' strengths through the shared records.
const parent = new Map<string, string>();
const find = (x: string): string => { let p = parent.get(x) ?? x; if (p !== x) { p = find(p); parent.set(x, p); } return p; };
for (const rc of races) { if (rc.R && rc.D) parent.set(find(rc.R), find(rc.D)); for (const k of [rc.R, rc.D]) if (k && !parent.has(k)) parent.set(k, k); }
const groups = new Map<string, Race[]>();
for (const rc of races) { const g = find((rc.R ?? rc.D)!); (groups.get(g) ?? groups.set(g, []).get(g)!).push(rc); }
const wt = (other: Race, at: Race) => (other.w ?? 1) * recencyDecayFor(other.office) ** Math.abs(other.year - at.year);
function score(gamma: number, lambda: number, iota = 0) {
  const errs: { e: number; w: number; office: string }[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const rc of group) {
      const rest = group.filter((x) => x !== rc);
      const hasRecord = (k?: string) => !!k && rest.some((x) => x.R === k || x.D === k);
      if (!hasRecord(rc.R) && !hasRecord(rc.D)) continue;
      const al = allocateByRecord(rest, gamma, lambda, recencyDecayFor, iota);
      const recordOf = (k: string | undefined) => { if (!k) return 0; let num = 0, den = lambda; for (const x of rest) { const side = x.R === k ? "R" : x.D === k ? "D" : null; if (!side) continue; const w = wt(x, rc); num += w * al.get(x)![side]!.strength; den += w; } return num / den; };
      errs.push({ e: rc.r - (recordOf(rc.R) - recordOf(rc.D)), w: rc.w ?? 1, office: rc.office! });
    }
  }
  const mae = (v: typeof errs) => v.reduce((s, x) => s + x.w * Math.abs(x.e), 0) / v.reduce((s, x) => s + x.w, 0);
  const rmse = (v: typeof errs) => Math.sqrt(v.reduce((s, x) => s + x.w * Math.min(x.e * x.e, 900), 0) / v.reduce((s, x) => s + x.w, 0));
  return { n: errs.length, mae: mae(errs), rmse: rmse(errs), house: mae(errs.filter((x) => x.office === "H")), statewide: mae(errs.filter((x) => x.office !== "H")) };
}
{ const v = races.filter((rc) => { const g = groups.get(find((rc.R ?? rc.D)!))!; return g.length > 1; }); console.log(`mean |r| with no candidate information: ${(v.reduce((s, x) => s + (x.w ?? 1) * Math.abs(x.r), 0) / v.reduce((s, x) => s + (x.w ?? 1), 0)).toFixed(2)}; largest connected group ${Math.max(...[...groups.values()].map((g) => g.length))} races`); }
console.log("held-out error of record(R) − record(D) as a prediction of r (races where a candidate has a record)");
console.log("  gamma  lambda     n    MAE   RMSE(capped 30)  House  statewide");
console.log("  incumbent record ι (extra record weight of an elected incumbent), at λ 0.5:");
for (const gamma of [0.5, 1, 2]) for (const iota of [0, 1, 2, 4, 8]) { const s = score(gamma, 0.5, iota); console.log(`    γ ${gamma}  ι ${iota}   MAE ${s.mae.toFixed(3)}  House ${s.house.toFixed(3)}  statewide ${s.statewide.toFixed(3)}`); }
for (const lambda of [0.25, 0.5, 1, 2]) for (const gamma of [-1, 0, 0.5, 1, 2, 4]) { const s = score(gamma, lambda); console.log(`  ${String(gamma).padStart(5)}  ${String(lambda).padStart(5)}  ${String(s.n).padStart(5)}  ${s.mae.toFixed(3)}  ${s.rmse.toFixed(3)}          ${s.house.toFixed(3)}  ${s.statewide.toFixed(3)}`); }

// The same held-out test for the ridge the table used until 2026-11-24: effects solved as of the
// removed race's year from the rest of its group, with and without the heavy tail.
{
  const incumbents = new Set(rows.filter((r) => r.replacementPts !== 0).map((r) => warCandidateKey(r.state, r.party, r.candidate)));
  for (const [label, tail] of [["ridge (λ 1)", undefined], ["ridge with the heavy tail (τ 10 · 5 incumbents)", (c: string) => (incumbents.has(c) ? 5 : 10)]] as const) {
    let num = 0, den = 0, numS = 0, denS = 0, numH = 0, denH = 0, n = 0;
    for (const group of groups.values()) { if (group.length < 2) continue; for (const rc of group) { const rest = group.filter((x) => x !== rc); const has = (k?: string) => !!k && rest.some((x) => x.R === k || x.D === k); if (!has(rc.R) && !has(rc.D)) continue; const { a } = solveCandidateEffects(rest, rc.year, undefined, undefined, recencyDecayFor, tail as ((c: string) => number) | undefined); const e = Math.abs(rc.r - ((rc.R ? a.get(rc.R) ?? 0 : 0) - (rc.D ? a.get(rc.D) ?? 0 : 0))); const w = rc.w ?? 1; num += w * e; den += w; n += 1; if (rc.office === "H") { numH += w * e; denH += w; } else { numS += w * e; denS += w; } } }
    console.log(`  ${label.padEnd(48)} n ${n}  MAE ${(num / den).toFixed(3)}   House ${(numH / denH).toFixed(3)}  statewide ${(numS / denS).toFixed(3)}`);
  }
}

const G = Number(process.argv.find((a) => a.startsWith("--gamma="))?.split("=")[1] ?? 2);
const al = allocateByRecord(races, G, Number(process.argv.find((a) => a.startsWith("--lambda="))?.split("=")[1] ?? WAR_LAMBDA), recencyDecayFor, Number(process.argv.find((a) => a.startsWith("--iota="))?.split("=")[1] ?? 0));
const old = new Map(computeWarTable("own-year", "ridge").map((r) => [`${r.state}|${r.office}|${r.race}|${r.year}|${r.party === "R" ? "R" : "D"}`, r]));
console.log(`\nexamples at gamma ${G} (strength in the race, before the incumbency credit; in brackets: record from other races, share of the surprise) against the table's current WAR`);
const show = (f: (rc: Race) => boolean) => { for (const rc of races.filter(f).sort((a, b) => a.year - b.year)) { const a = al.get(rc)!; const part = (side: "R" | "D") => { const x = a[side]; if (!x) return ""; const k = [...byRace.entries()].find(([, v]) => v === rc)![0]; const o = old.get(`${k}|${side}`) as WarRow | undefined; return `${rc.names[side]} ${sg(x.strength)} [record ${sg(x.record)}, share ${(x.share * 100).toFixed(0)}%]  was WAR ${o ? sg(o.war - o.replacementPts) : "?"}${o && o.replacementPts ? ` +${o.replacementPts.toFixed(1)} incumbency` : ""}`; }; console.log(`  ${rc.label.padEnd(12)} r ${sg(rc.r).padStart(6)} | ${part("R")} | ${part("D")}`); } };
show((rc) => rc.label.includes("VT G"));
show((rc) => /SC S$/.test(rc.label) || (rc.names.R === "Lindsey Graham"));
show((rc) => rc.names.D === "Joe Manchin" || rc.names.R === "Susan Collins" || rc.names.R === "Larry Hogan" || rc.names.D === "Jon Tester");

// ── The table on both attributions ──
{
  const ridge = computeWarTable("own-year", "ridge"), rec = computeWarTable("own-year", "record");
  const idOf = (r: WarRow) => `${r.state}|${r.office}|${r.race}|${r.year}|${r.party}|${r.candidate}`;
  const R = new Map(ridge.map((r) => [idOf(r), r]));
  const d = rec.filter((r) => R.has(idOf(r))).map((r) => ({ r, o: R.get(idOf(r))!, d: r.war - R.get(idOf(r))!.war }));
  const abs = d.map((x) => Math.abs(x.d)).sort((a, b) => a - b);
  const corr = (x: number[], y: number[]) => { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
  console.log(`\nWAR, ridge → by record: rows ${d.length}; median |Δ| ${abs[Math.floor(abs.length / 2)].toFixed(2)}, 90th pct ${abs[Math.floor(abs.length * 0.9)].toFixed(2)}; moved > 2: ${abs.filter((x) => x > 2).length}, > 5: ${abs.filter((x) => x > 5).length}, > 10: ${abs.filter((x) => x > 10).length}; r ${corr(d.map((x) => x.o.war), d.map((x) => x.r.war)).toFixed(3)}`);
  const pairsOf = (t: WarRow[]) => { const m = new Map<string, WarRow[]>(); for (const r of t) { const k = `${r.state}|${r.office}|${r.race}|${r.year}`; (m.get(k) ?? m.set(k, []).get(k)!).push(r); } return [...m.values()].filter((v) => v.length === 2); };
  for (const [label, t] of [["ridge", ridge], ["by record", rec]] as const) { const p = pairsOf(t); console.log(`  ${label.padEnd(10)} races where both candidates are above +5: ${p.filter((v) => v[0].war > 5 && v[1].war > 5).length} · both below −5: ${p.filter((v) => v[0].war < -5 && v[1].war < -5).length} · mean of the two WARs' sum minus the incumbency credit: ${mean(p.map((v) => v[0].war + v[1].war - v[0].replacementPts - v[1].replacementPts)).toFixed(2)} (sd ${Math.sqrt(mean(p.map((v) => (v[0].war + v[1].war - v[0].replacementPts - v[1].replacementPts) ** 2))).toFixed(2)})`); }
  console.log("largest moves:");
  for (const x of d.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 16)) console.log(`  ${x.r.year} ${x.r.state} ${x.r.office} ${x.r.candidate.padEnd(24)} WAR ${sg(x.o.war).padStart(6)} → ${sg(x.r.war).padStart(6)}   (ran ${sg(x.r.residual)} against Expected; record ${sg(x.r.record ?? 0)}, opponent ${sg(x.r.opponentEffect)})`);
  console.log("highest and lowest, by record (House, Senate, governor):");
  const db = rec.filter((r) => r.office !== "P");
  for (const r of [...db.slice(0, 8), ...db.slice(-6)]) console.log(`  ${r.year} ${r.state} ${r.office} ${r.candidate.padEnd(24)} WAR ${sg(r.war).padStart(6)}  was ${sg(R.get(idOf(r))?.war ?? NaN)}`);
  for (const [st, off, y] of [["VT", "G", 2026], ["SC", "S", 2026], ["TX", "S", 2026], ["GA", "S", 2026]] as const) for (const r of rec.filter((x) => x.state === st && x.office === off && x.year === y)) console.log(`  ${y} ${st} ${off} ${r.candidate.padEnd(22)} actual ${sg(r.actual)} expected ${sg(r.expected)} vs opp ${sg(r.expectedVsOpponent)} | record ${sg(r.record ?? 0)} rating ${sg(r.effect)} opponent ${sg(r.opponentEffect)} incumb ${sg(r.replacementPts)} | WAR ${sg(r.war)}  was ${sg(R.get(idOf(r))?.war ?? NaN)}`);
}
