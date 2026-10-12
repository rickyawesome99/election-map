#!/usr/bin/env python3
"""Attach CANDIDATE NAMES (and winners / incumbents where the article marks them) to per-district
state legislative results whose votes came from sources that carried no names.

Two name sources already exist - Klarner's candidate file for 2016-2022 and MEDSL for 2024 - and
between them they leave these chamber-years nameless: the odd years past Klarner's end (LA/MS/NJ/
VA 2023, NJ/VA 2025), the 2024 chambers MEDSL could not answer (AZ, IA, OR, NE, and NY/NM whose
votes came from state canvass PDFs), and the two chamber-years the Klarner pass skips as defective
(NH 2022 House, VT 2018 Senate). Wikipedia's chamber-election articles tabulate every district
with `Election box` templates that name each candidate, so this pass reads those.

It reuses the two Wikipedia scripts' machinery (article titles, cached wikitext fetch, district
headings, the general-only filter that keeps primaries out) and parses each result template in
full: `candidate`, `party`, `votes`; the `winning candidate` template variant marks the winner, and
"(incumbent)" in the candidate text marks the incumbent. Nebraska's nonpartisan ballot gets each
WINNER's party from the researched member list (data-entry/state-leg-party-overrides/ne_senate.json);
losers stay O.

THIS SCRIPT NEVER CHANGES A VOTE NUMBER. A district is written only when its candidates' votes sum
to the recorded demVotes+repVotes+othVotes within TOLERANCE (Wikipedia transcriptions drop a
write-in line now and then); mismatches are reported and skipped. New York's fusion ballot is the
one knowing exception: our buckets count a Working Families line as Other while the article gives
each candidate one fused total, so a NY candidate's party is the party they are listed under and the
list still sums to the district total.

Usage:
    python3 scripts/build-state-leg-candidates-from-wikipedia.py --report
    python3 scripts/build-state-leg-candidates-from-wikipedia.py --targets NJ:2025,VA:2025 --report
    python3 scripts/build-state-leg-candidates-from-wikipedia.py --write
"""

import argparse
import collections
import importlib.util
import json
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, "data-entry", "state-leg-results")
NE_PARTIES = os.path.join(REPO, "data-entry", "state-leg-party-overrides", "ne_senate.json")

DEFAULT_TARGETS = [
    ("LA", 2023), ("MS", 2023), ("NJ", 2023), ("VA", 2023),
    ("NJ", 2025), ("VA", 2025),
    ("AZ", 2024), ("IA", 2024), ("OR", 2024), ("NE", 2024), ("NY", 2024), ("NM", 2024),
    ("NH", 2022), ("VT", 2018), ("LA", 2019),
]
# Votes a district's candidate sum may differ from the recorded total by and still be written.
TOLERANCE = 0.006


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(REPO, "scripts", filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


W = _load("wiki_statewide", "build-state-leg-votes-from-wikipedia.py")
R = _load("wiki_results", "build-state-leg-results-from-wikipedia.py")

BOX_START = re.compile(r"\{\{\s*Election box ((?:winning )?candidate[^|}]*)", re.IGNORECASE)
PARAM = re.compile(r"\|\s*([a-z_]+)\s*=\s*", re.IGNORECASE)
WIKILINK = re.compile(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]")
TEMPLATE_INLINE = re.compile(r"\{\{\s*(?:small|nowrap|sort)\s*\|([^{}]*)\}\}", re.IGNORECASE)


def template_bodies(block):
    """Yield (variant, body) for every Election box candidate template, brace-balanced."""
    for m in BOX_START.finditer(block):
        depth, i = 0, m.start()
        while i < len(block):
            if block.startswith("{{", i):
                depth += 2 if False else 1
                i += 2
                continue
            if block.startswith("}}", i):
                depth -= 1
                i += 2
                if depth == 0:
                    break
                continue
            i += 1
        yield m.group(1).lower(), block[m.end(): i - 2]


def params_of(body):
    out = {}
    keys = list(PARAM.finditer(body))
    for j, k in enumerate(keys):
        end = keys[j + 1].start() if j + 1 < len(keys) else len(body)
        out[k.group(1).lower()] = body[k.end(): end].strip()
    return out


def clean_name(raw):
    s = TEMPLATE_INLINE.sub(r"\1", raw)
    s = WIKILINK.sub(r"\1", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"'{2,}", "", s)
    incumbent = bool(re.search(r"\(\s*incumbent\s*\)|\bincumbent\b", s, re.IGNORECASE))
    s = re.sub(r"\(\s*incumbent\s*\)", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\(write-in\)", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s+", " ", s).strip(" ,;")
    return s, incumbent


def parse_candidates(wt, abbr):
    """-> {district: [candidate dicts]} from a chamber-year article."""
    heads = list(W.DISTRICT_HEAD_ANY.finditer(wt))
    if len(heads) < 5:
        return None
    out = {}
    for i, h in enumerate(heads):
        nums = R.HEAD_NUM.findall(h.group(0))
        if not nums:
            continue
        key = str(int(nums[-1]))
        block = wt[h.end(): heads[i + 1].start() if i + 1 < len(heads) else len(wt)]
        block = W.general_only(block)
        cands = []
        for variant, body in template_bodies(block):
            p = params_of(body)
            votes = p.get("votes", "").replace(",", "").strip()
            if not votes.isdigit():
                continue
            name, inc = clean_name(p.get("candidate", ""))
            if not name:
                continue
            # New York's articles list each fusion line as its own box and then a "Total" box per
            # candidate; our buckets are per party line, so the total box is the double count.
            if re.search(r"\btotal\b", p.get("party", ""), re.IGNORECASE):
                continue
            entry = {"name": name, "party": W.bucket(p.get("party", "")), "votes": int(votes)}
            if inc:
                entry["incumbent"] = True
            if variant.startswith("winning"):
                entry["winner"] = True
            cands.append(entry)
        for votes in W.WRITEIN_BOX.findall(block):
            cands.append({"name": "Write-in", "party": "O", "votes": int(votes.replace(",", ""))})
        if cands:
            out.setdefault(key, []).extend(cands)
    return out or None


def article(state_name, chamber, year):
    for title in W.titles_for(state_name, chamber, year):
        wt = W.wikitext(title)
        if wt:
            return title, wt
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets", help="comma list like NJ:2025,VA:2025 (default: the known nameless chamber-years)")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    args = ap.parse_args()

    names = R.abbr_to_name()
    targets = DEFAULT_TARGETS if not args.targets else [(t.split(":")[0], int(t.split(":")[1])) for t in args.targets.split(",")]
    ne_party = json.load(open(NE_PARTIES)) if os.path.exists(NE_PARTIES) else {}

    plan = {}
    totals = collections.Counter()
    print(f"{'ST':3s} {'YEAR':5s} {'CHAMBER':8s} {'IN FILE':>8s} {'IN ARTICLE':>11s} {'NAMED':>6s} {'ALREADY':>8s} {'MISMATCH':>9s} {'CANDS':>6s} {'INC':>5s} {'WIN':>5s}  article")
    for abbr, year in targets:
        path = os.path.join(OUT_DIR, f"{abbr}-{year}.json")
        if not os.path.exists(path):
            print(f"{abbr:3s} {year:<5d} {'-':8s} no results file")
            continue
        data = json.load(open(path, encoding="utf-8"))
        for ch in ("house", "senate"):
            block = data.get(ch)
            if not block:
                continue
            chamber = "Senate" if ch == "senate" else "House"
            title, wt = article(names[abbr], chamber, year)
            if not wt:
                print(f"{abbr:3s} {year:<5d} {chamber:8s} {len(block['districts']):8d} {'no article':>11s}")
                continue
            parsed = parse_candidates(wt, abbr) or {}
            named = already = bad = ncand = ninc = nwin = 0
            mism = []
            for dkey, rec in block["districts"].items():
                if rec.get("candidates"):
                    already += 1
                    continue
                cands = parsed.get(dkey)
                if not cands:
                    continue
                cands = sorted(cands, key=lambda c: -c["votes"])
                if abbr == "NE":
                    for c in cands:
                        if c.get("winner") and dkey in ne_party and ne_party[dkey] in ("D", "R"):
                            c["party"] = ne_party[dkey]
                total = rec.get("totalVotes")
                s = sum(c["votes"] for c in cands)
                if total is not None and abs(s - total) > max(1, TOLERANCE * total):
                    bad += 1
                    mism.append((dkey, s, total))
                    continue
                named += 1
                ncand += len(cands)
                ninc += sum(1 for c in cands if c.get("incumbent"))
                nwin += sum(1 for c in cands if c.get("winner"))
                plan.setdefault((abbr, year), {}).setdefault(ch, {})[dkey] = cands
            print(f"{abbr:3s} {year:<5d} {chamber:8s} {len(block['districts']):8d} {len(parsed):11d} {named:6d} {already:8d} {bad:9d} {ncand:6d} {ninc:5d} {nwin:5d}  {title}")
            for dkey, s, total in mism[:8]:
                print(f"      mismatch district {dkey}: article {s:,} vs recorded {total:,}")
            totals.update({"named": named, "bad": bad, "cands": ncand})
    print(f"\nTOTAL named {totals['named']:,} | mismatched {totals['bad']:,} | candidates {totals['cands']:,}")

    if args.write:
        n = 0
        for (abbr, year), chambers in sorted(plan.items()):
            path = os.path.join(OUT_DIR, f"{abbr}-{year}.json")
            data = json.load(open(path, encoding="utf-8"))
            for ch, districts in chambers.items():
                for dkey, cands in districts.items():
                    data[ch]["districts"][dkey]["candidates"] = cands
                    n += 1
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=1)
                fh.write("\n")
        print(f"wrote candidates into {n:,} districts across {len(plan)} files")


if __name__ == "__main__":
    main()
