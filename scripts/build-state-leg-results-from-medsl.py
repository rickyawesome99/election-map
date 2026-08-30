#!/usr/bin/env python3
"""Phase 3 for 2024: per-district state legislative results from MEDSL's precinct returns.

The Klarner contest file (build-state-leg-results-from-klarner.py) covers 2016-2022 and
stops. MEDSL's "State Precinct-Level Returns 2024" carries a `district` on every row, so
the same file the statewide pass groups to (state, chamber) groups here to
(state, chamber, district) and writes data-entry/state-leg-results/{ABBR}-2024.json.

Everything about READING the file - the per-county TOTAL-vs-mode rule, the NON_CANDIDATE
filter, fusion-line party resolution, the candidate->party recovery map, the excluded and
truncated chambers - is imported from scripts/build-state-leg-votes-from-medsl.py rather
than restated, so the two passes cannot drift apart. Read that script's docstring first;
the gotchas it documents all still apply.

WHAT IS NEW HERE IS THE DISTRICT STRING, and MEDSL writes it a different way in almost
every state. The boundary data's keys are the target (Phase 4 joins results to the map on
them), so `normalize_district` handles:

  * zero-padded numbers - "001" -> "1", by far the common case;
  * subdistrict letters - "10A" stays "10A" (Minnesota), "045" -> "45";
  * PER-SEAT SUFFIXES - Idaho files "DISTRICT 1 SEAT A" and "DISTRICT 1 SEAT B" as separate
    districts. The suffix is stripped and the two are SUMMED into district "1", matching
    what the Klarner pass does with `mmdpost` and what the statewide totals already count;
  * New Hampshire's "BELKNAP 001" -> "BE1", its boundary keys being a 2-letter county code;
  * named districts - "ORANGE-CALEDONIA", "10TH ESSEX", "1ST ESSEX". These are resolved by
    normalising the BOUNDARY data's own key list and looking the MEDSL name up in it, the
    same inversion the Klarner pass uses. Massachusetts needs one extra candidate form:
    its Senate keys spell the ordinal out ("First Essex") where MEDSL writes "1ST ESSEX".

COVERAGE. Three classes of chamber are absent from this file or unusable in it, and all
three are inherited from the statewide pass rather than rediscovered: Nebraska (nonpartisan
ballot, no party recorded anywhere), New Mexico (the 2024 file is truncated to 25 districts
per chamber), and any chamber where too large a share of the vote carries no usable party
(Oregon, Arizona, Iowa). Washington is a fourth: it has NO state-legislative rows in this
file at all - its races live in the separate per-state volume (doi:10.7910/DVN/NYTPDU).

Usage:
    python3 scripts/build-state-leg-results-from-medsl.py --report
    python3 scripts/build-state-leg-results-from-medsl.py --write
"""

import argparse
import collections
import csv
import importlib.util
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

YEAR = 2024

# MEDSL publishes TWO 2024 collections. The bundled "STATE_precinct_general.csv" is the default
# here; the per-state volume ("Precinct-Level Returns 2024 by Individual State",
# doi:10.7910/DVN/NYTPDU) is a separate set of files, and for some states it carries legislative
# races the bundled volume simply does not have. Washington is the clear case: its 182,104 rows in
# the bundled file are all statewide executive and judicial offices, with no legislative row at all.
PER_STATE_FILES = {"WA": 13731157, "OR": 13731150, "NM": 13731177, "AZ": 13731136, "IA": 13731166}
# Byte-identical to the statewide rows' source so the audit page reports these as shared
# lineage rather than as independent corroboration of the same file.
SOURCE_LABEL = "MEDSL State Precinct-Level Returns 2024"


def _load_statewide_module():
    path = os.path.join(REPO, "scripts", "build-state-leg-votes-from-medsl.py")
    spec = importlib.util.spec_from_file_location("medsl_statewide", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M = _load_statewide_module()

NH_COUNTY_CODES = {
    "BELKNAP": "BE", "CARROLL": "CA", "CHESHIRE": "CH", "COOS": "CO", "GRAFTON": "GR",
    "HILLSBOROUGH": "HI", "MERRIMACK": "ME", "ROCKINGHAM": "RO", "STRAFFORD": "ST",
    "SULLIVAN": "SU",
}

WORD_ORDINALS = {
    "1ST": "FIRST", "2ND": "SECOND", "3RD": "THIRD", "4TH": "FOURTH", "5TH": "FIFTH",
    "6TH": "SIXTH", "7TH": "SEVENTH", "8TH": "EIGHTH", "9TH": "NINTH", "10TH": "TENTH",
    "11TH": "ELEVENTH", "12TH": "TWELFTH",
}

# A per-seat / per-position suffix identifies one seat of a multi-member district, not a
# district of its own. Stripping it is what merges Idaho's SEAT A and SEAT B back together.
SEAT_SUFFIX = re.compile(r"\s*[-,]?\s*(SEAT|POSITION|POS\.?|PLACE|POST)\s*[A-Z0-9]+\s*$")
DISTRICT_PREFIX = re.compile(r"^\s*(STATE\s+)?(HOUSE|SENATE|LEGISLATIVE\s+)?DISTRICT\s+")

# Washington puts the district number inside the office NAME and leaves the `district` column
# blank on every row - "LEGISLATIVE DISTRICT 1 - STATE REPRESENTATIVE POS. 1" / "POS. 2" (it
# elects two House members per district as separate races, both folding into the same district,
# the same shape as Idaho's SEAT A/B) and "LEGISLATIVE DISTRICT 1 - STATE SENATOR". A state whose
# office string does not decompose into a fixed chamber name plus a separate district column needs
# an entry here. Same convention as OFFICE_PARSERS in scripts/crosswalk-state-leg-pres2024.py.
_WA_OFFICE_RE = re.compile(r"^LEGISLATIVE DISTRICT (\d+) - STATE (REPRESENTATIVE|SENATOR)")


def _wa_office(office):
    m = _WA_OFFICE_RE.match((office or "").strip().upper())
    if not m:
        return None
    return ("House" if m.group(2) == "REPRESENTATIVE" else "Senate", m.group(1))


OFFICE_PARSERS = {"WA": _wa_office}


def normalize_name(s):
    """Fold a district name for comparison; `and` must go as a WHOLE word, not a substring."""
    return re.sub(r"[^a-z0-9]", "", re.sub(r"\band\b", " ", s.lower()))


def normalize_district(state_po, chamber, raw, canonical_by_norm):
    """MEDSL's district string -> the boundary data's key. Returns (key, exact)."""
    s = (raw or "").strip().upper()
    if not s:
        return ("", False)
    s = DISTRICT_PREFIX.sub("", s)
    s = SEAT_SUFFIX.sub("", s).strip()

    # New Hampshire's House keys are a two-letter county code plus the number.
    if state_po == "NH" and chamber == "House":
        m = re.match(r"^([A-Z]+)\s+0*(\d+)$", s)
        if m and m.group(1) in NH_COUNTY_CODES:
            return (f"{NH_COUNTY_CODES[m.group(1)]}{m.group(2)}", True)

    # Plain number, or number plus a subdistrict letter.
    m = re.match(r"^0*(\d+)([A-Z]?)$", s)
    if m:
        return (f"{m.group(1)}{m.group(2)}", True)

    # Named district: look it up in the boundary data's own keys.
    if canonical_by_norm:
        candidates = [s]
        lead = s.split(" ", 1)
        if len(lead) == 2 and lead[0] in WORD_ORDINALS:
            candidates.append(f"{WORD_ORDINALS[lead[0]]} {lead[1]}")
        for c in candidates:
            hit = canonical_by_norm.get(normalize_name(c))
            if hit:
                return (hit, True)

    return (s.title(), False)


def load_current_keys():
    out = {}
    if not os.path.isdir(PRES_DIR):
        return out
    for fn in os.listdir(PRES_DIR):
        if not fn.endswith(".json"):
            continue
        data = json.load(open(os.path.join(PRES_DIR, fn), encoding="utf-8"))
        for ch, districts in data.items():
            out[(fn[:-5], "House" if ch == "house" else "Senate")] = set(districts)
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


def fetch_per_state(po):
    """Path to one state's file from the per-state volume, downloading it once.

    Dataverse serves these under either extension - it converts the smaller files to its own
    tabular `.tab` format and leaves the large ones as `.csv` (Arizona's 207 MB file is the
    latter) - so check both before deciding a download is needed. The contents are
    comma-separated either way.
    """
    base = os.path.join(M.CACHE_DIR, f"{YEAR}-{po.lower()}-precinct-general")
    for ext in (".tab", ".csv"):
        if os.path.exists(base + ext):
            return base + ext
    os.makedirs(M.CACHE_DIR, exist_ok=True)
    path = base + ".tab"
    url = f"https://dataverse.harvard.edu/api/access/datafile/{PER_STATE_FILES[po]}?format=original"
    sys.stderr.write(f"downloading MEDSL {YEAR} {po} per-state returns -> {path}\n")
    urllib.request.urlretrieve(url, path)
    return path


def collect(path, cand_party, current, office_parser=None):
    """(state, chamber) -> {district: Counter(D/R/O/U)}, per-county TOTAL-vs-mode resolved."""
    by_norm = {k: {normalize_name(d): d for d in v} for k, v in current.items()}
    # (state, chamber, district, county) -> {"TOTAL": Counter, "MODES": Counter}
    per_unit = {}
    inexact = collections.Counter()
    # Votes on rows carrying NO district at all. They are real votes the statewide pass counts,
    # so a chamber with many of them sums BELOW its own statewide row - New York's 2024 file
    # leaves 13% of both chambers' vote undistricted. Reported rather than silently dropped.
    undistricted = collections.Counter()
    state_po = {}

    with open(path, newline="", encoding="utf-8", errors="replace") as fh:
        for row in csv.DictReader(fh):
            if office_parser:
                parsed = office_parser(row.get("office"))
                if parsed is None:
                    continue
                chamber, raw_district = parsed
            else:
                chamber = M.OFFICE_TO_TYPE.get((row.get("office") or "").strip().upper())
                if chamber is None:
                    continue
                raw_district = row.get("district")
            if (row.get("stage") or "").strip().upper() not in ("GEN", ""):
                continue
            if M.truthy(row.get("special")):
                continue
            state = (row.get("state") or "").strip().title()
            cand = (row.get("candidate") or "").strip().upper()
            if not state or not cand or cand in M.NON_CANDIDATE:
                continue
            if state in M.EXCLUDE_STATES or (state, chamber) in M.SKIP_CHAMBERS:
                continue
            raw = (row.get("votes") or "").strip()
            if raw == "*":
                continue
            try:
                v = int(float(raw))
            except ValueError:
                continue

            po = (row.get("state_po") or "").strip().upper()
            state_po[state] = po
            dkey, exact = normalize_district(po, chamber, raw_district,
                                             by_norm.get((po, chamber)))
            if not dkey:
                undistricted[(state, chamber)] += v
                continue
            if not exact:
                inexact[(state, chamber)] += 1

            if cand in M.OTHER_CANDIDATE:
                p = "O"
            else:
                p = M.party_bucket(row.get("party_simplified"), row.get("party_detailed"))
                if p is None:
                    p = cand_party.get((state, cand), "U")

            unit = ((row.get("county_fips") or "").strip()
                    or (row.get("county_name") or "").strip().upper())
            u = per_unit.setdefault((state, chamber, dkey, unit),
                                    {"TOTAL": collections.Counter(), "MODES": collections.Counter()})
            u["TOTAL" if (row.get("mode") or "").strip().upper() == "TOTAL" else "MODES"][p] += v

    out = collections.defaultdict(dict)
    for (state, chamber, dkey, _unit), u in per_unit.items():
        basis = "TOTAL" if sum(u["TOTAL"].values()) else "MODES"
        c = out[(state, chamber)].setdefault(dkey, collections.Counter())
        c.update(u[basis])
    return out, inexact, undistricted, state_po


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    ap.add_argument("--state", help="use the per-state volume for this state instead of the "
                                    "bundled one, e.g. --state WA")
    args = ap.parse_args()

    office_parser = None
    if args.state:
        po = args.state.upper()
        if po not in PER_STATE_FILES:
            sys.exit(f"no per-state file id recorded for {po}; add it to PER_STATE_FILES")
        path = fetch_per_state(po)
        office_parser = OFFICE_PARSERS.get(po)
    else:
        path = M.fetch(YEAR)
    sys.stderr.write("building candidate->party map...\n")
    cand_party = M.build_candidate_parties(path) if not office_parser else {}
    current = load_current_keys()
    sys.stderr.write("aggregating districts...\n")
    data, inexact, undistricted, state_po = collect(path, cand_party, current, office_parser)
    statewide = load_statewide()

    kept, skipped, mismatched, notes = {}, [], [], {}
    print(f"{'ST':3s} {'CHAMBER':8s} {'DISTS':>6s} {'UNATTR':>7s} {'INEXACT':>8s} {'IN MAP':>9s} {'VS STATEWIDE':>13s}")
    for (state, chamber), districts in sorted(data.items()):
        po = state_po[state]
        sw_row = statewide.get((state, YEAR, chamber))
        # A chamber with no row for this year did not hold a regular election - what is in the
        # file is an off-cycle special that slipped the `special` flag. Minnesota's Senate is
        # the 2024 case: one district against a chamber that next elects in 2026.
        if sw_row is None:
            skipped.append((po, chamber, f"no 2024 row in state_leg.csv - {len(districts)} district(s) here are an off-cycle special"))
            continue
        tot = sum(sum(c.values()) for c in districts.values())
        un = sum(c["U"] for c in districts.values())
        share = un / tot if tot else 1.0
        if share > M.MAX_UNATTRIBUTED:
            skipped.append((po, chamber, f"{share:.1%} of the vote carries no usable party"))
            continue
        cur = current.get((po, chamber), set())
        matched = sum(1 for k in districts if k in cur) if cur else None
        sw = sw_row
        diff = None
        if sw and sw["total_votes"].strip():
            diff = tot - int(sw["total_votes"])
            if diff != 0:
                mismatched.append((po, chamber, diff, int(sw["total_votes"])))
        mt = "—" if matched is None else f"{matched}/{len(districts)}"
        dv = "no statewide" if diff is None else ("exact" if diff == 0 else f"{diff:+,}")
        print(f"{po:3s} {chamber:8s} {len(districts):6d} {share:6.2%} {inexact[(state, chamber)]:8d} {mt:>9s} {dv:>13s}")
        kept[(po, chamber)] = districts

        # Record the two ways a chamber can be legitimately short of a full district set, so the
        # audit page shows a reason rather than an unexplained diff.
        why = []
        und = undistricted[(state, chamber)]
        if und:
            why.append(f"{und:,} votes ({und / (tot + und):.1%}) are on rows carrying no district and are not included")
        up = int(sw["seats_up"]) if sw["seats_up"].strip() else None
        size = int(sw["total_seats"]) if sw["total_seats"].strip() else None
        if cur and up is not None and size is not None and up == size and len(cur) == size and len(districts) < size:
            why.append(f"only {len(districts)} of {size} districts appear; states that declare unopposed candidates elected print no vote count")
        if why:
            notes[(po, chamber)] = " | ".join(why)

    print(f"\n{len(kept)} chamber(s) kept, {len(skipped)} skipped for poor party coverage:")
    for po, chamber, why in skipped:
        print(f"  {po} {chamber}: {why}")
    print(f"\n{len(mismatched)} chamber(s) do not reconcile against state_leg.csv:")
    for po, chamber, diff, total in mismatched:
        print(f"  {po} {chamber}: district sum is {diff:+,} ({diff / total:+.2%}) against a statewide {total:,}")
    if not mismatched:
        print("  none")
    print(f"\n{len(notes)} chamber(s) carry a coverage note:")
    for (po, chamber), why in sorted(notes.items()):
        print(f"  {po} {chamber}: {why}")

    if args.write:
        os.makedirs(OUT_DIR, exist_ok=True)
        by_state = collections.defaultdict(dict)
        for (po, chamber), districts in kept.items():
            by_state[po]["senate" if chamber == "Senate" else "house"] = {
                "source": SOURCE_LABEL,
                **({"note": notes[(po, chamber)]} if (po, chamber) in notes else {}),
                "districts": {
                    k: {
                        "demVotes": c["D"], "repVotes": c["R"],
                        "othVotes": c["O"] + c["U"],
                        "totalVotes": c["D"] + c["R"] + c["O"] + c["U"],
                    }
                    for k, c in sorted(districts.items(), key=lambda kv: (len(kv[0]), kv[0]))
                },
            }
        for po, payload in sorted(by_state.items()):
            fp = os.path.join(OUT_DIR, f"{po}-{YEAR}.json")
            existing = json.load(open(fp, encoding="utf-8")) if os.path.exists(fp) else {}
            existing.update(payload)
            with open(fp, "w", encoding="utf-8") as fh:
                json.dump(existing, fh, indent=1)
                fh.write("\n")
        print(f"\nwrote {len(by_state)} files to {OUT_DIR}")


if __name__ == "__main__":
    main()
