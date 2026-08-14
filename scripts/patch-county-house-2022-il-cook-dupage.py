#!/usr/bin/env python3
"""
Patches Cook (17031) and DuPage (17043) counties into
data-entry/county_house_results_2022.csv - the last remaining real House gap this
project ever had (IL-03/04/06/07 entirely absent from MEDSL's 2022 file, no
OpenElections 2022 IL folder, Wikipedia has zero by-county tables for IL 2022 House).

Source: user-supplied official Illinois State Board of Elections 2022 general election
county-level results file (data-entry/medsl equivalent not used here - this is a
standalone official state canvass file, tab-delimited, one row per office/candidate/
county, already aggregated to county level - no precinct rollup needed). Saved at
~/Downloads/2022gecty_639222577436917044.txt (cp1252 encoded, not UTF-8 - has a raw
0xd3 byte, breaks utf-8/utf-8-sig decoding).

Extracted every "{N} CONGRESS" row for County in (COOK, DuPAGE), bucketed by last-name
match against house_past_results.csv's IL 2022 dem_candidate/rep_candidate per
district (accented "García" normalized to ASCII before matching). Minor-party/write-in
candidates (Libertarian, Independent, Working Class Party, blank write-ins) bucketed as
oth. 11 districts touch these two counties: IL-01/02/03/04/05/06/07/08/09/10/11 (Cook);
IL-03/04/06/08/11 (DuPage).

**Validated exactly**: summing the current (pre-patch) IL county file - which already
correctly covers every OTHER IL county via MEDSL - and comparing against
house_past_results.csv's full IL 2022 state total left a gap of exactly 1,261,346 dem /
472,677 gop. Cook's computed total (1,069,080 dem / 327,014 gop) plus DuPage's
(192,266 dem / 145,663 gop) sums to EXACTLY that gap on both columns - about as strong a
confirmation as this pipeline can get without a second independent source.

Run from project root: python3 scripts/patch-county-house-2022-il-cook-dupage.py
"""
import csv, os
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2022.csv")
IL_FILE = os.path.expanduser("~/Downloads/2022gecty_639222577436917044.txt")
YEAR = 2022

DEM_LAST = {1: "jackson", 2: "kelly", 3: "ramirez", 4: "garcia", 5: "quigley",
            6: "casten", 7: "davis", 8: "krishnamoorthi", 9: "schakowsky",
            10: "schneider", 11: "foster"}
REP_LAST = {1: "carlson", 2: "lynch", 3: "burau", 4: "falakos", 5: "hanson",
            6: "pekau", 7: None, 8: "dargis", 9: "rice", 10: "severino", 11: "lauf"}

COUNTY_FIPS = {"COOK": "17031", "DuPAGE": "17043"}
COUNTY_NAME = {"COOK": "Cook", "DuPAGE": "DuPage"}


def norm(s):
    s = s.upper()
    for a, b in {"Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ñ": "N"}.items():
        s = s.replace(a, b)
    return s


def main():
    by_county = defaultdict(lambda: defaultdict(int))
    by_county_districts = defaultdict(set)

    with open(IL_FILE, encoding="cp1252") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            office = row["OfficeName"]
            county = row["County"]
            if "CONGRESS" not in office or county not in COUNTY_FIPS:
                continue
            num = int("".join(ch for ch in office.split()[0] if ch.isdigit()))
            last = norm(row["CanLastName"])
            votes = int(row["Votes"])
            dem_last, rep_last = DEM_LAST.get(num), REP_LAST.get(num)
            if dem_last and dem_last.upper() in last:
                bucket = "dem"
            elif rep_last and rep_last.upper() in last:
                bucket = "gop"
            else:
                bucket = "oth"
            by_county[county][bucket] += votes
            by_county_districts[county].add(num)

    with open(OUT_CSV, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    existing_ids = {r["county_id"] for r in rows}
    for county, fips in COUNTY_FIPS.items():
        if fips in existing_ids:
            print(f"{COUNTY_NAME[county]} County ({fips}) already present - skipped.")
            continue
        b = by_county[county]
        dem, gop, oth = b.get("dem", 0), b.get("gop", 0), b.get("oth", 0)
        total = dem + gop + oth
        districts = ";".join(str(d) for d in sorted(by_county_districts[county]))
        rows.append({
            "state": "IL", "county_name": COUNTY_NAME[county], "county_id": fips,
            f"dem_{YEAR}": dem, f"gop_{YEAR}": gop, f"oth_{YEAR}": oth,
            f"total_{YEAR}": total, f"districts_{YEAR}": districts,
        })
        print(f"{COUNTY_NAME[county]}: dem={dem} gop={gop} oth={oth} total={total} districts={districts}")

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)

    print(f"Wrote {len(rows)} total rows -> {OUT_CSV}")


if __name__ == "__main__":
    main()
