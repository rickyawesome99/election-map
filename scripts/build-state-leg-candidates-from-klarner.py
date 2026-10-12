#!/usr/bin/env python3
"""Attach CANDIDATE NAMES, incumbency and winners to the 2016-2022 per-district state legislative
results, from Klarner's candidate-level SLERS file.

The district vote buckets for these years came from Klarner's CONTEST file
(build-state-leg-results-from-klarner.py), which carries candidate counts and never a name. The
same Dataverse release (doi:10.7910/DVN/FJOGJB) also ships `208slers_uoa_cand_contest`, one row
per candidate per contest: name parts, party, votes, `exper` (incumbency) and `outcome` (won /
lost). This pass reads that file and adds a `candidates` list to each district already present.

GENERAL ELECTIONS ONLY. `etype == "g"` is the regular general. Special elections (`s`, `gs`) are
excluded on purpose - the atlas covers regular general elections only. Louisiana's jungle rounds
(`lafsettled`, `larunoff`) are the state's general election; where a district went to a runoff the
runoff field is the final result and only its candidates are kept, otherwise the settled first
round is.

THIS SCRIPT NEVER CHANGES A VOTE NUMBER. A district is written only when its candidates' votes sum
exactly to the demVotes+repVotes+othVotes already recorded (after the same KNOWN_DEFECTS divisor
the contest pass applied - New Hampshire's 2022 Senate is doubled in both Klarner files). Districts
whose recorded votes are null (`noCount`) still get their candidates, with null votes, because the
names are real even where the state printed no count.

District keys are derived with the contest script's own functions, imported rather than restated,
so a candidate lands in exactly the district the vote pass created.

WHAT A CANDIDATE ENTRY IS. `name` (display form built from Klarner's last/first/middle/suffix
fields), `party` D/R/O (Klarner `d`/`r`; everything else - `nm`, `np`, `w` - is O; Nebraska's
nonpartisan candidates are resolved to D/R through the hand-researched party files where a name
matches), `votes` (null where Klarner has none), `incumbent` (exper == "inc"), `winner`
(outcome == "w"), and `post` for the states that elect a district's seats as separate numbered
or lettered races (Idaho, Washington, West Virginia Senate), so the UI can group them.

Usage:
    python3 scripts/build-state-leg-candidates-from-klarner.py --report
    python3 scripts/build-state-leg-candidates-from-klarner.py --write
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
KLARNER_CAND_URL = "https://dataverse.harvard.edu/api/access/datafile/10273084"
CACHE = os.environ.get(
    "KLARNER_CAND_CACHE",
    "/private/tmp/claude-501/-Users-rickyjia-election-map/adf92712-f251-4b6b-b71d-0031860b78a1/scratchpad/klarner/cand_contest.tab",
)
YEARS = {2016, 2017, 2018, 2019, 2020, 2021, 2022}
GENERAL_ETYPES = {"g", "lafsettled", "larunoff"}


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(REPO, "scripts", filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


contest = _load("contest", "build-state-leg-results-from-klarner.py")
medsl_cands = _load("medsl_cands", "build-state-leg-candidates-from-medsl.py")


def fetch():
    if not os.path.exists(CACHE):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        sys.stderr.write(f"downloading Klarner candidate file -> {CACHE}\n")
        urllib.request.urlretrieve(KLARNER_CAND_URL, CACHE)
    return CACHE


def clean(v):
    return (v or "").strip().strip('"').strip()


def display_name(row):
    """'boardman, william k' + parts -> 'William K. Boardman'. Klarner stores everything lowercase."""
    first, middle, middle2 = clean(row.get("first")), clean(row.get("middle")), clean(row.get("middle2"))
    last, suffix, prefix = clean(row.get("last")), clean(row.get("suffix")), clean(row.get("prefix"))
    if not last:
        # Fall back to the combined field, "last, first middle".
        cand = clean(row.get("cand"))
        if "," in cand:
            last, rest = [p.strip() for p in cand.split(",", 1)]
            first = rest
        else:
            last = cand
    parts = []
    for p in (first, middle, middle2):
        if not p:
            continue
        for tok in p.split():
            tok = tok.strip(".")
            parts.append(f"{tok}." if len(tok) == 1 else tok)
    parts.append(last)
    if suffix:
        parts.append(suffix.rstrip(".") + ("." if suffix.lower().rstrip(".") in ("jr", "sr") else ""))
    name = " ".join(parts)
    return medsl_cands.titlecase(name.upper())


def norm_person(name):
    return re.sub(r"[^a-z]", "", name.lower())


def load_nebraska_parties():
    """Hand-researched party for Nebraska's nonpartisan ballot: normalized name -> D/R."""
    out = {}
    members = os.path.join(REPO, "data-entry", "nebraska_2018_members.csv")
    cands = os.path.join(REPO, "data-entry", "nebraska_2018_candidate_parties.csv")
    party_of = lambda p: "D" if p.lower().startswith("dem") else "R" if p.lower().startswith("rep") else "O"
    if os.path.exists(members):
        for r in csv.DictReader(open(members, encoding="utf-8")):
            for who, party in ((r.get("incumbent"), r.get("incumbent_party")), (r.get("elected"), r.get("elected_party"))):
                if who and party:
                    out[norm_person(who)] = party_of(party)
    if os.path.exists(cands):
        for r in csv.DictReader(open(cands, encoding="utf-8")):
            if r.get("candidate") and r.get("party"):
                out[norm_person(r["candidate"])] = party_of(r["party"])
    return out


def collect(path, current):
    """(abbr, year, chamber) -> district key -> list of candidate dicts (+ bookkeeping)."""
    by_norm = {k: {contest.normalize_name(d): d for d in districts} for k, districts in current.items()}
    ne_parties = load_nebraska_parties()
    out = collections.defaultdict(lambda: collections.defaultdict(list))
    etypes_seen = collections.defaultdict(set)
    skipped_etype = collections.Counter()

    with open(path, newline="", encoding="utf-8", errors="replace") as fh:
        for row in csv.DictReader(fh, delimiter="\t"):
            row = {k.strip('"'): clean(v) for k, v in row.items()}
            year = contest.num(row.get("year"))
            if year is None or int(year) not in YEARS:
                continue
            sab = row.get("sab", "")
            name = contest.ABBR_TO_NAME.get(sab)
            if not name:
                continue
            chamber = "Senate" if contest.num(row.get("sen")) == 1 else "House"
            if (name, int(year), chamber) in contest.SKIP:
                continue
            etype = row.get("etype", "")
            if etype not in GENERAL_ETYPES:
                skipped_etype[etype] += 1
                continue
            dkey, exact = contest.district_key(sab, chamber, row)
            if not exact:
                resolved = contest.resolve_by_name(row, by_norm.get((sab, chamber)))
                if resolved:
                    dkey = resolved
            if not dkey:
                continue
            ckey = (sab, int(year), chamber)
            etypes_seen[(ckey, dkey)].add(etype)
            party_code = row.get("partyt", "").lower()
            party = "D" if party_code == "d" else "R" if party_code == "r" else "O"
            disp = display_name(row)
            if sab == "NE" and party == "O":
                party = ne_parties.get(norm_person(disp), "O")
            vote = contest.num(row.get("vote"))
            vmiss = contest.num(row.get("vmiss")) == 1
            entry = {
                "name": disp,
                "party": party,
                "votes": None if (vmiss or vote is None) else vote,
            }
            if row.get("exper", "") == "inc":
                entry["incumbent"] = True
            if row.get("outcome", "") == "w":
                entry["winner"] = True
            post = row.get("mmdpost", "")
            if post:
                entry["post"] = post
            entry["_etype"] = etype
            out[ckey][dkey].append(entry)

    # Louisiana: a district that reached a runoff keeps only the runoff candidates.
    for (ckey, dkey), types in etypes_seen.items():
        if "larunoff" in types:
            out[ckey][dkey] = [c for c in out[ckey][dkey] if c["_etype"] == "larunoff"]
    for districts in out.values():
        for cands in districts.values():
            for c in cands:
                c.pop("_etype", None)
    return out, skipped_etype


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    args = ap.parse_args()

    contest.load_state_names()
    current = contest.load_current_keys()
    collected, skipped_etype = collect(fetch(), current)

    print(f"skipped by election type: {dict(skipped_etype)}\n")
    header = f"{'ST':3s} {'YEAR':5s} {'CHAMBER':8s} {'IN FILE':>8s} {'NAMED':>6s} {'NO KEY':>7s} {'SUM MISMATCH':>13s} {'CANDS':>6s} {'INC':>5s} {'WIN':>5s}"
    print(header)
    totals = collections.Counter()
    mismatches = []
    plan = {}  # (sab, year) -> chamber -> dkey -> candidates
    for (sab, year, chamber), districts in sorted(collected.items()):
        path = os.path.join(OUT_DIR, f"{sab}-{year}.json")
        if not os.path.exists(path):
            print(f"{sab:3s} {year:<5d} {chamber:8s} {'no file':>8s}")
            continue
        data = json.load(open(path, encoding="utf-8"))
        ch = "senate" if chamber == "Senate" else "house"
        block = data.get(ch)
        if not block:
            print(f"{sab:3s} {year:<5d} {chamber:8s} {'no chamber':>8s}")
            continue
        divisor = contest.KNOWN_DEFECTS.get((contest.ABBR_TO_NAME[sab], year, chamber), 1)
        named = nokey = bad = ncand = ninc = nwin = 0
        for dkey, cands in districts.items():
            rec = block["districts"].get(dkey)
            if rec is None:
                nokey += 1
                continue
            cands = sorted(cands, key=lambda c: -(c["votes"] or 0))
            if divisor != 1:
                for c in cands:
                    if c["votes"] is not None:
                        c["votes"] = c["votes"] / divisor
            for c in cands:
                if c["votes"] is not None:
                    c["votes"] = int(round(c["votes"]))
            if rec.get("totalVotes") is not None:
                s = sum(c["votes"] or 0 for c in cands)
                if s != rec["totalVotes"]:
                    bad += 1
                    mismatches.append((sab, year, chamber, dkey, s, rec["totalVotes"]))
                    continue
            named += 1
            ncand += len(cands)
            ninc += sum(1 for c in cands if c.get("incumbent"))
            nwin += sum(1 for c in cands if c.get("winner"))
            plan.setdefault((sab, year), {}).setdefault(ch, {})[dkey] = cands
        in_file = len(block["districts"])
        print(f"{sab:3s} {year:<5d} {chamber:8s} {in_file:8d} {named:6d} {nokey:7d} {bad:13d} {ncand:6d} {ninc:5d} {nwin:5d}")
        totals.update({"in_file": in_file, "named": named, "nokey": nokey, "bad": bad, "cands": ncand, "inc": ninc, "win": nwin})

    print(f"\nTOTAL districts in files {totals['in_file']:,} | named {totals['named']:,} | unmatched key {totals['nokey']:,} | "
          f"sum mismatch {totals['bad']:,} | candidates {totals['cands']:,} | incumbents {totals['inc']:,} | winners {totals['win']:,}")
    if mismatches:
        print(f"\n{len(mismatches)} district(s) whose candidate votes do not sum to the recorded total (first 40):")
        for m in mismatches[:40]:
            print(f"  {m[0]} {m[1]} {m[2]} {m[3]}: candidates {m[4]:,} vs recorded {m[5]:,}")

    if args.write:
        n = 0
        for (sab, year), chambers in sorted(plan.items()):
            path = os.path.join(OUT_DIR, f"{sab}-{year}.json")
            data = json.load(open(path, encoding="utf-8"))
            for ch, districts in chambers.items():
                for dkey, cands in districts.items():
                    data[ch]["districts"][dkey]["candidates"] = cands
                    n += 1
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=1)
                fh.write("\n")
        print(f"\nwrote candidates into {n:,} districts across {len(plan)} files")


if __name__ == "__main__":
    main()
