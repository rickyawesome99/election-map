// Backtest of the State TPL's not-up seat estimate (lib/chamberMargins.ts notUpPool).
//
// Run:  npx tsx --conditions=react-server scripts/stateLegNotUpBacktest.ts          (report)
//       npx tsx --conditions=react-server scripts/stateLegNotUpBacktest.ts --emit   (also write data/stateLegNotUpValidation.ts)
//
// A staggered chamber's not-up seats have no result to score against, so the test is run where
// every seat WAS up: each chamber-year that elects all its seats at once is split into two
// "seat classes" — alternate districts in key order, the way most states number their classes,
// plus RANDOM_SPLITS random halves — and each half's contested seats are estimated from the other
// half's, exactly as the model estimates a class that sat out:
//
//   none   the hidden half is assumed to vote like the visible half (the row before the fix);
//   flat   P + a, a = the visible seats' vote-weighted mean gap (legislative − presidential);
//   slope  P + a + b·n/(n+k)·(clamp(P) − center), for each k in K_GRID.
//
// Scored on the hidden half's vote-weighted margin (its share of the row), and on the full
// chamber's — visible results plus hidden estimates against all results — which is the row's
// error once the hidden half is half the chamber.

import fs from "node:fs";
import path from "node:path";
import { stateLegResults } from "@/data/stateLegResults";
import { stateLegPresByEra } from "@/data/stateLegPresByEra";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { stateLegCalendar } from "@/data/stateLegCalendar";
import { indexByNormalizedKey, isUnassignedResultKey, lookupByDistrictCode } from "@/lib/stateLegDistrictKey";
import { MIN_GAP_SEATS } from "@/lib/stateLegChamberMargin";
import { LEG_NOT_UP_MODE, LEG_NOT_UP_SLOPE_K } from "@/lib/tplCompute";

const K_GRID = [0, 5, 10, 20, 50, 100];
const RANDOM_SPLITS = 20;

interface Seat { key: string; leg: number; pres: number; votes: number; presVotes: number }

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const wmean = (xs: { v: number; w: number }[]) => xs.reduce((a, x) => a + x.v * x.w, 0) / xs.reduce((a, x) => a + x.w, 0);

/** Every estimator's prediction of the hidden seats' vote-weighted margin. */
function estimate(visible: Seat[], hidden: Seat[]): Record<string, number> {
  const W = visible.reduce((a, s) => a + s.votes, 0);
  const center = visible.reduce((a, s) => a + s.votes * s.pres, 0) / W;
  const a = visible.reduce((acc, s) => acc + s.votes * (s.leg - s.pres), 0) / W;
  let sxy = 0, sxx = 0;
  for (const s of visible) { const dx = s.pres - center; sxy += s.votes * dx * (s.leg - s.pres - a); sxx += s.votes * dx * dx; }
  const b = sxx > 0 ? sxy / sxx : 0;
  const lo = Math.min(...visible.map((s) => s.pres)), hi = Math.max(...visible.map((s) => s.pres));
  // Production weights: presidential votes × the visible seats' legislative/presidential ratio.
  const ratio = W / visible.reduce((acc, s) => acc + s.presVotes, 0);
  const hw = (s: Seat) => s.presVotes * ratio;
  const out: Record<string, number> = {
    none: wmean(visible.map((s) => ({ v: s.leg, w: s.votes }))),
    flat: wmean(hidden.map((s) => ({ v: s.pres + a, w: hw(s) }))),
  };
  for (const k of K_GRID) {
    const bt = (b * visible.length) / (visible.length + k);
    out[`slope k=${k}`] = wmean(hidden.map((s) => ({ v: s.pres + a + bt * (Math.min(hi, Math.max(lo, s.pres)) - center), w: hw(s) })));
  }
  return out;
}

// ── collect the all-seats-up chamber-years ──────────────────────────────────

const chambersTested: { id: string; seats: Seat[] }[] = [];
for (const [abbr, years] of Object.entries(stateLegResults)) for (const [year, chambers] of Object.entries(years)) for (const chamber of ["house", "senate"] as const) {
  const block = chambers[chamber];
  if (!block || stateLegCalendar[abbr]?.[chamber]?.staggered !== false) continue;
  const era = String(stateLegHistoricalMaps[abbr]?.[chamber]?.[year] ?? "current");
  const presEra = stateLegPresByEra[abbr]?.[chamber]?.[era] ?? {};
  const presIndex = indexByNormalizedKey(presEra);
  const available = (["2016", "2020", "2024"] as const).filter((y) => Object.values(presEra).some((d) => d[y]));
  if (available.length === 0) continue;
  const src = [...available].sort((a, b) => Math.abs(Number(a) - Number(year)) - Math.abs(Number(b) - Number(year)) || Number(b) - Number(a))[0];
  const seats: Seat[] = [];
  for (const [key, r] of Object.entries(block.districts)) {
    if (isUnassignedResultKey(key) || r.noCount || !(r.demVotes! > 0 && r.repVotes! > 0 && r.totalVotes! > 0)) continue;
    const pres = lookupByDistrictCode(presIndex, abbr, chamber, key)?.[src];
    if (!pres) continue;
    seats.push({ key, leg: ((r.repVotes! - r.demVotes!) / r.totalVotes!) * 100, pres: pres.margin, votes: r.totalVotes!, presVotes: pres.totalVotes });
  }
  if (seats.length >= 2 * MIN_GAP_SEATS) chambersTested.push({ id: `${abbr} ${year} ${chamber}`, seats });
}

// ── score ───────────────────────────────────────────────────────────────────

type Split = "alternate" | "random";
const err: Record<Split, Record<string, { half: number[]; row: number[] }>> = { alternate: {}, random: {} };
function score(split: Split, seats: Seat[], inHidden: (i: number) => boolean) {
  const hidden = seats.filter((_, i) => inHidden(i)), visible = seats.filter((_, i) => !inHidden(i));
  if (hidden.length < MIN_GAP_SEATS || visible.length < MIN_GAP_SEATS) return;
  const truth = wmean(hidden.map((s) => ({ v: s.leg, w: s.votes })));
  const all = wmean(seats.map((s) => ({ v: s.leg, w: s.votes })));
  const Wv = visible.reduce((a, s) => a + s.votes, 0), Wh = hidden.reduce((a, s) => a + s.votes, 0);
  const vis = wmean(visible.map((s) => ({ v: s.leg, w: s.votes })));
  for (const [name, est] of Object.entries(estimate(visible, hidden))) {
    const bucket = (err[split][name] ??= { half: [], row: [] });
    bucket.half.push(Math.abs(est - truth));
    bucket.row.push(Math.abs((vis * Wv + est * Wh) / (Wv + Wh) - all));
  }
}
for (const { seats } of chambersTested) {
  const ordered = [...seats].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  score("alternate", ordered, (i) => i % 2 === 0);
  score("alternate", ordered, (i) => i % 2 === 1);
  const rand = mulberry32(seats.length * 7919 + Math.round(seats[0].votes));
  for (let r = 0; r < RANDOM_SPLITS; r++) {
    const pick = ordered.map(() => rand() < 0.5);
    score("random", ordered, (i) => pick[i]);
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const rows = Object.keys(err.alternate).map((name) => ({
  estimator: name,
  alternateHalf: mean(err.alternate[name].half), alternateRow: mean(err.alternate[name].row),
  randomHalf: mean(err.random[name].half), randomRow: mean(err.random[name].row),
}));
const live = LEG_NOT_UP_MODE === "slope" ? `slope k=${LEG_NOT_UP_SLOPE_K}` : LEG_NOT_UP_MODE;
console.log(`${chambersTested.length} all-seats-up chamber-years; ${err.alternate.none.half.length} alternate and ${err.random.none.half.length} random splits\n`);
console.log("estimator        alternate: hidden half / full row    random: hidden half / full row");
for (const r of rows) console.log(`${(r.estimator + (r.estimator === live ? " *" : "")).padEnd(16)} ${r.alternateHalf.toFixed(2).padStart(10)} / ${r.alternateRow.toFixed(2).padEnd(18)} ${r.randomHalf.toFixed(2).padStart(10)} / ${r.randomRow.toFixed(2)}`);
console.log("\nMAE in margin points; * = the live setting (LEG_NOT_UP_MODE / LEG_NOT_UP_SLOPE_K).");

if (process.argv.includes("--emit")) {
  const file = path.join(process.cwd(), "data", "stateLegNotUpValidation.ts");
  const payload = { generatedAt: new Date().toISOString().slice(0, 10), chamberYears: chambersTested.length, live, rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * 100) / 100 : v]))) };
  fs.writeFileSync(file, `// GENERATED by \`npx tsx --conditions=react-server scripts/stateLegNotUpBacktest.ts --emit\` — do not edit by hand.\n// Hidden-seat-class test of the State TPL's not-up seat estimate, on chambers that elected every seat.\nexport const STATE_LEG_NOT_UP_VALIDATION = ${JSON.stringify(payload, null, 2)} as const;\n`);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
