#!/usr/bin/env python3
"""
Idaho state legislative fundraising for the 2020 and 2022 cycles from the Secretary of State's Sunshine portal
(sunshine.sos.idaho.gov), plus 2019 from the archived annual reports (the portal starts January 1, 2020).

  python3 -I scripts/fetch-state-leg-finance-id-sunshine.py [2020] [2022]

Sunshine: POST /api/es/finances/get_activity.json (no login; the body must go as text/plain like the page's own fetch —
with application/json the filters are silently ignored; at most 1,000 rows a page). Donations to State Senator (office
91) and State Representative (92) dated in the cycle (2021–2022 for 2022; 2020 for 2020): Normal + Unitemized + In-Kind
+ Cash − Return. Loans are left out (as for 2016/2018), and so are "Credit Card Item" rows — the card statement's
line items, listed with the bank as the donor (Tim Kastning 2020: $6,662 of them). Each report's transactions appear
once (the portal keeps the latest version). Check: the sum plus loans reproduces the calendar-year-to-date total
contributions (line 3) of the December-Annual 2020 report for 61 of 65 legislative candidates whose report parses; the
4 others are within $250–$4,500 (later amendments).

2019 (the 2020 cycle's off year): archive.sos.idaho.gov/ELECT/Finance/2020/last_year_state_legislature.html lists every
legislative committee's 2019 annual report (C-2, typed PDFs; two scanned amendments read by eye below). Each is a full-
year report, so page 2's "this period" lines are the year's: total contributions (line 5) less new loans (line 4). An
amended report replaces the original. A candidate with no 2019 report is taken to have raised nothing in 2019 (a
legislative committee active in 2019 had to file the annual report). Matched to the portal's candidates by chamber +
district + surname (the forms say "James W Woodward", the portal "Jim Woodward").

Output: data-entry/state-leg-finance/portal-raw/ID-{cycle}.json. Cache in scratch (SCRATCH below).
"""
import collections
import datetime
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
SCRATCH = "/private/tmp/claude-501/-Users-rickyjia-election-map/6b494d78-e452-4e2a-a736-93ff75a64a87/scratchpad/sunshine"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
API = "https://sunshine.sos.idaho.gov/api/es/finances/get_activity.json"
ARCHIVE = "https://archive.sos.idaho.gov/ELECT/Finance/2020/"
SOURCE = "Idaho Secretary of State Sunshine portal (contributions incl. unitemized and in-kind, less returns; loans excluded)"
SOURCE_2019 = " + 2019 annual reports from the Secretary of State's archive"
LOCAL = ("city", "county", "school", "trustee", "mayor", "commission", "sheriff", "assessor", "clerk", "coroner",
         "prosecut", "judge", "justice", "district", "council", "highway", "library", "fire", "hospital", "cemetery", "treasurer (county")
KEEP_OFFICE = lambda o: not o or not any(w in o.lower() for w in LOCAL) or "state representative" in o.lower() or "state senator" in o.lower()
COUNTED = {"Normal": 1, "Unitemized": 1, "In-Kind": 1, "Cash": 1, "Return": -1}  # Loan, Credit Card Item: left out
# Scanned 2019 amendments (no text layer), read by eye: page 2 line 5 total contributions, line 4 new loans.
SCANNED_2019 = {
    "10788_amended.pdf": {"name": "Tim Kastning", "office": "State Rep, Pos B", "district": "2", "total": 2100.30, "loans": 1500.00},
    "10345_amended.pdf": {"name": "James Bratnober", "office": "State Senator", "district": "15", "total": 13467.50, "loans": 0.0},
}


def curl(*args):
    return subprocess.run(["curl", "-s", "-m", "300", "-A", UA, *args], capture_output=True, text=True).stdout


def pull(start, end):
    """Every donation to any candidate dated start..end (inclusive). Not filtered by office on the server: the office is
    the candidate's latest, so a 2020 legislator now registered for another office would be missed."""
    cache = os.path.join(SCRATCH, f"donations-all-{start}-{end}.json")
    if os.path.exists(cache):
        return json.load(open(cache))
    rows, page = [], 1
    while True:
        body = {"dates": [f"{start}T12:00:00.000Z", f"{end}T12:00:00.000Z"], "activity_types": {"donate": 1, "spend": 0, "file": 0},
                "amounts": [0, 50000000], "campaigns": [], "committee_types": [], "treasurers": [], "ch": ["summary"], "ch_data": [],
                "donors": [], "donate_types": [], "vendors": [], "spend_types": [], "spend_codes": [], "report_types": [], "reports": [],
                "offices": [], "districts": [], "parties": [], "stages": [], "contest_years": [2015, 2030],
                "order": "date asc", "page": page, "limit": 1000, "get_link_to_result": 0}
        d = json.loads(curl("-X", "POST", "-H", "Content-Type: text/plain;charset=UTF-8", "--data-binary", json.dumps(body), API))
        rows += d["output"]
        total = int(d["output_meta"]["count_total_rows"])
        if not d["output"] or len(rows) >= total:
            break
        page += 1
        time.sleep(1)
    if len(rows) != total:
        sys.exit(f"Sunshine {start}..{end}: {len(rows)} rows of {total}, refusing to write")
    os.makedirs(SCRATCH, exist_ok=True)
    json.dump(rows, open(cache, "w"))
    return rows


def chamber_of(office):
    o = (office or "").lower()
    return "senate" if "senat" in o else "house" if "rep" in o else None


def surname(name):
    t = [w for w in re.sub(r"[^A-Za-z' -]", " ", name).split() if w.lower().rstrip(".") not in ("jr", "sr", "ii", "iii", "iv")]
    return t[-1].lower() if t else ""


def reports_2019():
    """(chamber, district, surname) → 2019 contributions less loans, from the archived annual reports."""
    page = curl(ARCHIVE + "last_year_state_legislature.html")
    files = sorted({h for h in re.findall(r'href="(First%20Annual/[^"]+\.pdf)"', page)})
    pdir = os.path.join(SCRATCH, "pdf19")
    os.makedirs(pdir, exist_ok=True)
    found = {}
    for h in files:
        fn = h.split("/")[-1].replace("%20", "_")
        p = os.path.join(pdir, fn)
        if not os.path.exists(p):
            curl("-L", "-o", p, ARCHIVE + h)
        if fn in SCANNED_2019:
            r = SCANNED_2019[fn]
            name, office, district, total, loans = r["name"], r["office"], r["district"], r["total"], r["loans"]
        else:
            t = subprocess.run(["pdftotext", "-l", "1", p, "-"], capture_output=True, text=True).stdout
            if len(t.strip()) < 200:
                sys.exit(f"{fn}: no text layer — read it by eye into SCANNED_2019")
            lines = [x.strip() for x in t.split("\n") if x.strip()]
            i = lines.index("District (if any)")
            name, office, district = lines[i + 1], lines[i + 2], lines[i + 3]
            t2 = subprocess.run(["pdftotext", "-layout", "-f", "2", "-l", "2", p, "-"], capture_output=True, text=True).stdout
            line = lambda n: float(re.search(rf"\n\s*{n}\s+[A-Z][^\n]*?\$\s*(-?[\d,]*\d\.\d\d)", t2).group(1).replace(",", ""))
            total, loans = line(5), line(4)
            head = subprocess.run(["pdftotext", "-layout", "-l", "1", p, "-"], capture_output=True, text=True).stdout
            head = head[:head.find("Section III")]
            dates = re.findall(r"(\d\d)\s+(\d\d)\s+(20\d\d)", head)
            if ("01", "01", "2019") not in dates or ("12", "31", "2019") not in dates:
                sys.exit(f"{fn}: not a full-year 2019 report ({dates})")
        key = (chamber_of(office), str(int(re.sub(r"\D", "", district) or 0)), surname(name))
        amended = "amend" in fn.lower()
        if key not in found or amended or not found[key][1]:
            found[key] = (round(total - loans, 2), amended, fn, name)
    return found


def first_initial(name):
    t = [w for w in re.sub(r"[^A-Za-z' -]", " ", name).split() if len(w) > 1 or w.isalpha()]
    return t[0][0].lower() if t else ""


def race_chambers(cycle):
    """(district, surname) → chambers in which a general-election candidate of that surname ran that year, from
    scripts/dump-state-leg-candidates.ts ID (written to SCRATCH/id-cands.json)."""
    p = os.path.join(SCRATCH, "id-cands.json")
    if not os.path.exists(p):
        out = subprocess.run(["npx", "tsx", "--conditions=react-server", os.path.join(ROOT, "scripts", "dump-state-leg-candidates.ts"), "ID"],
                             capture_output=True, text=True, cwd=ROOT).stdout
        open(p, "w").write(out)
    ran = collections.defaultdict(set)
    for c in json.load(open(p)):
        if c["year"] == cycle:
            ran[(str(int(c["district"])), surname(c["name"]))].add(c["chamber"])
    return ran


def place(rec, ran, district):
    """A record gets a chamber + district only when the district's race that year had a candidate of its surname in
    exactly one chamber (Idaho legislators keep their district number when they switch chambers: Christy Zito, House
    23 in 2019, Senate 23 in 2020); inside the district a nickname still matches (Rod Furniss for Rodney)."""
    chs = ran.get((district, surname(rec["name"])), set())
    if len(chs) == 1:
        rec["chamber"], rec["district"] = next(iter(chs)), district


def build(cycle):
    """The portal's office and district are the candidate's LATEST registration, not the race's (Tammy Nichols's 2020
    House donations are labeled "State Senator, District 10"; Idaho redistricted for 2022). A record is placed in a
    district only where its district is known for the race's map — the 2019 report's for 2020, the portal's own for
    2022 (place()) — and is otherwise matched statewide by full name. (2019 committees with no 2020 money go out with
    their report's own office and district.)"""
    start, end = (f"{cycle - 1}-01-01", f"{cycle}-12-31") if cycle != 2020 else ("2020-01-01", "2020-12-31")
    rows = pull(start, end)
    tot, who = collections.defaultdict(float), {}
    for r in rows:
        sign = COUNTED.get(r["donate_type"])
        # Candidates now registered for a local office (city, county, school, judge...) are left out: a same-name local
        # candidate must not take a legislator's place (the name match keeps the larger of two records).
        if sign is None or r["to_entity_type"] != "Candidate" or not KEEP_OFFICE(r["to_office_name"]):
            continue
        tot[r["to_pk_id"]] += sign * float(r["amount"])
        who[r["to_pk_id"]] = (r["to_display_name"], r["to_party_code"] or None, str(int(re.sub(r"\D", "", r["to_district_name"] or "") or 0)))
    full = collections.Counter(re.sub(r"\W+", " ", n.lower()).strip() for n, _, _ in who.values())
    y2019 = reports_2019() if cycle == 2020 else {}
    # 2019 report ↔ portal candidate by surname + first initial, unique on both sides
    by_key = collections.defaultdict(list)
    for key, v in y2019.items():
        by_key[(key[2], first_initial(v[3]))].append(key)
    portal_key = collections.Counter((surname(n), first_initial(n)) for n, _, _ in who.values())
    ran = race_chambers(cycle)
    used, out, unjoined, twins = set(), [], 0, 0
    for k, v in tot.items():
        name, party, pdist = who[k]
        rec = {"name": name, "party": party, "chamber": None, "district": None, "contributions": round(v, 2)}
        if cycle >= 2022:
            place(rec, ran, pdist)  # the portal's district is on the 2022 map, still in use
        if full[re.sub(r"\W+", " ", name.lower()).strip()] > 1:
            rec["contributions"] = None  # two portal candidates with this name: which one ran cannot be told
            twins += 1
        sk = (surname(name), first_initial(name))
        hits = by_key.get(sk, [])
        if cycle == 2020 and hits:
            if len(hits) == 1 and portal_key[sk] == 1:
                key = hits[0]
                place(rec, ran, key[1])  # the 2019 report's district is on the 2020 map
                if rec["contributions"] is not None:
                    rec["contributions"] = round(v + y2019[key][0], 2)
                used.add(key)
            else:
                rec["contributions"] = None  # a 2019 report that may be this candidate's: the 2020 total cannot be completed
                unjoined += 1
        out.append(rec)
    if cycle == 2020:
        # 2019 committees with no 2020 donations at all (retired, or no 2020 money) still have their 2019 money
        for key, (c, _, fn, name) in y2019.items():
            if key not in used and key[0] and portal_key[(key[2], first_initial(name))] == 0:
                out.append({"name": name, "party": None, "chamber": key[0], "district": key[1], "contributions": c})
        print(f"  2019 reports: {len(y2019)} committees, {len(used)} joined to a 2020 candidate, {unjoined} ambiguous (null)")
    print(f"  {twins} portal candidates share a full name (null)")
    src = SOURCE + (SOURCE_2019 if cycle == 2020 else "")
    body = {"state": "ID", "cycle": cycle, "source": src, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"ID-{cycle}.json"), "w"), indent=1)
    print(f"ID {cycle}: {len(out)} legislative candidates, {len(rows)} donation rows")


if __name__ == "__main__":
    for c in [int(a) for a in sys.argv[1:]] or [2020, 2022]:
        build(c)
