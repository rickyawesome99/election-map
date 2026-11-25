import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { externalForecasts } from "@/data/externalForecasts";
import { buildRows, externalTopline, type ExternalCall } from "@/lib/forecastComparison";
import { SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE } from "@/lib/forecastTypes";
import { raceHref } from "@/lib/raceLinks";
import { results2026Page } from "@/lib/results2026Page";
import { parseCsv } from "@/lib/turnout";
import type { ModelReviewData, MrBucket, MrForecaster, MrGrade, MrOffice, MrPolled, MrProbBucket, MrRace, MrScore, MrSeats, MrSnapshot } from "@/lib/modelReview2026Types";

// ── The 2026 Model Review (/analysis/model-review) ────────────────────────────
// The final forecast graded against the results. Two layers, kept apart on the page:
//   live      the frozen forecast (data/forecast-final-2026/races.json, frozen/chambers.json)
//             against the saved results (data-entry/results_2026_seats.csv): every score, map,
//             seat count and race grade. It follows the results file.
//   snapshot  data/model-review-2026/autopsy-2026-11-10.json: the reruns of the locked model's own
//             arithmetic (one input changed at a time) and its 2018 to 2024 replay, computed on
//             the November 10 count for the post-election autopsy. The code that produced them
//             was the locked model's and no longer exists in this form, so they are not rerun.
// Nothing here runs or changes the model. Paths are spelled out in literals (Vercel file tracing).

type Archived = {
  office: MrOffice; id: string; name: string; electionType?: string; contest: string;
  dem: { name: string; party: string } | null; rep: { name: string; party: string } | null;
  forecast: { margin: number; interval80: [number, number]; pDem: number; rating: string; model: number; pollMargin: number | null; pollWeight: number; pollCount: number };
};
type SnapRace = { lean: number | null; cf: number | null };

const KEY: Record<MrOffice, "H" | "S" | "G"> = { house: "H", senate: "S", governor: "G" };
const OFFICES: MrOffice[] = ["house", "senate", "governor"];
const RATINGS = ["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"];
const r2 = (v: number) => Math.round(v * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

/** Within 3 points an A, 6 a B, 9 a C, 12 a D; a missed call drops one grade and is a C at best. */
function grade(miss: number, right: boolean): MrGrade {
  const i = Math.min(4, Math.floor((Math.abs(miss) - 1e-9) / 3));
  return (["A", "B", "C", "D", "F"] as const)[Math.max(0, right ? i : Math.max(2, Math.min(4, i + 1)))];
}
const POINTS: Record<MrGrade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };

function pearson(xs: number[], ys: number[]) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}

const LEAN_BUCKETS: [string, number, number][] = [
  ["D+30 or more", -Infinity, -30], ["D+15 to D+30", -30, -15], ["D+5 to D+15", -15, -5], ["D+5 to R+5", -5, 5],
  ["R+5 to R+15", 5, 15], ["R+15 to R+30", 15, 30], ["R+30 or more", 30, Infinity],
];
const PROB_BUCKETS: [string, number, number][] = [["50–60%", 0.5, 0.6], ["60–70%", 0.6, 0.7], ["70–80%", 0.7, 0.8], ["80–90%", 0.8, 0.9], ["90–95%", 0.9, 0.95], ["95–99%", 0.95, 0.99], ["99%+", 0.99, 1.0001]];
/** A rating as a Democratic win chance, for the outlets that publish ratings only. */
const RATING_P: Record<string, number> = { "Safe D": 0.99, "Likely D": 0.9, "Lean D": 0.75, "Tilt D": 0.6, "Toss-up": 0.5, "Tilt R": 0.4, "Lean R": 0.25, "Likely R": 0.1, "Safe R": 0.01 };

let cache: ModelReviewData | null = null;

export function modelReview2026(): ModelReviewData {
  if (cache) return cache;
  const archive = JSON.parse(readFileSync(join(process.cwd(), "data", "forecast-final-2026", "races.json"), "utf8")) as Record<string, Archived>;
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "data", "forecast-final-2026", "manifest.json"), "utf8")) as { lockedAt: string };
  const chambers = JSON.parse(readFileSync(join(process.cwd(), "data", "forecast-final-2026", "frozen", "chambers.json"), "utf8")) as Record<MrOffice, { meanDem: number; lo80: number; hi80: number; pDemControl: number | null; controlThreshold: number; histogram: Record<string, number> }>;
  const snapFile = JSON.parse(readFileSync(join(process.cwd(), "data", "model-review-2026", "autopsy-2026-11-10.json"), "utf8")) as MrSnapshot & { meta: { fetched: string; pastMae: Record<string, number> }; races: Record<string, SnapRace> };
  const rows = parseCsv(readFileSync(join(process.cwd(), "data-entry", "results_2026_seats.csv"), "utf8"));
  const forecastOf = new Map(Object.values(archive).map((a) => [`${a.office}|${a.id}`, a]));

  // ── races ──
  const races: MrRace[] = [];
  const seatsWon: Record<MrOffice, { called: number; actual: number; uncalled: { label: string; a: number }[] }> = { house: { called: 0, actual: 0, uncalled: [] }, senate: { called: 0, actual: 0, uncalled: [] }, governor: { called: 0, actual: 0, uncalled: [] } };
  let asOf = 0, uncontested = 0;
  for (const r of rows) {
    const office = r.office as MrOffice;
    const called = r.called === "1" && !!r.winner_party;
    asOf = Math.max(asOf, Date.parse(r.fetched_at) || 0);
    const a = Number(r.margin);
    if (r.contest !== "contested") {
      uncontested += 1;
      const dem = r.contest.endsWith("-D");
      if (dem) { seatsWon[office].actual += 1; if (called) seatsWon[office].called += 1; }
      continue;
    }
    const arch = forecastOf.get(`${office}|${r.race_id}`);
    if (!arch) continue;
    const f = arch.forecast;
    const demWon = called ? r.winner_party === (r.dem_party || "D") : a < 0;
    if (demWon && (r.dem_party || "D") === "D") { seatsWon[office].actual += 1; if (called) seatsWon[office].called += 1; }
    if (!called) seatsWon[office].uncalled.push({ label: r.label, a });
    const snap = snapFile.races[`${KEY[office]}|${r.race_id}`];
    const label = office === "house" ? r.label : r.special === "1" ? `${r.state_name} (special)` : r.state_name;
    races.push({
      office, id: r.race_id, label, abbr: r.state, href: raceHref(office, { name: r.label, id: r.race_id }),
      mapKey: office === "house" ? String(parseInt(r.race_id, 10)) : r.state_name,
      dem: r.dem_name, rep: r.rep_name, demParty: r.dem_party || "D",
      f: r2(f.margin), lo: f.interval80[0], hi: f.interval80[1], pDem: f.pDem, rating: f.rating,
      model: f.model, poll: f.pollCount > 0 ? f.pollMargin : null, w: f.pollWeight, nPoll: f.pollCount,
      a: r2(a), called, demWon, right: (f.margin < 0) === demWon,
      err: a - f.margin, rel: 0, grade: "A", gradeRel: "A",
      lean: snap?.lean ?? null, cf: snap?.cf ?? null,
    });
  }

  // ── scores ──
  const score = {} as Record<MrOffice, MrScore>;
  const gpa = {} as ModelReviewData["gpa"];
  for (const office of OFFICES) {
    const rs = races.filter((r) => r.office === office);
    const bias = mean(rs.map((r) => r.err));
    for (const r of rs) {
      r.rel = r.err - bias;
      r.grade = grade(r.err, r.right);
      r.gradeRel = grade(r.rel, (r.f + bias < 0) === r.demWon);
    }
    const close = rs.filter((r) => Math.abs(r.f) < 10);
    score[office] = {
      n: rs.length, right: rs.filter((r) => r.right).length,
      mae: mean(rs.map((r) => Math.abs(r.err))), bias, median: median(rs.map((r) => Math.abs(r.err))),
      cov80: mean(rs.map((r) => (r.a >= r.lo && r.a <= r.hi ? 1 : 0))),
      brier: mean(rs.map((r) => (r.pDem - (r.demWon ? 1 : 0)) ** 2)),
      pearson: pearson(rs.map((r) => r.f), rs.map((r) => r.a)),
      dBeat: rs.filter((r) => r.err < 0).length,
      netMae: mean(rs.map((r) => Math.abs(r.rel))), netRight: rs.filter((r) => (r.f + bias < 0) === r.demWon).length,
      netCov80: mean(rs.map((r) => (r.a - bias >= r.lo && r.a - bias <= r.hi ? 1 : 0))),
      closeN: close.length, closeRight: close.filter((r) => r.right).length, closeMae: mean(close.map((r) => Math.abs(r.err))),
      pastMae: snapFile.meta.pastMae[KEY[office]],
    };
    const count = (k: "grade" | "gradeRel") => Object.fromEntries((["A", "B", "C", "D", "F"] as const).map((g) => [g, rs.filter((r) => r[k] === g).length])) as Record<MrGrade, number>;
    gpa[office] = { counts: count("grade"), countsRel: count("gradeRel"), gpa: mean(rs.map((r) => POINTS[r.grade])), gpaRel: mean(rs.map((r) => POINTS[r.gradeRel])) };
  }
  for (const r of races) { r.err = r2(r.err); r.rel = r2(r.rel); }

  // ── seats ──
  const seats = {} as Record<MrOffice, MrSeats>;
  for (const office of OFFICES) {
    const c = chambers[office], won = seatsWon[office], hold = SEAT_HOLDOVERS[office].dem;
    const hist = Object.entries(c.histogram).map(([k, v]) => [Number(k), v] as [number, number]).sort((x, y) => x[0] - y[0]);
    const actual = hold + won.actual;
    seats[office] = {
      total: TOTAL_SEATS_BY_TYPE[office], majority: office === "house" ? 218 : office === "senate" ? 51 : 26,
      mean: c.meanDem, lo: c.lo80, hi: c.hi80, pControl: c.pDemControl,
      called: hold + won.called, actual, pAtLeast: hist.filter(([k]) => k >= actual).reduce((s, [, v]) => s + v, 0),
      inRange: actual >= c.lo80 && actual <= c.hi80, hist, uncalled: won.uncalled,
    };
  }

  // ── calibration ──
  const ratings = RATINGS.map((rating) => {
    const rs = races.filter((r) => r.rating === rating);
    return { rating, n: rs.length, dWins: rs.filter((r) => r.demWon).length, expD: rs.reduce((s, r) => s + r.pDem, 0), bias: mean(rs.map((r) => r.err)) };
  }).filter((r) => r.n > 0);
  const probBuckets: MrProbBucket[] = PROB_BUCKETS.map(([label, lo, hi]) => {
    const rs = races.filter((r) => { const p = Math.max(r.pDem, 1 - r.pDem); return p >= lo && p < hi; });
    return { label, lo, hi, n: rs.length, won: rs.filter((r) => r.right).length, meanP: mean(rs.map((r) => Math.max(r.pDem, 1 - r.pDem))) };
  }).filter((b) => b.n > 0);

  // ── the shape of the House miss ──
  const house = races.filter((r) => r.office === "house");
  const leanBuckets: MrBucket[] = LEAN_BUCKETS.map(([label, lo, hi]) => {
    const rs = house.filter((r) => r.lean != null && r.lean > lo && r.lean <= hi);
    const fixed = rs.filter((r) => r.cf != null);
    return { label, n: rs.length, bias: mean(rs.map((r) => r.err)), biasFixed: fixed.length ? mean(fixed.map((r) => r.a - r.cf!)) : null };
  }).filter((b) => b.n > 0);
  const byState = new Map<string, MrRace[]>();
  for (const r of house) byState.set(r.abbr, [...(byState.get(r.abbr) ?? []), r]);
  const states = [...byState].filter(([, rs]) => rs.length >= 3).map(([abbr, rs]) => {
    const bias = mean(rs.map((r) => r.err));
    return { abbr, n: rs.length, bias, resid: bias - score.house.bias };
  }).sort((x, y) => x.resid - y.resid);
  const stateSd = Math.sqrt(mean(states.map((s) => s.resid ** 2)));

  // ── polls against fundamentals, in the races that had polls ──
  const polled = {} as Record<MrOffice, MrPolled>;
  for (const office of OFFICES) {
    const rs = races.filter((r) => r.office === office && r.poll != null);
    const part = (of: (r: MrRace) => number) => ({ mae: mean(rs.map((r) => Math.abs(r.a - of(r)))), bias: mean(rs.map((r) => r.a - of(r))), right: rs.filter((r) => (of(r) < 0) === r.demWon).length });
    polled[office] = { n: rs.length, meanW: mean(rs.map((r) => r.w)), model: part((r) => r.model), poll: part((r) => r.poll!), blend: part((r) => r.f) };
  }

  // ── other forecasters, on the House races all of them covered ──
  const houseRows = buildRows("house"), senateRows = buildRows("senate");
  const resultOf = new Map(house.map((r) => [r.id, r]));
  const pOf = (c: ExternalCall | undefined) => (c ? c.pDem ?? RATING_P[c.rating] ?? null : null);
  const scored = houseRows.filter((row) => resultOf.has(row.id));
  const covering = externalForecasts.filter((f) => scored.every((row) => pOf(row.calls[f.id]) != null));
  const common = scored;
  const brierOf = (p: (row: (typeof common)[number]) => number) => ({
    brier: mean(common.map((row) => (p(row) - (resultOf.get(row.id)!.demWon ? 1 : 0)) ** 2)),
    // A 50% call is half right.
    right: common.reduce((s, row) => { const q = p(row), won = resultOf.get(row.id)!.demWon; return s + (q === 0.5 ? 0.5 : (q > 0.5) === won ? 1 : 0); }, 0),
  });
  const forecasters: MrForecaster[] = [
    { id: "ours", name: "This model", kind: "model", ours: true, houseSeats: seats.house.mean, senateSeats: seats.senate.mean, ...brierOf((row) => row.ours.pDem) },
    ...externalForecasts.map((f): MrForecaster => {
      const covers = covering.includes(f);
      return {
        id: f.id, name: f.name, kind: f.kind,
        houseSeats: externalTopline(f, "house", houseRows)?.demSeats ?? null, senateSeats: externalTopline(f, "senate", senateRows)?.demSeats ?? null,
        ...(covers ? brierOf((row) => pOf(row.calls[f.id])!) : { brier: null, right: null }),
      };
    }).filter((f) => f.brier != null || f.houseSeats != null),
  ];

  const gb = results2026Page().genericBallot.y2026;
  const { meta, races: _snapRaces, ...snap } = snapFile;
  void _snapRaces;
  const wrong = races.filter((r) => !r.right);
  cache = {
    asOf, lockedAt: manifest.lockedAt, races, score,
    all: { n: races.length, right: races.length - wrong.length, dBeat: races.filter((r) => r.err < 0).length, uncontested, wrongTowardD: wrong.filter((r) => r.demWon).length },
    seats, ratings, probBuckets, leanBuckets, states, stateSd, polled, forecasters, forecasterRaces: common.length,
    houseVote: { raw: gb.raw, contested: gb.contested, imputed: gb.imputed },
    gpa,
    snap: { ...snap, fetched: meta.fetched } as MrSnapshot,
  };
  return cache;
}
