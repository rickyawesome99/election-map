#!/usr/bin/env python3
"""New Hampshire's 2022 House results, from the Secretary of State's county canvasses.

NH House 2022 was the one chamber-year Klarner is defective for and no other source could
reach: Klarner mixes DOUBLED and undoubled districts (Belknap 1 is exactly 2x official) in a
way that is not cleanly correctable, so it sits in that script's SKIP list, and the Wikipedia
article carries no district tables at all. This canvass replaces it.

SOURCE: the ten per-county "2022 General Election - State Representatives" PDFs from the NH
SoS, supplied by the user. `--extract <dir>` reads them all with `pdftotext -layout` and
writes data-entry/new_hampshire_2022_legislature.csv; the committed CSV is what the other
modes read, so the PDFs are not needed again.

NH's format is the most awkward in this project. Per county: a block per district headed
"District No. 5 (4)" - the number in parentheses is SEATS, and a trailing F/FL marks a
FLOTERIAL district, which overlays several base districts and legitimately carries far more
voters than its seat count (this is why NH trips every "votes per seat" outlier check). Then
a header row of "Surname, party" columns, a row per town, and a "Totals" row.

FIVE THINGS THAT EACH SILENTLY CORRUPT THE PARSE:

  * The district heading and the first candidate header share ONE line, so a parser that
    consumes the heading and moves on loses that district's candidates entirely.
  * A district can have SEVERAL header/Totals groups when its candidates do not fit one row.
  * `re.IGNORECASE` on the candidate pattern is fatal: `[a-z]{1,3}` then matches a name's
    initial or suffix, so "Newman, R., d", "O'Brien, Sr., d" and "Lekas, T., r" each produce
    a phantom extra candidate. The party must be matched case-sensitively.
  * A zero-vote Scatter column is printed in the header but OMITTED from the Totals row, and
    the Hillsborough file misspells it "Scattrer". Columns are therefore aligned from the
    left, with a trailing Scatter dropped or added as needed.
  * Rockingham 1's rows lost their town labels in extraction and its Totals row is unlabelled,
    so a numeric-only row is recognised as the total when it equals the running column sum -
    a rule that validates itself rather than guessing.

RECOUNTS: several districts print a "Recount" column beside a candidate. The recount is the
certified figure, so it supersedes the original count rather than adding to it.

Usage:
    python3 scripts/build-newhampshire-2022-leg-votes.py --extract ~/Downloads/2022NH
    python3 scripts/build-newhampshire-2022-leg-votes.py --report
    python3 scripts/build-newhampshire-2022-leg-votes.py --write
    python3 scripts/build-newhampshire-2022-leg-votes.py --districts
"""

import argparse
import collections
import csv
import glob
import json
import os
import re
import subprocess

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")
NH_CSV = os.path.join(REPO, "data-entry", "new_hampshire_2022_legislature.csv")
DISTRICTS_JSON = os.path.join(REPO, "data-entry", "state-leg-results", "NH-2022.json")

SOURCE = "New Hampshire SoS 2022 county canvasses (per-district)"

# The boundary data keys NH House districts as a two-letter county code plus the number.
CODE = {"belknap": "BE", "carroll": "CA", "cheshire": "CH", "coos": "CO", "grafton": "GR",
        "hillsborough": "HI", "merrimack": "ME", "rockingham": "RO", "strafford": "ST",
        "sullivan": "SU"}

DHEAD = re.compile(r"^\s*District No\.?\s*([0-9]+)\s*\((\d+)\)\s*(F\w*)?", re.I)
# Deliberately NOT re.I - see the docstring; an ignorecase party group eats name initials.
TOK = re.compile(r"(?P<recount>\bRecount\b)|(?P<scatter>\b[Ss]catt\w*)|(?P<writein>\bw-in\b)"
                 r"|[A-Za-z'’\-\.]+\s*,\s*(?P<party>[a-z]{1,3})\b")
# The label MUST start with a letter. Several districts lost their town labels in extraction,
# and a `\S.*?` label group then swallows the row's FIRST vote figure as if it were the town
# name - silently dropping one candidate's votes from every such row.
LABELLED = re.compile(r"^\s*([A-Za-z][^\n]*?)\s{2,}((?:[\d,]+|-)(?:\s+(?:[\d,]+|-))*)\s*$")
BARE = re.compile(r"^\s+((?:[\d,]+|-)(?:\s+(?:[\d,]+|-))+)\s*$")
BUCKET = {"r": "R", "d": "D"}


def _v(s):
    return 0 if s == "-" else int(s.replace(",", ""))


def _tokens(s):
    out = []
    for t in TOK.finditer(s):
        if t.group("recount"):
            out.append("RECOUNT")
        elif t.group("party"):
            out.append(BUCKET.get(t.group("party"), "O"))
        else:
            out.append("O")
    return out


def extract(src_dir):
    res = collections.defaultdict(collections.Counter)
    seats = {}
    stats = collections.Counter()
    unresolved = []

    for pdf in sorted(glob.glob(os.path.join(src_dir, "*.pdf"))):
        name = os.path.basename(pdf).lower()
        county = next((c for c in CODE if c in name), None)
        if county is None:
            print(f"skipping unrecognised file {os.path.basename(pdf)}")
            continue
        code = CODE[county]
        txt = subprocess.run(["pdftotext", "-layout", pdf, "-"],
                             capture_output=True, text=True, check=True).stdout
        st = {"d": None, "e": None, "towns": [], "tot": None}

        def flush():
            # Read the accumulated rows BEFORE clearing them.
            e, dist, tot, towns = st["e"], st["d"], st["tot"], st["towns"]
            st.update(e=None, towns=[], tot=None)
            if not (e and dist):
                return
            vals = tot if tot is not None else ([sum(x) for x in zip(*towns)] if towns else None)
            if vals is None:
                return
            stats["groups"] += 1
            e, vals = list(e), list(vals)
            # A zero-vote Scatter is headed but not totalled; an unheaded trailing column is a
            # Scatter the header misspelled. Align from the left and reconcile the tail.
            while len(e) > len(vals) and e and e[-1] == "O":
                e.pop()
            while len(vals) > len(e):
                e.append("O")
            if len(e) != len(vals):
                stats["unresolved"] += 1
                unresolved.append((code, dist, e, vals))
                return
            stats["ok"] += 1
            i = 0
            while i < len(e):
                # Capture the party BEFORE advancing past a Recount column: reading e[i] after
                # the skip lands on the RECOUNT marker itself and discards the candidate's votes.
                party = e[i]
                v = vals[i]
                if i + 1 < len(e) and e[i + 1] == "RECOUNT":
                    v = vals[i + 1]      # the recount is the certified figure
                    i += 1
                if party != "RECOUNT":
                    res[(code, dist)][party if party in ("D", "R") else "O"] += v
                i += 1

        for ln in txt.split("\n"):
            m = DHEAD.match(ln)
            if m:
                # Heading and first candidate header share this line.
                flush()
                st["d"] = str(int(m.group(1)))
                seats[(code, st["d"])] = int(m.group(2))
                st["e"] = _tokens(ln[m.end():]) or None
                continue
            t = _tokens(ln)
            if t and any(x != "RECOUNT" for x in t):
                flush()
                st["e"] = t
                continue
            if st["e"] is None:
                continue
            m = LABELLED.match(ln)
            if m:
                nums = [_v(x) for x in m.group(2).split()]
                if m.group(1).strip().lower().startswith("total"):
                    st["tot"] = nums
                else:
                    st["towns"].append(nums)
                continue
            m = BARE.match(ln)
            if m:
                nums = [_v(x) for x in m.group(1).split()]
                running = [sum(x) for x in zip(*st["towns"])] if st["towns"] else None
                # An unlabelled row equal to the running column sum IS the totals row. Compare
                # on the shared prefix: Rockingham 1 omits its Scatter column from the total,
                # so the totals row is one value shorter than the town rows above it.
                if (running is not None and nums and len(nums) <= len(running)
                        and running[:len(nums)] == nums):
                    st["tot"] = nums
                else:
                    st["towns"].append(nums)
        flush()

    print(f"groups {stats['groups']} | resolved {stats['ok']} | unresolved {stats['unresolved']}")
    for u in unresolved:
        print(f"   UNRESOLVED {u[0]}{u[1]}: {len(u[2])} header entries vs {len(u[3])} values")
    print(f"districts {len(res)} | seats declared {sum(seats.values())}")
    return res


def write_csv(res):
    with open(NH_CSV, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["chamber", "district", "dem_votes", "rep_votes", "oth_votes", "total_votes"])
        for (code, d), c in sorted(res.items(), key=lambda kv: (kv[0][0], int(kv[0][1]))):
            w.writerow(["House", f"{code}{d}", c["D"], c["R"], c["O"], c["D"] + c["R"] + c["O"]])
    print(f"wrote {len(res)} districts -> {NH_CSV}")


def load_csv():
    out = {}
    with open(NH_CSV, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            out[r["district"]] = collections.Counter(
                D=int(r["dem_votes"]), R=int(r["rep_votes"]), O=int(r["oth_votes"]))
    return out


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--extract", metavar="DIR")
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    g.add_argument("--districts", action="store_true")
    args = ap.parse_args()

    if args.extract:
        write_csv(extract(args.extract))
        return

    agg = load_csv()
    if args.districts:
        payload = {"house": {
            "source": SOURCE,
            "districts": {
                d: {"demVotes": c["D"], "repVotes": c["R"], "othVotes": c["O"],
                    "totalVotes": c["D"] + c["R"] + c["O"]}
                for d, c in sorted(agg.items())
            },
        }}
        os.makedirs(os.path.dirname(DISTRICTS_JSON), exist_ok=True)
        existing = json.load(open(DISTRICTS_JSON, encoding="utf-8")) if os.path.exists(DISTRICTS_JSON) else {}
        existing.update(payload)
        with open(DISTRICTS_JSON, "w", encoding="utf-8") as fh:
            json.dump(existing, fh, indent=1)
            fh.write("\n")
        print(f"house   {len(agg):3d} districts -> {DISTRICTS_JSON}")
        return

    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
        fields = list(rows[0].keys())

    changed = 0
    for r in rows:
        if r["state_name"] != "New Hampshire" or r["year"] != "2022" or r["type"] != "House":
            continue
        d = sum(c["D"] for c in agg.values())
        rp = sum(c["R"] for c in agg.values())
        o = sum(c["O"] for c in agg.values())
        total = d + rp + o
        print(f"House   {len(agg):3d} districts   "
              f"was D={int(r['dem_votes']):>9,} R={int(r['rep_votes']):>9,} O={int(r['oth_votes'] or 0):>6,} T={int(r['total_votes']):>10,}   "
              f"now D={d:>9,} R={rp:>9,} O={o:>6,} T={total:>10,}")
        r["dem_votes"], r["rep_votes"], r["oth_votes"] = str(d), str(rp), str(o)
        r["total_votes"] = str(total)
        r["dem_pct"] = f"{d / total * 100:.1f}"
        r["rep_pct"] = f"{rp / total * 100:.1f}"
        r["oth_pct"] = f"{o / total * 100:.1f}"
        r["margin"] = f"{(rp - d) / total * 100:.1f}"
        r["vote_margin"] = str(rp - d)
        r["source"] = SOURCE
        r["note"] = ""
        changed += 1

    if args.write:
        with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        print(f"\nupdated {changed} New Hampshire 2022 House row in {STATE_LEG_CSV}")


if __name__ == "__main__":
    main()
