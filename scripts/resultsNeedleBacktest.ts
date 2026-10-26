// Replays the election-night needle (lib/resultsNeedle.ts) over civicAPI's snapshot histories of
// the 2025 Virginia and New Jersey governor races — the only general elections with county-level
// snapshots (history starts October 2025) — and scores it against the final margin.
//
// The prior for each county is what the 2026 priors would have been built from, a year earlier:
// expected votes = the county's 2021 governor votes; expected margin = its 2024 presidential
// margin shifted so the vote-weighted mean equals the pre-election forecast (the final polling
// average, hand-entered below); sigma = a governor race's forecast sigma. Real snapshots carry no
// county percent-reporting, as on the night.
//
//   npx tsx scripts/resultsNeedleBacktest.ts            # score the current constants
//   npx tsx scripts/resultsNeedleBacktest.ts --grid     # grid over the constants (--fine: the narrow one)
//   npx tsx scripts/resultsNeedleBacktest.ts --emit     # write data/resultsNeedleCalibration.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { countyPresidentialData } from "../data/countyPresidentialData";
import { normalizeRace } from "../lib/resultsFeed";
import { DEFAULT_PARAMS, normalCdf, projectRace, type NeedleParams } from "../lib/resultsNeedle";
import type { RacePrior } from "../lib/resultsTypes";

const BASE = "https://civicapi.org/api/v2/";
const UA = { "User-Agent": "curl/8.4.0", Accept: "application/json" };
const CACHE = join(process.cwd(), "data-entry", "results-archive", "history");

// civicAPI id, state, the pre-election forecast margin (R-positive; final polling averages: RCP had
// Spanberger +7.6 and Sherrill +4.1 on election eve) and a governor race's forecast sigma.
const RACES = [
  { id: 5861, state: "VA", stateName: "Virginia", forecast: -7.6, sigma: 5, dem: "Abigail Spanberger", rep: "Winsome Earle-Sears" },
  { id: 5859, state: "NJ", stateName: "New Jersey", forecast: -4.1, sigma: 5, dem: "Mikie Sherrill", rep: "Jack Ciattarelli" },
];

async function get<T>(path: string): Promise<T> {
  const file = join(CACHE, path.replace(/[^A-Za-z0-9_.-]/g, "_") + ".json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as T;
  const res = await fetch(BASE + path, { headers: UA });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const data = await res.json();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(data));
  return data as T;
}

function parseCsv(text: string): Record<string, string>[] {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => Object.fromEntries(cols.map((c, i) => [c, l.split(",")[i] ?? ""])));
}

function priorFor(r: (typeof RACES)[number]): RacePrior {
  const rows = parseCsv(readFileSync(join(process.cwd(), "data-entry", "county_governor_results_2021.csv"), "utf8")).filter((x) => x.state === r.state);
  const cells = rows.map((x) => {
    const p = countyPresidentialData[x.county_id]?.years[2024];
    const other = Math.min(8, p ? (p.othVotes / p.totalVotes) * 100 : 1.5);
    return { fips: x.county_id, name: x.county_name, votes: Number(x.total_2021), lean: p?.margin ?? 0, other };
  });
  const total = cells.reduce((a, c) => a + c.votes, 0);
  const mean = cells.reduce((a, c) => a + c.votes * c.lean, 0) / total;
  const shift = r.forecast - mean;
  return {
    office: "governor", id: r.state, civicId: r.id, label: r.stateName, state: r.state, stateName: r.stateName, href: "",
    dem: { name: r.dem, party: "D", incumbent: false, photo: null }, rep: { name: r.rep, party: "R", incumbent: false, photo: null },
    seatParty: null, seatHolder: null, special: false, rcv: false, jungle: false,
    forecast: { margin: r.forecast, sigma: r.sigma, probability: normalCdf(-r.forecast / r.sigma), rating: "", contest: "contested", interval80: [r.forecast - 1.28 * r.sigma, r.forecast + 1.28 * r.sigma] },
    pollsClose: { first: "19:00", last: "19:00", note: null },
    votes: total,
    counties: cells.map((c) => ({ fips: c.fips, name: c.name, share: 1, votes: c.votes, margin: Math.max(-98, Math.min(98, c.lean + shift)), other: c.other, tpl: null, benchmark: null })),
  };
}

type Snap = { ts: string; share: number; counted: number; current: number | null; margin: number; sigma: number; total: number; swing: number; tau: number; matched: number };
type RaceRun = { race: (typeof RACES)[number]; final: number; finalTotal: number; snaps: Snap[] };

const BUCKETS: [number, number, string][] = [[0, 0.1, "<10%"], [0.1, 0.3, "10–30%"], [0.3, 0.6, "30–60%"], [0.6, 0.9, "60–90%"], [0.9, 0.995, "90–99%"]];

async function replay(r: (typeof RACES)[number], P: NeedleParams, raw: { ts: string; data: unknown }[], prior: RacePrior): Promise<RaceRun> {
  const final = normalizeRace(prior, raw[raw.length - 1].data as never);
  const finalMargin = ((final.rep - final.dem) / final.total) * 100;
  const snaps: Snap[] = [];
  for (const { ts, data } of raw) {
    const live = normalizeRace(prior, data as never);
    if (live.total <= 0) continue;
    // Calls lock the probability but not the margin; score the margin as if uncalled.
    const p = projectRace(prior, { ...live, called: false, winner: null, percentReporting: Math.min(live.percentReporting, 99.5) }, P);
    snaps.push({ ts, share: live.total / final.total, counted: live.total, current: p.currentMargin, margin: p.margin, sigma: p.sigma, total: p.projectedTotal, swing: p.swing, tau: p.turnoutFactor, matched: p.counties.filter((c) => c.counted > 0).length });
  }
  return { race: r, final: finalMargin, finalTotal: final.total, snaps };
}

function score(runs: RaceRun[]) {
  // Equal weight per race; snapshots inside 0.5%–99.5% counted.
  const rows: { bucket: string; err: number; z: number; covered: number; logs: number; totalErr: number }[] = [];
  for (const run of runs) {
    for (const s of run.snaps) {
      if (s.share < 0.005 || s.share > 0.995) continue;
      const bucket = BUCKETS.find(([lo, hi]) => s.share >= lo && s.share < hi)?.[2] ?? "99%+";
      const z = (run.final - s.margin) / s.sigma;
      rows.push({ bucket, err: Math.abs(run.final - s.margin), z, covered: Math.abs(z) <= 1.2816 ? 1 : 0, logs: -0.5 * z * z - Math.log(s.sigma), totalErr: Math.abs(s.total - run.finalTotal) / run.finalTotal });
    }
  }
  const agg = (xs: typeof rows) => ({ n: xs.length, mae: xs.reduce((a, x) => a + x.err, 0) / xs.length, cover: xs.reduce((a, x) => a + x.covered, 0) / xs.length, rmsz: Math.sqrt(xs.reduce((a, x) => a + x.z * x.z, 0) / xs.length), logs: xs.reduce((a, x) => a + x.logs, 0) / xs.length, totalErr: xs.reduce((a, x) => a + x.totalErr, 0) / xs.length });
  return { all: agg(rows), buckets: BUCKETS.map(([, , b]) => [b, agg(rows.filter((x) => x.bucket === b))] as const).filter(([, a]) => a.n > 0) };
}

const f1 = (v: number) => v.toFixed(1), f2 = (v: number) => v.toFixed(2), pc = (v: number) => `${Math.round(v * 100)}%`;

async function main() {
  const grid = process.argv.includes("--grid");
  const histories: { r: (typeof RACES)[number]; raw: { ts: string; data: unknown }[]; prior: RacePrior }[] = [];
  for (const r of RACES) {
    const h = await get<{ timestamps: ({ timestamp: string } | string)[] }>(`race/${r.id}/history`);
    const ts = h.timestamps.map((t) => (typeof t === "string" ? t : t.timestamp)).sort();
    const raw: { ts: string; data: unknown }[] = [];
    for (const t of ts) raw.push({ ts: t, data: (await get<{ data: unknown }>(`race/${r.id}/history/${t}`)).data });
    histories.push({ r, raw, prior: priorFor(r) });
    console.log(`${r.state}: ${raw.length} snapshots, prior ${f1(histories[histories.length - 1].prior.votes)} votes at ${f1(r.forecast)}`);
  }
  const runAll = async (P: NeedleParams) => Promise.all(histories.map((h) => replay(h.r, P, h.raw, h.prior)));

  const runs = await runAll(DEFAULT_PARAMS);
  for (const run of runs) {
    console.log(`\n${run.race.state}: final ${f1(run.final)} on ${run.finalTotal.toLocaleString()} votes`);
    console.log("  time (UTC)        in     counted   current  → needle   ±σ    z     proj.total  swing   τ   counties");
    for (const s of run.snaps.filter((_, i) => i % 4 === 0 || i === run.snaps.length - 1)) {
      console.log(`  ${s.ts.slice(5, 16)}  ${pc(s.share).padStart(4)}  ${s.counted.toLocaleString().padStart(9)}  ${f1(s.current ?? 0).padStart(6)}  → ${f1(s.margin).padStart(6)}  ${f1(s.sigma).padStart(4)}  ${f2((run.final - s.margin) / s.sigma).padStart(5)}  ${s.total.toLocaleString().padStart(10)}  ${f1(s.swing).padStart(5)}  ${f2(s.tau)}  ${s.matched}`);
    }
  }
  const sc = score(runs);
  console.log(`\nCurrent constants ${JSON.stringify(DEFAULT_PARAMS)}`);
  console.log("  bucket    n   MAE   80% cover  RMS z   log score   total err");
  for (const [b, a] of sc.buckets) console.log(`  ${b.padEnd(8)} ${String(a.n).padStart(3)}  ${f1(a.mae).padStart(4)}  ${pc(a.cover).padStart(6)}     ${f2(a.rmsz).padStart(5)}   ${f2(a.logs).padStart(6)}     ${pc(a.totalErr)}`);
  console.log(`  ${"all".padEnd(8)} ${String(sc.all.n).padStart(3)}  ${f1(sc.all.mae).padStart(4)}  ${pc(sc.all.cover).padStart(6)}     ${f2(sc.all.rmsz).padStart(5)}   ${f2(sc.all.logs).padStart(6)}     ${pc(sc.all.totalErr)}`);

  if (process.argv.includes("--emit")) {
    const out = `// Generated by scripts/resultsNeedleBacktest.ts --emit — do not edit. The election-night needle
// (lib/resultsNeedle.ts) replayed over civicAPI's snapshot histories of the 2025 Virginia and New
// Jersey governor races, scored against the final margin; shown on /analysis/internal-methodology/turnout#results-needle.
export const NEEDLE_BACKTEST = ${JSON.stringify({
      generated: new Date().toISOString().slice(0, 10),
      races: runs.map((r) => ({ state: r.race.state, forecast: r.race.forecast, final: Math.round(r.final * 10) / 10, finalVotes: r.finalTotal, priorVotes: Math.round(histories.find((h) => h.r === r.race)!.prior.votes), snapshots: r.snaps.length })),
      params: DEFAULT_PARAMS,
      buckets: [...sc.buckets.map(([b, a]) => ({ bucket: b, ...a })), { bucket: "all", ...sc.all }].map((b) => ({ ...b, mae: Math.round(b.mae * 100) / 100, cover: Math.round(b.cover * 1000) / 1000, rmsz: Math.round(b.rmsz * 100) / 100, logs: Math.round(b.logs * 100) / 100, totalErr: Math.round(b.totalErr * 1000) / 1000 })),
    }, null, 2)} as const;\n`;
    writeFileSync(join(process.cwd(), "data", "resultsNeedleCalibration.ts"), out);
    console.log("wrote data/resultsNeedleCalibration.ts");
  }

  if (!grid) return;
  const results: { P: NeedleParams; s: ReturnType<typeof score> }[] = [];
  const fine = process.argv.includes("--fine");
  const G = fine
    ? { kSwing: [0.05, 0.1, 0.15], sigmaCounty: [6], kTurnout: [0.1], ownExp: [1], sigmaLate: [4, 5, 6, 7, 8, 10], sigmaFloor: [0.3, 0.5] }
    : { kSwing: [0.02, 0.05, 0.1, 0.2, 0.4], sigmaCounty: [3, 6, 12], kTurnout: [0.05, 0.1], ownExp: [1, 0.5, 0.25], sigmaLate: [0, 8, 15, 25], sigmaFloor: [0.3, 0.8] };
  for (const kSwing of G.kSwing)
    for (const sigmaCounty of G.sigmaCounty)
      for (const kTurnout of G.kTurnout)
        for (const ownExp of G.ownExp)
          for (const sigmaLate of G.sigmaLate)
            for (const sigmaFloor of G.sigmaFloor) {
              const P = { ...DEFAULT_PARAMS, kSwing, sigmaCounty, kTurnout, ownExp, sigmaLate, sigmaFloor };
              results.push({ P, s: score(await runAll(P)) });
            }
  results.sort((a, b) => b.s.all.logs - a.s.all.logs);
  console.log("\nGrid, best log score first (MAE in points; coverage of the 80% band; RMS z should be ~1):");
  for (const { P, s } of results.slice(0, 15)) console.log(`  kSwing ${P.kSwing}  σcounty ${P.sigmaCounty}  kTurnout ${P.kTurnout}  ownExp ${P.ownExp}  σlate ${P.sigmaLate}  floor ${P.sigmaFloor}  → log ${f2(s.all.logs)}  MAE ${f1(s.all.mae)}  cover ${pc(s.all.cover)}  RMSz ${f2(s.all.rmsz)}  | ${s.buckets.map(([b, a]) => `${b} ${f1(a.mae)}/${pc(a.cover)}`).join("  ")}`);
  const bestMae = [...results].sort((a, b) => a.s.all.mae - b.s.all.mae)[0];
  console.log(`  lowest MAE: kSwing ${bestMae.P.kSwing} σcounty ${bestMae.P.sigmaCounty} kTurnout ${bestMae.P.kTurnout} ownExp ${bestMae.P.ownExp} σlate ${bestMae.P.sigmaLate} → MAE ${f1(bestMae.s.all.mae)} cover ${pc(bestMae.s.all.cover)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
