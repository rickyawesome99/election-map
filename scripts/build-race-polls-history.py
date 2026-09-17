#!/usr/bin/env python3
"""Historical race polls (2018–2024 Senate / Governor / House generals) from the
FiveThirtyEight poll archive → data-entry/race_polls_history.csv.

Source: projects.fivethirtyeight.com/polls/data/{senate,house,governor}_polls_historical.csv,
which went dark with 538 in March 2025; the Wayback Machine holds the last copies
(web.archive.org/web/2025id_/<url>). Pass a directory of those three files, or let the
script download them.

One row per poll question: the DEM and REP nominee shares (highest per party when a
question lists more than one), general-election stage only, no hypothetical match-ups.
Race keys follow the site's past-results CSVs: Senate "Senate" / "Senate Special" (special =
the class NOT regularly up that year), Governor "Governor", House "House {ST}-{NN}".
Feeds scripts/forwardBacktest.ts (--polls): the poll-weight fit by horizon.

Usage: python3 scripts/build-race-polls-history.py [dir-with-538-csvs]
"""
import csv, os, sys, urllib.request, datetime, collections
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "data-entry", "race_polls_history.csv")
FILES = {"S": "senate_polls_historical", "H": "house_polls_historical", "G": "governor_polls_historical"}
UA = "election-map-research/1.0 (race poll history)"
REGULAR_CLASS = {2016: "Class III", 2018: "Class I", 2020: "Class II", 2022: "Class III", 2024: "Class I"}

src_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "data-entry", "fivethirtyeight")
os.makedirs(src_dir, exist_ok=True)
for name in FILES.values():
    p = os.path.join(src_dir, name + ".csv")
    if not os.path.exists(p):
        url = f"https://web.archive.org/web/2025id_/https://projects.fivethirtyeight.com/polls/data/{name}.csv"
        print("downloading", url)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        open(p, "wb").write(urllib.request.urlopen(req, timeout=120).read())

abbr = {r["state_name"]: r["state_abbr"] for r in csv.DictReader(open(os.path.join(REPO, "data-entry", "house_seats.csv")))}
def iso(d):  # "11/4/24" → 2024-11-04
    m, dd, y = d.split("/"); return datetime.date(2000 + int(y), int(m), int(dd)).isoformat()

out = []; stats = collections.Counter()
for office, name in FILES.items():
    q = collections.OrderedDict()
    for r in csv.DictReader(open(os.path.join(src_dir, name + ".csv"))):
        if r["stage"] != "general" or r["hypothetical"] == "true": stats["skip-stage/hypo"] += 1; continue
        if r["party"] not in ("DEM", "REP"): continue
        if r["state"] not in abbr: stats["skip-state"] += 1; continue
        k = r["question_id"]
        e = q.setdefault(k, {"r": r, "DEM": None, "REP": None})
        v = float(r["pct"])
        if e[r["party"]] is None or v > e[r["party"]]: e[r["party"]] = v
    for e in q.values():
        r = e["r"]
        if e["DEM"] is None or e["REP"] is None: stats["skip-one-party"] += 1; continue
        if not r["election_date"]: stats["skip-no-election-date"] += 1; continue
        year = int(r["cycle"]); st = abbr[r["state"]]
        if office == "S":
            race = "Senate" if r["seat_name"] == REGULAR_CLASS.get(year) else "Senate Special"
        elif office == "G": race = "Governor"
        else: race = f"House {st}-{max(1, int(r['seat_number'] or 1)):02d}"
        out.append({"year": year, "office": office, "state": st, "race": race, "pollster": r["pollster"], "partisan": {"DEM": "D", "REP": "R"}.get(r["partisan"], ""),
                    "start": iso(r["start_date"]), "end": iso(r["end_date"]), "sample": r["sample_size"], "population": r["population"], "dem": e["DEM"], "rep": e["REP"], "grade": r["numeric_grade"]})
        stats[f"rows-{office}"] += 1
out.sort(key=lambda x: (x["year"], x["office"], x["state"], x["race"], x["end"]))
with open(OUT, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)
print(dict(stats)); print("wrote", OUT, len(out), "rows;", len({(x["year"], x["office"], x["state"], x["race"]) for x in out}), "races")
