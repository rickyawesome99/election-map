#!/usr/bin/env python3
"""Attach CANDIDATE NAMES to the 2024 per-district state legislative results.

The district vote buckets already exist (scripts/build-state-leg-results-from-medsl.py wrote
them). This pass re-reads the same MEDSL file and adds a `candidates` list to each district
it already has, so the legislature page can name who ran instead of only showing "Democratic"
and "Republican".

WHY ONLY 2024. Names have to come from the source that carried them, and only one of ours
does. The 2016-2022 districts come from Klarner's SLERS contest file, which is aggregated to
the contest and records candidate COUNTS (`dcand`/`rcand`/`ocand` = 1/1/0), never a name -
so those years cannot get names from the data we hold at all. The hand-entered odd-year and
gap files (LA/MS/NJ/NM/NY/NH/VT/Wikipedia) were transcribed as party vote columns only.
That leaves the 75 MEDSL 2024 chamber-years, which is what this script fills.

THIS SCRIPT NEVER CHANGES A VOTE NUMBER. It only adds names to districts that are already
present, and it refuses to write a district whose candidate votes do not sum to the
demVotes+repVotes+othVotes already recorded there. That invariant is what makes the addition
safe: the reconciled Phase 3 totals stay exactly as audited, and the names are a strict
annotation on top of them.

HOW THE SUM IS MADE TO MATCH. Every reading rule is imported from the two existing MEDSL
scripts rather than restated - the GEN/special filter, the NON_CANDIDATE rows, fusion-line
party resolution, the candidate->party recovery map, and above all the per-county
TOTAL-vs-mode rule (a county filing both a `TOTAL` row and per-mode rows for the same
candidate is counted once, and the choice is made per county because states mix the two
styles across their counties). The unit that rule is applied over here is exactly the
existing pass's unit - (state, chamber, district, county) - so the candidate rows split the
same totals the district buckets were built from.

WHAT A CANDIDATE ENTRY IS. Name (title-cased out of MEDSL's all-caps), party bucket, votes.
Write-in and scattering rows keep their label and land in the O bucket, exactly as they do
in the vote pass, so the list sums to the district total rather than quietly falling short.
No winner is marked: Idaho's SEAT A/B and Washington's POS. 1/2 are separate races that the
vote pass merges into one district, so "most votes in the district" is not the winner there,
and multi-member districts elect several people anyway.

Usage:
    python3 scripts/build-state-leg-candidates-from-medsl.py --report
    python3 scripts/build-state-leg-candidates-from-medsl.py --write
"""

import argparse
import collections
import csv
import importlib.util
import json
import os
import re
import sys

csv.field_size_limit(10_000_000)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, "data-entry", "state-leg-results")

YEAR = 2024


def _load(name, filename):
    path = os.path.join(REPO, "scripts", filename)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M = _load("medsl_statewide", "build-state-leg-votes-from-medsl.py")
D = _load("medsl_districts", "build-state-leg-results-from-medsl.py")

# Lowercase inside a name: particles that are not the first word. "Van Dyke" keeps its
# capital when it leads, which is why this is applied per-position rather than blindly.
PARTICLES = {"de", "del", "della", "der", "di", "du", "la", "le", "van", "von", "der", "ten",
             "ter", "da", "dos", "das", "of", "the", "y"}
# Stay upper: roman-numeral generational suffixes and the initialisms in ballot names.
KEEP_UPPER = {"II", "III", "IV", "V", "VI", "MD", "DDS", "DVM", "PHD", "CPA",
              "USN", "USA", "USAF", "JD", "RN"}
# Written out rather than shouted - "ROBERT THORNE JR" is Robert Thorne Jr., not Robert Thorne JR.
SUFFIX_TITLE = {"JR": "Jr.", "SR": "Sr."}


def titlecase_part(word, first):
    """Title-case one whitespace-delimited token of a ballot name."""
    bare = word.strip(".,")
    if bare.upper() in KEEP_UPPER:
        return word.upper()
    if bare.upper() in SUFFIX_TITLE:
        return SUFFIX_TITLE[bare.upper()]
    if not first and bare.lower() in PARTICLES:
        return word.lower()
    # A single letter is an initial - "J" or "J.".
    if len(bare) == 1:
        return word.upper()

    def cap(chunk):
        if not chunk:
            return chunk
        # Capitalise the first LETTER, not the first character: ballot names carry quoted
        # nicknames ('WALTER "BOO" JONES'), and uppercasing the quote leaves the name lowercase.
        i = next((j for j, ch in enumerate(chunk) if ch.isalpha()), None)
        if i is None:
            return chunk
        head, body = chunk[:i], chunk[i:]
        low = body.lower()
        # Mc/Mac/O' compounds keep the interior capital: MCDONALD -> McDonald, O'BRIEN -> O'Brien.
        if low.startswith("mc") and len(body) > 2:
            return head + "Mc" + body[2].upper() + body[3:].lower()
        if low.startswith("mac") and len(body) > 4:
            return head + "Mac" + body[3].upper() + body[4:].lower()
        return head + body[0].upper() + body[1:].lower()

    # Split on the separators that can carry an interior capital, keeping them in place.
    out, buf = [], ""
    for ch in word:
        if ch in "-'’.":
            out.append(cap(buf))
            out.append(ch)
            buf = ""
        else:
            buf += ch
    out.append(cap(buf))
    joined = "".join(out)
    # O'brien -> O'Brien; only after an apostrophe following a single leading letter.
    return re.sub(r"^([A-Z])'([a-z])", lambda m: f"{m.group(1)}'{m.group(2).upper()}", joined)


def titlecase(name):
    """MEDSL's all-caps ballot name -> display form. Mixed-case input is left alone."""
    if not name.isupper():
        return name
    parts = name.split()
    return " ".join(titlecase_part(p, i == 0) for i, p in enumerate(parts))


def medsl_chambers():
    """(po, chamber) -> the district keys the built 2024 files already carry from MEDSL."""
    out = {}
    for fn in sorted(os.listdir(OUT_DIR)):
        if not fn.endswith(f"-{YEAR}.json"):
            continue
        po = fn[:2]
        data = json.load(open(os.path.join(OUT_DIR, fn), encoding="utf-8"))
        for ch, block in data.items():
            if block.get("source") == D.SOURCE_LABEL:
                chamber = "Senate" if ch == "senate" else "House"
                out[(po, chamber)] = set(block.get("districts", {}))
    return out


def collect(path, cand_party, current, office_parser, wanted):
    """(po, chamber, district) -> {candidate: {party: votes}}, per-county TOTAL-vs-mode resolved.

    `wanted` restricts the scan to the (po, chamber) pairs whose districts came from MEDSL, so a
    chamber the vote pass rejected for poor party coverage never picks up names here either.
    """
    by_norm = {k: {D.normalize_name(d): d for d in v} for k, v in current.items()}
    # (po, chamber, district, county) -> {"TOTAL": {...}, "MODES": {...}}, each a
    # (candidate, party) -> votes map. The basis is chosen over the whole unit, not per
    # candidate, matching the vote pass exactly.
    per_unit = {}

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
            po = (row.get("state_po") or "").strip().upper()
            if (po, chamber) not in wanted:
                continue
            if (row.get("stage") or "").strip().upper() not in ("GEN", ""):
                continue
            if M.truthy(row.get("special")):
                continue
            state = (row.get("state") or "").strip().title()
            cand = (row.get("candidate") or "").strip().upper()
            if not state or not cand or cand in M.NON_CANDIDATE:
                continue
            raw = (row.get("votes") or "").strip()
            if raw == "*":
                continue
            try:
                v = int(float(raw))
            except ValueError:
                continue

            dkey, _exact = D.normalize_district(po, chamber, raw_district,
                                                by_norm.get((po, chamber)))
            if not dkey:
                continue

            if cand in M.OTHER_CANDIDATE:
                p = "O"
            else:
                p = M.party_bucket(row.get("party_simplified"), row.get("party_detailed"))
                if p is None:
                    p = cand_party.get((state, cand), "U")

            unit = ((row.get("county_fips") or "").strip()
                    or (row.get("county_name") or "").strip().upper())
            u = per_unit.setdefault((po, chamber, dkey, unit), {"TOTAL": {}, "MODES": {}})
            slot = "TOTAL" if (row.get("mode") or "").strip().upper() == "TOTAL" else "MODES"
            u[slot][(cand, p)] = u[slot].get((cand, p), 0) + v

    out = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
    for (po, chamber, dkey, _unit), u in per_unit.items():
        basis = "TOTAL" if sum(u["TOTAL"].values()) else "MODES"
        for (cand, p), v in u[basis].items():
            out[(po, chamber)][dkey][(cand, p)] += v
    return out


def to_entries(by_cand):
    """{(name, party): votes} -> the display list, one entry per person, votes desc.

    A candidate carrying more than one party bucket is a fusion line the row-level resolver
    split (rare - it needs the same person filed under different party strings); their votes
    are summed and the bucket holding most of them wins, so the person appears once.
    """
    merged = collections.defaultdict(collections.Counter)
    for (cand, p), v in by_cand.items():
        merged[cand][p] += v
    entries = []
    for cand, buckets in merged.items():
        total = sum(buckets.values())
        party = max(buckets.items(), key=lambda kv: (kv[1], kv[0]))[0]
        entries.append({"name": titlecase(cand),
                        "party": "O" if party == "U" else party,
                        "votes": total})
    entries.sort(key=lambda e: (-e["votes"], e["name"]))
    return entries


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    args = ap.parse_args()

    wanted = medsl_chambers()
    current = D.load_current_keys()

    sys.stderr.write(f"{len(wanted)} MEDSL chamber-years to name\n")
    sys.stderr.write("reading bundled file...\n")
    path = M.fetch(YEAR)
    cand_party = M.build_candidate_parties(path)
    found = collect(path, cand_party, current, None, set(wanted))

    # Chambers the bundled volume does not carry (Washington's legislative races are only in
    # the per-state volume, and Iowa's usable ones likewise) come from their own file, read
    # with that state's office parser where the district is inside the office string.
    missing = [k for k in wanted if not found.get(k)]
    for po in sorted({po for po, _ch in missing if po in D.PER_STATE_FILES}):
        chambers = {k for k in missing if k[0] == po}
        sys.stderr.write(f"reading per-state volume for {po}...\n")
        p = D.fetch_per_state(po)
        parser = D.OFFICE_PARSERS.get(po)
        extra = collect(p, {} if parser else M.build_candidate_parties(p), current, parser, chambers)
        found.update(extra)

    # Verify against the district totals already on disk, and only keep what reconciles.
    ok, bad, absent = {}, [], []
    for fn in sorted(os.listdir(OUT_DIR)):
        if not fn.endswith(f"-{YEAR}.json"):
            continue
        po = fn[:2]
        data = json.load(open(os.path.join(OUT_DIR, fn), encoding="utf-8"))
        for ch, block in data.items():
            if block.get("source") != D.SOURCE_LABEL:
                continue
            chamber = "Senate" if ch == "senate" else "House"
            districts = found.get((po, chamber), {})
            if not districts:
                absent.append((po, chamber, len(block["districts"])))
                continue
            named, diffs = {}, 0
            for dkey, rec in block["districts"].items():
                entries = to_entries(districts.get(dkey, {}))
                if not entries:
                    continue
                want = (rec.get("demVotes") or 0) + (rec.get("repVotes") or 0) + (rec.get("othVotes") or 0)
                if sum(e["votes"] for e in entries) != want:
                    diffs += 1
                    continue
                named[dkey] = entries
            ok[(po, chamber)] = named
            if diffs:
                bad.append((po, chamber, diffs, len(block["districts"])))

    total_d = sum(len(v) for v in ok.values())
    total_c = sum(len(e) for v in ok.values() for e in v.values())
    print(f"{'ST':3s} {'CHAMBER':8s} {'NAMED':>7s} {'OF':>5s} {'CANDS':>7s}")
    for (po, chamber), named in sorted(ok.items()):
        block_n = len(medsl_chambers().get((po, chamber), ()))
        print(f"{po:3s} {chamber:8s} {len(named):7d} {block_n:5d} {sum(len(e) for e in named.values()):7d}")
    print(f"\n{total_d:,} districts named, {total_c:,} candidate entries")
    if absent:
        print(f"\n{len(absent)} chamber(s) got no rows from any volume:")
        for po, chamber, n in absent:
            print(f"  {po} {chamber}: {n} districts left unnamed")
    if bad:
        print(f"\n{len(bad)} chamber(s) had districts whose candidate sum missed the recorded total:")
        for po, chamber, n, of in bad:
            print(f"  {po} {chamber}: {n} of {of} skipped")
    else:
        print("\nevery named district's candidates sum exactly to its recorded votes")

    if args.write:
        written = 0
        for fn in sorted(os.listdir(OUT_DIR)):
            if not fn.endswith(f"-{YEAR}.json"):
                continue
            po = fn[:2]
            fp = os.path.join(OUT_DIR, fn)
            data = json.load(open(fp, encoding="utf-8"))
            touched = False
            for ch, block in data.items():
                chamber = "Senate" if ch == "senate" else "House"
                named = ok.get((po, chamber))
                if named is None:
                    continue
                for dkey, entries in named.items():
                    block["districts"][dkey]["candidates"] = entries
                    touched = True
            if touched:
                with open(fp, "w", encoding="utf-8") as fh:
                    json.dump(data, fh, indent=1)
                    fh.write("\n")
                written += 1
        print(f"\nwrote {written} files in {OUT_DIR}")


if __name__ == "__main__":
    main()
