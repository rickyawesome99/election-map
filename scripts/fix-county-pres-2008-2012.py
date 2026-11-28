#!/usr/bin/env python3
"""
Rebuilds the 2008 and 2012 columns of data/county_presidential_results_2008_2024.csv from certified
county returns. The columns it replaces were not certified counts: 2012 was largely an election-night
count (CA 10.5M of 13.0M, Los Angeles 2.43M of 3.18M; NY, NJ, MD, VA, WA, UT, AZ short too), and 2008
had shifted rows (TN McMinn..Maury each carried the next county's numbers; MT McCone/Madison swapped),
plus bad rows such as LaPorte IN (208,757) and Laclede MO (total under D+R).

Sources (all in data-entry/):
  county_pres_2008_2012_medsl.csv        MIT Election Data + Science Lab, County Presidential Election
                                         Returns 2000-2016 (github.com/MEDSL/county-returns, version
                                         2019-07-22), the 2008/2012 rows. Official state records.
  county_pres_2012_wikipedia_ny_ct.csv   NY and CT 2012 "By county" tables from Wikipedia's state pages.
                                         MEDSL's NY counts only the Democratic and Republican lines (NY
                                         fuses Working Families/Conservative votes onto the nominees),
                                         and its CT 2012 has Tolland ~24k short.
  pres_state_certified_2008_2012.csv     certified state totals (FEC, via Wikipedia's results tables),
                                         used only to choose and check sources.

Rule, per state and year:
  D/R votes   MEDSL, unless another source's state D/R sums are closer to certified by more than
              0.03% (2008 CT, LA, MT, NY, PA keep the old column; 2012 NY and CT use Wikipedia).
              MEDSL's "totalvotes" column is not used: its VA figures are ~20% high; the total is the
              sum of candidate rows instead.
  Other votes from the D/R source when its state total is within 0.3% of certified, else from the
              source whose total is; that source's row is found by its D/R pair first, so a shifted
              row still gives the right county its votes.
  Fixes       Shannon SD (46113) -> Oglala Lakota (46102); Bedford city VA (51515) -> Bedford County
              (51019, merged 2013); MEDSL's separate Kansas City MO return -> Jackson County (the old
              column's convention; small slices of KC lie in Clay, Platte and Cass). MT 2008: McCone and
              Madison swapped back, Broadwater from MEDSL (the old 365/756/1,149 is a third of its 2012
              and 2016 turnout; the FEC state sum carries the same figure).
  Alaska has no borough returns for these years and stays blank.

Remaining known gaps vs certified (votes no county was credited with): 2012 ID total -0.7%, KS -0.4%,
ME -0.5% (UOCAVA and statewide write-ins), 2008 PA total -0.3%.

Run from project root, then regenerate the TS file:
  python3 scripts/fix-county-pres-2008-2012.py && python3 scripts/generate-county-pres-data.py
"""
import collections, csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
MEDSL = os.path.join(ROOT, "data-entry/county_pres_2008_2012_medsl.csv")
WIKI = os.path.join(ROOT, "data-entry/county_pres_2012_wikipedia_ny_ct.csv")
CERT = os.path.join(ROOT, "data-entry/pres_state_certified_2008_2012.csv")
YEARS = ("2008", "2012")
REMAP = {"46113": "46102", "51515": "51019", "36000": "29095"}
MEDSL_PREFERENCE = 0.03  # pct points of D/R error MEDSL may give up before another source wins
TOTAL_OK = 0.3           # pct: a source's state total this close to certified supplies "other" votes


def load():
    with open(CSV, newline="") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = list(reader)
    ours = {r["county_id"]: r for r in rows}

    cert = {(r["year"], r["state"]): {"dem": int(r["dem"]), "gop": int(r["gop"]), "total": int(r["total"])}
            for r in csv.DictReader(open(CERT))}

    med = {}
    for r in csv.DictReader(open(MEDSL)):
        if r["year"] not in YEARS or r["fips"] in ("", "NA") or r["state_po"] == "AK":
            continue
        f = r["fips"].zfill(5)
        f = REMAP.get(f, f)
        v = 0 if r["candidatevotes"] in ("", "NA") else int(float(r["candidatevotes"]))
        m = med.setdefault((f, r["year"]), {"st": r["state_po"], "dem": 0, "gop": 0, "oth": 0})
        m["dem" if r["party"] == "democrat" else "gop" if r["party"] == "republican" else "oth"] += v

    old = {}
    for f, r in ours.items():
        for y in YEARS:
            if r[f"total_{y}"]:
                d, g, t = int(r[f"dem_{y}"]), int(r[f"gop_{y}"]), int(r[f"total_{y}"])
                old[(f, y)] = {"st": r["state"], "dem": d, "gop": g, "oth": t - d - g}

    wiki = {}
    for r in csv.DictReader(open(WIKI)):
        names = {o["county_name"]: f for f, o in ours.items() if o["state"] == r["state"]}
        wiki[(names[r["county_name"]], "2012")] = {"st": r["state"], "dem": int(r["dem"]), "gop": int(r["gop"]), "oth": int(r["oth"])}

    return fields, rows, ours, cert, {"medsl": med, "old": old, "wikipedia": wiki}


def main():
    fields, rows, ours, cert, SRC = load()

    def sums(src, st, y):
        vals = [v for (f, yy), v in SRC[src].items() if yy == y and v["st"] == st and f in ours]
        if not vals:
            return None
        return (sum(v["dem"] for v in vals), sum(v["gop"] for v in vals), sum(v["dem"] + v["gop"] + v["oth"] for v in vals))

    out = {}
    for (y, st), c in sorted(cert.items()):
        if st == "AK":
            continue
        S = {k: s for k in SRC if (s := sums(k, st, y))}
        dr_err = {k: max(abs(s[0] - c["dem"]) / c["dem"], abs(s[1] - c["gop"]) / c["gop"]) * 100 for k, s in S.items()}
        t_err = {k: abs(s[2] - c["total"]) / c["total"] * 100 for k, s in S.items()}
        best = min(dr_err.values())
        dr = "medsl" if dr_err["medsl"] <= best + MEDSL_PREFERENCE else min(dr_err, key=dr_err.get)
        oth = dr if t_err[dr] <= TOTAL_OK else min(t_err, key=t_err.get)
        if dr != "medsl" or oth != "medsl":
            print(f"{y} {st}: D/R from {dr} ({dr_err[dr]:.2f}% off), other from {oth} ({t_err[oth]:.2f}% off)")
        by_pair = {(v["dem"], v["gop"]): v["oth"] for (f, yy), v in SRC[oth].items() if yy == y and v["st"] == st}
        for (f, yy), v in SRC[dr].items():
            if yy != y or v["st"] != st or f not in ours:
                continue
            if oth == dr:
                o = v["oth"]
            elif (v["dem"], v["gop"]) in by_pair:
                o = by_pair[(v["dem"], v["gop"])]
            elif (f, y) in SRC[oth]:
                o = SRC[oth][(f, y)]["oth"]
            else:
                o = v["oth"]
            out[(f, y)] = [v["dem"], v["gop"], o]

    # Montana 2008 keeps the old column (it matches the FEC sum) apart from three rows, written out so
    # a rerun on this script's own output gives the same file: McCone and Madison had swapped rows
    # (their "other" votes too), Broadwater a third of its usual turnout. D/R from MEDSL; "other" from
    # the old column's swapped rows (McCone 44, Madison 138) and MEDSL for Broadwater.
    out[("30055", "2008")] = [321, 726, 44]
    out[("30057", "2008")] = [1607, 2822, 138]
    out[("30007", "2008")] = [854, 1853, 68]

    changed = 0
    for r in rows:
        for y in YEARS:
            v = out.get((r["county_id"], y))
            if v is None:
                continue
            d, g, o = v
            new = [str(d), str(g), str(o), str(d + g + o)]
            if [r[f"dem_{y}"], r[f"gop_{y}"], r[f"oth_{y}"], r[f"total_{y}"]] != new:
                changed += 1
            r[f"dem_{y}"], r[f"gop_{y}"], r[f"oth_{y}"], r[f"total_{y}"] = new

    with open(CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)

    for y in YEARS:
        tot = collections.Counter()
        for (f, yy), (d, g, o) in out.items():
            if yy == y:
                tot[ours[f]["state"]] += d + g + o
        us = sum(tot.values())
        cert_us = sum(c["total"] for (yy, st), c in cert.items() if yy == y and st != "AK")
        print(f"{y}: counties sum to {us:,} of {cert_us:,} certified (excl. AK)")
    print(f"{changed} county-years changed")


if __name__ == "__main__":
    main()
