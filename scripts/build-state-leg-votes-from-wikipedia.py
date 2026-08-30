#!/usr/bin/env python3
"""Last-resort fill for state_leg.csv rows no dataset covers, from Wikipedia infoboxes.

This is deliberately the LOWEST-priority source and only ever touches rows that are still
unsourced. Order of preference across the three scripts:
    1. build-state-leg-votes-from-klarner.py   1967-2022, 48 states  (academic, cleaned)
    2. build-state-leg-votes-from-medsl.py     2024                  (official canvasses)
    3. this script                             whatever is left
It refuses to overwrite a row already sourced from Klarner or MEDSL.

What is left after the other two, and why Wikipedia is the only option:
  * ODD-YEAR cycles - Virginia, New Jersey, Mississippi and Louisiana elect in 2019/2023/
    2025. MEDSL's "State Precinct-Level Returns" volumes are even-year only, and Klarner
    stops at 2022.
  * 2024 chambers MEDSL cannot answer: Arizona / Iowa / Oregon (too many candidates carry
    no party in the file), New Mexico (its 2024 file holds only 25 districts per chamber),
    Washington (no state-legislative rows at all in the STATE volume).
  * Louisiana in every year - its jungle primary keeps it out of Klarner entirely.

TRUST THIS SOURCE LEAST. Wikipedia infoboxes have already been caught wrong twice in this
project, both times verified against official results: the 2019 New Jersey Assembly infobox
understates the vote by ~4x (implying a 6.5% turnout), and Idaho's 2020 Senate figures were
~50% low because uncontested races were dropped. So every row this script writes is marked
`source = "Wikipedia infobox"` to keep it visibly weaker than the other two, and --report
prints a per-seat plausibility ratio against the same chamber's other cycles so an
implausible article shows up before it is written.

Usage:
    python3 scripts/build-state-leg-votes-from-wikipedia.py --report
    python3 scripts/build-state-leg-votes-from-wikipedia.py --write
"""

import argparse
import csv
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")
CACHE_DIR = os.environ.get(
    "WIKI_CACHE", "/private/tmp/claude-501/-Users-rickyjia-election-map/wiki-cache")
UA = {"User-Agent": "election-map-data/1.0 (state legislature research)"}

PROTECTED_SOURCES = ("Klarner", "MEDSL", "Wikipedia district tables")

# Lower chamber is not called "House of Representatives" everywhere, and the article title
# follows the real name. Upper chamber is "<State> Senate" or "<State> State Senate".
LOWER_NAMES = {
    "New Jersey": ["General Assembly"],
    "Virginia": ["House of Delegates"],
    "Maryland": ["House of Delegates"],
    "California": ["State Assembly"],
    "New York": ["State Assembly"],
    "Nevada": ["State Assembly"],
    "Wisconsin": ["State Assembly"],
}
INFOBOX_PARTY = re.compile(r"^\s*\|\s*party(\d+)\s*=\s*(.+?)\s*$", re.M)
INFOBOX_VOTES = re.compile(r"^\s*\|\s*popular_vote(\d+)\s*=\s*'*([\d,]+)'*\s*$", re.M)

# Many of these infoboxes do not hold a statewide popular vote at all - some carry only the
# two leaders' OWN district results, which look like vote totals but are ~2% of the chamber
# (2023 Virginia Senate came out at 59,204 against a chamber that should be near 2M). So a
# parsed figure is only accepted when its votes-per-seat lands near what the same chamber
# records in the cycles that ARE properly sourced.
PLAUSIBLE_RANGE = (0.5, 2.0)
# One major party reading exactly zero in a real chamber-wide total is never right; 2023
# Virginia House parsed as D 0 / R 1,144,704 because the infobox only listed one party.
ZERO_PARTY_FLOOR = 50_000


def titles_for(state, chamber, year):
    if chamber == "Senate":
        names = [f"{state} Senate", f"{state} State Senate"]
    else:
        names = [f"{state} {n}" for n in LOWER_NAMES.get(state, [])]
        names += [f"{state} House of Representatives", f"{state} House"]
    return [f"{year} {n} election" for n in names]


def wikitext(page):
    """Raw wikitext for an article, cached; None if the article does not exist."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    safe = page.replace("/", "_")
    path = os.path.join(CACHE_DIR, f"{safe}.wikitext")
    if os.path.exists(path):
        txt = open(path, encoding="utf-8").read()
        return txt or None
    url = ("https://en.wikipedia.org/w/api.php?action=parse&redirects=1&page="
           f"{urllib.parse.quote(page)}&prop=wikitext&format=json")
    wt = None
    time.sleep(1.5)   # the API 429s readily; every article is cached after one fetch
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            data = json.load(urllib.request.urlopen(req))
            wt = data.get("parse", {}).get("wikitext", {}).get("*")
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                break
            if e.code != 429 or attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(wt or "")
    return wt


def bucket(party):
    p = party.upper()
    if "DEMOCRAT" in p:
        return "D"
    if "REPUBLICAN" in p:
        return "R"
    return "O"


def parse_infobox(wt):
    """-> ({'D':n,'R':n,'O':n}, n_parties) from the infobox's partyN/popular_voteN pairs.

    `n_parties` matters: most of these infoboxes list only the two major parties, so an O of
    0 there means "not reported", NOT "no third-party votes were cast". The caller notes
    that on the row rather than asserting a zero.
    """
    parties = {int(n): v for n, v in INFOBOX_PARTY.findall(wt)}
    votes = {int(n): int(v.replace(",", "")) for n, v in INFOBOX_VOTES.findall(wt)}
    if not votes:
        return None, 0
    out = {"D": 0, "R": 0, "O": 0}
    for n, v in votes.items():
        party = parties.get(n, "")
        if not party:
            return None, 0       # a vote total we cannot attribute; don't guess
        out[bucket(party)] += v
    return (out, len(votes)) if sum(out.values()) > 0 else (None, 0)


# --- fallback: sum the per-district result tables -------------------------------------
# Used when the infobox has no statewide popular vote, or has one the plausibility check
# rejects. Same shape as the Nebraska script: a heading per district, and for the top-two
# primary states the primary and the general share one box, split by GENERAL_MARKER.
# A district heading, level 2 or 3. The district name is not always bare text - Oregon
# writes "=== [[Oregon's 1st House district|District 1]] ===" - so match a heading that
# CONTAINS "District <n>" rather than one that starts with it.
DISTRICT_HEAD_ANY = re.compile(r"^(={2,3})\s*(?![^\n]*?[Pp]rimary)[^\n=]*?"
                               r"(?:District|LD)\s*\d+[^\n=]*?\1\s*$", re.M)
# Subsection headings that introduce a primary rather than the general election; Oregon
# nests "==== Republican primary ====" inside each district block.
PRIMARY_SUBHEAD = re.compile(r"^={3,}\s*[^\n=]*primary[^\n=]*={3,}\s*$", re.M | re.IGNORECASE)
ANY_SUBHEAD = re.compile(r"^={3,}\s*[^\n=]*={3,}\s*$", re.M)
CAND_BOX = re.compile(
    r"\{\{\s*Election box (?:winning )?candidate[^}]*?\|\s*party\s*=\s*([^|\n}]+?)\s*\|"
    r"[^}]*?\|\s*votes\s*=\s*([\d,]+)", re.IGNORECASE | re.DOTALL)
WRITEIN_BOX = re.compile(r"\{\{\s*Election box write-?in[^}]*?\|\s*votes\s*=\s*([\d,]+)",
                         re.IGNORECASE | re.DOTALL)
# Only the "winning candidate" variant marks who took the seat. Counting these gives
# seats-won, which for a STAGGERED chamber cannot be derived from the composition (most of
# the body is holdovers) and which Klarner does not cover past 2022.
WINNER_BOX = re.compile(
    r"\{\{\s*Election box winning candidate[^}]*?\|\s*party\s*=\s*([^|\n}]+?)\s*\|",
    re.IGNORECASE | re.DOTALL)
GENERAL_MARKER = re.compile(r"\{\{\s*Election box open primary general election",
                            re.IGNORECASE)


BOX_BEGIN = re.compile(r"\{\{\s*Election box begin", re.IGNORECASE)
BOX_TITLE = re.compile(r"\|\s*title\s*=\s*([^\n|}]{0,120})", re.IGNORECASE)


def general_only(block):
    """Strip a district block down to its general-election result boxes.

    Two different article styles have to be handled, and getting either wrong silently
    doubles a chamber:
      * TOP-TWO states (WA, NE) put the primary and the general in ONE box separated by
        {{Election box open primary general election}}.
      * PARTISAN-PRIMARY states (AZ, VA) use SEPARATE boxes, the primary one titled
        something like "Primary election results". Those get dropped by title.
    """
    m = GENERAL_MARKER.search(block)
    if m:
        return block[m.end():]

    # Drop whole subsections that are primaries (Oregon nests "==== Republican primary ====
    # / ==== Democratic primary ====" inside each district before the general).
    subs = list(ANY_SUBHEAD.finditer(block))
    if any(PRIMARY_SUBHEAD.match(s.group(0)) for s in subs):
        kept, pos = [], 0
        for i, s in enumerate(subs):
            if i == 0:
                kept.append(block[:s.start()])
            end = subs[i + 1].start() if i + 1 < len(subs) else len(block)
            if not PRIMARY_SUBHEAD.match(s.group(0)):
                kept.append(block[s.end():end])
        block = "".join(kept)

    starts = [b.start() for b in BOX_BEGIN.finditer(block)]
    if not starts:
        return block
    kept = []
    for i, s in enumerate(starts):
        seg = block[s: starts[i + 1] if i + 1 < len(starts) else len(block)]
        title = BOX_TITLE.search(seg)
        label = (title.group(1) if title else "").lower()
        if "primary" in label and "general" not in label:
            continue
        kept.append(seg)
    return "".join(kept)


def parse_district_tables(wt, min_districts=5):
    """Sum every district's GENERAL-election candidate rows. -> (counts, n_boxes)."""
    heads = list(DISTRICT_HEAD_ANY.finditer(wt))
    if len(heads) < min_districts:
        return None, 0
    out = {"D": 0, "R": 0, "O": 0}
    won = {"D": 0, "R": 0, "O": 0}
    n = 0
    for i, h in enumerate(heads):
        block = wt[h.end(): heads[i + 1].start() if i + 1 < len(heads) else len(wt)]
        block = general_only(block)
        for party, votes in CAND_BOX.findall(block):
            out[bucket(party)] += int(votes.replace(",", ""))
            n += 1
        for votes in WRITEIN_BOX.findall(block):
            out["O"] += int(votes.replace(",", ""))
            n += 1
        for party in WINNER_BOX.findall(block):
            won[bucket(party)] += 1
    return (out, n, won) if sum(out.values()) > 0 else (None, 0, won)


def load_rows():
    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    return rows, list(rows[0].keys())


def per_seat_reference(rows, state, chamber):
    """Median votes-per-seat-up from that chamber's already-sourced cycles, for sanity."""
    vals = []
    for r in rows:
        if r["state_name"] != state or r["type"] != chamber:
            continue
        if not r["source"].startswith(PROTECTED_SOURCES):
            continue
        t = (r["total_votes"] or "").strip()
        ds, rs = (r["dem_seats"] or "").strip(), (r["rep_seats"] or "").strip()
        if t.isdigit() and ds.isdigit() and rs.isdigit() and int(ds) + int(rs) > 0:
            vals.append(int(t) / (int(ds) + int(rs)))
    if not vals:
        return None
    vals.sort()
    return vals[len(vals) // 2]


def infobox_plausible(got, row, rows, state, chamber):
    total = sum(got.values())
    if (got["D"] == 0 or got["R"] == 0) and total > ZERO_PARTY_FLOOR:
        return False
    seats = 0
    if row["dem_seats"].strip().isdigit() and row["rep_seats"].strip().isdigit():
        seats = int(row["dem_seats"]) + int(row["rep_seats"])
    ref = per_seat_reference(rows, state, chamber)
    if not (seats and ref):
        return True
    ratio = (total / seats) / ref
    return PLAUSIBLE_RANGE[0] <= ratio <= PLAUSIBLE_RANGE[1]


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    ap.add_argument("--min-year", type=int, default=2016)
    ap.add_argument("--max-year", type=int, default=2025)
    ap.add_argument("--seats-only", action="store_true",
                    help="only fill missing seats_won by counting district-table winners")
    args = ap.parse_args()

    rows, fields = load_rows()
    targets = []
    for r in rows:
        y = int(r["year"]) if r["year"].strip().isdigit() else 0
        if not (args.min_year <= y <= args.max_year):
            continue
        if r["note"].strip() == "Unicameral":
            continue          # NE's empty placeholder rows; its data lives in "House"
        if args.seats_only:
            # Staggered chambers Klarner does not reach and MEDSL could not attribute:
            # their seats-won has to be counted off the article's district tables.
            if not r["dem_seats_won"].strip():
                targets.append(r)
            continue
        if r["source"].startswith(PROTECTED_SOURCES):
            continue
        targets.append(r)

    print(f"candidate rows (unsourced, {args.min_year}-{args.max_year}): {len(targets)}\n")
    print(f"{'year':5s}{'state':15s}{'ch':7s}{'D':>10}{'R':>10}{'O':>9}{'total':>10}  {'per-seat':>9}  {'verdict':26s}article")
    filled = 0
    for r in sorted(targets, key=lambda x: (x["year"], x["state_name"], x["type"])):
        state, chamber, year = r["state_name"], r["type"], int(r["year"])
        got, used, nparty, method, won_counts = None, None, 0, "infobox", None
        texts = []
        for t in titles_for(state, chamber, year):
            wt = wikitext(t)
            if not wt:
                continue
            texts.append((t, wt))
            if args.seats_only:
                continue   # only the district tables mark winners; the infobox never does
            got, nparty = parse_infobox(wt)
            if got:
                used = t
                break
        # An infobox figure that fails the plausibility check is usually the two leaders'
        # own district results rather than a statewide total, so fall back to summing the
        # per-district tables on the same article.
        if texts and (not got or not infobox_plausible(got, r, rows, state, chamber)):
            for t, wt in texts:
                alt, nboxes, wonc = parse_district_tables(wt)
                if alt:
                    won_counts = wonc
                    got, used, nparty, method = alt, t, 3, "district tables"
                    break
        if not got:
            print(f"{year:<5d}{state:15s}{chamber:7s}{'—':>10}{'—':>10}{'—':>9}{'—':>10}"
                  f"{'':>11}  no infobox popular vote found")
            continue
        total = sum(got.values())
        seats = 0
        if r["dem_seats"].strip().isdigit() and r["rep_seats"].strip().isdigit():
            seats = int(r["dem_seats"]) + int(r["rep_seats"])
        ref = per_seat_reference(rows, state, chamber)
        ratio_val = (total / seats) / ref if (seats and ref) else None
        ratio = f"{ratio_val:.2f}x" if ratio_val else "n/a"

        verdict = "accept"
        if (got["D"] == 0 or got["R"] == 0) and total > ZERO_PARTY_FLOOR:
            verdict = "REJECT one major party = 0"
        elif ratio_val is None:
            # Louisiana has no Klarner/MEDSL cycle to compare against. Its House and Senate
            # figures are internally consistent (per-seat 5,276 vs 12,875, and its Senate
            # districts really are ~2.7x a House district), so they are taken with the note
            # above rather than dropped.
            verdict = "accept" if state == "Louisiana" else "REVIEW no reference cycle"
        elif not (PLAUSIBLE_RANGE[0] <= ratio_val <= PLAUSIBLE_RANGE[1]):
            verdict = "REJECT implausible per-seat"

        print(f"{year:<5d}{state:15s}{chamber:7s}{got['D']:10,}{got['R']:10,}{got['O']:9,}"
              f"{total:10,}  {ratio:>9}  {verdict:26s}{method:16s}{used}")
        if verdict != "accept":
            continue

        if args.write:
            r["dem_votes"], r["rep_votes"], r["oth_votes"] = str(got["D"]), str(got["R"]), str(got["O"])
            r["total_votes"] = str(total)
            r["dem_pct"] = f"{got['D'] / total * 100:.1f}"
            r["rep_pct"] = f"{got['R'] / total * 100:.1f}"
            r["oth_pct"] = f"{got['O'] / total * 100:.1f}"
            notes = []
            if nparty <= 2:
                # The infobox listed only the major parties, so this total omits whatever
                # third-party vote there was; O is unknown here, not zero.
                notes.append("infobox lists major parties only; third-party vote not included")
            if state == "Louisiana":
                # Louisiana decides many seats in its October jungle primary and reports no
                # November figure for them, so a LA chamber total is structurally well below
                # the state's turnout - not a gap.
                notes.append("Louisiana jungle primary; unopposed/primary-decided seats report no votes")
            r["note"] = " | ".join(notes)
            r["margin"] = f"{(got['R'] - got['D']) / total * 100:.1f}"
            r["vote_margin"] = str(got["R"] - got["D"])
            r["source"] = f"Wikipedia {method}"
            if won_counts and sum(won_counts.values()):
                r["dem_seats_won"], r["rep_seats_won"] = str(won_counts["D"]), str(won_counts["R"])
                r["oth_seats_won"] = str(won_counts["O"])
                r["seats_up"] = str(sum(won_counts.values()))
            filled += 1

    if args.write:
        with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        print(f"\nfilled {filled} rows -> {STATE_LEG_CSV}")


if __name__ == "__main__":
    main()
