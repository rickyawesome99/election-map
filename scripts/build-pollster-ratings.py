#!/usr/bin/env python3
"""Pollster ratings from the graded polls (data-entry/pollster_graded_polls.csv, built by
scripts/build-pollster-graded-polls.py) → data/pollsterRatings.ts (the /analysis/pollsters page
page) + data/pollsterLookup.ts (name → id aliases and grades for the poll averages and race pages) + data-entry/pollster_ratings_vintages.csv (ratings as they would
have stood before each past cycle — what scripts/forwardBacktest.ts --pollsters scores, so the
backtest never grades a poll with a rating that already knows its result).

Method (constants below are chosen by `--validate`, a forward test: ratings from cycles < T
predicting each pollster's excess error and house effect in cycle T):
  1. Graded poll = general-election poll whose field midpoint is within GRADE_WINDOW days of the
     election; error = poll margin − result (R-positive, so a negative error overstated Democrats).
  2. Each poll is benchmarked against what a typical poll of that race would have missed by:
       benchmark = f × (mean |error| of the OTHER pollsters in the same race)
                 + (1 − f) × (expected |error| for the race type and year, the sample size and the days out),
       f = nOther / (nOther + FIELD_K).   excess = |error| − benchmark   (negative = beat the field)
  3. Weights: RECENCY_DECAY^(years before the rating date) × 1/√(polls that pollster ran in that race).
  4. score = Σ w·excess / (Σ w + SCORE_K) — shrunk toward the average pollster (0); the letter grade
     is a band of the score. A pollster with few polls stays near the middle on purpose.
  5. bias = mean signed error; house effect = mean of (error − the other pollsters' mean error in the
     same race), both shrunk by BIAS_K.
  6. Regional scores shrink toward the pollster's own overall score:
       score_region = (Σ_region w·excess + REGION_K × score) / (Σ_region w + REGION_K).

Usage: python3 scripts/build-pollster-ratings.py [--validate]
"""
import csv, os, sys, json, math, collections
import numpy as np
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DE = os.path.join(REPO, "data-entry")
SRC = os.path.join(DE, "pollster_graded_polls.csv")
OUT_TS = os.path.join(REPO, "data", "pollsterRatings.ts")
OUT_LOOKUP = os.path.join(REPO, "data", "pollsterLookup.ts")
OUT_VINTAGES = os.path.join(DE, "pollster_ratings_vintages.csv")

CYCLE_START = "2026-01-01"  # polls in the field before this are archive, not 2026 polling (build-race-polls.js)
GRADE_WINDOW = 21      # days before the election
RECENCY_DECAY = 0.84   # per year (halves every 4 years)
FIELD_K = 2.0
SCORE_K = 12.0
BIAS_K = 8.0
REGION_K = 10.0
LIVE_ASOF = 2026
FIRST_DISPLAY_YEAR = 2016   # the page lists pollsters with graded polls since this cycle
VINTAGES = [2018, 2020, 2022, 2024, 2026]

REGIONS = {
    "National": ["US"],
    "Northeast": "ME NH VT MA RI CT NY NJ DE MD DC".split(),
    "Rust Belt": "PA OH MI WI MN IA IN IL".split(),
    "Sun Belt": "AZ NV GA NC FL TX NM".split(),
    "South": "VA SC AL MS LA AR TN KY WV OK MO".split(),
    "Plains & Mountain": "ND SD NE KS MT WY ID UT CO".split(),
    "Pacific": "CA OR WA AK HI".split(),
}
REGION_OF = {st: reg for reg, sts in REGIONS.items() for st in sts}
TYPE_LABEL = {"P": "President", "S": "Senate", "G": "Governor", "H": "House", "GB": "Generic ballot"}

def load():
    polls = []
    for r in csv.DictReader(open(SRC)):
        p = dict(r); p["year"] = int(r["year"]); p["days"] = int(r["days"]); p["error"] = float(r["error"]); p["oriented"] = r["oriented"] == "1"
        p["sample"] = float(r["sample"]) if r["sample"] else None
        p["region"] = REGION_OF.get(r["location"][:2])
        p["abs"] = abs(p["error"])
        polls.append(p)
    return polls

def benchmark(polls, field_k=FIELD_K):
    """Attach `expected`, `field`, `excess`, `rel` (error − others' mean error) and `dup` to each poll."""
    # expected |error|: race type × year cell mean, plus common sample-size and days-out slopes
    cells = collections.defaultdict(list)
    for p in polls: cells[(p["type"], p["year"])].append(p)
    med = np.median([p["sample"] for p in polls if p["sample"]])
    X, y = [], []
    for ps in cells.values():
        m = np.mean([p["abs"] for p in ps]); xs = [(1 / math.sqrt(p["sample"] or med), p["days"]) for p in ps]; xm = np.mean(xs, axis=0)
        for p, x in zip(ps, xs): X.append([x[0] - xm[0], x[1] - xm[1]]); y.append(p["abs"] - m)
    slope = np.linalg.lstsq(np.array(X), np.array(y), rcond=None)[0]
    for ps in cells.values():
        m = np.mean([p["abs"] for p in ps]); xm = np.mean([(1 / math.sqrt(p["sample"] or med), p["days"]) for p in ps], axis=0)
        for p in ps: p["expected"] = m + slope[0] * (1 / math.sqrt(p["sample"] or med) - xm[0]) + slope[1] * (p["days"] - xm[1])
    races = collections.defaultdict(lambda: collections.defaultdict(list))
    for p in polls: races[p["race"]][p["pollster_id"]].append(p)
    for by_pollster in races.values():
        mean_abs = {k: np.mean([p["abs"] for p in v]) for k, v in by_pollster.items()}
        mean_err = {k: np.mean([p["error"] for p in v]) for k, v in by_pollster.items()}
        for k, v in by_pollster.items():
            others = [o for o in by_pollster if o != k]; n = len(others)
            f = n / (n + field_k)
            for p in v:
                p["field"] = np.mean([mean_abs[o] for o in others]) if n else None
                p["excess"] = p["abs"] - (f * p["field"] + (1 - f) * p["expected"] if n else p["expected"])
                p["rel"] = p["error"] - np.mean([mean_err[o] for o in others]) if n >= 2 else None
                p["dup"] = len(v)
    return slope

def rate(polls, as_of, decay=RECENCY_DECAY, score_k=SCORE_K, bias_k=BIAS_K, region_k=REGION_K):
    """Ratings from graded polls of cycles before `as_of` (already benchmarked)."""
    by = collections.defaultdict(list)
    for p in polls:
        if p["year"] < as_of: by[p["pollster_id"]].append(p)
    out = {}
    for pid, ps in by.items():
        w = np.array([decay ** (as_of - 1 - p["year"]) / math.sqrt(p["dup"]) for p in ps])
        ex = np.array([p["excess"] for p in ps])
        score = float((w * ex).sum() / (w.sum() + score_k))
        o = [i for i, p in enumerate(ps) if p["oriented"]]
        bias = float((w[o] * np.array([ps[i]["error"] for i in o])).sum() / (w[o].sum() + bias_k)) if o else 0.0
        rl = [i for i in o if ps[i]["rel"] is not None]
        house = float((w[rl] * np.array([ps[i]["rel"] for i in rl])).sum() / (w[rl].sum() + bias_k)) if rl else 0.0
        regions = {}
        for reg in REGIONS:
            ix = [i for i, p in enumerate(ps) if p["region"] == reg]
            if not ix: continue
            ixo = [i for i in ix if ps[i]["oriented"]]
            regions[reg] = {"n": len(ix), "weight": float(w[ix].sum()), "mae": float(np.average([ps[i]["abs"] for i in ix], weights=w[ix])),
                            "excess": float(np.average(ex[ix], weights=w[ix])), "score": float(((w[ix] * ex[ix]).sum() + region_k * score) / (w[ix].sum() + region_k)),
                            "bias": float(np.average([ps[i]["error"] for i in ixo], weights=w[ixo])) if ixo else None}
        out[pid] = {"id": pid, "polls": ps, "n": len(ps), "weight": float(w.sum()), "score": score, "bias": bias, "house": house, "regions": regions,
                    "mae": float(np.average([p["abs"] for p in ps], weights=w)), "excess": float(np.average(ex, weights=w)),
                    "rawBias": float(np.average([ps[i]["error"] for i in o], weights=w[o])) if o else None}
    return out

def validate(polls):
    """Forward test: ratings as of T (cycles < T) against cycle T's polls, pooled over T."""
    tests = [2016, 2018, 2020, 2022, 2024]
    def pooled(metric, target, **kw):
        num = den = 0.0; n = 0; base = 0.0
        for T in tests:
            R = rate(polls, T, **kw)
            for p in polls:
                if p["year"] != T or p.get(target) is None or (target == "rel" and not p["oriented"]): continue
                r = R.get(p["pollster_id"]); pred = metric(r, p) if r else 0.0
                wt = 1 / math.sqrt(p["dup"])
                num += wt * (p[target] - pred) ** 2; base += wt * p[target] ** 2; den += wt; n += 1
        return 1 - num / base, n
    print("Out-of-sample R² of the prior rating for a poll's excess error (0 = no better than calling every pollster average):")
    for decay in (0.7, 0.78, 0.84, 0.9, 1.0):
        print(f"  decay {decay:<5}" + "".join(f"  k={k:<3} {pooled(lambda r, p: r['score'], 'excess', decay=decay, score_k=k)[0] * 100:6.2f}%" for k in (4, 8, 12, 20, 35)))
    print("…for a poll's house effect (error relative to the other pollsters in the race):")
    for decay in (0.7, 0.84, 1.0):
        print(f"  decay {decay:<5}" + "".join(f"  k={k:<3} {pooled(lambda r, p: r['house'], 'rel', decay=decay, bias_k=k)[0] * 100:6.2f}%" for k in (2, 4, 8, 15, 30)))
    print("…for a poll's raw signed error (does last cycles' partisan bias carry over?):")
    for decay in (0.7, 0.84, 1.0):
        print(f"  decay {decay:<5}" + "".join(f"  k={k:<3} {pooled(lambda r, p: r['bias'], 'error', decay=decay, bias_k=k)[0] * 100:6.2f}%" for k in (2, 8, 30)))
    print("…regional score vs the pollster's overall score, for polls in regions where the pollster had ≥ 5 prior polls:")
    def regional(r, p): return r["regions"].get(p["region"], {}).get("score", r["score"])
    for k in (3, 10, 30, 100, 1e9):
        num = den = 0.0
        for T in tests:
            R = rate(polls, T, region_k=k)
            for p in polls:
                r = R.get(p["pollster_id"])
                if p["year"] != T or not r or r["regions"].get(p["region"], {}).get("n", 0) < 5: continue
                wt = 1 / math.sqrt(p["dup"]); num += wt * (p["excess"] - regional(r, p)) ** 2; den += wt * (p["excess"] - r["score"]) ** 2
        print(f"  region k={k:<6g}  squared error vs overall-only: {num / den * 100:6.2f}%")

def persistence(polls):
    """Does a pollster's record carry into the next cycle? For each test cycle T (2016–2024) and each
    pollster with ≥ 10 graded polls in the eight years before T and ≥ 5 in T: correlation (weighted by
    test-cycle polls, capped at 30) between the prior mean and the test-cycle mean of each measure."""
    out = {}
    for name, key in (("accuracy", "excess"), ("house", "rel"), ("bias", "error")):
        P, Q, W = [], [], []
        for T in (2016, 2018, 2020, 2022, 2024):
            prior, test = collections.defaultdict(list), collections.defaultdict(list)
            for p in polls:
                if p[key] is None or (key != "excess" and not p["oriented"]): continue
                if T - 8 <= p["year"] < T - 1: prior[p["pollster_id"]].append(p[key])
                elif cycle_of(p["year"]) == T: test[p["pollster_id"]].append(p[key])
            for k, v in test.items():
                if len(v) >= 5 and len(prior.get(k, [])) >= 10: P.append(np.mean(prior[k])); Q.append(np.mean(v)); W.append(min(len(v), 30))
        P, Q, W = map(np.array, (P, Q, W)); pm, qm = np.average(P, weights=W), np.average(Q, weights=W)
        cov = (W * (P - pm) * (Q - qm)).sum()
        out[name] = {"n": len(P), "corr": round(float(cov / math.sqrt((W * (P - pm) ** 2).sum() * (W * (Q - qm) ** 2).sum())), 2), "slope": round(float(cov / (W * (P - pm) ** 2).sum()), 2)}
    return out

GRADES = [("A+", -1.1), ("A", -0.8), ("A-", -0.55), ("B+", -0.3), ("B", -0.1), ("B-", 0.1), ("C+", 0.3), ("C", 0.55), ("C-", 0.8), ("D", 1.2)]
def grade(score): return next((g for g, cut in GRADES if score <= cut), "F")

def norm_name(s):
    """Pollster-name key shared with lib/pollsterRatings.ts (normalisePollsterName) — keep the two in step."""
    import re
    s = re.sub(r"\((D|R|I)[^)]*\)", " ", s).replace("**", " ").replace("&", " and ").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9/ ]", " ", s)).strip()

def aliases():
    """normalised name → pollster id: every name 538 used for a rated pollster, then the hand-kept
    data-entry/pollster_aliases.csv (how this cycle's Wikipedia / RCP tables spell them)."""
    import glob
    seen = collections.defaultdict(collections.Counter); label = {}
    for r in csv.DictReader(open(os.path.join(DE, "fivethirtyeight", "raw_polls.csv"))):
        seen[norm_name(r["pollster"])][r["pollster_rating_id"]] += 1; label[r["pollster_rating_id"]] = r["pollster"]
    for f in sorted(glob.glob(os.path.join(DE, "fivethirtyeight", "*_historical.csv"))):
        for r in csv.DictReader(open(f)):
            i = r["pollster_rating_id"]
            if not i: continue
            for k in ("pollster", "display_name", "pollster_rating_name"):
                if r[k]: seen[norm_name(r[k])][i] += 1
            label[i] = r["pollster_rating_name"] or label.get(i) or r["pollster"]
    out = {k: c.most_common(1)[0][0] for k, c in seen.items()}
    for r in csv.DictReader(open(os.path.join(DE, "pollster_aliases.csv"))):
        if r["pollster_id"]: out[norm_name(r["name"])] = r["pollster_id"]
    return out, label

def live_pollsters(alias):
    """This cycle's pollsters: id-or-name key → {name, race polls, generic-ballot polls}.

    Counts only polls in the field on or after CYCLE_START, the same window
    data-entry/build-race-polls.js emits (the generic-ballot file is already 2026-only)."""
    live = {}
    for path, col, field in ((os.path.join(DE, "race_polls.csv"), "pollster", "racePolls"), (os.path.join(DE, "generic_ballot_polls.csv"), "Pollster", "genericPolls")):
        for r in csv.DictReader(open(path)):
            if (r.get("start") or CYCLE_START) < CYCLE_START: continue
            key = alias.get(norm_name(r[col])) or "name:" + norm_name(r[col])
            e = live.setdefault(key, {"name": r[col].replace("**", "").strip(), "racePolls": 0, "genericPolls": 0}); e[field] += 1
    return live

def cycle_of(year): return year + year % 2
def r2(x): return None if x is None else round(float(x), 2)

if __name__ == "__main__":
    polls = [p for p in load() if p["days"] <= GRADE_WINDOW]
    slope = benchmark(polls)
    print(f"{len(polls)} graded polls within {GRADE_WINDOW} days; expected |error| slopes: {slope[0]:.1f}/√n, {slope[1]:+.3f}/day")
    if "--validate" in sys.argv: validate(polls); sys.exit()

    # ratings as they stood before each cycle (the backtest's no-look-ahead view)
    with open(OUT_VINTAGES, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["as_of", "pollster_id", "n", "weight", "score", "bias", "house"])
        for T in VINTAGES:
            for r in sorted(rate(polls, T).values(), key=lambda r: int(r["id"])): w.writerow([T, r["id"], r["n"], round(r["weight"], 2), round(r["score"], 3), round(r["bias"], 3), round(r["house"], 3)])

    alias, label = aliases()
    live = live_pollsters(alias)
    R = rate(polls, LIVE_ASOF)
    rows = []
    for pid, r in R.items():
        ps = r["polls"]; last = max(p["year"] for p in ps)
        if last < FIRST_DISPLAY_YEAR and pid not in live: continue
        cyc = collections.defaultdict(list)
        for p in ps: cyc[cycle_of(p["year"])].append(p)
        typ = collections.defaultdict(list)
        for p in ps: typ[p["type"]].append(p)
        meth = collections.Counter(p["methodology"] for p in ps if p["year"] == last and p["methodology"] not in ("", "NA"))
        lv = live.get(pid, {})
        rows.append({
            "id": pid, "name": label.get(pid, ps[-1]["pollster"]), "grade": grade(r["score"]) if r["n"] >= 5 else None, "score": r2(r["score"]),
            "n": r["n"], "races": len({p["race"] for p in ps}), "weight": round(r["weight"], 1), "firstYear": min(p["year"] for p in ps), "lastYear": last,
            "avgError": r2(r["mae"]), "excess": r2(r["excess"]), "bias": r2(r["bias"]), "rawBias": r2(r["rawBias"]), "house": r2(r["house"]),
            "partisanShare": round(sum(1 for p in ps if p["partisan"]) / len(ps), 2), "partisanLean": (collections.Counter(p["partisan"] for p in ps if p["partisan"]).most_common(1) or [(None, 0)])[0][0],
            "methodology": meth.most_common(1)[0][0] if meth else None,
            "byCycle": [{"cycle": c, "n": len(v), "avgError": r2(np.mean([p["abs"] for p in v])), "excess": r2(np.mean([p["excess"] for p in v])),
                         "bias": r2(np.mean([p["error"] for p in v if p["oriented"]])) if any(p["oriented"] for p in v) else None} for c, v in sorted(cyc.items()) if c >= FIRST_DISPLAY_YEAR - 4],
            "byRegion": [{"region": reg, "n": x["n"], "avgError": r2(x["mae"]), "excess": r2(x["excess"]), "score": r2(x["score"]), "bias": r2(x["bias"])} for reg, x in r["regions"].items()],
            "byType": [{"type": TYPE_LABEL[t], "n": len(v), "avgError": r2(np.mean([p["abs"] for p in v]))} for t, v in typ.items()],
            "racePolls2026": lv.get("racePolls", 0), "genericPolls2026": lv.get("genericPolls", 0),
        })
    for key, lv in live.items():  # this cycle's pollsters with no graded record
        if key not in R:
            rows.append({"id": key, "name": label.get(key, lv["name"]), "grade": None, "score": None, "n": 0, "races": 0, "weight": 0, "firstYear": None, "lastYear": None, "avgError": None, "excess": None,
                         "bias": None, "rawBias": None, "house": None, "partisanShare": None, "partisanLean": None, "methodology": None, "byCycle": [], "byRegion": [], "byType": [], "racePolls2026": lv["racePolls"], "genericPolls2026": lv["genericPolls"]})
    rows.sort(key=lambda x: (x["score"] is None or x["n"] < 5, x["score"] if x["score"] is not None else 0, x["name"]))
    used = {x["id"] for x in rows}
    alias_out = {k: v for k, v in sorted(alias.items()) if v in used}
    cycles = collections.defaultdict(list)
    for p in polls: cycles[cycle_of(p["year"])].append(p)
    meta = {"gradedPolls": len(polls), "pollsters": len(rows), "graded": sum(1 for x in rows if x["grade"]), "window": GRADE_WINDOW, "decay": RECENCY_DECAY, "scoreK": SCORE_K, "biasK": BIAS_K, "regionK": REGION_K,
            "persistence": persistence(polls), "firstYear": min(p["year"] for p in polls), "lastYear": max(p["year"] for p in polls), "regions": REGIONS, "gradeBands": [[g, c] for g, c in GRADES],
            "byCycle": [{"cycle": c, "n": len(v), "avgError": r2(np.mean([p["abs"] for p in v])), "bias": r2(np.mean([p["error"] for p in v if p["oriented"]]))} for c, v in sorted(cycles.items()) if c >= FIRST_DISPLAY_YEAR - 4]}
    with open(OUT_TS, "w") as f:
        f.write("// ⚠️  AUTO-GENERATED — do not edit by hand.\n// python3 scripts/build-pollster-graded-polls.py && python3 scripts/build-pollster-ratings.py\n"
                "// (aliases for this cycle's pollster spellings: data-entry/pollster_aliases.csv)\n\n"
                "// Errors and biases are R-positive margins: bias −2 = the pollster overstated Democrats by 2 pts.\n"
                "// score = shrunk average of (|error| − what a typical poll of the same race missed by); negative is better.\n"
                "export type PollsterCycleRecord = { cycle: number; n: number; avgError: number; excess: number; bias: number | null };\n"
                "export type PollsterRegionRecord = { region: string; n: number; avgError: number; excess: number; score: number; bias: number | null };\n"
                "export type PollsterTypeRecord = { type: string; n: number; avgError: number };\n"
                "export type PollsterRating = {\n  id: string; name: string; grade: string | null; score: number | null; n: number; races: number; weight: number;\n  firstYear: number | null; lastYear: number | null; avgError: number | null; excess: number | null;\n"
                "  bias: number | null; rawBias: number | null; house: number | null; partisanShare: number | null; partisanLean: \"D\" | \"R\" | null; methodology: string | null;\n"
                "  byCycle: PollsterCycleRecord[]; byRegion: PollsterRegionRecord[]; byType: PollsterTypeRecord[]; racePolls2026: number; genericPolls2026: number;\n};\n\n")
        f.write("export const POLLSTER_RATING_META = " + json.dumps(meta, ensure_ascii=False) + " as const;\n\n")
        f.write("export const pollsterRatings: PollsterRating[] = [\n" + "".join("  " + json.dumps(x, ensure_ascii=False, separators=(",", ":")) + ",\n" for x in rows) + "];\n\n")
    # the small lookup the poll averages and race pages import (keeps the full table out of their bundles)
    with open(OUT_LOOKUP, "w") as f:
        f.write("// ⚠️  AUTO-GENERATED by scripts/build-pollster-ratings.py — do not edit by hand.\n\n"
                "// normalised pollster name (lib/pollsterRatings.ts normalisePollsterName) → rating id\n"
                "export const pollsterAliases: Record<string, string> = " + json.dumps(alias_out, ensure_ascii=False, separators=(",", ":")) + ";\n\n"
                "// rating id → [display name, grade (null = fewer than 5 graded polls), score, graded polls]\n"
                "export const pollsterGrades: Record<string, [string, string | null, number | null, number]> = "
                + json.dumps({x["id"]: [x["name"], x["grade"], x["score"], x["n"]] for x in rows if x["n"]}, ensure_ascii=False, separators=(",", ":")) + ";\n")
    unmatched = sorted(((lv["racePolls"] + lv["genericPolls"], lv["name"]) for k, lv in live.items() if k.startswith("name:")), reverse=True)
    print(f"wrote {OUT_TS}: {len(rows)} pollsters ({meta['graded']} graded, {sum(1 for x in rows if x['racePolls2026'] or x['genericPolls2026'])} active in 2026) · {OUT_VINTAGES}")
    print(f"2026 pollsters with no 538 id ({len(unmatched)}): " + ", ".join(f"{n} ({c})" for c, n in unmatched[:40]))
