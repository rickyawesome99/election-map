#!/usr/bin/env python3
"""
Three-way races: how much more do the polls miss? → FORECAST_CONSTANTS.THREE_WAY_SIGMA_MULT

    python3 scripts/threeWayBacktest.py

Unit = one race: the average of its polls fielded in the final 21 days (each pollster's polls
averaged first, then pollsters equally), graded against the result — data-entry/
pollster_graded_polls.csv (2008–2024 Senate/Governor/House; 538's graded file + the 2023–24
archive, see scripts/build-pollster-graded-polls.py). NY (fusion lines split a nominee's vote,
so the top two look small) and the territories are left out.

Race class, from 538's raw_polls.csv (the top two's actual shares and parties):
  normal  D vs R, top two ≥ 92% of the vote
  mid     D vs R, top two 85–92%
  3way    D vs R, top two < 85%  (a third candidate with 15%+ — MT-Sen 2026's Bankhead polls ~17%)
  indep   a non-major candidate among the top two (KS-Sen 2014 Orman, UT-Sen 2022 McMullin;
          NE-Sen 2024 Osborn added by hand — the 2023–24 archive has no raw_polls row)

A race's miss is scaled by the RMSE of ordinary races with as many pollsters (1 · 2 · 3–4 · 5+),
since fewer polls miss more. k = √mean((miss / that RMSE)²) is the maximum-likelihood multiple of
the ordinary spread for the class (ordinary races give 1.00 by construction — the check); a
4,000-draw bootstrap gives its 90% interval, and the mean Gaussian log score is shown at several k.
Result 2026-10-30: 3way k = 1.34 (15 races, 0.91–1.76), log score best between 1.25 and 1.5 →
THREE_WAY_SIGMA_MULT 1.35. indep k = 1.73 but carried by one-poll races without a real opponent
(AR-Sen 2008 had no Republican, AR-Sen 2020 only a Libertarian); with ≥ 2 pollsters its RMSE is
below the ordinary races', so two-way independent races (Osborn) are not widened.
"""
import collections
import csv
import math
import os
import random
import statistics as st

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DE = os.path.join(ROOT, "data-entry")
MAX_DAYS = 21

cls = {}
for r in csv.DictReader(open(os.path.join(DE, "fivethirtyeight", "raw_polls.csv"))):
    if r["type_simple"] not in ("Sen-G", "Gov-G", "House-G"):
        continue
    parties = {r["cand1_party"], r["cand2_party"]}
    if len(parties) < 2:
        cls[r["race"]] = "skip"
        continue
    top2 = float(r["cand1_actual"]) + float(r["cand2_actual"])
    cls[r["race"]] = "indep" if parties != {"DEM", "REP"} else "3way" if top2 < 85 else "mid" if top2 < 92 else "normal"
cls["2024_Sen-G_NE"] = "indep"

polls = collections.defaultdict(lambda: collections.defaultdict(list))
for r in csv.DictReader(open(os.path.join(DE, "pollster_graded_polls.csv"))):
    if r["type"] not in ("S", "G", "H") or int(r["days"]) > MAX_DAYS:
        continue
    if r["location"][:2] in ("NY", "PR", "VI", "DC", "GU"):
        continue
    polls[r["race"]][r["pollster"]].append(float(r["error"]))

races = []  # (class, race, pollsters, miss)
for race, by in polls.items():
    c = cls.get(race, "normal" if race.startswith("2024") else None)  # 2024 rows: no raw_polls entry
    if c in (None, "skip"):
        continue
    races.append((c, race, len(by), st.mean(st.mean(v) for v in by.values())))


def rmse(xs):
    return math.sqrt(sum(x * x for x in xs) / len(xs))


def bucket(n):
    return 1 if n == 1 else 2 if n == 2 else 3 if n <= 4 else 5


base = {b: rmse([e for c, _, n, e in races if c == "normal" and bucket(n) == b]) for b in (1, 2, 3, 5)}
print("Ordinary-race RMSE by pollster count:", " · ".join(f"{b}{'+' if b == 5 else ''}: {v:.2f}" for b, v in base.items()))


def k_mle(rs):
    return math.sqrt(st.mean((e / base[bucket(n)]) ** 2 for _, _, n, e in rs))


random.seed(1)
for label in ("normal", "mid", "3way", "indep"):
    rs = [r for r in races if r[0] == label]
    boots = sorted(k_mle([random.choice(rs) for _ in rs]) for _ in range(4000))
    print(f"\n{label:6s} races {len(rs):4d}  k = {k_mle(rs):.2f}  (90% {boots[200]:.2f}–{boots[3800]:.2f})")
    if label in ("3way", "indep"):
        for kk in (1.0, 1.25, 1.35, 1.5, 1.75, 2.0):
            ll = st.mean(-math.log(kk * base[bucket(n)]) - 0.5 * (e / (kk * base[bucket(n)])) ** 2 for _, _, n, e in rs)
            print(f"   k {kk:.2f}  mean log score {ll:.3f}")
        print("   " + ", ".join(f"{race} ({n}p, {e:+.1f})" for _, race, n, e in sorted(rs, key=lambda r: r[1])))
