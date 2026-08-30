#!/usr/bin/env python3
"""Phase 3: per-district state legislative results, 2016-2022, from the Klarner contest file.

Klarner's "State Legislative Election Returns, 1967-2022" (doi:10.7910/DVN/FJOGJB, file
`202slers_uoa_contest20230810.tab`) is one row per CONTEST - a single state-legislative
race - so it is already district-level. The statewide pass
(build-state-leg-votes-from-klarner.py) throws that detail away by aggregating to
(state, year, chamber); this script keeps it and writes
data-entry/state-leg-results/{ABBR}-{year}.json for scripts/build-state-leg-results.mjs.

LINEAGE. state_leg.csv's 2016-2022 vote columns came from THIS FILE, so the audit page's
aggregate-vs-statewide check is a self-consistency test for these years, not an independent
one. That is deliberate and it is still worth having: it verifies the district->chamber
aggregation, the multi-member seat arithmetic and the district key derivation all the way
through the build. To keep the audit honest the emitted `source` string is byte-identical
to the statewide row's, so the page labels these rows "shared" rather than "independent".
An independent 2022 check needs MEDSL's 2022 volume (doi:10.7910/DVN/OAARCY, 0.98 GB).

DISTRICT KEYS. Most states number their districts and `dno` is the whole answer. Four
patterns are not that simple, and all four are handled below:

  * SUBDISTRICTS (MD/MN/ND House): `dno` is the numeric district and `geopost` the
    subdistrict index, so 12 + geopost 1 -> "12A". Matches the boundary data's own keys.
  * PER-POST MULTI-MEMBER (ID/WA House, WV Senate): a district's seats are elected as
    separate races distinguished by `mmdpost`. These are SUMMED into one district row -
    the district's total legislative vote - which is also what makes the chamber sum
    reconcile against state_leg.csv, since the statewide pass counts every post too.
  * LETTERED DISTRICTS (AK Senate): `dname` carries the letter and `dno` is blank.
  * NAMED DISTRICTS (NH/VT/MA): `dname` is a lowercased, punctuation-stripped county name
    with `dno` an index within it. NH's boundary keys are a 2-letter county code plus the
    number ("BE1"); VT's are "Addison-1"; Massachusetts's House are ordinals ("10th
    Bristol"). Massachusetts's Senate and Vermont's multi-county districts cannot be rebuilt
    from the parts - "bristolplymouth" gives no way to know the canonical name puts an "and"
    in the middle - so those are resolved the other way round, by normalising the boundary
    data's own key list and looking the Klarner name up in it (`resolve_by_name`). Anything
    still unresolved keeps the raw Klarner name and is counted in the report rather than
    silently emitted as if it were canonical.

    Resolving an OLD year against the CURRENT key list settles the district's LABEL only,
    never that its lines are unchanged - Phase 2's era table (data/stateLegCalendar.ts) is
    what says which map a given year used. It is safe here because these chambers have no
    numeric alternative, and a name that no longer exists simply fails to resolve.

The report prints, per chamber-year, how many district keys correspond to a district in
the CURRENT boundary data. A low rate is expected for older years - these are the district
lines of their own era, and Phase 2's era table (data/stateLegCalendar.ts) says which map
each year used - so it is a diagnostic, not a pass/fail.

Usage:
    python3 scripts/build-state-leg-results-from-klarner.py --years 2022 --report
    python3 scripts/build-state-leg-results-from-klarner.py --years 2016,2018,2020,2022 --write
"""

import argparse
import collections
import csv
import json
import os
import re
import sys
import urllib.request

csv.field_size_limit(10_000_000)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, "data-entry", "state-leg-results")
PRES_DIR = os.path.join(REPO, "data-entry", "state-leg-pres2024")
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")

KLARNER_URL = "https://dataverse.harvard.edu/api/access/datafile/10273086"
CACHE = os.environ.get(
    "KLARNER_CACHE", "/private/tmp/claude-501/-Users-rickyjia-election-map/klarner-cache/contest.tab"
)

# Byte-identical to the statewide rows' source, so the audit page's lineage check sees these
# two as one source rather than reporting a false independent corroboration.
SOURCE_LABEL = "Klarner SLERS 1967-2022"

# Carried over from build-state-leg-votes-from-klarner.py - the same defects apply here, and
# a chamber-year excluded from the statewide file must not reappear at district level.
KNOWN_DEFECTS = {("New Hampshire", 2022, "Senate"): 2}
SKIP = {
    ("New Hampshire", 2022, "House"),
    ("Vermont", 2018, "Senate"),
}

NH_COUNTY_CODES = {
    "belknap": "BE", "carroll": "CA", "cheshire": "CH", "coos": "CO", "grafton": "GR",
    "hillsborough": "HI", "merrimack": "ME", "rockingham": "RO", "strafford": "ST",
    "sullivan": "SU",
}

ABBR_TO_NAME = {}


def load_state_names():
    import re
    text = open(os.path.join(REPO, "data", "statesData.ts"), encoding="utf-8").read()
    for m in re.finditer(r'name: "([^"]+)",\s*abbr: "([A-Z]{2})"', text):
        ABBR_TO_NAME[m.group(2)] = m.group(1)


def fetch_klarner():
    if not os.path.exists(CACHE):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        sys.stderr.write(f"downloading Klarner contest file -> {CACHE}\n")
        urllib.request.urlretrieve(KLARNER_URL, CACHE)
    return CACHE


def num(v):
    v = (v or "").strip()
    if not v or v.upper() in ("NA", "N/A", "."):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def ordinal(n):
    if 10 <= n % 100 <= 20:
        return f"{n}th"
    return f"{n}{ {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th') }".replace(" ", "")


def normalize_name(s):
    """Fold a district name to a comparison key: 'Bristol and Norfolk' -> 'bristolnorfolk'.

    `and` has to go as a WHOLE WORD - a plain substring strip turns 'Addison-Rutland' into
    'addisonrutl' and 'Cape and Islands' into 'capeisls', neither of which matches anything.
    """
    return re.sub(r"[^a-z0-9]", "", re.sub(r"\band\b", " ", s.lower()))


WORD_ORDINALS = [
    "", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth",
    "ninth", "tenth", "eleventh", "twelfth",
]


def resolve_by_name(row, canonical_by_norm):
    """Look a Klarner name up in the boundary data's own key list. Returns the key or None."""
    dno = (row.get("dno") or "").strip().lstrip("0")
    dname = (row.get("dname") or "").strip().lower()
    if not dname or not canonical_by_norm:
        return None
    candidates = [dname, f"{dname}{dno}" if dno else dname]
    if dno.isdigit():
        n = int(dno)
        if n < len(WORD_ORDINALS):
            candidates.append(f"{WORD_ORDINALS[n]}{dname}")
        candidates.append(f"{ordinal(n)}{dname}")
    for c in candidates:
        hit = canonical_by_norm.get(normalize_name(c))
        if hit:
            return hit
    return None


def district_key(sab, chamber, row):
    """The district's key, matching the boundary data's convention where one exists.

    Returns (key, exact) - `exact` is False for the name-based districts this file cannot
    reconstruct unambiguously, so the report can separate them from the reliable ones.
    """
    dno = (row.get("dno") or "").strip().lstrip("0")
    dname = (row.get("dname") or "").strip().lower()
    geopost = num(row.get("geopost"))

    # AK Senate districts are letters, carried in dname with dno blank.
    if sab == "AK" and chamber == "Senate":
        return (dname.upper(), True) if dname else (dno, False)

    if sab == "NH" and chamber == "House":
        code = NH_COUNTY_CODES.get(dname)
        return (f"{code}{dno}", True) if code and dno else (f"{dname}{dno}", False)

    if sab == "VT" and chamber == "House":
        # Single-county names reconstruct cleanly; the multi-county ones ("addisonrutland")
        # cannot be split back into "Addison-Rutland" without a name list.
        if dname.isalpha() and dno:
            return (f"{dname.title()}-{dno}", True)
        return (f"{dname}-{dno}" if dno else dname, False)

    if sab == "MA" and chamber == "House":
        if dno and dname.isalpha():
            return (f"{ordinal(int(dno))} {dname.title()}", True)
        return (f"{dno} {dname}".strip(), False)

    # Vermont/Massachusetts Senate names are multi-county and not reconstructable.
    if sab in ("VT", "MA") and chamber == "Senate":
        return (f"{dname}{('-' + dno) if dno else ''}", False)

    if not dno:
        return (dname, False) if dname else ("", False)

    # A subdistrict index makes "12" into "12A"/"12B" (Maryland, Minnesota, North Dakota).
    if geopost is not None:
        return (f"{dno}{chr(ord('A') + int(geopost) - 1)}", True)

    return (dno, True)


def load_current_keys():
    """District keys of the CURRENT maps, from the 2024-president crosswalk, for diagnostics."""
    out = {}
    if not os.path.isdir(PRES_DIR):
        return out
    for fn in os.listdir(PRES_DIR):
        if not fn.endswith(".json"):
            continue
        abbr = fn[:-5]
        data = json.load(open(os.path.join(PRES_DIR, fn), encoding="utf-8"))
        for ch, districts in data.items():
            out[(abbr, "House" if ch == "house" else "Senate")] = set(districts)
    return out


def load_statewide():
    out = {}
    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            try:
                out[(r["state_name"], int(r["year"]), r["type"])] = r
            except ValueError:
                continue
    return out


def collect(path, years, current):
    """(abbr, year, chamber) -> {district_key: {votes...}}, plus per-chamber bookkeeping."""
    by_norm = {
        k: {normalize_name(d): d for d in districts} for k, districts in current.items()
    }
    agg = collections.defaultdict(lambda: collections.defaultdict(
        lambda: {"demVotes": 0.0, "repVotes": 0.0, "othVotes": 0.0, "contests": 0,
                 "counted": 0, "uncontested": 0}
    ))
    meta = collections.defaultdict(lambda: {"seatsup": 0.0, "totalseats": 0.0, "inexact": 0, "vmiss": 0})

    with open(path, newline="", encoding="utf-8", errors="replace") as fh:
        for row in csv.DictReader(fh):
            year = num(row.get("year"))
            if year is None or int(year) not in years:
                continue
            sab = (row.get("sab") or "").strip()
            name = ABBR_TO_NAME.get(sab)
            if not name:
                continue
            chamber = "Senate" if num(row.get("sen")) == 1 else "House"
            key = (name, int(year), chamber)
            if key in SKIP:
                continue

            dkey, exact = district_key(sab, chamber, row)
            if not exact:
                resolved = resolve_by_name(row, by_norm.get((sab, chamber)))
                if resolved:
                    dkey, exact = resolved, True
            if not dkey:
                continue

            ckey = (sab, int(year), chamber)
            m = meta[ckey]
            m["seatsup"] = max(m["seatsup"], num(row.get("seatsup")) or 0.0)
            m["totalseats"] = max(m["totalseats"], num(row.get("totalseats")) or 0.0)
            if not exact:
                m["inexact"] += 1
            if num(row.get("vmiss")) == 1:
                m["vmiss"] += 1

            d = agg[ckey][dkey]
            dv, rv, ov = num(row.get("dvote")), num(row.get("rvote")), num(row.get("ovote"))
            d["demVotes"] += dv or 0.0
            d["repVotes"] += rv or 0.0
            d["othVotes"] += ov or 0.0
            d["contests"] += 1
            # Klarner lists a district whether or not anyone contested it, and leaves the vote
            # fields NA where the state published no count. Tracking that here is what keeps
            # "nobody voted" separate from "no count was ever printed" in the output.
            if dv is not None or rv is not None or ov is not None:
                d["counted"] += 1
            if num(row.get("uncont")) == 1:
                d["uncontested"] += 1

    # Drop lone off-cycle special elections, exactly as the statewide pass does: a real
    # general always puts up more than one seat in a chamber bigger than two.
    for ckey in list(agg):
        m = meta[ckey]
        if m["seatsup"] == 1 and m["totalseats"] > 2:
            del agg[ckey]
            continue
        sab, year, chamber = ckey
        divisor = KNOWN_DEFECTS.get((ABBR_TO_NAME[sab], year, chamber))
        if divisor:
            for d in agg[ckey].values():
                for f in ("demVotes", "repVotes", "othVotes"):
                    d[f] /= divisor
    return agg, meta


def district_payload(v):
    """One district's output record.

    A district none of whose contests carried a vote figure gets NULL votes, not zero. The
    two are different claims - Oklahoma, Florida, Texas and Hawaii declare an unopposed
    candidate elected without printing the race, so no ballot was ever cast for that office
    in that district - and writing 0 would tell a map to render a real 0-0 tie. Indiana is
    the counter-example: it does print unopposed races, so all 100 of its districts carry
    counts. `uncontested` is recorded separately because the two do not always coincide -
    a few uncontested races do publish a count, and a contest can be missing votes for
    reasons other than being uncontested.
    """
    uncontested = v["uncontested"] == v["contests"] and v["contests"] > 0
    if v["counted"] == 0:
        return {
            "demVotes": None, "repVotes": None, "othVotes": None, "totalVotes": None,
            "noCount": True,
            **({"uncontested": True} if uncontested else {}),
        }
    out = {
        "demVotes": int(round(v["demVotes"])),
        "repVotes": int(round(v["repVotes"])),
        "othVotes": int(round(v["othVotes"])),
        "totalVotes": int(round(v["demVotes"] + v["repVotes"] + v["othVotes"])),
    }
    if uncontested:
        out["uncontested"] = True
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", default="2016,2018,2020,2022")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    args = ap.parse_args()

    years = {int(y) for y in args.years.split(",")}
    load_state_names()
    current = load_current_keys()
    agg, meta = collect(fetch_klarner(), years, current)
    statewide = load_statewide()

    rows = []
    mismatched = []
    for (sab, year, chamber), districts in sorted(agg.items()):
        dem = sum(d["demVotes"] for d in districts.values())
        rep = sum(d["repVotes"] for d in districts.values())
        oth = sum(d["othVotes"] for d in districts.values())
        sw = statewide.get((ABBR_TO_NAME[sab], year, chamber))
        diff = None
        if sw and sw["total_votes"].strip():
            diff = int(round(dem + rep + oth)) - int(sw["total_votes"])
        cur = current.get((sab, chamber), set())
        matched = sum(1 for k in districts if k in cur) if cur else None
        nocount = sum(1 for v in districts.values() if v["counted"] == 0)
        rows.append((sab, year, chamber, len(districts), nocount,
                     meta[(sab, year, chamber)]["inexact"], matched, diff))
        if diff not in (None, 0):
            mismatched.append((sab, year, chamber, diff, int(sw["total_votes"])))

    nocount_total = sum(1 for ds in agg.values() for v in ds.values() if v["counted"] == 0)
    print(f"{len(agg)} chamber-years, {sum(len(d) for d in agg.values())} districts "
          f"({nocount_total} with no published count)\n")
    print(f"{'ST':3s} {'YEAR':5s} {'CHAMBER':8s} {'DISTS':>6s} {'NO COUNT':>9s} {'INEXACT':>8s} {'IN CURRENT MAP':>15s} {'VS STATEWIDE':>13s}")
    for sab, year, chamber, n, nocount, inexact, matched, diff in rows:
        mt = "—" if matched is None else f"{matched}/{n}"
        dv = "no statewide" if diff is None else ("exact" if diff == 0 else f"{diff:+,}")
        print(f"{sab:3s} {year:<5d} {chamber:8s} {n:6d} {nocount:9d} {inexact:8d} {mt:>15s} {dv:>13s}")

    print(f"\n{len(mismatched)} chamber-year(s) do not reconcile against state_leg.csv:")
    for sab, year, chamber, diff, total in mismatched:
        print(f"  {sab} {year} {chamber}: district sum is {diff:+,} against a statewide {total:,}")
    if not mismatched:
        print("  none — every chamber-year's district sum equals its statewide row exactly")

    if args.write:
        os.makedirs(OUT_DIR, exist_ok=True)
        by_file = collections.defaultdict(dict)
        for (sab, year, chamber), districts in agg.items():
            ch = "senate" if chamber == "Senate" else "house"
            m = meta[(sab, year, chamber)]
            note = None
            if m["vmiss"]:
                note = f"{int(m['vmiss'])} contest(s) missing votes in source"
            if m["inexact"]:
                extra = f"{int(m['inexact'])} district key(s) could not be matched to the boundary data's naming"
                note = f"{note} | {extra}" if note else extra
            by_file[(sab, year)][ch] = {
                "source": SOURCE_LABEL,
                **({"note": note} if note else {}),
                "districts": {
                    k: district_payload(v)
                    for k, v in sorted(districts.items(), key=lambda kv: (len(kv[0]), kv[0]))
                },
            }
        for (sab, year), payload in sorted(by_file.items()):
            path = os.path.join(OUT_DIR, f"{sab}-{year}.json")
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=1)
                fh.write("\n")
        print(f"\nwrote {len(by_file)} files to {OUT_DIR}")


if __name__ == "__main__":
    main()
