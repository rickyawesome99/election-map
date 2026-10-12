#!/usr/bin/env python3
"""Fill the candidate flags a source did not carry: `winner`, `incumbent`, and the district's
`uncontested`, for every per-district state legislative result that has a candidate list.

Klarner (2016-2022) marks winners and incumbents itself. MEDSL (2024) names candidates and marks
nothing; Wikipedia marks winners only where an article used the "winning candidate" template and
incumbents only where it wrote "(incumbent)". This pass derives the rest, and only where a
district has NO flag of that kind already - a source's own marking is never overridden.

WINNERS. Seats are filled in this order:
  1. by ROSTER MATCH for elections held on the current map - a candidate whose name matches a
     sitting member of that district whose `lastElection` is this year won it. This is what makes
     the per-post states (Idaho and Washington House seats A/B and positions 1/2, West Virginia
     Senate's alternating pair) come out right, since "most votes in the district" is not the
     winner there;
  2. then by VOTES for the seats still open, top-N, where N is the district's seat count: the
     roster's `seats` (New Hampshire), else the number of sitting members for a multi-member
     chamber on the current map, else 1. Per-post chambers (ID/WA House, WV Senate) are NOT
     filled by votes, so a post race the roster cannot resolve stays unmarked.

INCUMBENTS. A candidate is the incumbent when their name matches a WINNER of the same chamber's
previous election for that seat class - any of the chamber's election years in the four years
before this one (so a four-year senator elected in 2020 is matched in 2024). Matching is on the
normalized "first last" form, then on "last + first initial" when that is unique within the
chamber. Nicknames (Bill / William) defeat this; the report prints the share of winners who were
incumbents so a chamber that reads implausibly low can be checked.

UNCONTESTED. Set where absent: the district had no more real candidates (write-in and scattering
lines excluded) than seats.

Years are processed in order so 2024's incumbents can be matched against 2022's winners.

Usage:
    python3 scripts/derive-state-leg-candidate-flags.py --report
    python3 scripts/derive-state-leg-candidate-flags.py --write
"""

import argparse
import collections
import glob
import json
import os
import re
import unicodedata

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, "data-entry", "state-leg-results")
ROSTER_TS = os.path.join(REPO, "data", "stateLegDistricts.ts")
HIST_TS = os.path.join(REPO, "data", "stateLegHistoricalMaps.ts")

POST_CHAMBERS = {("ID", "house"), ("WA", "house"), ("WV", "senate")}
MULTI_CHAMBERS = {("AZ", "house"), ("MD", "house"), ("ND", "house"), ("NH", "house"), ("NJ", "house"),
                  ("SD", "house"), ("VT", "house"), ("VT", "senate")} | POST_CHAMBERS
SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}
NON_CANDIDATE = re.compile(r"write.?in|scatter|blank|void|under.?vote|over.?vote|none of", re.IGNORECASE)


def load_ts_object(path, const_name):
    s = open(path, encoding="utf-8").read()
    body = s[s.index("{", s.index(f"export const {const_name}")):]
    return json.loads(body[: body.rindex("}") + 1])


def norm_tokens(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"\(.*?\)|\".*?\"|'.*?'", " ", s)          # nicknames in quotes / parentheticals
    s = re.sub(r"[^A-Za-z\s-]", " ", s).lower()
    toks = [t for t in re.split(r"[\s-]+", s) if t and t not in SUFFIXES]
    return toks


def name_keys(name):
    """(full key, initial key): 'william k boardman' -> ('william boardman', 'w boardman')."""
    toks = norm_tokens(name)
    if not toks:
        return None, None
    if len(toks) == 1:
        return toks[0], toks[0]
    first, last = toks[0], toks[-1]
    return f"{first} {last}", f"{first[0]} {last}"


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    args = ap.parse_args()

    roster = load_ts_object(ROSTER_TS, "stateLegDistricts")
    hist = load_ts_object(HIST_TS, "stateLegHistoricalMaps")

    files = sorted(glob.glob(os.path.join(OUT_DIR, "??-????.json")))
    by_state = collections.defaultdict(list)
    for f in files:
        st, year = os.path.basename(f)[:-5].split("-")
        by_state[st].append((int(year), f))

    stats = collections.defaultdict(collections.Counter)
    changed_files = {}
    for st, items in sorted(by_state.items()):
        items.sort()
        # chamber -> year -> set of winner name keys (full) and initial keys
        winners_by_year = collections.defaultdict(dict)
        for year, path in items:
            data = json.load(open(path, encoding="utf-8"))
            dirty = False
            for ch, block in data.items():
                districts = block.get("districts", {})
                on_current = str(year) not in (hist.get(st, {}).get(ch) or {})
                roster_d = {d["number"]: d for d in (roster.get(st, {}).get(ch) or [])}
                is_post = (st, ch) in POST_CHAMBERS
                is_multi = (st, ch) in MULTI_CHAMBERS
                # previous winners: the chamber's election years within 4 years before this one
                prev_full, prev_init = set(), collections.Counter()
                for py, keys in winners_by_year[ch].items():
                    if year - 4 <= py < year:
                        prev_full |= keys["full"]
                        prev_init.update(keys["init"])
                # A source that marked ANY incumbent or uncontested district in this chamber-year
                # marked them all (Klarner, Wikipedia's "(incumbent)"); derive those only where the
                # source carried none, so a derived guess never sits beside a sourced flag.
                source_has_inc = any(c.get("incumbent") for r in districts.values() for c in (r.get("candidates") or []))
                source_has_unc = any("uncontested" in r for r in districts.values())
                this_full, this_init = set(), []
                for dkey, rec in districts.items():
                    cands = rec.get("candidates")
                    if not cands:
                        continue
                    real = [c for c in cands if not NON_CANDIDATE.search(c["name"])]
                    rd = roster_d.get(dkey)
                    members = rd.get("incumbents") or [] if rd else []
                    seats = (rd or {}).get("seats") or (len(members) if (is_multi and rd and on_current) else 1)
                    if is_post and (st, ch) == ("WV", "senate"):
                        seats = 1
                    stats[year]["districts"] += 1

                    # --- winners
                    if not any(c.get("winner") for c in cands):
                        won = []
                        if on_current and rd:
                            for c in real:
                                fk, ik = name_keys(c["name"])
                                for m in members:
                                    last = m.get("lastElection") or rd.get("lastElection")
                                    if last != year:
                                        continue
                                    mfk, mik = name_keys(m["name"])
                                    if fk and (fk == mfk or (ik == mik and len(real) <= 4)):
                                        won.append(c)
                                        break
                        if len(won) < seats and not is_post:
                            rest = sorted((c for c in real if c not in won and c.get("votes") is not None), key=lambda c: -c["votes"])
                            if not rest and len(real) == 1 and seats == 1:
                                rest = real
                            won += rest[: seats - len(won)]
                        for c in won:
                            c["winner"] = True
                            dirty = True
                        stats[year]["winners_set"] += len(won)
                        if not won:
                            stats[year]["no_winner"] += 1

                    # --- incumbents
                    if not source_has_inc and prev_full:
                        for c in real:
                            fk, ik = name_keys(c["name"])
                            if fk and (fk in prev_full or (ik in prev_init and prev_init[ik] == 1)):
                                c["incumbent"] = True
                                dirty = True
                                stats[year]["incumbents_set"] += 1

                    # --- uncontested
                    if not source_has_unc:
                        contenders = [c for c in real if c.get("votes") is None or c["votes"] > 0]
                        if len(contenders) <= seats:
                            rec["uncontested"] = True
                            dirty = True
                            stats[year]["uncontested_set"] += 1

                    for c in cands:
                        if c.get("winner"):
                            fk, ik = name_keys(c["name"])
                            if fk:
                                this_full.add(fk)
                                this_init.append(ik)
                            stats[year]["winners_total"] += 1
                            if c.get("incumbent"):
                                stats[year]["winners_incumbent"] += 1
                winners_by_year[ch][year] = {"full": this_full, "init": this_init}
            if dirty:
                changed_files[path] = data

    print(f"{'YEAR':5s} {'DISTRICTS':>9s} {'WIN SET':>8s} {'NO WINNER':>10s} {'INC SET':>8s} {'UNC SET':>8s} {'WINNERS':>8s} {'INC SHARE':>9s}")
    for year in sorted(stats):
        s = stats[year]
        share = (s["winners_incumbent"] / s["winners_total"] * 100) if s["winners_total"] else 0
        print(f"{year:<5d} {s['districts']:9d} {s['winners_set']:8d} {s['no_winner']:10d} {s['incumbents_set']:8d} {s['uncontested_set']:8d} {s['winners_total']:8d} {share:8.1f}%")

    if args.write:
        for path, data in changed_files.items():
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=1)
                fh.write("\n")
        print(f"\nwrote {len(changed_files)} files")


if __name__ == "__main__":
    main()
