import type { RacePoll } from "@/data/racePolls";
import { FORECAST_CONSTANTS as F } from "@/data/tplModelData";
import { pollsterIdOf } from "@/lib/pollsterRatings";

// ── Current-cycle house effects ──────────────────────────────────────────────
// A pollster's house effect is how far its numbers sit from the other pollsters' in the
// races they have both polled THIS cycle. Every recent poll is modelled as
//   margin = race level + house effect(pollster) + noise
// and solved by alternating the two sets of means, with each effect shrunk toward its
// prior (0, or ±HOUSE_EFFECT_PARTISAN_PRIOR for a party/campaign poll):
//   h = (Σ (margin − race level) + k × prior) / (n + k),   |h| ≤ HOUSE_EFFECT_CAP
// The poll average then subtracts h from each poll, so a race polled only by one firm's
// favourable pollsters is read net of their lean. Effects are relative to the field, not
// to the truth: an adjustment cannot fix a miss every pollster shares.
//
// Why this and not the historical ratings: scripts/build-pollster-ratings.py --validate and
// scripts/forwardBacktest.ts --pollsters (2018–24) find a pollster's past ACCURACY does not
// carry into the next cycle (weighting by it moves no poll average), while its LEAN relative
// to the field does — and the lean measured inside the cycle beats the lean carried over
// from earlier cycles.

const MS_PER_DAY = 86400000;

export interface HouseEffect { key: string; pollster: string; partisan: "D" | "R" | null; effect: number; polls: number; races: number }
export interface HouseEffects {
  /** R-positive house effect to subtract from this poll's margin. */
  of: (p: Pick<RacePoll, "pollster" | "partisan">) => number;
  table: HouseEffect[];
}
export interface HouseEffectRace { polls: RacePoll[]; shiftFor?: (p: RacePoll) => number }

export const houseEffectKey = (p: Pick<RacePoll, "pollster" | "partisan">) => `${pollsterIdOf(p.pollster)}|${p.partisan ?? ""}`;

export function computeHouseEffects(
  races: HouseEffectRace[], asOf: Date,
  opts: { k?: number; windowDays?: number; partisanPrior?: number; cap?: number } = {},
): HouseEffects {
  const k = opts.k ?? F.HOUSE_EFFECT_K, windowDays = opts.windowDays ?? F.HOUSE_EFFECT_WINDOW_DAYS, partisanPrior = opts.partisanPrior ?? F.HOUSE_EFFECT_PARTISAN_PRIOR, cap = opts.cap ?? F.HOUSE_EFFECT_CAP;
  const prior = (partisan: "D" | "R" | null) => (partisan === "D" ? -partisanPrior : partisan === "R" ? partisanPrior : 0);
  const cutoff = asOf.toISOString().slice(0, 10), asOfMs = asOf.getTime();
  // recent polls of every race at least two pollsters have polled
  type Obs = { key: string; margin: number; poll: RacePoll };
  const usable: Obs[][] = [];
  for (const race of races) {
    const obs = race.polls
      .filter((p) => p.endDate <= cutoff && (asOfMs - new Date(p.endDate).getTime()) / MS_PER_DAY <= windowDays)
      .map((p) => ({ key: houseEffectKey(p), margin: p.diff + (race.shiftFor?.(p) ?? 0), poll: p }));
    if (new Set(obs.map((o) => o.key.split("|")[0])).size >= 2) usable.push(obs);
  }
  const effect = new Map<string, number>();
  const stats = new Map<string, { sum: number; n: number; races: number; poll: RacePoll }>();
  if (k >= 0 && usable.length) {
    for (let iter = 0; iter < 15; iter++) {
      stats.clear();
      for (const obs of usable) {
        const level = obs.reduce((s, o) => s + o.margin - (effect.get(o.key) ?? prior(o.poll.partisan)), 0) / obs.length;
        const seen = new Set<string>();
        for (const o of obs) {
          const st = stats.get(o.key) ?? stats.set(o.key, { sum: 0, n: 0, races: 0, poll: o.poll }).get(o.key)!;
          st.sum += o.margin - level; st.n++;
          if (!seen.has(o.key)) { seen.add(o.key); st.races++; }
        }
      }
      // capped: one race where two pollsters are 30 pts apart (a three-way question against a head-to-head) is not a lean
      for (const [key, st] of stats) effect.set(key, Math.max(-cap, Math.min(cap, (st.sum + k * prior(st.poll.partisan)) / (st.n + k))));
    }
  }
  return {
    of: (p) => effect.get(houseEffectKey(p)) ?? prior(p.partisan),
    table: [...stats].map(([key, st]) => ({ key, pollster: st.poll.pollster, partisan: st.poll.partisan, effect: effect.get(key)!, polls: st.n, races: st.races })).sort((a, b) => b.polls - a.polls),
  };
}
