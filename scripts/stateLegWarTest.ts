// Legislative WAR (lib/stateLegWar.ts): coverage, sanity checks, the credit-split check, the same-name
// audit and the crossover test against the federal table.
//
//   npx tsx --conditions=react-server scripts/stateLegWarTest.ts [--names] [--list] [--emit]
//
//   --names  every candidate page whose races belong to more than one person, with each person's seats
//   --list   the crossover candidates, one per line
//   --emit   write data/stateLegWarSummary.ts, which the Methodology tabs read (re-run after any change
//            to the model or its inputs)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeLegWarTable, sharedNamePages, LEG_WAR, type LegWarRow } from "../lib/stateLegWar";
import { computeWarTable, WAR_CROSS_K } from "../lib/tplCompute";
import { findStateLegCandidate } from "../lib/stateLegCandidateIndex";
import { statesData } from "../data/statesData";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const corr = (xs: number[], ys: number[]) => { const n = xs.length; if (n < 3) return NaN; const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
const slope = (xs: number[], ys: number[]) => { const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0; for (let i = 0; i < xs.length; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; } return sxy / sxx; };
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "—");
const r2 = (x: number) => Math.round(x * 100) / 100;
const pair = (xs: number[], ys: number[]) => ({ n: xs.length, r: r2(corr(xs, ys)), slope: r2(slope(xs, ys)) });

const t0 = Date.now();
const rows = computeLegWarTable();
const people = new Set(rows.map((r) => r.person)).size;
console.log(`${rows.length} candidate rows, ${rows.length / 2} races, ${people} people (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

// ── Coverage by year ──────────────────────────────────────────────────────────
const years = [...new Set(rows.map((r) => r.year))].sort();
const byYear = years.map((year) => {
  const rs = rows.filter((r) => r.year === year && r.party === "R");
  const b = (k: string) => rs.filter((r) => r.basis === k).length;
  return { year, races: rs.length, ownYear: b("own-year"), blend: b("blend"), modelled: b("modelled"), residualSd: r2(sd(rs.map((r) => r.residual))), medianAbsWar: r2(med(rows.filter((r) => r.year === year).map((r) => Math.abs(r.war)))) };
});
console.log("\nyear   races  own-year  blend  modelled   sd(resid)  med|WAR|");
for (const y of byYear) console.log(y.year, String(y.races).padStart(6), String(y.ownYear).padStart(8), String(y.blend).padStart(6), String(y.modelled).padStart(8), f(y.residualSd).padStart(10), f(y.medianAbsWar).padStart(8));
const notes = new Map<string, number>();
for (const r of rows) if (r.party === "R" && r.basis === "modelled") notes.set(r.note, (notes.get(r.note) ?? 0) + 1);
const whyModelled = [...notes].sort((a, b) => b[1] - a[1]).map(([note, n]) => ({ note, n }));
console.log("\nwhy modelled:", whyModelled.map((x) => `${x.n} ${x.note}`).join(" · "));

// ── Does a score repeat, and how much of that is the seat? ───────────────────
const byPerson = new Map<string, LegWarRow[]>();
for (const r of rows) byPerson.set(r.person, [...(byPerson.get(r.person) ?? []), r]);
const consecutive: [LegWarRow, LegWarRow][] = [];
for (const list of byPerson.values()) { list.sort((a, b) => a.year - b.year); for (let i = 1; i < list.length; i += 1) consecutive.push([list[i - 1], list[i]]); }
const repeat = pair(consecutive.map((p) => p[0].residual), consecutive.map((p) => p[1].residual));
const racesPerPerson = [...byPerson.values()].map((l) => l.length);
// The same seat on the same map in consecutive elections: with neither candidate the same, whatever
// repeats is the seat (a baseline that misses it), not a person.
const bySeat = new Map<string, LegWarRow[]>();
for (const r of rows) if (r.party === "R") bySeat.set(`${r.state}|${r.chamber}|${r.district}`, [...(bySeat.get(`${r.state}|${r.chamber}|${r.district}`) ?? []), r]);
const neither: [number, number][] = [], rematch: [number, number][] = [];
for (const list of bySeat.values()) {
  list.sort((a, b) => a.year - b.year);
  for (let i = 1; i < list.length; i += 1) {
    const a = list[i - 1], b = list[i];
    if (b.year - a.year > 4) continue;
    const sameR = a.person === b.person, sameD = a.opponent!.name === b.opponent!.name;
    const x: [number, number] = [a.actual - a.expected, b.actual - b.expected];
    if (!sameR && !sameD) neither.push(x); else if (sameR && sameD) rematch.push(x);
  }
}
const sameSeat = { neither: pair(neither.map((p) => p[0]), neither.map((p) => p[1])), rematch: pair(rematch.map((p) => p[0]), rematch.map((p) => p[1])) };
console.log(`\nrepeat candidates: ${repeat.n} consecutive pairs · residual r ${f(repeat.r)} slope ${f(repeat.slope)}`);
console.log(`same seat number, consecutive elections: neither candidate the same n ${sameSeat.neither.n} r ${f(sameSeat.neither.r)} · rematch n ${sameSeat.rematch.n} r ${f(sameSeat.rematch.r)}`);
console.log("mean residual toward R by year:", years.map((y) => `${y} ${f(mean(rows.filter((r) => r.year === y && r.party === "R").map((r) => r.residual)))}`).join(" · "));

// ── Who moved? ────────────────────────────────────────────────────────────────
// An established candidate (two or more earlier scored races) against a first-time one.
// shortfall = the established candidate's earlier mean residual − their residual in this race.
// Does it carry into the NEWCOMER's next race (they were strong), or the ESTABLISHED one's (they slipped)?
const rowOfRace = new Map<string, LegWarRow>();
for (const r of rows) rowOfRace.set(`${r.state}|${r.chamber}|${r.district}|${r.year}|${r.party}`, r);
const nx: number[] = [], ny: number[] = [], ex: number[] = [], ey: number[] = [];
for (const list of byPerson.values()) {
  for (let i = 2; i < list.length; i += 1) {
    const t = list[i], before = mean(list.slice(0, i).map((r) => r.residual));
    const opp = rowOfRace.get(`${t.state}|${t.chamber}|${t.district}|${t.year}|${t.party === "R" ? "D" : "R"}`);
    const oppRows = opp ? byPerson.get(opp.person) ?? [] : [];
    if (!opp || oppRows[0] !== opp) continue; // the opponent's first scored race
    const shortfall = before - t.residual;
    if (oppRows[1]) { nx.push(shortfall); ny.push(oppRows[1].residual); }
    if (list[i + 1]) { ex.push(-shortfall); ey.push(list[i + 1].residual - before); }
  }
}
const attribution = { newcomer: pair(nx, ny), established: pair(ex, ey) };
console.log(`\nATTRIBUTION: an established candidate's shortfall against a first-time opponent\n  carries to the newcomer's next race: slope ${f(attribution.newcomer.slope)} (n ${attribution.newcomer.n})\n  carries to the established candidate's next race: slope ${f(attribution.established.slope)} (n ${attribution.established.n})`);

const ranked = [...rows].sort((a, b) => b.war - a.war);
const line = (r: LegWarRow) => `${r.year} ${r.race.padEnd(10)} ${r.candidate} (${r.party}) WAR ${f(r.war, 1)} actual ${f(r.actual, 1)} exp ${f(r.expected, 1)} ${r.basis}`;
console.log("\ntop 10:\n" + ranked.slice(0, 10).map(line).join("\n"));
console.log("bottom 6:\n" + ranked.slice(-6).map(line).join("\n"));

// ── Same name, different people ───────────────────────────────────────────────
const shared = sharedNamePages();
console.log(`\n${shared.length} candidate pages hold more than one person (--names lists them)`);
if (process.argv.includes("--names")) for (const s of shared) console.log(`  ${s.slug}: ${s.people.map((p) => `[${p.seats.join(", ")}]`).join(" vs ")}`);

// ── Crossover ─────────────────────────────────────────────────────────────────
// People with a federal WAR row AND a legislative one, matched by name within the state and party
// (the join the candidate pages use). Each side is the mean race residual toward the candidate, their
// own incumbency in Expected on both sides, so the two are on one footing.
// Both tables as they stand on their own: no record carried from one into the other.
const fed = computeWarTable(undefined, undefined, false).filter((r) => r.office !== "P");
const legBySlug = new Map<string, LegWarRow[]>();
for (const r of computeLegWarTable(false)) if (r.slug) legBySlug.set(r.slug, [...(legBySlug.get(r.slug) ?? []), r]);
type X = { name: string; state: string; office: string; fedYear: number; fed: number; legYear: number; leg: number; nLeg: number; legFirst: boolean };
const xs: X[] = [];
const seen = new Set<string>();
const fedByCand = new Map<string, typeof fed>();
for (const r of fed) fedByCand.set(`${r.state}|${r.party}|${r.candidate}`, [...(fedByCand.get(`${r.state}|${r.party}|${r.candidate}`) ?? []), r]);
for (const [k, list] of fedByCand) {
  const [state, party, name] = k.split("|");
  const page = findStateLegCandidate(name, statesData.find((s) => s.abbr === state)?.name ?? state);
  if (!page || seen.has(page.slug)) continue;
  const legAll = (legBySlug.get(page.slug) ?? []).filter((r) => r.party === party);
  if (legAll.length === 0) continue;
  // One person: the legislative record holding the page's most recent race.
  const person = [...legAll].sort((a, b) => b.year - a.year)[0].person;
  const leg = legAll.filter((r) => r.person === person);
  seen.add(page.slug);
  const fy = Math.min(...list.map((r) => r.year)), ly = Math.min(...leg.map((r) => r.year));
  xs.push({ name, state, office: [...new Set(list.map((r) => r.office))].join(""), fedYear: fy, fed: mean(list.map((r) => (r.party === "R" ? 1 : -1) * (r.actual - r.expected))), legYear: ly, leg: mean(leg.map((r) => r.residual)), nLeg: leg.length, legFirst: ly < fy });
}
const cross = (label: string, set: X[]) => ({ label, ...pair(set.map((x) => x.leg), set.map((x) => x.fed)), sdLeg: r2(sd(set.map((x) => x.leg))), sdFed: r2(sd(set.map((x) => x.fed))) });
const crossover = [
  cross("All crossover candidates", xs),
  cross("Legislature first, then a federal or statewide race", xs.filter((x) => x.legFirst)),
  cross("Federal or statewide race first", xs.filter((x) => !x.legFirst)),
  cross("Federal race is for the U.S. House", xs.filter((x) => x.office === "H")),
  cross("Federal race is for Senate or governor", xs.filter((x) => x.office !== "H")),
  cross("Two or more legislative races", xs.filter((x) => x.nLeg >= 2)),
  cross("Neither side more than 20 points from Expected", xs.filter((x) => Math.abs(x.leg) < 20 && Math.abs(x.fed) < 20)),
];
console.log(`\nCROSSOVER (mean race residual toward the candidate, legislative vs federal):`);
for (const c of crossover) console.log(`  ${c.label.padEnd(52)} n ${String(c.n).padStart(3)}  r ${f(c.r)}  slope of federal on legislative ${f(c.slope)}  sd leg ${f(c.sdLeg, 1)} fed ${f(c.sdFed, 1)}`);
if (process.argv.includes("--list")) for (const x of xs.sort((a, b) => b.leg - a.leg)) console.log(`  ${x.name} ${x.state} ${x.office}  leg ${f(x.leg, 1)} (${x.nLeg}, from ${x.legYear})  fed ${f(x.fed, 1)} (from ${x.fedYear})`);

// ── What joining the records moved ────────────────────────────────────────────
const moved = <T extends { war: number }>(alone: T[], joined: T[], key: (r: T) => string) => {
  const base = new Map(alone.map((r) => [key(r), r.war]));
  const d = joined.map((r) => Math.abs(r.war - (base.get(key(r)) ?? r.war))).filter((x) => x > 0.005).sort((a, b) => a - b);
  return { rows: joined.length, moved: d.length, median: r2(d[Math.floor(d.length / 2)] ?? 0), max: r2(d[d.length - 1] ?? 0), overOne: d.filter((x) => x > 1).length };
};
const joined = {
  k: WAR_CROSS_K,
  federal: moved(computeWarTable(undefined, undefined, false), computeWarTable(), (r) => `${r.state}|${r.office}|${r.race}|${r.year}|${r.candidate}`),
  legislative: moved(computeLegWarTable(false), rows, (r) => `${r.state}|${r.chamber}|${r.district}|${r.year}|${r.party}`),
};
console.log(`\nJOINED RECORDS (κ House ${WAR_CROSS_K.H}, Senate/governor ${WAR_CROSS_K.S}): federal ${joined.federal.moved} of ${joined.federal.rows} rows moved, median ${joined.federal.median}, max ${joined.federal.max}, ${joined.federal.overOne} over a point · legislative ${joined.legislative.moved} of ${joined.legislative.rows}, max ${joined.legislative.max}`);

if (process.argv.includes("--emit")) {
  const example = rows.find((r) => r.slug === "frank-burns-pa" && r.year === 2024) ?? ranked[0];
  const slim = (r: LegWarRow) => ({ candidate: r.candidate, party: r.party, race: r.race, year: r.year, actual: r2(r.actual), expected: r2(r.expected), vsOpp: r2(r.expectedVsOpponent), war: r2(r.war), generic: r.generic == null ? null : r2(r.generic), genericWeight: r2(r.genericWeight), offices: r.offices, modelled: r.modelled == null ? null : r2(r.modelled), others: r2(r.others), incSign: r.incSign, basis: r.basis, record: r2(r.record), effectN: r.effectN, replacementPts: r2(r.replacementPts), opponentEffect: r2(r.opponentEffect), opponent: r.opponent?.name ?? null });
  const firstPer = (list: LegWarRow[]) => list.filter((r, i, a) => a.findIndex((x) => x.person === r.person) === i);
  const summary = {
    built: new Date().toISOString().slice(0, 10),
    constants: LEG_WAR,
    rows: rows.length, races: rows.length / 2, people,
    oneRacePeople: racesPerPerson.filter((n) => n === 1).length,
    byYear, whyModelled, repeat, sameSeat, attribution, crossover, joined,
    sharedNamePages: shared.length,
    example: slim(example),
    top: firstPer(ranked).slice(0, 6).map(slim), bottom: firstPer([...ranked].reverse()).slice(0, 6).map(slim),
  };
  const path = join(process.cwd(), "data", "stateLegWarSummary.ts");
  writeFileSync(path, `// Legislative WAR at a glance: coverage, checks and the crossover test, for the Methodology tabs.\n// GENERATED by \`npx tsx --conditions=react-server scripts/stateLegWarTest.ts --emit\` — do not edit by hand.\n// The model is lib/stateLegWar.ts; this file keeps its figures off the methodology routes' import graph.\n\nexport const STATE_LEG_WAR_SUMMARY = ${JSON.stringify(summary, null, 1)} as const;\n`);
  console.log(`\nwrote data/stateLegWarSummary.ts`);
}
