#!/usr/bin/env python3
"""
Comprehensive audit: for every (office, year) this project has compiled county-level
data for, sums the county CSV's dem/gop/total and compares against that office/year's
official state-level total, flagging any state whose county-summed total disagrees
beyond tolerance (>1% or >500 votes, whichever is larger - the tolerance class this
project's fill/scrape scripts already use for absentee/rounding noise).

Reference truth per office:
- Senate/Governor: senate_past_results.csv / governor_past_results.csv are already
  state-level (one row per statewide race). Senate is filtered to type != "Special"
  (a state can have both a regular and special Senate race in the same year - only the
  regular one matches what the county scripts compiled); Governor uses every row as-is
  (no state/year has both a Regular and Special row - OR 2016's Kate Brown special is
  that year's ONLY gubernatorial race, not a duplicate of a filtered-out regular row).
- House: TWO references are checked per state/year, not just one, because this
  project's own memory documents these two files sometimes disagreeing with each other
  independently of whether the county data is actually right:
    1. house_del_history.csv - the nominal "official" state-level aggregate.
    2. house_past_results.csv, summed per state across all districts with
       true_party_bucket() applied (so same-party jungle-primary districts, e.g. CA's
       CA-12-style Dem-vs-Dem races, are bucketed by TRUE party like the fill scripts
       do, not naively by column).
  A state is flagged as a REAL county-data issue only if it disagrees with BOTH
  references; disagreeing with only house_del_history.csv while matching
  house_past_results.csv is flagged separately as a known "reference-file disagreement"
  class, not a county-data bug (this exact pattern recurred constantly across the
  2016-2024 House batches - see memory/project_county_election_scrape.md).

Run from project root: python3 scripts/audit-county-state-totals.py
"""
import csv, glob, os, re
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
TRUE_PARTY_RE = re.compile(r"\((D|R)\)\s*$")


def to_int(s):
    if s is None:
        return 0
    s = s.strip().replace(",", "")
    return int(s) if s else 0


def sum_county_csv(path, year):
    """Returns {state: (dem, gop, total)} from a county_{office}_results_{year}.csv."""
    out = defaultdict(lambda: [0, 0, 0])
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            st = row["state"]
            out[st][0] += to_int(row.get(f"dem_{year}"))
            out[st][1] += to_int(row.get(f"gop_{year}"))
            out[st][2] += to_int(row.get(f"total_{year}"))
    return out


def sum_county_presidential(year):
    """Returns {state: (dem, gop, total)} from the wide-format
    data/county_presidential_results_2008_2024.csv (one row per county, columns repeated
    per year), for a single requested year."""
    out = defaultdict(lambda: [0, 0, 0])
    with open(os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv"), newline="") as f:
        for row in csv.DictReader(f):
            st = row["state"]
            out[st][0] += to_int(row.get(f"dem_{year}"))
            out[st][1] += to_int(row.get(f"gop_{year}"))
            out[st][2] += to_int(row.get(f"total_{year}"))
    return out


def load_statewide_ref(path, year_field="year", state_field="state_abbr", type_field=None,
                        exclude_types=()):
    """Returns {(state_abbr, year): (dem, gop, total)} from an already state-level CSV
    (senate_past_results.csv / governor_past_results.csv). Applies true-party bucketing
    via each row's own dem_candidate/rep_candidate (D)/(R) override marker - e.g. CA's
    2016/2018 Senate races are Dem-vs-Dem top-two contests where the second Democrat sits
    in the rep_candidate column marked "(D)"; the county scrape scripts bucket both
    candidates' votes into the TRUE party (both dem here), so the reference must match
    that convention rather than a naive column sum, or every same-party state/year looks
    like a false-positive ~100% mismatch (see memory/project_county_election_scrape.md)."""
    out = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            if type_field and row.get(type_field, "") in exclude_types:
                continue
            key = (row[state_field], row[year_field])
            dv, rv = to_int(row["dem_votes"]), to_int(row["rep_votes"])
            dem_m = TRUE_PARTY_RE.search(row.get("dem_candidate", "").strip())
            rep_m = TRUE_PARTY_RE.search(row.get("rep_candidate", "").strip())
            if dem_m or rep_m:
                dem_bucket = dem_m.group(1) if dem_m else "D"
                rep_bucket = rep_m.group(1) if rep_m else "R"
                dem, gop = 0, 0
                dem += dv if dem_bucket == "D" else 0
                gop += dv if dem_bucket == "R" else 0
                dem += rv if rep_bucket == "D" else 0
                gop += rv if rep_bucket == "R" else 0
                out[key] = (dem, gop, to_int(row["total_votes"]))
            else:
                out[key] = (dv, rv, to_int(row["total_votes"]))
    return out


def load_house_del_history():
    """Returns {(state_name, year): (dem, gop, total)}."""
    out = {}
    with open(os.path.join(ROOT, "data-entry/house_del_history.csv"), newline="") as f:
        for row in csv.DictReader(f):
            out[(row["state_name"], row["year"])] = (
                to_int(row["dem_votes"]), to_int(row["rep_votes"]), to_int(row["total_votes"]))
    return out


def load_house_past_summed():
    """Returns {(state_abbr, year): (dem, gop, total)} - house_past_results.csv summed
    per state, with true_party_bucket() applied per district so same-party districts
    bucket by TRUE party, matching how the county fill scripts themselves bucket votes."""
    def bucket(name, default):
        m = TRUE_PARTY_RE.search(name.strip())
        return ("dem" if m.group(1) == "D" else "gop") if m else default

    out = defaultdict(lambda: [0, 0, 0])
    state_names = {}
    with open(os.path.join(ROOT, "data-entry/house_past_results.csv"), newline="") as f:
        for row in csv.DictReader(f):
            state_names[row["state_abbr"]] = row["state_name"]
            db = bucket(row["dem_candidate"], "dem")
            rb = bucket(row["rep_candidate"], "gop")
            dv, rv = to_int(row["dem_votes"]), to_int(row["rep_votes"])
            key = (row["state_abbr"], row["year"])
            out[key][0] += dv if db == "dem" else 0
            out[key][0] += rv if rb == "dem" else 0
            out[key][1] += dv if db == "gop" else 0
            out[key][1] += rv if rb == "gop" else 0
            out[key][2] += to_int(row["total_votes"])
    return out, state_names


def flagged(ours, truth):
    d, g, t = ours
    ed, eg, et = truth
    ddiff, gdiff, tdiff = d - ed, g - eg, t - et
    if (abs(ddiff) > max(500, ed * 0.01) or abs(gdiff) > max(500, eg * 0.01)
            or abs(tdiff) > max(500, et * 0.01)):
        return ddiff, gdiff, tdiff
    return None


def audit_statewide_office(office_label, glob_pattern, ref_path, type_field=None, exclude_types=()):
    print(f"\n{'='*70}\n{office_label}\n{'='*70}")
    ref = load_statewide_ref(ref_path, type_field=type_field, exclude_types=exclude_types)
    files = sorted(glob.glob(os.path.join(ROOT, glob_pattern)))
    total_flags = 0
    for path in files:
        year = re.search(r"_(\d{4})\.csv$", path).group(1)
        by_state = sum_county_csv(path, year)
        year_flags = []
        for st, ours in sorted(by_state.items()):
            truth = ref.get((st, year))
            if truth is None:
                year_flags.append((st, "NO REFERENCE ROW for this state/year", None))
                continue
            f = flagged(ours, truth)
            if f:
                ddiff, gdiff, tdiff = f
                ed, eg, et = truth
                dpct = ddiff / ed * 100 if ed else float("inf") if ddiff else 0
                gpct = gdiff / eg * 100 if eg else float("inf") if gdiff else 0
                tpct = tdiff / et * 100 if et else float("inf") if tdiff else 0
                year_flags.append((st, f"dem_diff={ddiff}({dpct:.1f}%) gop_diff={gdiff}({gpct:.1f}%) total_diff={tdiff}({tpct:.1f}%)", f))
        if year_flags:
            print(f"\n{year}: {len(year_flags)} state(s) flagged")
            for st, msg, _ in year_flags:
                print(f"  {st}: {msg}")
            total_flags += len(year_flags)
    if total_flags == 0:
        print("  All states/years within tolerance.")
    return total_flags


def audit_house():
    print(f"\n{'='*70}\nHOUSE\n{'='*70}")
    del_hist = load_house_del_history()
    past_summed, state_names = load_house_past_summed()
    files = sorted(glob.glob(os.path.join(ROOT, "data-entry/county_house_results_*.csv")))
    real_issues = 0
    ref_disagreements = 0
    for path in files:
        year = re.search(r"_(\d{4})\.csv$", path).group(1)
        by_state = sum_county_csv(path, year)
        year_real, year_ref_only = [], []
        for st, ours in sorted(by_state.items()):
            state_name = state_names.get(st)
            del_truth = del_hist.get((state_name, year))
            past_truth = tuple(past_summed.get((st, year), (0, 0, 0)))
            del_flag = flagged(ours, del_truth) if del_truth else None
            past_flag = flagged(ours, past_truth) if any(past_truth) else None
            if del_flag and past_flag:
                ddiff, gdiff, tdiff = past_flag
                year_real.append((st, f"dem_diff={ddiff} gop_diff={gdiff} total_diff={tdiff} (disagrees with house_past_results.csv too)"))
            elif del_flag and not past_flag:
                ddiff, gdiff, tdiff = del_flag
                year_ref_only.append((st, f"dem_diff={ddiff} gop_diff={gdiff} total_diff={tdiff} vs house_del_history.csv, but MATCHES house_past_results.csv - reference-file disagreement, not a county-data bug"))
            elif past_flag and not del_flag:
                ddiff, gdiff, tdiff = past_flag
                year_real.append((st, f"dem_diff={ddiff} gop_diff={gdiff} total_diff={tdiff} (disagrees with house_past_results.csv; matches house_del_history.csv)"))
        if year_real or year_ref_only:
            print(f"\n{year}:")
            if year_real:
                print(f"  REAL county-data issues ({len(year_real)}):")
                for st, msg in year_real:
                    print(f"    {st}: {msg}")
            if year_ref_only:
                print(f"  Reference-file-disagreement only, not a county bug ({len(year_ref_only)}):")
                for st, msg in year_ref_only:
                    print(f"    {st}: {msg}")
            real_issues += len(year_real)
            ref_disagreements += len(year_ref_only)
    if real_issues == 0 and ref_disagreements == 0:
        print("  All states/years within tolerance.")
    return real_issues, ref_disagreements


def audit_president():
    """President's county data lives in ONE wide-format file (all 5 years as sibling
    columns) rather than one CSV per year like Senate/Governor/House - handled separately
    from audit_statewide_office(). Reference (president_past_results.csv) only covers
    2016/2020/2024 (no 2008/2012 state-level row exists anywhere in this repo), so only
    those 3 years are checked - 2008/2012 are structurally unauditable here, not a gap."""
    print(f"\n{'='*70}\nPRESIDENT\n{'='*70}")
    ref = load_statewide_ref(os.path.join(ROOT, "data-entry/president_past_results.csv"))
    total_flags = 0
    for year in ("2016", "2020", "2024"):
        by_state = sum_county_presidential(year)
        year_flags = []
        for st, ours in sorted(by_state.items()):
            truth = ref.get((st, year))
            if truth is None:
                year_flags.append((st, "NO REFERENCE ROW for this state/year"))
                continue
            f = flagged(ours, truth)
            if f:
                ddiff, gdiff, tdiff = f
                ed, eg, et = truth
                dpct = ddiff / ed * 100 if ed else float("inf") if ddiff else 0
                gpct = gdiff / eg * 100 if eg else float("inf") if gdiff else 0
                tpct = tdiff / et * 100 if et else float("inf") if tdiff else 0
                year_flags.append((st, f"dem_diff={ddiff}({dpct:.1f}%) gop_diff={gdiff}({gpct:.1f}%) total_diff={tdiff}({tpct:.1f}%)"))
        if year_flags:
            print(f"\n{year}: {len(year_flags)} state(s) flagged")
            for st, msg in year_flags:
                print(f"  {st}: {msg}")
            total_flags += len(year_flags)
    if total_flags == 0:
        print("  All states/years within tolerance.")
    return total_flags


def load_house_statewide_sums():
    """Returns {(state_abbr, year, race_label): (dem, gop, total)} - every district row in
    house_statewide_results.csv (President/Senate/Governor, incl. Runoff/Special variants)
    summed per state+year+exact-race-label. This is the DISTRICT view's data source
    (per memory/project_national_geolevel_toggle.md), so summing it per state and comparing
    against the same state-level reference used for the County audit checks whether
    District aggregates agree with County aggregates and with the published state totals."""
    out = defaultdict(lambda: [0, 0, 0])
    with open(os.path.join(ROOT, "data-entry/house_statewide_results.csv"), newline="") as f:
        for row in csv.DictReader(f):
            key = (row["state_abbr"], row["year"], row["race"])
            out[key][0] += to_int(row.get("dem_votes"))
            out[key][1] += to_int(row.get("rep_votes"))
            out[key][2] += to_int(row.get("total_votes"))
    return out


# Priority order the app itself uses (NationalCountyMap.tsx's RACE_LABEL_FALLBACKS) to
# pick which race label represents "the regular race" for a state/year - try the plain
# label first, only fall back to a decisive-round/special-election variant if no plain
# row exists. Senate deliberately excludes the "Special" suffixes here (unlike Governor)
# because a state can hold BOTH a regular and a special Senate race the same year (e.g.
# GA 2020) - falling back to the Special row for the REGULAR audit would silently compare
# the wrong race. Governor never has this same-year-double-race shape (see
# audit_statewide_office's own docstring), so its fallback can safely include Special.
DISTRICT_LABEL_FALLBACKS = {
    "President": [""],
    "Senate": ["", " (Runoff)"],
    "Governor": ["", " (Runoff)", " Special", " Special (Runoff)"],
}


def audit_district_level():
    print(f"\n{'='*70}\nDISTRICT LEVEL (house_statewide_results.csv vs published state totals)\n{'='*70}")
    stw_sums = load_house_statewide_sums()
    offices = [
        ("President", os.path.join(ROOT, "data-entry/president_past_results.csv"), None, ()),
        ("Senate", os.path.join(ROOT, "data-entry/senate_past_results.csv"), "type", {"Special"}),
        ("Governor", os.path.join(ROOT, "data-entry/governor_past_results.csv"), None, ()),
    ]
    total_flags = 0
    total_no_data = 0
    for office, ref_path, type_field, exclude_types in offices:
        ref = load_statewide_ref(ref_path, type_field=type_field, exclude_types=exclude_types)
        fallbacks = DISTRICT_LABEL_FALLBACKS[office]
        by_year = defaultdict(list)
        no_data_by_year = defaultdict(list)
        for (st, year), truth in sorted(ref.items(), key=lambda kv: (kv[0][1], kv[0][0])):
            ours = None
            for suffix in fallbacks:
                cand = stw_sums.get((st, year, office + suffix))
                if cand is not None:
                    ours = cand
                    break
            if ours is None:
                no_data_by_year[year].append(st)
                continue
            f = flagged(ours, truth)
            if f:
                ddiff, gdiff, tdiff = f
                ed, eg, et = truth
                dpct = ddiff / ed * 100 if ed else float("inf") if ddiff else 0
                gpct = gdiff / eg * 100 if eg else float("inf") if gdiff else 0
                tpct = tdiff / et * 100 if et else float("inf") if tdiff else 0
                by_year[year].append((st, f"dem_diff={ddiff}({dpct:.1f}%) gop_diff={gdiff}({gpct:.1f}%) total_diff={tdiff}({tpct:.1f}%)"))
        flags_this_office = sum(len(v) for v in by_year.values())
        no_data_this_office = sum(len(v) for v in no_data_by_year.values())
        if flags_this_office or no_data_this_office:
            print(f"\n--- {office} ---")
            for year in sorted(set(by_year) | set(no_data_by_year)):
                if by_year.get(year):
                    print(f"  {year}: {len(by_year[year])} state(s) flagged")
                    for st, msg in by_year[year]:
                        print(f"    {st}: {msg}")
                if no_data_by_year.get(year):
                    print(f"  {year}: no district-level row at all for: {', '.join(sorted(no_data_by_year[year]))}")
        else:
            print(f"\n--- {office}: all states/years within tolerance ---")
        total_flags += flags_this_office
        total_no_data += no_data_this_office
    return total_flags, total_no_data


def main():
    senate_flags = audit_statewide_office(
        "SENATE", "data-entry/county_senate_results_*.csv",
        os.path.join(ROOT, "data-entry/senate_past_results.csv"),
        type_field="type", exclude_types={"Special"})
    gov_flags = audit_statewide_office(
        "GOVERNOR", "data-entry/county_governor_results_*.csv",
        os.path.join(ROOT, "data-entry/governor_past_results.csv"))
    house_real, house_ref = audit_house()
    pres_flags = audit_president()
    dist_flags, dist_no_data = audit_district_level()

    print(f"\n{'='*70}\nSUMMARY\n{'='*70}")
    print(f"President flagged state/years: {pres_flags}")
    print(f"Senate flagged state/years: {senate_flags}")
    print(f"Governor flagged state/years: {gov_flags}")
    print(f"House REAL county-data issues: {house_real}")
    print(f"House reference-file-disagreement-only (not a bug): {house_ref}")
    print(f"District-level flagged state/years: {dist_flags}")
    print(f"District-level state/years with no district row at all: {dist_no_data}")


if __name__ == "__main__":
    main()
