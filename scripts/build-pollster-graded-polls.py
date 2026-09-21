#!/usr/bin/env python3
"""Graded polls (every late general-election poll scored against the result) →
data-entry/pollster_graded_polls.csv. Input to scripts/build-pollster-ratings.py.

Two sources, both FiveThirtyEight:
  ≤ 2022  github.com/fivethirtyeight/data  pollster-ratings/raw_polls.csv — 538's own graded
          file (polls in the final ~60 days, top-two margin, actual result attached).
  2023–24 the poll archive that went dark with 538 in March 2025 (Wayback copies of
          {president,senate,house,governor,generic_ballot}_polls_historical.csv), graded here
          against the site's own past-results CSVs with the same rules: general stage, no
          hypotheticals, both top-two finishers named, the likeliest-voter population of each
          poll (lv > rv > v > a), remaining questions averaged.
Primaries are not graded (the forecast uses general-election polls only).

Columns: margins are R-positive (rep − dem) like the rest of the repo; `oriented` = 0 when
the top two were not one D-slot and one R-slot candidate (top-two same-party runoffs) — those
rows count for accuracy but not for partisan bias. `days` = election day − field midpoint.

Usage: python3 scripts/build-pollster-graded-polls.py [dir-with-538-csvs]
"""
import csv, os, sys, urllib.request, datetime, collections, re, unicodedata
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DE = os.path.join(REPO, "data-entry")
OUT = os.path.join(DE, "pollster_graded_polls.csv")
UA = "election-map-research/1.0 (pollster ratings)"
WAYBACK = "https://web.archive.org/web/20250306id_/https://projects.fivethirtyeight.com/polls/data/{}.csv"
ARCHIVE = ["president_polls_historical", "senate_polls_historical", "house_polls_historical", "governor_polls_historical", "generic_ballot_polls_historical"]
MAX_DAYS = 60
FIRST_CYCLE = 2008

src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(DE, "fivethirtyeight")
os.makedirs(src, exist_ok=True)
def fetch(name, url):
    p = os.path.join(src, name + ".csv")
    if not os.path.exists(p):
        print("downloading", url)
        open(p, "wb").write(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=300).read())
    return p
RAW = fetch("raw_polls", "https://raw.githubusercontent.com/fivethirtyeight/data/master/pollster-ratings/raw_polls.csv")
ARCH = {n: fetch(n, WAYBACK.format(n)) for n in ARCHIVE}

TYPE = {"Pres-G": "P", "Sen-G": "S", "Gov-G": "G", "House-G": "H", "House-G-US": "GB"}
FIELDS = ["year", "type", "location", "race", "pollster_id", "pollster", "partisan", "methodology", "date", "days", "sample", "poll_margin", "actual_margin", "error", "oriented"]
out = []

# ── ≤ 2022: 538's graded file ────────────────────────────────────────────────
def orient(p1, p2):
    """+1 when cand1 sits in the R slot, −1 in the D slot, 0 when the pair has no D/R axis."""
    if p1 == p2: return 0
    if p1 == "REP" or p2 == "DEM": return 1
    if p1 == "DEM" or p2 == "REP": return -1
    return 0
for r in csv.DictReader(open(RAW)):
    t = TYPE.get(r["type_simple"])
    if not t or int(r["cycle"]) < FIRST_CYCLE or int(r["time_to_election"]) > MAX_DAYS: continue
    o = orient(r["cand1_party"], r["cand2_party"])
    s = o or 1
    pm, am = s * float(r["margin_poll"]), s * float(r["margin_actual"])
    part = [p for p in r["partisan"].split(",") if p in ("DEM", "REP")]
    out.append({"year": int(r["electiondate"][:4]), "type": t, "location": r["location"], "race": r["race"], "pollster_id": r["pollster_rating_id"], "pollster": r["pollster"],
                "partisan": {"DEM": "D", "REP": "R"}[part[0]] if len(part) == 1 else "", "methodology": r["methodology"], "date": r["polldate"], "days": int(r["time_to_election"]),
                "sample": "" if r["samplesize"] in ("NA", "") else round(float(r["samplesize"])), "poll_margin": round(pm, 2), "actual_margin": round(am, 2), "error": round(pm - am, 2), "oriented": 1 if o else 0})
n_raw = len(out)

# ── 2023–24: archive polls graded against the site's results ─────────────────
def norm(s): return re.sub(r"[^a-z ]", "", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower())
def surname(name):
    parts = [w for w in norm(re.sub(r"\(.*?\)", "", name)).split() if w not in ("jr", "sr", "ii", "iii", "iv")]
    return parts[-1] if parts else ""
def num(s): return float(str(s).replace(",", "") or 0)
def rows(name): return csv.DictReader(open(os.path.join(DE, name)))
abbr = {r["state_name"]: r["state_abbr"] for r in rows("house_seats.csv")}
abbr["District of Columbia"] = "DC"

results = {}  # (office, year, location, seat) → (dem surname, rep surname, actual R-margin)
for r in rows("president_past_results.csv"):
    results[("P", int(r["year"]), r["state_abbr"], "")] = (surname(r["dem_candidate"]), surname(r["rep_candidate"]), num(r["rep_pct"]) - num(r["dem_pct"]))
for r in rows("pop_vote.csv"):
    if r["type"] == "President":
        y = int(r["year"]); any_state = results[("P", y, "PA", "")]
        results[("P", y, "US", "")] = (any_state[0], any_state[1], num(r["rep_pct"]) - num(r["dem_pct"]))
for r in rows("senate_past_results.csv"):
    results[("S", int(r["year"]), r["state_abbr"], "Class " + "I" * int(r["class"]))] = (surname(r["dem_candidate"]), surname(r["rep_candidate"]), num(r["rep_pct"]) - num(r["dem_pct"]), r["type"] == "Special")
for r in rows("governor_past_results.csv"):
    results[("G", int(r["year"]), r["state_abbr"], "")] = (surname(r["dem_candidate"]), surname(r["rep_candidate"]), num(r["rep_pct"]) - num(r["dem_pct"]))
for r in rows("house_past_results.csv"):
    if r["dem_candidate"] and r["rep_candidate"]:
        results[("H", int(r["year"]), r["district_name"], "")] = (surname(r["dem_candidate"]), surname(r["rep_candidate"]), num(r["rep_pct"]) - num(r["dem_pct"]))
house_pv = {int(r["year"]): float(r["house_pv_margin"]) for r in rows("national_environment_history.csv")}

def date(d): m, dd, y = d.split("/"); return datetime.date(2000 + int(y), int(m), int(dd))
POP_RANK = {"lv": 0, "rv": 1, "v": 2, "a": 3}
stats = collections.Counter()
questions = collections.OrderedDict()  # (office, question_id) → {meta, answers}
for name in ARCHIVE:
    office = {"president": "P", "senate": "S", "house": "H", "governor": "G", "generic": "GB"}[name.split("_")[0]]
    for r in csv.DictReader(open(ARCH[name])):
        if int(r["cycle"]) < 2023 or r["stage"] != "general" or r.get("hypothetical") == "true" or not r["election_date"]: continue
        if r.get("ranked_choice_round") not in (None, "", "1"): continue
        q = questions.setdefault((office, r["question_id"]), {"r": r, "ans": {}})
        if office == "GB": q["ans"] = {"__dem": float(r["dem"] or 0), "__rep": float(r["rep"] or 0)}
        else: q["ans"][surname(r["candidate_name"])] = float(r["pct"])

polls = collections.OrderedDict()  # (office, poll_id, race key) → questions
for (office, _), q in questions.items():
    r = q["r"]; el = date(r["election_date"]); year = el.year
    if office == "GB": loc, res = "US", ("__dem", "__rep", house_pv.get(year))
    else:
        st = "US" if not r["state"] else abbr.get(r["state"])
        if st is None: stats["skip: sub-state / unknown location"] += 1; continue
        loc = f"{st}-{max(1, int(r['seat_number'] or 1)):02d}" if office == "H" else st
        res = results.get((office, year, loc, r["seat_name"] if office == "S" else ""))
    if not res or res[2] is None: stats[f"skip: no result {office}"] += 1; continue
    d, p = q["ans"].get(res[0]), q["ans"].get(res[1])
    if d is None or p is None: stats["skip: top two not both named"] += 1; continue
    mid = date(r["start_date"]) + (date(r["end_date"]) - date(r["start_date"])) / 2
    days = (el - mid).days
    if days < 0 or days > MAX_DAYS or date(r["end_date"]) >= el: stats["skip: outside window"] += 1; continue
    kind = {"P": "Pres-G", "S": "Sen-GS" if len(res) > 3 and res[3] else "Sen-G", "G": "Gov-G", "H": "House-G", "GB": "House-G"}[office]
    race = f"{year}_{kind}_{loc}"
    polls.setdefault((office, r["poll_id"], race), []).append({"r": r, "margin": p - d, "actual": res[2], "days": days, "mid": mid, "loc": loc, "year": year})
for (office, _, race), qs in polls.items():
    best = min(POP_RANK.get(q["r"]["population"], 9) for q in qs)
    qs = [q for q in qs if POP_RANK.get(q["r"]["population"], 9) == best]
    r = qs[0]["r"]; pm = sum(q["margin"] for q in qs) / len(qs)
    samples = [float(q["r"]["sample_size"]) for q in qs if q["r"]["sample_size"]]
    out.append({"year": qs[0]["year"], "type": office, "location": qs[0]["loc"], "race": race, "pollster_id": r["pollster_rating_id"], "pollster": r["pollster_rating_name"] or r["pollster"],
                "partisan": {"DEM": "D", "REP": "R"}.get(r["partisan"], ""), "methodology": r["methodology"], "date": qs[0]["mid"].isoformat(), "days": qs[0]["days"],
                "sample": round(sum(samples) / len(samples)) if samples else "", "poll_margin": round(pm, 2), "actual_margin": round(qs[0]["actual"], 2), "error": round(pm - qs[0]["actual"], 2), "oriented": 1})

out.sort(key=lambda x: (x["year"], x["type"], x["location"], x["race"], x["date"], x["pollster"]))
with open(OUT, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader(); w.writerows(out)
print(dict(stats))
print(f"wrote {OUT}: {len(out)} graded polls ({n_raw} from raw_polls, {len(out) - n_raw} graded here)")
by = collections.Counter((x["year"], x["type"]) for x in out if x["year"] >= 2020)
print("  " + "  ".join(f"{y} {t}: {n}" for (y, t), n in sorted(by.items())))
