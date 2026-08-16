#!/usr/bin/env python3
"""
Fills county-level 2022 Senate SPECIAL election results for Oklahoma (Mullin vs. Kendra
Horn, filling Jim Inhofe's resignation) using MIT Election Data and Science Lab's
county-level returns (data-entry/medsl/senate_2022.csv, from
https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/YB60EJ) - the
same file this project's fill-county-senate-2022-medsl.py already used to fill OK's
REGULAR 2022 race (Wikipedia's "By county" table doesn't exist for OK's special race
either - the regular race's page has one, the special's dedicated page doesn't), just
filtered to special=="True" instead of "False".

Writes data-entry/county_senate_special_results_2022.csv (creating/appending, same
convention as the regular fill scripts) with the SAME column shape as the regular file
(state,county_name,county_id,dem_2022,gop_2022,oth_2022,total_2022).

Run from project root: python3 scripts/fill-county-senate-2022-special-medsl.py
"""
import csv, os, re

ROOT = os.path.join(os.path.dirname(__file__), "..")
MEDSL_CSV = os.path.join(ROOT, "data-entry/medsl/senate_2022.csv")
SENATE_PAST_CSV = os.path.join(ROOT, "data-entry/senate_past_results.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_senate_special_results_2022.csv")
YEAR = 2022

GAP_STATES = ["OK"]

SUFFIX_TOKENS = {"JR", "SR", "II", "III", "IV"}


def norm_name(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)\s*", "", name)
    name = name.replace(",", "").replace(".", "").replace('"', "").replace("\\", "")
    return re.sub(r"\s+", " ", name).strip().upper()


def name_tokens(name: str) -> set:
    return {t for t in norm_name(name).split() if t not in SUFFIX_TOKENS}


def last_name_token(full_name: str) -> str:
    toks = [t for t in norm_name(full_name).split() if t not in SUFFIX_TOKENS]
    return toks[-1] if toks else ""


def load_senate_special_2022():
    m = {}
    with open(SENATE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["year"] == str(YEAR) and row["type"] == "Special":
                m[row["state_abbr"]] = row
    return m


def main():
    senate_special = load_senate_special_2022()

    with open(MEDSL_CSV, newline="", encoding="utf-8") as f:
        all_rows = list(csv.DictReader(f))

    new_rows = []
    report = []
    for abbr in GAP_STATES:
        sub = [r for r in all_rows if r["state_po"] == abbr and r["special"] == "True"]
        if not sub:
            report.append((abbr, "FAILED: no rows in MEDSL file"))
            continue

        use_total_mode = any(r["mode"] == "TOTAL" for r in sub)

        past = senate_special.get(abbr)
        dem_name = norm_name(past["dem_candidate"]) if past else None
        rep_name = norm_name(past["rep_candidate"]) if past else None
        dem_last = last_name_token(past["dem_candidate"]) if past else None
        rep_last = last_name_token(past["rep_candidate"]) if past else None

        candidates = sorted({r["candidate"] for r in sub if r["candidate"] not in ("UNDER VOTES", "OVER VOTES")})
        party_of = {r["candidate"]: r["party_simplified"] for r in sub}

        dem_matched = bool(dem_name) and any(
            norm_name(c) == dem_name or (dem_last and dem_last in name_tokens(c)) for c in candidates
        )
        rep_matched = bool(rep_name) and any(
            norm_name(c) == rep_name or (rep_last and rep_last in name_tokens(c)) for c in candidates
        )

        bucket_of = {}
        for c in candidates:
            toks = name_tokens(c)
            n = norm_name(c)
            if dem_name and n == dem_name:
                bucket_of[c] = "dem"
            elif rep_name and n == rep_name:
                bucket_of[c] = "gop"
            elif dem_last and dem_last in toks:
                bucket_of[c] = "dem"
            elif rep_last and rep_last in toks:
                bucket_of[c] = "gop"
            elif not dem_matched and party_of[c] == "DEMOCRAT":
                bucket_of[c] = "dem"
            elif not rep_matched and party_of[c] == "REPUBLICAN":
                bucket_of[c] = "gop"
            else:
                bucket_of[c] = "oth"

        county_totals = {}  # (fips, name) -> {"dem":.., "gop":.., "oth":..}
        for r in sub:
            cand = r["candidate"]
            if cand in ("UNDER VOTES", "OVER VOTES"):
                continue
            if use_total_mode and r["mode"] != "TOTAL":
                continue
            fips = f"{int(float(r['county_fips'])):05d}"
            name = r["county_name"].title()
            key = (fips, name)
            entry = county_totals.setdefault(key, {"dem": 0, "gop": 0, "oth": 0})
            entry[bucket_of[cand]] += float(r["candidatevotes"])

        sum_dem = sum_gop = sum_oth = sum_total = 0
        for (fips, name), v in county_totals.items():
            dem, gop, oth = int(v["dem"]), int(v["gop"]), int(v["oth"])
            total = dem + gop + oth
            sum_dem += dem
            sum_gop += gop
            sum_oth += oth
            sum_total += total
            new_rows.append({
                "state": abbr, "county_name": name, "county_id": fips,
                f"dem_{YEAR}": dem, f"gop_{YEAR}": gop, f"oth_{YEAR}": oth, f"total_{YEAR}": total,
            })

        status = f"{len(county_totals)} counties, dem={sum_dem} gop={sum_gop} oth={sum_oth} total={sum_total}"
        if past:
            expected_dem, expected_gop = int(past["dem_votes"]), int(past["rep_votes"])
            ddiff = sum_dem - expected_dem
            gdiff = sum_gop - expected_gop
            status += f" | vs senate_past_results: dem_diff={ddiff} gop_diff={gdiff}"
            if abs(ddiff) > 5000 or abs(gdiff) > 5000:
                status = "MISMATCH " + status
        report.append((abbr, status))

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}"]
    existing_rows = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    kept = [r for r in existing_rows if r["state"] not in GAP_STATES]
    dropped = len(existing_rows) - len(kept)

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + new_rows:
            w.writerow(r)

    print(f"Wrote {len(new_rows)} rows ({dropped} old rows replaced) -> {OUT_CSV} (file now has {len(kept) + len(new_rows)} total)\n")
    for abbr, status in report:
        print(f"{abbr}: {status}")


if __name__ == "__main__":
    main()
