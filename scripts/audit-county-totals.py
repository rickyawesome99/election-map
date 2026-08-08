#!/usr/bin/env python3
"""
Audits every data-entry/county_{senate,governor}_results_{year}.csv against the
corresponding state-level row in data-entry/{senate,governor}_past_results.csv,
summing all counties per (state, year) and comparing to the certified dem/gop totals.

Flags anything outside a tolerance band (max of 1% or 250 votes) as a MISMATCH;
everything else is reported as OK (with the actual diff shown so genuine near-zero
gaps stay visible). Does not fix anything - just reports, so gaps found this way can
be triaged the same way every other gap in this pipeline has been (re-scrape, patch,
or document as an accepted tolerance-level gap).

Run from project root: python3 scripts/audit-county-totals.py
"""
import csv, glob, os, re
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")


def load_past_results(path):
    m = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            state, year, rtype = row["state_abbr"], row["year"], row["type"]
            key = (state, year)
            # Prefer the Regular row when both a Regular and Special row exist for
            # the same state/year; only use Special if that's all there is.
            if key in m and m[key]["type"] != "Special":
                continue
            if key in m and rtype == "Special" and m[key]["type"] != "Special":
                continue
            m[key] = row
    return m


def audit_office(office, county_glob, past_csv_name):
    past_path = os.path.join(ROOT, "data-entry", past_csv_name)
    past = load_past_results(past_path)

    county_files = sorted(glob.glob(os.path.join(ROOT, "data-entry", county_glob)))
    print(f"\n{'='*70}\n{office.upper()} — auditing {len(county_files)} year-files against {past_csv_name}\n{'='*70}")

    all_ok, all_mismatch = [], []
    for path in county_files:
        year = re.search(r"_(\d{4})\.csv$", path).group(1)
        sums = defaultdict(lambda: {"dem": 0, "gop": 0, "total": 0, "counties": 0})
        with open(path, newline="") as f:
            for row in csv.DictReader(f):
                state = row["state"]
                s = sums[state]
                s["dem"] += int(row[f"dem_{year}"])
                s["gop"] += int(row[f"gop_{year}"])
                s["total"] += int(row[f"total_{year}"])
                s["counties"] += 1

        for state, s in sorted(sums.items()):
            key = (state, year)
            if key not in past:
                print(f"  {year} {state}: NO PAST-RESULTS ROW FOUND (key {key}) - {s['counties']} counties, "
                      f"dem={s['dem']} gop={s['gop']} - can't validate")
                all_mismatch.append((year, state, "no past-results row"))
                continue
            row = past[key]
            expected_dem = int(row["dem_votes"].replace(",", ""))
            expected_gop = int(row["rep_votes"].replace(",", ""))
            ddiff = s["dem"] - expected_dem
            gdiff = s["gop"] - expected_gop
            dpct = abs(ddiff) / expected_dem * 100 if expected_dem else 0
            gpct = abs(gdiff) / expected_gop * 100 if expected_gop else 0
            tol_d = max(250, expected_dem * 0.01)
            tol_g = max(250, expected_gop * 0.01)
            line = (f"  {year} {state}: {s['counties']} counties | dem_diff={ddiff:+d} ({dpct:.2f}%) "
                    f"gop_diff={gdiff:+d} ({gpct:.2f}%)")
            if abs(ddiff) > tol_d or abs(gdiff) > tol_g:
                print("MISMATCH" + line)
                all_mismatch.append((year, state, f"dem_diff={ddiff} gop_diff={gdiff}"))
            else:
                all_ok.append((year, state))

    print(f"\n{office}: {len(all_ok)} OK, {len(all_mismatch)} flagged")
    return all_ok, all_mismatch


def main():
    gov_ok, gov_bad = audit_office("Governor", "county_governor_results_*.csv", "governor_past_results.csv")
    sen_ok, sen_bad = audit_office("Senate", "county_senate_results_*.csv", "senate_past_results.csv")

    print(f"\n{'='*70}\nSUMMARY\n{'='*70}")
    print(f"Governor: {len(gov_ok)} OK, {len(gov_bad)} flagged")
    for year, state, detail in gov_bad:
        print(f"  {year} {state}: {detail}")
    print(f"Senate: {len(sen_ok)} OK, {len(sen_bad)} flagged")
    for year, state, detail in sen_bad:
        print(f"  {year} {state}: {detail}")


if __name__ == "__main__":
    main()
