#!/usr/bin/env python3
"""Attach CANDIDATE NAMES to the per-district state legislative results whose votes were transcribed
from state election-authority documents that carried names the transcription dropped.

Four sources, each re-read from its public location (none of the documents is committed; they
are fetched into the scratch directory given by --src):

  vt2018   Vermont Senate 2018 - the Vermont Election Archive's CSV export (civera), one row per
           town x candidate x party line. Candidates are summed across their fusion lines and
           bucketed with build-vermont-2018-leg-votes.py's own FUSION_PARTY rule, so the names'
           parties agree with the recorded D/R/O buckets. `is_winner` marks winners.
  nh2022   New Hampshire House 2022 - the NH election database's CSV export (same civera API,
           tenant nh2). District "Belknap 1" -> our code "BE1" (Hillsborough 3-9 are zero-padded
           "HI03".."HI09" in the boundary data). "All Other Votes" is the write-in line and is
           kept as an O entry because the recorded Other bucket includes it. Multi-member and
           floterial districts list several winners.
  ms2023   Mississippi 2023 - the SoS Statewide Recapitulation Sheet PDF, read with the same
           heading / candidate-row rules as build-mississippi-2023-leg-votes.py (imported). Single-
           member chambers, so the top vote-getter is the winner.
  la2019 / la2023  Louisiana - the SoS "Election Results" workbooks for the October jungle primary
           and the November runoff (mediaresults.sos.la.gov). The recorded district figures are the
           OCTOBER round, so the candidate list is the October field; a candidate over 50% in
           October is the winner, otherwise the runoff workbook names the winner.

THIS SCRIPT NEVER CHANGES A VOTE NUMBER. A district is written only when its candidates' votes sum
to the recorded total (exactly for the SoS sources); mismatches are reported and skipped.

Usage:
    python3 scripts/build-state-leg-candidates-from-sos.py --src <scratch/sos> --report
    python3 scripts/build-state-leg-candidates-from-sos.py --src <scratch/sos> --only nh2022 --write
"""

import argparse
import collections
import csv
import importlib.util
import json
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, "data-entry", "state-leg-results")
csv.field_size_limit(10_000_000)


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(REPO, "scripts", filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


NON_CANDIDATE = re.compile(r"total (ballots|votes) cast|^undervotes?$|^overvotes?$|^blank|^void|^scattering", re.IGNORECASE)
NH_COUNTY = {"Belknap": "BE", "Carroll": "CA", "Cheshire": "CH", "Coos": "CO", "Grafton": "GR",
             "Hillsborough": "HI", "Merrimack": "ME", "Rockingham": "RO", "Strafford": "ST", "Sullivan": "SU"}


# ---------------------------------------------------------------- Vermont 2018 Senate
def vt2018(src):
    vt = _load("vt", "build-vermont-2018-leg-votes.py")
    path = os.path.join(src, "vt", "search2018.csv")
    agg = collections.defaultdict(lambda: collections.defaultdict(lambda: {"votes": 0, "party": None, "winner": False}))
    for r in csv.DictReader(open(path, encoding="utf-8")):
        if r["office_name"] != "State Senate" or r["election_type"] != "General Election":
            continue
        name = r["candidate_name"].strip()
        if NON_CANDIDATE.search(name):
            continue
        d = agg[r["district_name"].strip()]
        key = "Write-in" if name.lower().startswith("write-in") else name
        e = d[key]
        e["votes"] += int(float(r["votes"] or 0))
        party = vt.bucket(name, r["candidate_party_name"]) if key != "Write-in" else "O"
        e["party"] = party if e["party"] in (None, "O") else e["party"]
        if (r["is_winner"] or "").lower() == "true":
            e["winner"] = True
    seats = {}
    for r in csv.DictReader(open(path, encoding="utf-8")):
        if r["office_name"] == "State Senate" and r["election_type"] == "General Election":
            seats[r["district_name"].strip()] = int(float(r["number_seats"] or 1))
    return {("VT", 2018, "senate"): {dist: _top_n_winners(_entries(cands), seats.get(dist, 1)) for dist, cands in agg.items()}}


def _top_n_winners(entries, n):
    """The export's per-row is_winner flag is set town by town and is not reliable (a loser can
    carry it in one town); the winners are the top-N by votes, N = the district's seat count."""
    real = [e for e in entries if e["name"] != "Write-in"]
    for e in entries:
        e.pop("winner", None)
    for e in sorted(real, key=lambda e: -e["votes"])[:n]:
        e["winner"] = True
    return entries


def _entries(cands):
    out = []
    for name, e in cands.items():
        entry = {"name": name, "party": e["party"] or "O", "votes": e["votes"]}
        if e.get("winner"):
            entry["winner"] = True
        if e.get("incumbent"):
            entry["incumbent"] = True
        out.append(entry)
    return sorted(out, key=lambda c: -c["votes"])


# ---------------------------------------------------------------- New Hampshire 2022 House
def nh2022(src, existing_keys):
    path = os.path.join(src, "nh2", "probe_nh2.elstats.civera.com.csv")
    if not os.path.exists(path):
        path = os.path.join(src, "nh2", "search2022.csv")
    agg = collections.defaultdict(lambda: collections.defaultdict(lambda: {"votes": 0, "party": None, "winner": False}))
    seats = {}
    for r in csv.DictReader(open(path, encoding="utf-8")):
        if r["office_name"] != "State Representative" or r["election_type"] != "General Election":
            continue
        # A city with wards is exported twice: one City/Town row holding the city total AND one row
        # per ward that together sum to the same total. Keep the City/Town level only.
        if r["division_type"] != "City/Town":
            continue
        m = re.match(r"^(\w+)\s+(\d+)$", r["district_name"].strip())
        if not m or m.group(1) not in NH_COUNTY:
            continue
        code = NH_COUNTY[m.group(1)]
        n = int(m.group(2))
        key = f"{code}{n}"
        if key not in existing_keys and f"{code}{n:02d}" in existing_keys:
            key = f"{code}{n:02d}"
        name = r["candidate_name"].strip()
        if NON_CANDIDATE.search(name):
            continue
        if name.lower() == "all other votes":
            name = "Write-in"
        seats[key] = int(float(r["number_seats"] or 1))
        e = agg[key][name]
        e["votes"] += int(float(r["votes"] or 0))
        p = (r["candidate_party_name"] or "").lower()
        party = "D" if "democrat" in p else "R" if "republican" in p else "O"
        e["party"] = party if e["party"] in (None, "O") else e["party"]
        if (r["is_winner"] or "").lower() == "true":
            e["winner"] = True
    return {("NH", 2022, "house"): {k: _top_n_winners(_entries(v), seats.get(k, 1)) for k, v in agg.items()}}


def rewrite_nh_csv(src):
    """Regenerate data-entry/new_hampshire_2022_legislature.csv from the SoS election-database
    export. The county-PDF parse this CSV came from double-counted 17 districts whose candidate
    header did not fit one row (and tripled HI16, mis-assigned RO13/RO16/ST15, and missed ST16
    entirely): 2,275,330 chamber votes against the export's 2,089,636. The export is the SoS's own
    tabulation, every district's candidate votes equal its "Total Votes Cast" row, so it replaces
    the parse. Run scripts/build-newhampshire-2022-leg-votes.py --districts and --write afterwards."""
    path = os.path.join(src, "nh2", "probe_nh2.elstats.civera.com.csv")
    agg = collections.defaultdict(collections.Counter)
    for r in csv.DictReader(open(path, encoding="utf-8")):
        if r["office_name"] != "State Representative" or r["election_type"] != "General Election" or r["division_type"] != "City/Town":
            continue
        m = re.match(r"^(\w+)\s+(\d+)", r["district_name"].strip())
        if not m or m.group(1) not in NH_COUNTY:
            continue
        name = r["candidate_name"].strip()
        if NON_CANDIDATE.search(name):
            continue
        p = (r["candidate_party_name"] or "").lower()
        party = "D" if "democrat" in p else "R" if "republican" in p else "O"
        agg[(NH_COUNTY[m.group(1)], int(m.group(2)))][party] += int(float(r["votes"] or 0))
    out = os.path.join(REPO, "data-entry", "new_hampshire_2022_legislature.csv")
    # Hillsborough 3-9 are zero-padded in the boundary data ("HI03"), a quirk of the GRANIT source.
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["chamber", "district", "dem_votes", "rep_votes", "oth_votes", "total_votes"])
        for (code, n), c in sorted(agg.items()):
            key = f"{code}{n:02d}" if code == "HI" and 3 <= n <= 9 else f"{code}{n}"
            w.writerow(["House", key, c["D"], c["R"], c["O"], c["D"] + c["R"] + c["O"]])
    print(f"wrote {len(agg)} districts -> {out}; chamber total {sum(sum(c.values()) for c in agg.values()):,}")


# ---------------------------------------------------------------- Mississippi 2023
def ms2023(src):
    ms = _load("ms", "build-mississippi-2023-leg-votes.py")
    pdf = os.path.join(src, "ms", "recap2023.pdf")
    out = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout
    res = collections.defaultdict(list)
    seen = collections.defaultdict(set)
    carry = None
    for page in out.split("\f"):
        if not ms.TOTAL_COL.search(page):
            continue
        heads = [(m.end(), ("senate" if m.group(1) == "Senate" else "house", str(int(m.group(3)))))
                 for m in ms.HEAD.finditer(page)]
        cur = carry
        tail = page[heads[-1][0]:] if heads else ""
        carry = heads[-1][1] if heads and not any(ms.CAND.match(l) for l in tail.split("\n")) else None
        pos = hi = 0
        for line in page.split("\n"):
            start = pos
            pos += len(line) + 1
            while hi < len(heads) and heads[hi][0] <= start:
                cur = heads[hi][1]
                hi += 1
            c = ms.CAND.match(line)
            if not c or cur is None:
                continue
            nums = re.findall(r"\b\d[\d,]*\b", c.group(3))
            if not nums:
                continue
            name = c.group(1).strip()
            if name in seen[cur]:
                continue
            seen[cur].add(name)
            res[cur].append({"name": name, "party": ms.BUCKET.get(c.group(2), "O"), "votes": int(nums[-1].replace(",", ""))})
    out_by = collections.defaultdict(dict)
    for (ch, dist), cands in res.items():
        cands.sort(key=lambda c: -c["votes"])
        cands[0]["winner"] = True
        out_by[("MS", 2023, ch)][dist] = cands
    return out_by


# ---------------------------------------------------------------- Louisiana 2019 / 2023
LA_HEAD = re.compile(r"^State (Representative|Senator) --\s+(\d+)(?:st|nd|rd|th) ")
LA_PARTY = re.compile(r"\((DEM|REP|[A-Z]+)\)\s*$")


def _la_races(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True)
    rows = list(wb["Multi-Parish(Parish)"].iter_rows(values_only=True))
    races = {}
    i = 0
    while i < len(rows):
        r = rows[i]
        head = r[0] if r and isinstance(r[0], str) else None
        m = LA_HEAD.match(head or "")
        if m and i + 2 < len(rows):
            names = rows[i + 1]
            totals = rows[i + 2]
            if totals and totals[0] == "Total Votes":
                cands = []
                for name, votes in zip(names[1:], totals[1:]):
                    if not name:
                        continue
                    pm = LA_PARTY.search(name)
                    party = pm.group(1) if pm else ""
                    cands.append({"name": name[: pm.start()].strip() if pm else name.strip(),
                                  "party": "D" if party == "DEM" else "R" if party == "REP" else "O",
                                  "votes": int(votes or 0)})
                ch = "house" if m.group(1) == "Representative" else "senate"
                races[(ch, str(int(m.group(2))))] = cands
            i += 3
            continue
        i += 1
    return races


def la(src, year, primary_file, runoff_file):
    prim = _la_races(os.path.join(src, "la", primary_file))
    run = _la_races(os.path.join(src, "la", runoff_file))
    out = collections.defaultdict(dict)
    for (ch, dist), cands in prim.items():
        cands = sorted(cands, key=lambda c: -c["votes"])
        total = sum(c["votes"] for c in cands)
        if total and cands[0]["votes"] > total / 2:
            cands[0]["winner"] = True
        elif (ch, dist) in run:
            rc = sorted(run[(ch, dist)], key=lambda c: -c["votes"])
            win = rc[0]["name"].lower()
            for c in cands:
                if c["name"].lower() == win:
                    c["winner"] = True
        out[("LA", year, ch)][dist] = cands
    return out


# ---------------------------------------------------------------- New York 2024
def ny2024(src):
    """The State Board of Elections canvass PDF (results.elections.ny.gov document 476, served from
    ny.elstats-staging.com/eng/files/serve/476). One row per candidate PER PARTY LINE; the recorded
    buckets are per line (a Working Families row is Other), so each line is its own entry, named
    "Name (LINE)" off the major-party line, and the winner flag sits on the fused leader's main line."""
    ny = _load("ny", "build-newyork-2024-leg-votes.py")
    pdf = os.path.join(src, "ny", "ny2024.pdf")
    txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout.replace("\f", "\n")
    heads = list(ny.HEAD.finditer(txt))
    out = collections.defaultdict(dict)
    for i, h in enumerate(heads):
        ch = "house" if h.group(1) == "Member of Assembly" else "senate"
        dist = str(int(h.group(2)))
        blk = txt[h.end(): heads[i + 1].start() if i + 1 < len(heads) else len(txt)]
        cands, fused = [], collections.Counter()
        for ln in blk.split("\n"):
            m = ny.ROW.match(ln.strip())
            if not m:
                continue
            label = m.group("label").strip()
            pm = ny.PARTY.search(label)
            scattering = label.lower().startswith("scattering")
            if not pm and not scattering:
                continue
            nums = [ny._n(x) for x in m.group("nums").split()]
            v, _ = ny.total_by_party(nums)
            if scattering:
                cands.append({"name": "Scattering", "party": "O", "votes": v})
                continue
            person = label[: pm.start()].strip()
            line = pm.group(1)
            fused[person] += v
            if line in ("DEM", "REP"):
                cands.append({"name": person, "party": "D" if line == "DEM" else "R", "votes": v, "_person": person})
            else:
                cands.append({"name": f"{person} ({line})", "party": "O", "votes": v, "_person": person})
        if fused:
            leader = max(fused, key=fused.get)
            main = [c for c in cands if c.get("_person") == leader]
            main.sort(key=lambda c: (c["party"] == "O", -c["votes"]))
            main[0]["winner"] = True
        for c in cands:
            c.pop("_person", None)
        out[("NY", 2024, ch)][dist] = sorted(cands, key=lambda c: -c["votes"])
    return out


# ---------------------------------------------------------------- merge
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="scratch directory holding vt/ nh2/ ms/ la/ downloads")
    ap.add_argument("--only", help="comma list of handlers: vt2018,nh2022,ms2023,la2019,la2023,ny2024")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    g.add_argument("--rewrite-nh-csv", action="store_true", help="regenerate the NH 2022 vote CSV from the SoS export (see rewrite_nh_csv)")
    args = ap.parse_args()
    if args.rewrite_nh_csv:
        rewrite_nh_csv(args.src)
        return
    handlers = (args.only or "vt2018,nh2022,ms2023,la2019,la2023,ny2024").split(",")

    def existing(abbr, year, ch):
        p = os.path.join(OUT_DIR, f"{abbr}-{year}.json")
        d = json.load(open(p, encoding="utf-8"))
        return d, d.get(ch, {}).get("districts", {})

    collected = {}
    if "vt2018" in handlers:
        collected.update(vt2018(args.src))
    if "nh2022" in handlers:
        _, dists = existing("NH", 2022, "house")
        collected.update(nh2022(args.src, set(dists)))
    if "ms2023" in handlers:
        collected.update(ms2023(args.src))
    if "la2019" in handlers:
        collected.update(la(args.src, 2019, "20191012.xlsx", "20191116.xlsx"))
    if "la2023" in handlers:
        collected.update(la(args.src, 2023, "20231014.xlsx", "20231118.xlsx"))
    if "ny2024" in handlers:
        collected.update(ny2024(args.src))

    plan = {}
    print(f"{'ST':3s} {'YEAR':5s} {'CHAMBER':8s} {'IN FILE':>8s} {'IN SOURCE':>10s} {'NAMED':>6s} {'MISMATCH':>9s} {'CANDS':>6s} {'WIN':>5s}")
    for (abbr, year, ch), districts in sorted(collected.items()):
        data, recorded = existing(abbr, year, ch)
        named = bad = ncand = nwin = 0
        mism = []
        for dkey, cands in districts.items():
            rec = recorded.get(dkey)
            if rec is None:
                mism.append((dkey, "not in file", None))
                continue
            s = sum(c["votes"] for c in cands)
            if rec.get("totalVotes") is not None and s != rec["totalVotes"]:
                bad += 1
                mism.append((dkey, s, rec["totalVotes"]))
                continue
            named += 1
            ncand += len(cands)
            nwin += sum(1 for c in cands if c.get("winner"))
            plan.setdefault((abbr, year), {}).setdefault(ch, {})[dkey] = cands
        print(f"{abbr:3s} {year:<5d} {ch:8s} {len(recorded):8d} {len(districts):10d} {named:6d} {bad:9d} {ncand:6d} {nwin:5d}")
        for m in mism[:10]:
            print(f"      {m[0]}: source {m[1]} vs recorded {m[2]}")

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
        print(f"\nwrote candidates into {n:,} districts across {len(plan)} files")


if __name__ == "__main__":
    main()
