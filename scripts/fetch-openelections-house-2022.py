#!/usr/bin/env python3
"""
Fetches county-level 2022 U.S. House results from OpenElections
(github.com/openelections) for the states whose 2022 repo has a ready-made
county-level general-election file with a "U.S. House" office row. Re-surveyed
2022 coverage fresh (per memory/project_county_election_scrape.md - 2024's tier
list doesn't carry over): only SD/TN/WV/WY have this ready-made shape for 2022
(GA/MS, which had it in 2024, only have precinct-level files in 2022 - handled via
MEDSL instead, see fill-county-house-2022-medsl.py). Unlike Senate/Governor (one
statewide dem/rep candidate pair), House has one race PER DISTRICT, and a county
can span multiple districts - so votes are bucketed against each row's own
district's candidates (looked up from data-entry/house_past_results.csv by (state,
district number)) and then summed across every district that touches a given
county, per the project's convention that a county's House number is the sum of
every district race that includes it.

Writes/merges into data-entry/county_house_results_2022.csv (same columns as the
Senate/Governor pipelines: state,county_name,county_id,dem_2022,gop_2022,oth_2022,
total_2022). Each state's summed county-level output is cross-checked against
data-entry/house_del_history.csv's state-level aggregate (dem_votes/rep_votes/
total_votes) for that year - the authoritative statewide total - not just re-derived
from the same per-district house_past_results.csv rows used for candidate matching.

Run from project root: python3 scripts/fetch-openelections-house-2022.py
"""
import csv, io, os, re, unicodedata, urllib.request
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
HOUSE_DEL_CSV = os.path.join(ROOT, "data-entry/house_del_history.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2022.csv")
YEAR = 2022

# GA's file splits each candidate's votes across 4 vote-mode columns instead of one
# pre-summed "votes" column like every other state in this batch.
# Per-district/per-county overrides go here as real issues are found for 2022 (mirrors
# 2024's NAME_ALIASES/FIPS_OVERRIDES/VOTE_CORRECTIONS/COUNTY_EXCLUSIONS dicts) - left
# empty at the start rather than porting 2024's entries over, since those were specific
# to 2024's states/files (MO/MS/IN/SD) and none of this batch's 4 states (SD/TN/WV/WY)
# have a confirmed issue yet.
NAME_ALIASES = {}
FIPS_OVERRIDES = {}
VOTE_CORRECTIONS = {}
COUNTY_EXCLUSIONS = set()

# Ballot-accounting rows some states' precinct files list as if they were a "candidate"
# row under the U.S. House office - not real votes for anyone, would double-count if
# bucketed as oth (IN's "Cast Votes" is literally that race's total ballots cast; the
# rest are over/under/invalid-vote counters). Write-In/Write-in/Write-ins is NOT in this
# list on purpose - those are real votes for an actual write-in candidate and belong in oth.
NON_CANDIDATE_LABELS = {
    "over votes", "overvotes", "under votes", "undervotes", "total votes",
    "total votes cast", "cast votes", "invalid votes", "total",
}

# Some states' precinct files bake the row's own party code into the candidate-name cell
# itself for some (not all) counties, inconsistently with counties that report the bare
# name (SC: "DEM Bryon L Best" in some counties, "Bryon L Best" in others, for the same
# candidate) - stripped as a fixed prefix rather than relying on the row's separate party
# field, since it needs to come off the name before name-matching either way.
PARTY_PREFIX_RE = re.compile(r"^(DEM|REP|GRE|GRN|LBT|LIB|CON|IND|UNA|ALN|NPA|WTP)\s+", re.IGNORECASE)
TRUE_PARTY_RE = re.compile(r"\((D|R)\)\s*$")

# 2022's OE coverage survey (api.github.com/repos/openelections/openelections-data-{st}/
# contents/2022) found only these 4 states have a ready-made, pre-summed county-level
# general-election file with a "U.S. House" office row - GA/MS (tier 1 in 2024) only have
# precinct-level files in 2022, handled via MEDSL instead. All 4 verified to have district
# numbers filled in (no at_large-with-blank-district ambiguity for TN/WV; SD/WY are
# genuinely at-large so their file's district field is blank, same as 2024's shape).
STATE_CONFIG = {
    "SD": {
        "urls": ["https://raw.githubusercontent.com/openelections/openelections-data-sd/master/2022/20221108__sd__general__county.csv"],
        "office": "U.S. House", "county_field": "county", "candidate_field": "candidate",
        "district_field": "district", "vote_fields": ["votes"], "at_large": True,
    },
    "TN": {
        "urls": ["https://raw.githubusercontent.com/openelections/openelections-data-tn/master/2022/20221108__tn__general__county.csv"],
        "office": "U.S. House", "county_field": "county", "candidate_field": "candidate",
        "district_field": "district", "vote_fields": ["votes"], "at_large": False,
    },
    "WV": {
        "urls": ["https://raw.githubusercontent.com/openelections/openelections-data-wv/master/2022/20221108__wv__general__county.csv"],
        "office": "U.S. House", "county_field": "county", "candidate_field": "candidate",
        "district_field": "district", "vote_fields": ["votes"], "at_large": False,
    },
    "WY": {
        "urls": ["https://raw.githubusercontent.com/openelections/openelections-data-wy/master/2022/20221108__wy__general__county.csv"],
        "office": "U.S. House", "county_field": "county", "candidate_field": "candidate",
        "district_field": "district", "vote_fields": ["votes"], "at_large": True,
    },
}


def fetch_csv(url):
    req = urllib.request.Request(url, headers={"User-Agent": "election-map-data-pipeline/1.0"})
    with urllib.request.urlopen(req) as r:
        text = r.read().decode("utf-8", errors="replace")
    text = text.lstrip("﻿")  # CO's file opens with a UTF-8 BOM, which would otherwise
    # attach to the first header cell's name ("﻿county") and break every row[cfg["county_field"]] lookup.
    return list(csv.DictReader(io.StringIO(text)))


def load_pres_fips():
    m = {}
    dupe_names = set()
    with open(PRES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            state_map = m.setdefault(row["state"], {})
            if row["county_name"] in state_map:
                dupe_names.add((row["state"], row["county_name"]))
            state_map[row["county_name"]] = row["county_id"]
    for state, name in dupe_names:
        del m[state][name]
    return m


def norm_county(name: str) -> str:
    name = name.replace("ʻ", "").replace("'", "").replace("'", "")
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = re.sub(r"\s*&\s*", " and ", name)
    return re.sub(r"\s+", " ", name).strip().lower()


def resolve_fips(fips_map: dict, county: str):
    if county in fips_map:
        return fips_map[county]
    target = norm_county(county)
    for name, fips in fips_map.items():
        if norm_county(name) == target:
            return fips
    target_nospace = target.replace(" ", "")
    for name, fips in fips_map.items():
        if norm_county(name).replace(" ", "") == target_nospace:
            return fips
    return None


def norm_name(name: str) -> str:
    name = PARTY_PREFIX_RE.sub("", name)  # strip a baked-in party-code prefix, e.g. "DEM Bryon L Best"
    name = re.sub(r'"[^"]*"', "", name)  # strip nicknames in double quotes, e.g. Earl L. "Buddy" Carter
    name = re.sub(r"'[^']*'", "", name)  # strip nicknames in single quotes, e.g. Henry 'Hank' Johnson
    # Replace with a space, not "" - a mid-name parenthetical like IN's "Timothy (Tim)
    # PECK" would otherwise glue the surrounding words together ("timothypeck") since
    # this pattern consumes the whitespace on both sides of the parens. The final
    # whitespace-collapse below cleans up the extra space this leaves for end-of-name
    # cases like "Candidate Name (I)".
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)  # strip "(I)"/"(Tim)" etc.
    name = re.sub(r",?\s*(jr\.?|sr\.?|ii|iii|iv)\s*$", "", name, flags=re.IGNORECASE)  # strip suffix
    return re.sub(r"\s+", " ", name).strip().lower()


def last_name(full_name: str) -> str:
    n = norm_name(full_name)
    return n.split()[-1] if n.strip() else ""


def compact(full_name: str) -> str:
    """No-space full-name form, for sources that glue a multi-word name together
    inconsistently with house_past_results.csv's spelling (WY 2022's OpenElections file:
    "Lynnette GreyBull" vs. the reference's "Lynnette Grey Bull") - same idea as this
    project's established county-name nospace fallback, applied to candidate names."""
    return norm_name(full_name).replace(" ", "")


def load_house_2024():
    """Returns {(state_abbr, district_number:int): row} for 2024, plus a state_abbr->state_name map."""
    m = {}
    names = {}
    with open(HOUSE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            names[row["state_abbr"]] = row["state_name"]
            if row["year"] != str(YEAR):
                continue
            dnum = int(row["district_name"].split("-")[1])
            m[(row["state_abbr"], dnum)] = row
    return m, names


def build_statewide_index(house_2024: dict):
    """Returns {state_abbr: {"exact": {norm_name: bucket}, "last": {last_name: bucket}}} -
    a fallback candidate index covering every district in the state, for rows whose own
    district field is blank or doesn't match a real district (some states leave district
    blank for real at-large-*looking* rows that are actually a normal numbered district
    reported inconsistently per county; others have rows from a wholly different race
    mislabeled with this office). "last" only keeps last names that are unique across the
    WHOLE state's dem+rep candidate roster (both parties, every district) - if a last name
    repeats anywhere in that roster, matching on it statewide would be ambiguous, so it's
    left out and such a row can only match via its full name instead."""
    exact = defaultdict(dict)
    last_counts = defaultdict(lambda: defaultdict(int))
    last_bucket = defaultdict(dict)
    for (abbr, _dnum), row in house_2024.items():
        for cand_field, bucket in (("dem_candidate", "dem"), ("rep_candidate", "gop")):
            full, ln = norm_name(row[cand_field]), last_name(row[cand_field])
            if full:
                exact[abbr][full] = bucket
            if ln:
                last_counts[abbr][ln] += 1
                last_bucket[abbr][ln] = bucket
    index = {}
    for abbr in exact.keys() | last_bucket.keys():
        index[abbr] = {
            "exact": exact.get(abbr, {}),
            "last": {ln: b for ln, b in last_bucket.get(abbr, {}).items() if last_counts[abbr][ln] == 1},
        }
    return index


def load_house_del_history():
    """Returns {(state_name, year:int): row} - the state's official aggregate House
    vote totals (dem_votes/rep_votes/total_votes), used as the authoritative statewide
    validation target instead of re-deriving it by summing house_past_results.csv's
    per-district rows ourselves."""
    m = {}
    with open(HOUSE_DEL_CSV, newline="") as f:
        for row in csv.DictReader(f):
            m[(row["state_name"], int(row["year"]))] = row
    return m


def main():
    pres_fips = load_pres_fips()
    house_2024, state_names = load_house_2024()
    statewide_index = build_statewide_index(house_2024)
    house_del = load_house_del_history()

    out_rows = []
    report = []
    for abbr, cfg in STATE_CONFIG.items():
        rows = []
        for url in cfg["urls"]:
            rows.extend(fetch_csv(url))
        offices = cfg["office"] if isinstance(cfg["office"], (set, list)) else {cfg["office"]}
        rows = [r for r in rows if r.get("office") in offices]

        by_county = defaultdict(lambda: defaultdict(int))
        by_county_districts = defaultdict(set)
        dropped_votes = 0
        dropped_examples = set()
        fallback_used = 0
        for r in rows:
            county = r[cfg["county_field"]].strip()
            county = NAME_ALIASES.get((abbr, county), county)
            if (abbr, county) in COUNTY_EXCLUSIONS:
                continue

            cand = r[cfg["candidate_field"]].strip()
            if cand.lower() in NON_CANDIDATE_LABELS:
                continue

            votes = VOTE_CORRECTIONS.get((abbr, county, cand))
            if votes is None:
                # NM redacts small precinct counts as "*" (voter-privacy suppression on
                # low-turnout precincts) - treated as 0, a negligible, unfixable undercount.
                votes = 0
                for vf in cfg["vote_fields"]:
                    v = r.get(vf, "").strip().replace(",", "")
                    if v and v != "*":
                        votes += int(float(v))

            n, cl, nc = norm_name(cand), last_name(cand), compact(cand)

            dfield = r[cfg["district_field"]].strip()
            dnum = None
            if dfield.isdigit() and (abbr, int(dfield)) in house_2024:
                dnum = int(dfield)
            elif cfg["at_large"] and not dfield and (abbr, 1) in house_2024:
                dnum = 1

            if dnum is not None:
                past = house_2024[(abbr, dnum)]
                # Top-two/jungle-primary states (CA, WA) can run two same-party
                # candidates in one general election - house_past_results.csv still
                # files them under dem_candidate/rep_candidate (one of each column
                # required) but marks whichever sits in the "wrong" column with a
                # trailing "(D)"/"(R)" noting their REAL party (e.g. WA-04 2024:
                # dem_candidate="Jerrod Sessler (R)" - actually a Republican). See
                # scrape-county-house-2024.py's true_party_bucket() docstring for the
                # house_del_history.csv cross-check that confirmed this convention.
                dem_col_bucket = "dem"
                rep_col_bucket = "gop"
                tp_dem = TRUE_PARTY_RE.search(past["dem_candidate"].strip())
                tp_rep = TRUE_PARTY_RE.search(past["rep_candidate"].strip())
                if tp_dem:
                    dem_col_bucket = "dem" if tp_dem.group(1) == "D" else "gop"
                if tp_rep:
                    rep_col_bucket = "dem" if tp_rep.group(1) == "D" else "gop"
                dem_name, rep_name = norm_name(past["dem_candidate"]), norm_name(past["rep_candidate"])
                dem_last, rep_last = last_name(past["dem_candidate"]), last_name(past["rep_candidate"])
                dem_compact, rep_compact = compact(past["dem_candidate"]), compact(past["rep_candidate"])
                # Last-name fallback is only safe when the two candidates' last names actually
                # differ - some districts have same-surname dem/rep candidates (SD-01 2024:
                # Sheryl Johnson vs. Dusty Johnson), where a naive per-bucket "or last-name-
                # matches" check steals the other candidate's votes the moment it's evaluated.
                distinct_last = bool(dem_last) and bool(rep_last) and dem_last != rep_last
                if dem_name and n == dem_name:
                    bucket = dem_col_bucket
                elif rep_name and n == rep_name:
                    bucket = rep_col_bucket
                elif dem_compact and nc == dem_compact:
                    bucket = dem_col_bucket
                elif rep_compact and nc == rep_compact:
                    bucket = rep_col_bucket
                elif distinct_last and cl == dem_last:
                    bucket = dem_col_bucket
                elif distinct_last and cl == rep_last:
                    bucket = rep_col_bucket
                elif not distinct_last and dem_last and not rep_name and cl == dem_last:
                    bucket = dem_col_bucket
                elif not distinct_last and rep_last and not dem_name and cl == rep_last:
                    bucket = rep_col_bucket
                else:
                    bucket = "oth"
            else:
                # District field is blank or doesn't match a real district for this state/
                # year (some states leave it blank for real candidates instead of using
                # "at_large"; others have rows from a wholly different, mislabeled race -
                # e.g. IN's Madison County tags some State Senate rows as office "U.S.
                # House" district "35", which isn't one of IN's 9 real districts). Fall
                # back to a state-wide candidate index instead of assuming either "oth" or
                # "drop" - if the candidate is a real, uniquely-identifiable House
                # candidate for this state, this still buckets them correctly; if not,
                # drop the row rather than risk folding a different race's votes into oth.
                idx = statewide_index.get(abbr, {"exact": {}, "last": {}})
                bucket = idx["exact"].get(n) or idx["last"].get(cl)
                if bucket is None:
                    dropped_votes += votes
                    dropped_examples.add(cand)
                    continue
                fallback_used += 1
            by_county[county][bucket] += votes
            if dnum is not None:
                by_county_districts[county].add(dnum)

        fips_map = pres_fips.get(abbr, {})
        fips_to_name = {fips: name for name, fips in fips_map.items()}
        sum_dem = sum_gop = sum_oth = sum_total = 0
        unmatched_counties = []
        for county, buckets in by_county.items():
            dem, gop, oth = buckets.get("dem", 0), buckets.get("gop", 0), buckets.get("oth", 0)
            total = dem + gop + oth
            sum_dem += dem
            sum_gop += gop
            sum_oth += oth
            sum_total += total
            fips = FIPS_OVERRIDES.get((abbr, county)) or resolve_fips(fips_map, county)
            if not fips:
                unmatched_counties.append(county)
                continue
            # Use the FIPS CSV's canonical spelling/casing for display, not the raw source
            # text - some states' precinct files write county names in ALL CAPS (CO).
            county_name = fips_to_name.get(fips, county)
            districts = ";".join(str(d) for d in sorted(by_county_districts.get(county, set())))
            out_rows.append({
                "state": abbr, "county_name": county_name, "county_id": fips,
                f"dem_{YEAR}": dem, f"gop_{YEAR}": gop, f"oth_{YEAR}": oth, f"total_{YEAR}": total,
                f"districts_{YEAR}": districts,
            })

        # Validate against house_del_history.csv's state-level aggregate for this year -
        # the authoritative statewide total (not re-derived by summing house_past_results.csv
        # ourselves, which would just be circular against the same per-district data this
        # script already used for candidate matching). Checks total_votes too, not just
        # dem/gop separately: a per-county bug that shifts votes between dem/oth or gop/oth
        # (rather than between dem/gop) can pass a dem/gop-only check while still being wrong.
        del_row = house_del.get((state_names[abbr], YEAR))
        expected_dem = int(del_row["dem_votes"])
        expected_gop = int(del_row["rep_votes"])
        expected_total = int(del_row["total_votes"])
        ddiff, gdiff, tdiff = sum_dem - expected_dem, sum_gop - expected_gop, sum_total - expected_total
        status = f"{len(by_county)} counties, dem={sum_dem} gop={sum_gop} oth={sum_oth} total={sum_total} | dem_diff={ddiff} gop_diff={gdiff} total_diff={tdiff}"
        if (abs(ddiff) > max(500, expected_dem * 0.005) or abs(gdiff) > max(500, expected_gop * 0.005)
                or abs(tdiff) > max(500, expected_total * 0.005)):
            status = "MISMATCH " + status
        if unmatched_counties:
            status += f" | unmatched counties: {unmatched_counties}"
        if fallback_used:
            status += f" | statewide-fallback matched: {fallback_used} rows"
        if dropped_votes:
            status += f" | dropped (unidentifiable candidate/district): {dropped_votes} votes, examples: {sorted(dropped_examples)[:5]}"
        report.append((abbr, status))

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}", f"districts_{YEAR}"]
    existing_rows = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    handled_states = set(STATE_CONFIG.keys())
    kept = [r for r in existing_rows if r["state"] not in handled_states]

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + out_rows:
            w.writerow(r)

    print(f"Wrote {len(out_rows)} rows for {len(STATE_CONFIG)} states -> {OUT_CSV} (file now has {len(kept) + len(out_rows)} total)\n")
    for abbr, status in report:
        print(f"{abbr}: {status}")


if __name__ == "__main__":
    main()
