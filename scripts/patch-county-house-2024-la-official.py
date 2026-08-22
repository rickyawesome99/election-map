#!/usr/bin/env python3
"""
Replaces LA's 2024 House county rows with the Louisiana Secretary of State's own
official parish-level canvass, closing the ~948K-vote gap MEDSL's precinct file leaves
(MEDSL's LA source explicitly excludes early voting - see house_2024_precinct_README.md:
"Louisiana reports early voting only at the parish level... early votes are NOT included
in the precinct data" - confirmed structurally absent, not just a parsing gap: no
precinct labeled EARLY/ABSENTEE appears anywhere in LA's MEDSL rows). Wikipedia and
OpenElections were also checked and are dead ends for LA 2024 House (no "By county"
tables on any of the 6 district pages; openelections-data-la has no 2022/2024 folder).

Source: the LA SOS's own "Graphical Election Results" viewer
(voterportal.sos.la.gov/graphical) is a JS-rendered Angular app, previously confirmed a
dead end for automated fetching (see this project's LA 2023 Governor session) - but its
"Download Results" button turns out to hit a STATIC S3-hosted "human readable" XLSX
export, found by fetching /ElectionResults/GraphicalConfig (the app's own config
endpoint) and reading `humanReadableExcelUrl`:
https://s3-us-west-2.amazonaws.com/mediaresults.sos.la.gov/HumanReadableElectionResults/{YYYYMMDD}/Election+Results+({MM-DD-YYYY}).xlsx
This IS a genuine official canvass (matches house_past_results.csv's district totals
exactly - includes early voting, absentee, and Election Day combined) and needs no
Angular rendering to fetch. Worth trying this exact URL pattern for ANY future LA gap
(other years/offices) before assuming the SOS portal is unfetchable again.

The "Multi-Parish(Parish)" sheet has one section per statewide/multi-parish race
("U. S. Representative -- Nth Congressional District"), each a small table of
candidate columns x parish rows. Bucketing follows this project's standing convention:
only the candidate house_past_results.csv designates as dem_candidate/rep_candidate for
that district gets bucketed dem/gop; every other candidate (even same-party) goes to oth
- matches how LA-04's second Republican (Joshua Morott) and every district's minor
candidates are already handled elsewhere in this pipeline.

Run from project root: python3 scripts/patch-county-house-2024-la-official.py
"""
import csv, os, re, unicodedata, urllib.request
import openpyxl

ROOT = os.path.join(os.path.dirname(__file__), "..")
XLSX_URL = "https://s3-us-west-2.amazonaws.com/mediaresults.sos.la.gov/HumanReadableElectionResults/20241105/Election+Results+(11-05-2024).xlsx"
CACHE_PATH = os.path.join(ROOT, "data-entry/la_2024_official_results.xlsx")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2024.csv")
YEAR = 2024

TRUE_PARTY_RE = re.compile(r"\((D|R)\)\s*$")
XLSX_PARTY_RE = re.compile(r"\s*\((DEM|REP|NOPTY|OTHER|IND|GRN|LBT)\)\s*$")
SUFFIX_TOKENS = {"JR", "SR", "II", "III", "IV"}


def norm_name(name: str) -> str:
    name = TRUE_PARTY_RE.sub("", name)
    name = XLSX_PARTY_RE.sub("", name)
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = name.replace(",", "").replace(".", "").replace('"', "").replace("-", "")
    return re.sub(r"\s+", " ", name).strip().upper()


def last_name_token(full_name: str) -> str:
    toks = [t for t in norm_name(full_name).split() if t not in SUFFIX_TOKENS]
    return toks[-1] if toks else ""


def norm_parish(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().lower()


def load_house_2024_la():
    m = {}
    with open(HOUSE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["year"] == str(YEAR) and row["state_abbr"] == "LA":
                dnum = int(row["district_name"].split("-")[1])
                m[dnum] = row
    return m


def load_fips():
    """{normalized parish name: fips} from the presidential CSV - the canonical
    display-name/fips source this pipeline always uses (see fill-county-house-2024-medsl.py's
    load_fips_names())."""
    m = {}
    with open(PRES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["county_id"][:2] == "22":
                m[norm_parish(row["county_name"])] = (row["county_id"], row["county_name"])
    return m


def fetch_xlsx():
    if os.path.exists(CACHE_PATH):
        return CACHE_PATH
    print(f"Downloading {XLSX_URL} ...")
    req = urllib.request.Request(XLSX_URL, headers={"User-Agent": "election-map-data-pipeline/1.0"})
    with urllib.request.urlopen(req) as r, open(CACHE_PATH, "wb") as out:
        out.write(r.read())
    return CACHE_PATH


def bucket_candidate(cand_raw, dem_row, rep_row):
    """dem_row/rep_row are house_past_results.csv candidate strings (or "" if none -
    LA-04 has a blank dem_candidate, an unopposed race)."""
    dem_col_bucket = "dem" if not TRUE_PARTY_RE.search(dem_row.strip()) else ("dem" if TRUE_PARTY_RE.search(dem_row.strip()).group(1) == "D" else "gop")
    rep_col_bucket = "gop" if not TRUE_PARTY_RE.search(rep_row.strip()) else ("dem" if TRUE_PARTY_RE.search(rep_row.strip()).group(1) == "D" else "gop")
    dem_name, rep_name = norm_name(dem_row), norm_name(rep_row)
    dem_last, rep_last = last_name_token(dem_row), last_name_token(rep_row)
    n = norm_name(cand_raw)
    cand_last = last_name_token(cand_raw)
    if dem_name and n == dem_name:
        return dem_col_bucket
    if rep_name and n == rep_name:
        return rep_col_bucket
    distinct_last = bool(dem_last) and bool(rep_last) and dem_last != rep_last
    if distinct_last:
        if cand_last == dem_last:
            return dem_col_bucket
        if cand_last == rep_last:
            return rep_col_bucket
    return "oth"


def main():
    path = fetch_xlsx()
    house_2024 = load_house_2024_la()
    fips_map = load_fips()

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Multi-Parish(Parish)"]
    rows = list(ws.iter_rows(values_only=True))
    starts = [i for i, r in enumerate(rows) if r and r[0] and "Congress" in str(r[0])]
    starts.append(len(rows))

    by_fips = {}  # fips -> {"dem":.., "gop":.., "oth":.., "districts": set(), "name":..}
    unmatched_parishes = set()
    district_totals = {}

    for si in range(len(starts) - 1):
        header = rows[starts[si]][0]
        m = re.search(r"(\d+)(?:st|nd|rd|th) Congressional District", header)
        dnum = int(m.group(1))
        past = house_2024.get(dnum)
        if past is None:
            print(f"SKIP {header}: no house_past_results.csv row")
            continue

        cand_row = rows[starts[si] + 1]
        candidates = [c for c in cand_row[1:] if c]
        total_row = rows[starts[si] + 2]
        assert total_row[0] == "Total Votes", total_row

        bucket_of = [bucket_candidate(c, past["dem_candidate"], past["rep_candidate"]) for c in candidates]

        d_dem = d_gop = d_oth = 0
        for r in rows[starts[si] + 3: starts[si + 1]]:
            if not r or r[0] is None:
                break  # blank row marks the end of this race's parish list
            parish_raw = r[0]
            key = norm_parish(parish_raw)
            if key not in fips_map:
                unmatched_parishes.add(parish_raw)
                continue
            fips, display_name = fips_map[key]
            entry = by_fips.setdefault(fips, {"dem": 0, "gop": 0, "oth": 0, "districts": set(), "name": display_name})
            for bucket, v in zip(bucket_of, r[1:1 + len(candidates)]):
                v = v or 0
                entry[bucket if bucket != "oth" else "oth"] = entry.get(bucket, 0) + v
                if bucket == "dem":
                    d_dem += v
                elif bucket == "gop":
                    d_gop += v
                else:
                    d_oth += v
            entry["districts"].add(dnum)

        ref_dem, ref_gop, ref_total = int(past["dem_votes"] or 0), int(past["rep_votes"] or 0), int(past["total_votes"] or 0)
        d_total = d_dem + d_gop + d_oth
        print(f"LA-{dnum:02d}: dem={d_dem} gop={d_gop} oth={d_oth} total={d_total} "
              f"| ref dem={ref_dem} gop={ref_gop} total={ref_total} "
              f"| diff dem={d_dem-ref_dem} gop={d_gop-ref_gop} total={d_total-ref_total}")

    if unmatched_parishes:
        print("UNMATCHED PARISH NAMES (not written):", unmatched_parishes)

    # Write LA rows (all 64 parishes) into county_house_results_2024.csv, replacing
    # whatever LA rows are currently there (from the MEDSL Election-Day-only fill).
    with open(OUT_CSV, newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        existing = [r for r in reader if r["state"] != "LA"]

    new_rows = []
    for fips, v in sorted(by_fips.items()):
        districts = ";".join(str(d) for d in sorted(v["districts"]))
        total = v["dem"] + v["gop"] + v["oth"]
        new_rows.append({
            "state": "LA", "county_name": v["name"], "county_id": fips,
            f"dem_{YEAR}": v["dem"], f"gop_{YEAR}": v["gop"], f"oth_{YEAR}": v["oth"], f"total_{YEAR}": total,
            f"districts_{YEAR}": districts,
        })

    print(f"\nWriting {len(new_rows)} LA parishes (was expecting 64).")
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in existing + new_rows:
            w.writerow(r)
    print(f"Wrote -> {OUT_CSV} ({len(existing) + len(new_rows)} total rows)")


if __name__ == "__main__":
    main()
