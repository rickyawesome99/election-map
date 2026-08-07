#!/usr/bin/env python3
"""
Fills county-level 2022 Senate results for the states Wikipedia's "By county" tables
don't cover (see scrape-county-senate-2022.py's FAILED report: IA, KS, KY, LA, MO, NC,
OK - AK excluded, see below) using MIT Election Data and Science Lab's county-level
returns (data-entry/medsl/senate_2022.csv, from
https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/YB60EJ).

AK is NOT filled here even though it's in the same FAILED list: MEDSL's file has an AK
row per candidate with no county_name/county_fips at all (Alaska has no counties, and
apparently no by-borough/census-area breakdown is published for this race either) - a
structural gap, not something this source can close.

Bucket-matching mirrors scrape-county-senate-2022.py's priority order (exact name match
against senate_past_results.csv's chosen dem/rep candidate first, then a name-token
match, then the row's own party_simplified label) rather than naively summing by
party_simplified - Louisiana's jungle primary had a second Democrat (Luke Mixon,
182,887 votes) and a second Republican (Devin Lance Graham, 25,275 votes) on the same
ballot, and senate_past_results.csv's dem_votes/rep_votes only count the lead nominee
Wikipedia/AP treat as "the" Democrat/Republican - blanket party-label bucketing would
silently fold Mixon's votes into "dem" and inflate the total by ~2.3x.

Appends its output to the existing data-entry/county_senate_results_2022.csv (adding
rows only for states not already present there) rather than writing a separate file,
so generate-county-senate-data.py's glob-by-filename merge doesn't need to change.

Run from project root: python3 scripts/fill-county-senate-2022-medsl.py
"""
import csv, os, re

ROOT = os.path.join(os.path.dirname(__file__), "..")
MEDSL_CSV = os.path.join(ROOT, "data-entry/medsl/senate_2022.csv")
SENATE_PAST_CSV = os.path.join(ROOT, "data-entry/senate_past_results.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_senate_results_2022.csv")
YEAR = 2022

# States scrape-county-senate-2022.py couldn't get a "By county" table for, and that
# MEDSL actually has county-level rows for (excludes AK - see module docstring).
GAP_STATES = ["IA", "KS", "KY", "LA", "MO", "NC", "OK"]

SUFFIX_TOKENS = {"JR", "SR", "II", "III", "IV"}

# Missouri-specific MEDSL data bug: the file carries two duplicate TOTAL-mode rows per
# major candidate under St. Louis County's fips (29189.0) instead of a separate St. Louis
# City row - the smaller-valued duplicate is St. Louis City mislabeled with the county's
# fips (confirmed against a user-provided screenshot of the ~99%-reporting city results:
# dem=69,118, gop=12,749 match MEDSL's smaller duplicate exactly, validating the split).
# MEDSL has no minor-party rows for Missouri at all (any county, any candidate), so the
# city's Libertarian (Jonathan Dine, 1,084) and Constitution (Paul Venable, 322) votes -
# and the corrected county-only oth of 0, matching every other MO county in this source -
# come from that screenshot, not MEDSL. Handled as a one-off override rather than a
# generic duplicate-fips mechanism since this didn't recur in any of the other 6 states.
ST_LOUIS_CITY_2022 = {"dem": 69118, "gop": 12749, "oth": 1084 + 322}


def norm_name(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)\s*", "", name)
    name = name.replace(",", "").replace(".", "").replace('"', "").replace("\\", "")
    return re.sub(r"\s+", " ", name).strip().upper()


def name_tokens(name: str) -> set:
    return {t for t in norm_name(name).split() if t not in SUFFIX_TOKENS}


def last_name_token(full_name: str) -> str:
    toks = [t for t in norm_name(full_name).split() if t not in SUFFIX_TOKENS]
    return toks[-1] if toks else ""


def load_senate_2022():
    m = {}
    with open(SENATE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["year"] == "2022" and row["type"] != "Special":
                m[row["state_abbr"]] = row
    return m


def main():
    senate_2022 = load_senate_2022()

    with open(MEDSL_CSV, newline="", encoding="utf-8") as f:
        all_rows = list(csv.DictReader(f))

    new_rows = []
    report = []
    for abbr in GAP_STATES:
        sub = [r for r in all_rows if r["state_po"] == abbr and r["special"] == "False"]
        if not sub:
            report.append((abbr, "FAILED: no rows in MEDSL file"))
            continue

        # Prefer the "TOTAL" mode row per (county, candidate) when the state reports one
        # (avoids double-counting ABSENTEE+ELECTION DAY, e.g. IA); states that never emit
        # a TOTAL row (e.g. NC: ABSENTEE/ELECTION DAY/ONE STOP/PROVISIONAL only) need every
        # mode row summed instead.
        use_total_mode = any(r["mode"] == "TOTAL" for r in sub)

        past = senate_2022.get(abbr)
        dem_name = norm_name(past["dem_candidate"]) if past else None
        rep_name = norm_name(past["rep_candidate"]) if past else None
        dem_last = last_name_token(past["dem_candidate"]) if past else None
        rep_last = last_name_token(past["rep_candidate"]) if past else None

        candidates = sorted({r["candidate"] for r in sub if r["candidate"] not in ("UNDER VOTES", "OVER VOTES")})
        party_of = {r["candidate"]: r["party_simplified"] for r in sub}

        # Must use the same match test (exact-name OR last-name-token) that bucket
        # assignment below uses, not exact-name alone - otherwise a candidate that's only
        # findable via the token fallback (e.g. "GARY CHAMBERS, JR." vs CSV's "Gary
        # Chambers") leaves dem_matched False, and a same-party runner-up like Louisiana's
        # second Democrat (Luke Mixon) wrongly falls into the "unclaimed slot" party-label
        # branch instead of "oth".
        dem_matched = bool(dem_name) and any(
            norm_name(c) == dem_name or (dem_last and dem_last in name_tokens(c)) for c in candidates
        )
        rep_matched = bool(rep_name) and any(
            norm_name(c) == rep_name or (rep_last and rep_last in name_tokens(c)) for c in candidates
        )

        # Last-name-token matching identifies a specific candidate on its own merits (each
        # candidate's own tokens are checked against dem_last/rep_last), so it must NOT be
        # gated by dem_matched/rep_matched the way the party-label fallback below is -
        # gating it would mean the one candidate whose token match is what makes
        # dem_matched True never actually gets bucketed (since by the time its own branch
        # is evaluated, dem_matched already reads True and blocks it). Only the
        # lowest-priority party-label branch needs the "already claimed" guard, to stop a
        # same-party runner-up (e.g. Louisiana's second Democrat) from also grabbing the
        # dem slot once the real candidate is already found via name/token match.
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

        if abbr == "MO":
            stl_county_key = next(k for k in county_totals if k[0] == "29189")
            stl = county_totals[stl_county_key]
            stl["dem"] -= ST_LOUIS_CITY_2022["dem"]
            stl["gop"] -= ST_LOUIS_CITY_2022["gop"]
            county_totals[("29510", "St. Louis City")] = dict(ST_LOUIS_CITY_2022)

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
    # GAP_STATES rows only ever come from this script (Wikipedia's scraper FAILED on all
    # of them), so replacing rather than skip-on-conflict keeps reruns idempotent after a
    # bucket-matching fix like this one.
    kept = [r for r in existing_rows if r["state"] not in GAP_STATES]
    dropped = len(existing_rows) - len(kept)

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + new_rows:
            w.writerow(r)

    print(f"Replaced {dropped} old GAP_STATES rows with {len(new_rows)} new ones -> {OUT_CSV} (file now has {len(kept) + len(new_rows)} total)\n")
    for abbr, status in report:
        print(f"{abbr}: {status}")


if __name__ == "__main__":
    main()
