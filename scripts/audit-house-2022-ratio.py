#!/usr/bin/env python3
"""
Per-county sanity-ratio check for 2022 House data (this year's House total vs. that
SAME county's own 2022 Senate/Governor total - 2022 is a midterm with no presidential
race to compare against, so this substitutes for the presidential-total ratio check
used in the 2024 House batches, per user instruction). Flags anything outside a wide
0.5-1.3 band (House usually trails a top-of-ticket race somewhat due to roll-off, but
rarely by more than ~2x in either direction for a real, complete county).

Prefers Senate if a state has both 2022 Senate and Governor county data; falls back to
Governor otherwise. Skipped entirely for states with neither 2022 Senate nor Governor
county data (AK, DE, MS, MT, NJ, VA, WV, WY) - all either single-district (no cross-
county blending possible, state-level check alone is sufficient) or already validated
near-exact at the state level.

Run from project root: python3 scripts/audit-house-2022-ratio.py
"""
import csv, os
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
HOUSE_CSV = os.path.join(ROOT, "data-entry/county_house_results_2022.csv")
SENATE_CSV = os.path.join(ROOT, "data-entry/county_senate_results_2022.csv")
GOV_CSV = os.path.join(ROOT, "data-entry/county_governor_results_2022.csv")


def load(path, year):
    m = {}
    if not os.path.exists(path):
        return m
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            total = row.get(f"total_{year}")
            if not total:
                continue
            m[row["county_id"]] = (row["state"], row["county_name"], int(total))
    return m


def main():
    house = load(HOUSE_CSV, 2022)
    senate = load(SENATE_CSV, 2022)
    gov = load(GOV_CSV, 2022)

    flagged = []
    for fips, (state, name, house_total) in house.items():
        baseline = senate.get(fips) or gov.get(fips)
        if not baseline:
            continue
        _, _, base_total = baseline
        source = "Senate" if fips in senate else "Governor"
        if base_total == 0:
            continue
        ratio = house_total / base_total
        if ratio < 0.5 or ratio > 1.3:
            flagged.append((state, name, fips, house_total, base_total, ratio, source))

    flagged.sort(key=lambda x: (x[0], x[5]))
    print(f"{len(flagged)} counties flagged (ratio <0.5 or >1.3):\n")
    for state, name, fips, ht, bt, ratio, source in flagged:
        print(f"{state} {name} ({fips}): house={ht} {source}={bt} ratio={ratio:.2f}")


if __name__ == "__main__":
    main()
