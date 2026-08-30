#!/usr/bin/env python3
"""Aggregate Nebraska Legislature election results by party from Wikipedia's district tables.

Nebraska is the one state neither of the other two sources can answer:
  * Klarner's returns dataset omits Nebraska entirely.
  * MEDSL carries Nebraska, but its ballot is officially NONPARTISAN, so every NE candidate
    is recorded as NONPARTISAN in both party_simplified and party_detailed - there is no
    party information in the file at all.
Nebraska's senators nonetheless caucus and campaign as Democrats or Republicans, and that
is the split the site shows, so it has to come from a source that records the affiliation.

Wikipedia's per-cycle "20XX Nebraska Legislature election" articles carry a table per
district with each candidate's party (sourced, per their own footnote, from "candidates'
websites and official party endorsement lists"), but only some cycles state a statewide
popular vote. This script parses the district tables out of the raw wikitext and sums them,
which both fills the cycles that lack an aggregate and cross-checks the ones that have one.

VALIDATION: run with --validate. For cycles where the article itself states a statewide
popular vote, the parsed sum is compared against it. 2020 is the reference case
(article: D 166,676 / R 245,639).

Note the article footnote is the honest caveat to keep in mind: these party labels are
endorsements and self-description, not ballot labels, because Nebraska has none.

Usage:
    python3 scripts/build-nebraska-leg-votes.py --validate
    python3 scripts/build-nebraska-leg-votes.py --write
"""

import argparse
import csv
import json
import os
import re
import time
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")

YEARS = [2016, 2018, 2020, 2022, 2024]
# Statewide popular vote as stated in the article itself, where it states one. Used only to
# validate the parser, never written.
STATED = {2020: {"D": 166676, "R": 245639}}

UA = {"User-Agent": "election-map-data/1.0 (state legislature research)"}
# One candidate row inside an {{Election box ...}} template. "total", "begin", "hold",
# "gain" and "end" boxes are not candidates and must not be summed.
CAND_BOX = re.compile(
    r"\{\{\s*Election box (?:winning )?candidate[^}]*?\|\s*party\s*=\s*([^|\n]+?)\s*\|"
    r"[^}]*?\|\s*votes\s*=\s*([\d,]+)", re.IGNORECASE | re.DOTALL)
# Only the WINNING variant of the box marks the candidate who took the seat, which is how
# seats-won is counted here. Nebraska's 49 seats are staggered, so seats-won cannot be
# inferred from the chamber's composition the way it can for a whole-chamber body.
WINNER_BOX = re.compile(
    r"\{\{\s*Election box winning candidate[^}]*?\|\s*party\s*=\s*([^|\n]+?)\s*\|",
    re.IGNORECASE | re.DOTALL)
DISTRICT_HEAD = re.compile(r"^=== *District\s+(\d+) *===", re.M | re.IGNORECASE)
# Nebraska runs a nonpartisan top-two primary, and each district's table shows BOTH rounds
# in one box: the primary first, then this marker, then the November general. Summing the
# whole block double-counts every district (2020 came out at D 253k against the article's
# D 167k). Everything before this marker is the primary and must be dropped.
GENERAL_MARKER = re.compile(r"\{\{\s*Election box open primary general election",
                            re.IGNORECASE)
# The 2018 article uses `no party` template variants: name and votes, no affiliation.
# These are read with a real field parser rather than a regex over the whole template,
# because a naive split on "|" also splits inside a [[A|B]] wikilink and mangles the name.
BOX_ANY = re.compile(r"\{\{\s*(Election box[^|}]*)((?:\|[^{}]*)*)\}\}", re.IGNORECASE | re.DOTALL)


def box_fields(body):
    body = re.sub(r"\[\[([^\]]*?)\|([^\]]*?)\]\]",
                  lambda m: "[[" + m.group(1) + "\x00" + m.group(2) + "]]", body)
    out = {}
    for chunk in body.split("|")[1:]:
        if "=" in chunk:
            k, v = chunk.split("=", 1)
            out[k.strip().lower()] = v.replace("\x00", "|").strip()
    return out


def noparty_candidates(block):
    """(candidate, votes, is_winner) for each `no party` candidate box."""
    for m in BOX_ANY.finditer(block):
        name = m.group(1).strip().lower()
        if "candidate no party" not in name:
            continue
        f = box_fields(m.group(2))
        if "candidate" in f and "votes" in f:
            yield f["candidate"], int(f["votes"].replace(",", "")), "winning" in name


MEMBERS_CSV = os.path.join(REPO, "data-entry", "nebraska_2018_members.csv")
DEFEATED_CSV = os.path.join(REPO, "data-entry", "nebraska_2018_candidate_parties.csv")

CACHE_DIR = os.environ.get(
    "WIKI_CACHE", "/private/tmp/claude-501/-Users-rickyjia-election-map/wiki-cache")


def wikitext(page):
    """Fetch an article's raw wikitext, caching it - the API rate-limits (HTTP 429)
    quickly when --validate and --write are run back to back."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, f"{page}.wikitext")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return fh.read()
    url = ("https://en.wikipedia.org/w/api.php?action=parse&page="
           f"{page}&prop=wikitext&format=json")
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            wt = json.load(urllib.request.urlopen(req))["parse"]["wikitext"]["*"]
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(wt)
    return wt


_NICK = {"BOB": "ROBERT", "TIM": "TIMOTHY", "TOM": "THOMAS", "MIKE": "MICHAEL",
         "MATT": "MATTHEW", "DAN": "DANIEL", "PAT": "PATRICIA", "STEVE": "STEPHEN",
         "CHUCK": "CHARLES"}


def name_key(raw):
    """first+last, nickname-normalised, middle initials dropped.

    The article writes the same person several ways across cycles - "Bob Hilkemann" vs
    "Robert Hilkemann", "Timothy J. Gragert" vs "Tim Gragert", "Mark A. Kolterman" - so a
    literal match misses a third of them.
    """
    n = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*?)\]?\]?$", r"\1", raw)
    n = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", n)
    n = re.sub(r"\(.*?\)", "", n)                       # "(incumbent)"
    n = re.sub(r"[^A-Za-z .]", " ", n.replace("'", "")).upper()
    parts = [x for x in re.split(r"[ .]+", n) if len(x) > 1]
    if not parts:
        return ""
    return _NICK.get(parts[0], parts[0]) + " " + parts[-1]


def short_bucket(party):
    """D/R/O from the short codes the two Nebraska files use ("Dem", "Rep", "Ind", "Lib").

    `bucket()` matches on the full party NAME as Wikipedia writes it ("Democratic Party
    (United States)"), so it returns O for "Dem" - hence this separate reader.
    """
    p = (party or "").strip().upper()
    if p.startswith("DEM"):
        return "D"
    if p.startswith("REP"):
        return "R"
    return "O"


def load_2018_parties():
    """Nebraska 2018 needs an external party map: its article records NO affiliation for
    any candidate (all 102 entries use the `no party` template) because the ballot carries
    none. Two committed files supply it - the seat-by-seat member list (incumbents and
    winners) and the researched parties of the 16 defeated non-incumbents the member list
    cannot cover. Keyed BY DISTRICT for the defeated file so a spelling variant cannot
    silently drop a candidate.
    """
    by_name, by_district = {}, {}
    if os.path.exists(MEMBERS_CSV):
        with open(MEMBERS_CSV, newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                if r["incumbent"].strip().upper() != "VACANT":
                    by_name[name_key(r["incumbent"])] = short_bucket(r["incumbent_party"])
                by_name[name_key(r["elected"])] = short_bucket(r["elected_party"])
    if os.path.exists(DEFEATED_CSV):
        with open(DEFEATED_CSV, newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                by_district[(r["district"].strip(), name_key(r["candidate"]))] = short_bucket(r["party"])
    return by_name, by_district


def bucket(party):
    """Map a Wikipedia party label to D / R / O by PARTY ALIGNMENT.

    Nebraska's ballot has no party labels at all, so the only meaningful split is which
    party a candidate aligns and caucuses with - that is what this column is for. A label
    that names a major party counts to it even when qualified, so "Independent Democratic"
    and "Independent Democrat" (22,160 votes in 2024) are Democratic. Labels naming no
    party - plain "Independent", and 2016's "Nonpartisan politician" (72,525 votes) - are
    Other.

    Wikipedia itself is inconsistent about this: the 2020 article's infobox folds
    Independent-Democratic into the Democratic total while the 2024 one lists it as its own
    party. Applying the alignment rule uniformly is what makes the parsed 2020 sum
    reproduce that article's stated D 166,676 / R 245,639 exactly, which is the check in
    --validate; it does mean the 2024 row moves off the figure the infobox happens to show.
    """
    p = party.upper()
    if "DEMOCRAT" in p:
        return "D"
    if "REPUBLICAN" in p:
        return "R"
    return "O"


def parse_year(year):
    """Sum the GENERAL-election candidate rows of every district table on the article.

    Anchored on the per-district headings rather than a results-section title, because the
    section is called "Results" in some cycles and "Detailed results" in others - matching
    the wrong title silently falls back to the whole article and sweeps up the
    "Close races"/"Predictions" boxes too.
    """
    wt = wikitext(f"{year}_Nebraska_Legislature_election")
    by_name, by_district = load_2018_parties() if year == 2018 else ({}, {})
    heads = list(DISTRICT_HEAD.finditer(wt))
    out = {"D": 0, "R": 0, "O": 0}
    won = {"D": 0, "R": 0, "O": 0}
    unattributed = []
    n = 0
    for i, h in enumerate(heads):
        block = wt[h.end(): heads[i + 1].start() if i + 1 < len(heads) else len(wt)]
        m = GENERAL_MARKER.search(block)
        if m:
            block = block[m.end():]
        for party, votes in CAND_BOX.findall(block):
            out[bucket(party)] += int(votes.replace(",", ""))
            n += 1
        for party in WINNER_BOX.findall(block):
            won[bucket(party)] += 1
        if by_name or by_district:
            # 2018: the boxes carry no party, so attribute each candidate by name.
            dist = h.group(1)
            for nm, votes, is_winner in noparty_candidates(block):
                k = name_key(nm)
                p = by_district.get((dist, k)) or by_name.get(k)
                if p is None:
                    unattributed.append((dist, nm.strip(), votes))
                    p = "O"
                out[p] += votes
                n += 1
                if is_winner:
                    won[p] += 1
    return out, n, len(heads), won, unattributed


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--validate", action="store_true")
    g.add_argument("--write", action="store_true")
    args = ap.parse_args()

    parsed = {}
    print(f"{'year':6s}{'cands':>6}{'dists':>6}{'D':>10}{'R':>10}{'O':>9}{'total':>10}   check")
    for y in YEARS:
        v, n, d, won, unattr = parse_year(y)
        total = sum(v.values())
        parsed[y] = (v, total, won)
        check = ""
        if y in STATED:
            s = STATED[y]
            ok = abs(v["D"] - s["D"]) <= 2 and abs(v["R"] - s["R"]) <= 2
            check = ("MATCHES article" if ok
                     else f"MISMATCH article D{s['D']} R{s['R']}")
        print(f"{y:<6d}{n:6d}{d:6d}{v['D']:10,}{v['R']:10,}{v['O']:9,}{total:10,}"
              f"   won {won['D']}D/{won['R']}R/{won['O']}O   {check}")
        for u in unattr:
            print(f"        UNATTRIBUTED  district {u[0]:>3s}  {u[1]:28s}{u[2]:>8,}")

    if not args.write:
        return

    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
        fields = list(rows[0].keys())

    updated = 0
    for r in rows:
        if r["state_name"] != "Nebraska" or r["type"] != "House":
            continue
        y = int(r["year"])
        if y not in parsed:
            continue
        v, total, won = parsed[y]
        if total <= 0:
            continue
        if sum(won.values()):
            r["dem_seats_won"], r["rep_seats_won"] = str(won["D"]), str(won["R"])
            r["oth_seats_won"], r["seats_up"] = str(won["O"]), str(sum(won.values()))
        r["dem_votes"], r["rep_votes"], r["oth_votes"] = str(v["D"]), str(v["R"]), str(v["O"])
        r["total_votes"] = str(total)
        r["dem_pct"] = f"{v['D'] / total * 100:.1f}"
        r["rep_pct"] = f"{v['R'] / total * 100:.1f}"
        r["oth_pct"] = f"{v['O'] / total * 100:.1f}"
        r["margin"] = f"{(v['R'] - v['D']) / total * 100:.1f}"
        r["vote_margin"] = str(v["R"] - v["D"])
        r["source"] = "Wikipedia district tables (party = endorsement; NE ballot is nonpartisan)"
        if r.get("note", "").strip() in ("Estimate", "Incomplete Data", "Incompelte Data"):
            r["note"] = ""
        updated += 1

    with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"\nupdated {updated} Nebraska rows in {STATE_LEG_CSV}")


if __name__ == "__main__":
    main()
