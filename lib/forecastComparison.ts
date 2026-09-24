// Forecast comparison (/analysis/forecasts): lines every external forecast in
// data/externalForecasts.ts up against this site's own, race by race and chamber by chamber.
//
// Every call is placed on one nine-step scale (Safe D … Toss-up … Safe R) so a rater's label
// and a model's probability can be compared: a rater's label is used as published; a model's
// probability is banded (PROB_BANDS); our own call is the site's rating (margin bands, see
// lib/colorScale marginToRating), which has no Toss-up — the closest step is Tilt.

import { houseData, type RaceType } from "@/data/forecastData";
import { externalForecasts, type ExternalForecaster, type ExternalRaceCall, type ExternalRating } from "@/data/externalForecasts";
import { forecastsFor, getChamberSimulations, seatTotals, SEAT_HOLDOVERS, TOTAL_SEATS_BY_TYPE, type ForecastedRace } from "@/lib/forecast";

export const RATING_SCALE: ExternalRating[] = ["Safe D", "Likely D", "Lean D", "Tilt D", "Toss-up", "Tilt R", "Lean R", "Likely R", "Safe R"];
export const ratingOrdinal = (r: string): number => { const i = RATING_SCALE.indexOf(r as ExternalRating); return i < 0 ? 0 : i - 4; };

// Democratic win probability → rating band (for models that publish no label).
// Symmetric: a Republican favorite is banded on 1 − p.
export const PROB_BANDS: { min: number; label: "Safe" | "Likely" | "Lean" | "Tilt" }[] = [
  { min: 0.95, label: "Safe" },
  { min: 0.8, label: "Likely" },
  { min: 0.65, label: "Lean" },
  { min: 0.55, label: "Tilt" },
];
export function probToRating(pDem: number): ExternalRating {
  const fav = pDem >= 0.5 ? "D" : "R";
  const p = Math.max(pDem, 1 - pDem);
  const band = PROB_BANDS.find((b) => p >= b.min);
  return band ? (`${band.label} ${fav}` as ExternalRating) : "Toss-up";
}

export const CHAMBERS: RaceType[] = ["senate", "governor", "house"];
export const CHAMBER_LABEL: Record<RaceType, string> = { senate: "Senate", governor: "Governor", house: "House" };

// House by district name; governors by state; Senate by state, the specials as "FL-2" / "OH-2"
// (our own Senate ids carry the seat number for seat-2 races, "DE-2", which nobody else uses).
export const externalKeyOf = (r: ForecastedRace): string =>
  r.raceType === "house" ? r.name : r.raceType === "governor" ? r.id : r.electionType === "Special" ? `${r.stateAbbr}-2` : r.stateAbbr;
const houseIdByName = new Map(houseData.map((r) => [r.name, r.id]));
export const houseIdOf = (name: string) => houseIdByName.get(name);

export interface OurCall { rating: string; pDem: number; margin: number; ordinal: number }
export interface ExternalCall extends ExternalRaceCall { rating: ExternalRating; ordinal: number; inferred?: boolean }

export interface ComparisonRow {
  key: string;      // external key ("AK", "FL-2", "AL-01")
  id: string;       // our race id
  raceType: RaceType;
  name: string;     // display name
  state: string;
  href: string;
  seatParty: "D" | "R" | "I" | undefined;
  contest: ForecastedRace["contest"];
  ours: OurCall;
  calls: Record<string, ExternalCall>; // by forecaster id
  spread: number;        // widest gap on the scale between any two calls (ours included)
  maxAbsDelta: number;   // widest gap between ours and any external call
  competitive: boolean;  // any call (ours included) closer than Safe
}

function toCall(c: ExternalRaceCall | undefined): ExternalCall | undefined {
  if (!c) return undefined;
  const rating = c.rating ?? (c.pDem != null ? probToRating(c.pDem) : undefined);
  if (!rating) return undefined;
  return { ...c, rating, ordinal: ratingOrdinal(rating) };
}

// A rater's competitive-seats list implies every seat it leaves out is Safe for the party
// that holds it: fill those in (flagged `inferred`) so the House grid and the agreement
// counts cover all 435 seats rather than only the ones some rater found interesting.
function inferredSafe(race: ForecastedRace): ExternalCall {
  const party = race.margin > 0 ? "R" : "D";
  const rating = `Safe ${party}` as ExternalRating;
  return { rating, ordinal: ratingOrdinal(rating), inferred: true };
}

export function buildRows(raceType: RaceType, forecasters: ExternalForecaster[] = externalForecasts): ComparisonRow[] {
  const ourRaces = forecastsFor(raceType);
  return ourRaces.map((race) => {
    const key = externalKeyOf(race);
    const ours: OurCall = { rating: race.rating, pDem: race.probability, margin: race.margin, ordinal: ratingOrdinal(race.rating) };
    const calls: Record<string, ExternalCall> = {};
    for (const f of forecasters) {
      const c = toCall(f.races[raceType][key]);
      if (c) calls[f.id] = c;
      else if (f.inferSafe?.includes(raceType)) calls[f.id] = inferredSafe(race);
    }
    const ords = [ours.ordinal, ...Object.values(calls).map((c) => c.ordinal)];
    const spread = Math.max(...ords) - Math.min(...ords);
    const maxAbsDelta = Math.max(0, ...Object.values(calls).map((c) => Math.abs(c.ordinal - ours.ordinal)));
    const competitive = ords.some((o) => Math.abs(o) < 4);
    return {
      key, id: race.id, raceType,
      name: raceType === "house" ? race.name : race.electionType === "Special" ? `${race.name} (special)` : race.name,
      state: race.state,
      href: `/${raceType}/${race.id}`,
      seatParty: race.seatParty,
      contest: race.contest,
      ours, calls, spread, maxAbsDelta, competitive,
    };
  });
}

export interface AgreementSummary {
  forecasterId: string;
  raceType: RaceType;
  compared: number;    // races both sides call
  same: number;        // identical step
  withinOne: number;   // within one step (same included)
  weMoreD: number;     // our call sits further toward the Democrats than theirs
  weMoreR: number;
  differentFavorite: number; // the two calls favor different parties (Toss-up favors neither: not counted)
  meanDelta: number | null;  // mean of (ours − theirs) in steps; positive = we lean more Republican
  meanAbsProbDiff: number | null; // models only: mean |our P(D) − theirs|
}

export function agreement(rows: ComparisonRow[], forecasterId: string): AgreementSummary {
  let compared = 0, same = 0, withinOne = 0, weMoreD = 0, weMoreR = 0, differentFavorite = 0, sumDelta = 0, sumProb = 0, nProb = 0;
  for (const row of rows) {
    const c = row.calls[forecasterId];
    if (!c) continue;
    compared += 1;
    const d = row.ours.ordinal - c.ordinal;
    sumDelta += d;
    if (d === 0) same += 1;
    if (Math.abs(d) <= 1) withinOne += 1;
    if (d < 0) weMoreD += 1;
    if (d > 0) weMoreR += 1;
    if (row.ours.ordinal * c.ordinal < 0) differentFavorite += 1;
    if (c.pDem != null) { sumProb += Math.abs(row.ours.pDem - c.pDem); nProb += 1; }
  }
  return {
    forecasterId, raceType: rows[0]?.raceType ?? "house", compared, same, withinOne, weMoreD, weMoreR, differentFavorite,
    meanDelta: compared ? sumDelta / compared : null,
    meanAbsProbDiff: nProb ? sumProb / nProb : null,
  };
}

// ── Chamber toplines ─────────────────────────────────────────────────────────

export interface ChamberTopline {
  pDemControl: number | null;
  demSeats: number | null; // expected (models, ours) or rated-D seats (raters)
  repSeats: number | null;
  tossups: number | null;
  range80: [number, number] | null;
  derived: boolean; // counted from the per-race calls rather than read from the site
}

export function ourTopline(raceType: RaceType): ChamberTopline {
  const sim = getChamberSimulations()[raceType];
  const called = seatTotals(forecastsFor(raceType), SEAT_HOLDOVERS[raceType]).called;
  return {
    pDemControl: sim.pDemControl,
    demSeats: raceType === "governor" ? called.dem : sim.meanDem,
    repSeats: raceType === "governor" ? called.rep : TOTAL_SEATS_BY_TYPE[raceType] - sim.meanDem,
    tossups: null,
    range80: [sim.lo80, sim.hi80],
    derived: false,
  };
}

export function externalTopline(f: ExternalForecaster, raceType: RaceType, rows: ComparisonRow[]): ChamberTopline | null {
  const t = f.totals[raceType];
  if (t && (t.demSeats != null || t.pDemControl != null)) {
    return { pDemControl: t.pDemControl ?? null, demSeats: t.demSeats ?? null, repSeats: t.repSeats ?? null, tossups: t.tossups ?? null, range80: t.range80 ?? null, derived: false };
  }
  // Count the per-race calls when they cover the whole chamber.
  const calls = rows.map((r) => r.calls[f.id]);
  if (calls.some((c) => !c)) return null;
  const hold = SEAT_HOLDOVERS[raceType];
  let dem = hold.dem, rep = hold.rep, toss = 0;
  for (const c of calls) {
    if (!c) continue;
    if (c.ordinal < 0) dem += 1; else if (c.ordinal > 0) rep += 1; else toss += 1;
  }
  return { pDemControl: null, demSeats: dem, repSeats: rep, tossups: toss, range80: null, derived: true };
}

export function comparisonFor(raceType: RaceType) {
  const rows = buildRows(raceType);
  const forecasters = externalForecasts.filter((f) => rows.some((r) => r.calls[f.id]));
  return {
    rows,
    forecasters,
    summaries: forecasters.map((f) => agreement(rows, f.id)),
    toplines: Object.fromEntries(forecasters.map((f) => [f.id, externalTopline(f, raceType, rows)])) as Record<string, ChamberTopline | null>,
    ours: ourTopline(raceType),
  };
}
