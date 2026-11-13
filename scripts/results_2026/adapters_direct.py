"""Direct state-source adapters: raw/direct/<ST>.<ext> → Rows (county and precinct; state rows
where the file has them, otherwise build.py sums the counties).

    enhanced_voting   AZ GA ID UT WA   one JSON export: statewide items, then localResults per
                                       county with precinctResults under each option (UT: none)
    ncsbe             NC               results_pct zip: one tab file, every contest by precinct
    mn_sos            MN               allracesbyprecinct.txt, ';'-separated, no header
    hi_oe             HI               media.txt, tab-separated, by precinct split
    results_export    MT               ResultsExport.aspx xlsx (postback), county; see fetch.py
"""
import csv, io, re, zipfile
from collections import defaultdict

from common import RAW, STATE_FIPS, Row, classify, county_fips, is_overunder, num, read_json, tidy_name


def _row(state, contest, level, unit, unit_name, cand, party, votes, fips, vote_for=1, **kw):
    c = classify(contest)
    if not c:
        return None
    office, seat, special = c
    if office.startswith("state_") and not seat:
        return None
    return Row(office=office, state=state, seat=seat, special=special, level=level, unit=unit, unit_name=unit_name,
               candidate=cand, party=party, votes=votes, county_fips=fips, vote_for=vote_for, contest=contest, **kw)


def enhanced_voting(state):
    d = read_json(RAW / "direct" / f"{state}.json")
    out, unmatched = [], set()
    for item in d["results"]["ballotItems"]:
        for o in item.get("ballotOptions") or []:
            r = _row(state, item["name"], "state", "", state, o["name"], o.get("politicalParty") or "", num(o.get("voteCount")), "", vote_for=item.get("voteFor") or 1)
            if r:
                out.append(r)
    for loc in d.get("localResults") or []:
        fips = county_fips(state, loc["name"])
        if not fips:
            unmatched.add(loc["name"])
        for item in loc.get("ballotItems") or []:
            for o in item.get("ballotOptions") or []:
                r = _row(state, item["name"], "county", fips, loc["name"], o["name"], o.get("politicalParty") or "", num(o.get("voteCount")), fips, vote_for=item.get("voteFor") or 1)
                if not r:
                    break
                out.append(r)
                for p in o.get("precinctResults") or []:
                    out.append(_row(state, item["name"], "precinct", f"{fips}:{p['id']}", p.get("name") or p["id"], o["name"], o.get("politicalParty") or "",
                                    num(p.get("voteCount")), fips, vote_for=item.get("voteFor") or 1))
    return out, unmatched


def ncsbe(state="NC"):
    with zipfile.ZipFile(RAW / "direct" / "NC.zip") as z:
        name = [n for n in z.namelist() if n.endswith(".txt")][0]
        text = z.read(name).decode("utf-8-sig", errors="replace")
    out, unmatched, fipsof = [], set(), {}
    for r in csv.DictReader(io.StringIO(text), delimiter="\t"):
        county = r["County"]
        if county not in fipsof:
            fipsof[county] = county_fips(state, county)
            if not fipsof[county]:
                unmatched.add(county)
        fips = fipsof[county]
        pct = r["Precinct"]
        row = _row(state, r["Contest Name"], "precinct", f"{fips}:{pct}", pct, r["Choice"], r["Choice Party"], num(r["Total Votes"]), fips,
                   vote_for=num(r["Vote For"]) or 1, extra={"real_precinct": r.get("Real Precinct", "")})
        if row:
            out.append(row)
    return out, unmatched


def mn_sos(state="MN"):
    out = []
    with (RAW / "direct" / "MN.txt").open(encoding="latin-1") as f:
        for line in f:
            p = line.rstrip("\r\n").split(";")
            if len(p) < 16:
                continue
            # Minnesota numbers its 87 counties alphabetically; FIPS is the odd number 2n-1.
            fips = STATE_FIPS[state] + f"{2 * int(p[1]) - 1:03d}"
            row = _row(state, p[4], "precinct", f"{fips}:{p[2]}", p[2], p[7], p[10], num(p[13]), fips,
                       incumbent="1" if p[9].strip() else "")
            if row:
                out.append(row)
    return out, set()


# Hawaii has no county column: precinct "DD-PP" sits in state House district DD, and House
# districts nest in counties (2022 lines). Kalawao is inside HD 13 and reads as Maui. "OS I"/"OS II"
# are overseas ballots by congressional district, with no county.
def _hi_county(precinct):
    m = re.match(r"(\d+)-", precinct)
    if not m:
        return ""
    hd = int(m.group(1))
    return "15001" if hd <= 7 else "15009" if hd <= 13 else "15007" if hd <= 16 else "15003"


def hi_oe(state="HI"):
    with (RAW / "direct" / "HI.txt").open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f, delimiter="\t"))
    out = []
    agg = defaultdict(int)
    for x in rows[3:]:
        if len(x) < 15 or x[8].strip():  # Contest_party set = a party primary line
            continue
        pct, contest, raw = x[0].strip(), x[7], x[10].split("\n")[0].strip()
        m = re.match(r"\((\w+)\)\s*(.*)", raw)
        party, name = (m.group(1), m.group(2)) if m else ("", raw)
        if "," in name:
            last, first = name.split(",", 1)
            name = f"{first.strip()} {tidy_name(last.strip())}"
        if is_overunder(name):
            continue
        agg[(contest, pct, name, party)] += num(x[13]) + num(x[14])
    for (contest, pct, name, party), votes in agg.items():
        fips = _hi_county(pct)
        r = _row(state, contest, "precinct", f"{fips}:{pct}", pct, name, party, votes, fips)
        if r:
            out.append(r)
    return out, set()


def results_export(state):
    """ResultsExport.aspx workbooks (MT): one sheet per contest, a header row
    [contest, "County", "NAME\nParty", ...], one row per county, then TOTALS."""
    import glob
    import openpyxl
    out, unmatched = [], set()
    for path in sorted(glob.glob(str(RAW / "direct" / f"{state}-*.xlsx"))):
        wb = openpyxl.load_workbook(path, read_only=True)
        for ws in wb.worksheets:
            cands, contest = None, None
            for row in ws.iter_rows(values_only=True):
                if len(row) > 2 and row[1] == "County" and row[0]:
                    contest = str(row[0])
                    cands = [(str(c).split("\n")[0].strip(), (str(c).split("\n") + [""])[1].strip()) if c else None for c in row[2:]]
                    if not classify(contest):
                        cands = None
                    continue
                if not cands or not row[1]:
                    continue
                total = str(row[1]).strip().upper() == "TOTALS"
                fips = "" if total else county_fips(state, str(row[1]))
                if not total and not fips:
                    unmatched.add(str(row[1]))
                for cand, v in zip(cands, row[2:]):
                    if cand:
                        r = _row(state, contest, "state" if total else "county", fips, state if total else str(row[1]), cand[0], cand[1], num(v), fips)
                        if r:
                            out.append(r)
    return out, unmatched


ADAPTERS = {"results_export": results_export, "enhanced_voting": enhanced_voting, "ncsbe": ncsbe, "mn_sos": mn_sos, "hi_oe": hi_oe}
