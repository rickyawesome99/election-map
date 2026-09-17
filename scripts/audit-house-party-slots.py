#!/usr/bin/env python3
"""
Audits the party LABEL of every House general-election nominee in forecastData's
houseData pastResults against MEDSL's precinct-level returns, and reports slots whose
candidate MEDSL never lists on that party's ballot line.

WHY. classifyEligibility decides whether a race is a real R-vs-D contest from the slot's
effective party (`repParty` / `demParty` overrides, defaulting to the slot). A minor-party
candidate sitting in the R slot with no override is silently scored as a Republican
nominee — NY-17 2018 carried Reform-line Joseph Ciardullo as "R", which turned Nita Lowey's
uncontested-by-a-Republican 88% into a +36 WAR outlier. Percentage rules cannot catch
this class (Ciardullo polled 12%), so it needs the actual ballot-line record.

It became urgent when District TPL started relocating pre-redistricting House races
(2026-09-16): ~1,500 historical races entered District TPL and House WAR at once, and
this bug class is invisible until a race is scored.

FUSION. MEDSL records each ballot line separately (NY/CT fusion), so a candidate's party
is the SET of lines they appeared on; a slot passes if the matching party is ANY of them.
Minnesota's DFL and North Dakota's Democratic-NPL count as Democratic.

Usage: python3 scripts/audit-house-party-slots.py [--years 2016 2018 ...]
Read-only — prints findings, changes nothing.
"""
import csv, os, re, sys
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
MEDSL = {
    2016: ("data-entry/medsl/house_2016_precinct.csv", ","),
    2018: ("data-entry/medsl/house_2018_precinct.csv", ","),
    2020: ("data-entry/medsl/house_2020_precinct.csv", ","),
    2022: ("data-entry/medsl/house_2022_precinct.tab", "\t"),
    2024: ("data-entry/medsl/house_2024_precinct.csv", ","),
}
SUFFIXES = {"JR", "SR", "II", "III", "IV", "V"}

csv.field_size_limit(sys.maxsize)


def party_class(p):
    p = (p or "").upper()
    if "REPUBLICAN" in p:
        return "R"
    if "DEMOCRAT" in p:  # DEMOCRAT, DEMOCRATIC, DEMOCRATIC-FARMER-LABOR, DEMOCRATIC-NPL
        return "D"
    return None


def norm(s):
    return re.sub(r"[^A-Z ]", " ", (s or "").upper())


def last_name(full):
    toks = [t for t in norm(full).split() if t not in SUFFIXES and len(t) > 1]
    return toks[-1] if toks else None


def to_int_district(v):
    try:
        d = int(float(str(v).strip()))
    except ValueError:
        return None
    return 1 if d == 0 else d  # at-large seats are 0 in some MEDSL years, 01 in this repo


def load_medsl(year):
    path, delim = MEDSL[year]
    by = defaultdict(lambda: defaultdict(lambda: {"votes": 0, "parties": set()}))
    with open(os.path.join(ROOT, path), newline="", encoding="utf-8", errors="replace") as f:
        rd = csv.DictReader(f, delimiter=delim)
        cols = {c.strip('"') for c in rd.fieldnames}
        st_col = "state_po" if "state_po" in cols else "state_postal"
        party_cols = [c for c in ("party_detailed", "party_simplified", "party") if c in cols]
        for row in rd:
            row = {k.strip('"'): (v or "").strip('"') for k, v in row.items() if k}
            if "HOUSE" not in row.get("office", "").upper():
                continue
            if row.get("stage", "").upper() not in ("GEN", ""):
                continue
            if row.get("special", "").upper() in ("TRUE", "1"):
                continue
            if row.get("writein", "").upper() in ("TRUE", "1"):
                continue
            d = to_int_district(row.get("district"))
            cand = row.get("candidate", "")
            if d is None or not cand:
                continue
            slot = by[(row[st_col], d)][norm(cand).strip()]
            try:
                slot["votes"] += int(float(row.get("votes") or 0))
            except ValueError:
                pass
            for pc in party_cols:
                cls = party_class(row.get(pc))
                if cls:
                    slot["parties"].add(cls)
                elif row.get(pc):
                    slot["parties"].add("other")
    return by


def load_ours():
    """houseData pastResults via a tiny tsx bridge — forecastData.ts is TypeScript."""
    import json, subprocess
    src = """
import { houseData } from "@/data/forecastData";
const out = [];
for (const d of houseData) for (const r of d.pastResults ?? []) out.push({ name: d.name, ...r });
console.log(JSON.stringify(out));
"""
    # A fixed name under scripts/ so tsx resolves the "@/" path alias the way it does for
    # every other script here (a tempfile-generated name failed to run).
    tmp = os.path.join(ROOT, "scripts", "__audit_house_party_bridge.ts")
    with open(tmp, "w") as t:
        t.write(src)
    cmd = ["npx", "tsx", tmp]
    # An x86_64 Python on Apple silicon (e.g. anaconda under Rosetta 2) spawns x86_64 node,
    # which then fails to load the arm64 esbuild that tsx installed ("darwin-x64 vs arm64").
    # Force the child back onto the native architecture.
    import platform
    if sys.platform == "darwin" and platform.machine() == "x86_64":
        probe = subprocess.run(["sysctl", "-n", "hw.optional.arm64"], capture_output=True, text=True)
        if probe.stdout.strip() == "1":
            cmd = ["arch", "-arm64"] + cmd
    try:
        res = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    finally:
        os.unlink(tmp)
    if res.returncode != 0:
        sys.exit(f"tsx bridge failed:\n{res.stderr[-2000:]}")
    return json.loads(res.stdout.strip().splitlines()[-1])


def main():
    years = [int(y) for y in sys.argv[sys.argv.index("--years") + 1:]] if "--years" in sys.argv else list(MEDSL)
    ours = load_ours()
    findings = []
    unmatched = 0
    for year in years:
        medsl = load_medsl(year)
        for r in (x for x in ours if x.get("year") == year):
            st, dist = r["name"].split("-")
            district = medsl.get((st, int(dist)))
            if not district:
                continue
            for slot, cand_key, party_key in (("R", "repCandidate", "repParty"), ("D", "demCandidate", "demParty")):
                cand = r.get(cand_key)
                if not cand or (r.get(party_key) and r.get(party_key) != slot):
                    continue  # empty slot, or already carries an explicit party override
                ln = last_name(cand)
                matches = [(k, v) for k, v in district.items() if ln and re.search(rf"\b{ln}\b", k)]
                if not matches:
                    unmatched += 1
                    continue
                _, best = max(matches, key=lambda kv: kv[1]["votes"])
                if slot not in best["parties"]:
                    pct = r.get("repPct" if slot == "R" else "demPct")
                    findings.append((year, r["name"], slot, cand, pct, sorted(best["parties"])))
    findings.sort()
    print(f"House nominee slots checked across {years}; {unmatched} slot candidates had no MEDSL name match.\n")
    print(f"{len(findings)} slot(s) where MEDSL never lists the candidate on that party's line:\n")
    for year, name, slot, cand, pct, parties in findings:
        print(f"  {year} {name:6} {slot}-slot  {cand:28} {str(pct):>6}%   MEDSL lines: {parties}")


if __name__ == "__main__":
    main()
