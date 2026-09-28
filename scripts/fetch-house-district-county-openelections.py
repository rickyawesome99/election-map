#!/usr/bin/env python3
"""
Fetches U.S. House results BY DISTRICT BY COUNTY from OpenElections' county-level general
election files ({year}/{date}__{st}__general__county.csv in each openelections-data-{st}
repo; every row already carries the district) for every state-year that has one, and
writes data-entry/house_district_county_openelections.csv — one row per (year, district,
county), counts as published, nothing summed across districts or rescaled. The builder
(scripts/build-house-district-county-results.py) uses these rows ahead of precinct roll-ups
when they sum to the certified district total.

Candidates are bucketed into the SLOT they fill in house_past_results.csv (dem column /
rep column / other) with the same name-matching tiers as the builder.

Run from project root:  python3 scripts/fetch-house-district-county-openelections.py [2016 …]
"""
import csv, importlib.util, io, os, re, sys, urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/house_district_county_openelections.csv")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
DATES = {2016: "20161108", 2018: "20181106", 2020: "20201103", 2022: "20221108", 2024: "20241105"}
STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split()

def load(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), os.path.join(os.path.dirname(__file__), name))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

wp = load("scrape-county-house-2024.py")          # resolve_fips / load_pres_fips
bl = load("build-house-district-county-results.py")  # bucket_for / norm_name / NON_CANDIDATE_LABELS

HOUSE_OFFICE_RE = re.compile(r"^(u\.?\s?s\.?\s*(house|representative)|united states (house|representative)|congress|us house)", re.I)
NOT_HOUSE_RE = re.compile(r"state|general assembly|delegate|senate", re.I)
NON_CANDIDATE = {s.upper() for s in bl.NON_CANDIDATE_LABELS} | {"TOTAL", "TOTALS", "TOTAL VOTES", "REGISTERED VOTERS", "BALLOTS CAST", "OVER VOTES", "UNDER VOTES", "WRITE-INS", "WRITE-IN", "WRITE IN", "TIMES COUNTED"}


def fetch(year, st):
    url = f"https://raw.githubusercontent.com/openelections/openelections-data-{st.lower()}/master/{year}/{DATES[year]}__{st.lower()}__general__county.csv"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "election-map-data-pipeline/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return year, st, r.read().decode("utf-8-sig", errors="replace")
    except Exception:
        return year, st, None


def load_house_past():
    m = {}
    with open(HOUSE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            m[(int(row["year"]), row["state_abbr"], int(row["district_name"].split("-")[1]))] = row
    return m


def to_int(v):
    v = (v or "").strip().replace(",", "")
    if not v or v in ("-", "*"):
        return None
    try:
        return int(float(v))
    except ValueError:
        return None


def parse(year, st, text, house_past, fips_map, report):
    reader = csv.DictReader(io.StringIO(text))
    cols = {c.lower().strip(): c for c in (reader.fieldnames or [])}
    need = ["county", "office", "candidate", "votes"]
    if any(n not in cols for n in need):
        report.append(f"{year} {st}: unexpected columns {reader.fieldnames}")
        return []
    dcol, pcol = cols.get("district"), cols.get("party")
    at_large = len([k for k in house_past if k[0] == year and k[1] == st]) == 1
    groups = defaultdict(lambda: defaultdict(int))
    names = {}
    for row in reader:
        office = (row[cols["office"]] or "").strip()
        if not HOUSE_OFFICE_RE.search(office) or NOT_HOUSE_RE.search(office):
            continue
        cand = (row[cols["candidate"]] or "").strip()
        if not cand or cand.upper() in NON_CANDIDATE:
            continue
        county = (row[cols["county"]] or "").strip()
        if not county or county.upper() in ("TOTAL", "TOTALS", "STATEWIDE"):
            continue
        d = to_int(row[dcol]) if dcol else None
        if d is None:
            if not at_large:
                continue
            d = 1
        if (year, st, d) not in house_past:
            continue
        votes = to_int(row[cols["votes"]])
        if votes is None:
            continue
        groups[(county, d)][cand] += votes
        names[(county, d)] = row[cols["county"]]
    out = []
    unmatched = set()
    for (county, d), cands in groups.items():
        fips = wp.resolve_fips(fips_map, county)
        if not fips:
            unmatched.add(county)
            continue
        past = house_past[(year, st, d)]
        dem = gop = oth = 0
        for cand, votes in cands.items():
            slot, _ = bl.bucket_for(cand, past, {}, st)
            if slot == "dem":
                dem += votes
            elif slot == "gop":
                gop += votes
            else:
                oth += votes
        out.append(dict(year=year, state=st, district=d, county_fips=fips, county_name=county.title(),
                        dem=dem, gop=gop, oth=oth, total=dem + gop + oth))
    if unmatched:
        report.append(f"{year} {st}: unmatched counties {sorted(unmatched)[:8]}")
    report.append(f"{year} {st}: {len(out)} rows, {len({r['district'] for r in out})} districts")
    return out


def main():
    years = [int(a) for a in sys.argv[1:]] or sorted(DATES)
    house_past = load_house_past()
    pres_fips = wp.load_pres_fips()
    existing = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing = [r for r in csv.DictReader(f) if int(r["year"]) not in years]
    rows = list(existing)
    report = []
    with ThreadPoolExecutor(12) as ex:
        results = list(ex.map(lambda a: fetch(*a), [(y, st) for y in years for st in STATES]))
    for year, st, text in results:
        if text is None:
            continue
        rows.extend(parse(year, st, text, house_past, pres_fips.get(st, {}), report))
    rows.sort(key=lambda r: (int(r["year"]), r["state"], int(r["district"]), r["county_fips"]))
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["year", "state", "district", "county_fips", "county_name", "dem", "gop", "oth", "total"])
        w.writeheader()
        for r in rows:
            w.writerow(r)
    for line in report:
        print(line)
    print(f"Wrote {len(rows)} rows -> {OUT_CSV}")


if __name__ == "__main__":
    main()
