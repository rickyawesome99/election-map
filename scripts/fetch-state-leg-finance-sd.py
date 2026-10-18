#!/usr/bin/env python3
"""
South Dakota state legislative fundraising from the Secretary of State's campaign finance system
(sdcfr.sdsos.gov), cycles 2016–2026. NOTE: SDCL 12-27-33 bars using this data for commercial purposes
or for soliciting contributions; it may be shown on a non-commercial page.

  python3 scripts/fetch-state-leg-finance-sd.py [CYCLE ...]

Committees: Search/SearchResults.aspx?cid=N (plain GET; the committee id alone is enough) for every
id up to the highest in use — each page names the committee, its type ("Legislative Committee"),
the candidate, and lists its filings. Money: each electronic disclosure statement
(Document.aspx?DocumentID=&type=doc, a system-generated text PDF) for Pre-Primary, Pre-General and
Year-End: TOTAL of Income − Other Income + Donated Goods or Services, for THAT reporting period. A
report's year is its filing year (a year-end is filed in January/February for the year before); a
later filing of the same report and year (an amendment) replaces the earlier one. A cycle = the
report years Y-1 and Y. Scanned paper filings (type=img) cannot be read and are skipped.
Brooke Abdallah, House, 2020 cycle: $1,505.00 + $6,226.08 + $400.00 = $8,131.08.

Output: data-entry/state-leg-finance/portal-raw/SD-{cycle}.json. Pages and PDFs cached in scratch portal-cache/sd/.
"""
import datetime
import html
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/sd"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://sdcfr.sdsos.gov/"
SOURCE = "South Dakota Secretary of State (electronic disclosure statements; non-commercial use only)"
TODAY = datetime.date.today()
REPORTS = {"Pre-Primary", "Pre-General", "Year End"}


def get(path, name):
    p = os.path.join(CACHE, name)
    if os.path.exists(p):
        return open(p, "rb").read()
    for attempt in range(4):
        r = subprocess.run(["curl", "-sS", "--max-time", "120", "-A", UA, BASE + path], capture_output=True)
        if r.returncode == 0 and r.stdout:
            break
        time.sleep(10 * (attempt + 1))
    else:
        sys.exit(f"SD: failed {path}")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "wb").write(r.stdout)
    time.sleep(0.25)
    return r.stdout


def text(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()


def committee(cid):
    h = get(f"Search/SearchResults.aspx?cid={cid}", f"c/{cid}.html").decode("utf-8", "replace")
    t = text(h)
    if "Legislative Committee" not in t:
        return None
    cand = re.search(r"Candidate Name:\s*(.*?)\s+Campaign Status", t)
    chamber = "senate" if "SD Senate" in t else "house"
    filings = []
    for tr in re.findall(r"<tr.*?</tr>", h, re.S):
        doc = re.search(r"Document\.aspx\?DocumentID=(\d+)&(?:amp;)?type=doc", tr)
        cells = [text(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if doc and len(cells) >= 2 and cells[0] in REPORTS:
            when = re.search(r"(\d+)/(\d+)/(\d{4})", cells[1])
            if when:
                filed = datetime.date(int(when.group(3)), int(when.group(1)), int(when.group(2)))
                filings.append({"doc": doc.group(1), "report": cells[0], "filed": filed.isoformat(),
                                "year": filed.year - 1 if cells[0] == "Year End" and filed.month <= 6 else filed.year})
    return {"cid": cid, "name": cand.group(1) if cand else "", "chamber": chamber, "filings": filings}


def report_income(doc):
    pdf = get(f"Document.aspx?DocumentID={doc}&type=doc", f"d/{doc}.pdf")
    if not pdf.startswith(b"%PDF"):
        return None
    t = subprocess.run(["pdftotext", "-layout", os.path.join(CACHE, "d", f"{doc}.pdf"), "-"], capture_output=True).stdout.decode("utf-8", "replace")
    amt = lambda label: (lambda m: float(m.group(1).replace(",", "")) if m else 0.0)(re.search(re.escape(label) + r":?\s+\$\s*([\d,]+\.\d\d)", t))
    if "TOTAL of Income" not in t:
        return None
    district = re.search(r"District\s*:?\s*(\d+[AB]?)", t)
    return {"contributions": amt("TOTAL of Income") - amt("TOTAL of all Other Income") + amt("TOTAL of all Donated Goods or Services"),
            "district": district.group(1) if district else None}


def main(cycles):
    index = os.path.join(CACHE, "committees.json")
    if os.path.exists(index):
        comms = json.load(open(index))
    else:
        comms, misses, cid = [], 0, 1
        while misses < 150:  # ids run contiguously; stop after a long run of empty pages
            h = get(f"Search/SearchResults.aspx?cid={cid}", f"c/{cid}.html")
            if b"Committee Type" not in h:
                misses += 1
            else:
                misses = 0
                c = committee(cid)
                if c:
                    comms.append(c)
            if cid % 200 == 0:
                print(f"SD: committee id {cid}, {len(comms)} legislative")
            cid += 1
        json.dump(comms, open(index, "w"))
    print(f"SD: {len(comms)} legislative committees")
    for cycle in cycles:
        out = []
        for c in comms:
            latest = {}
            for f in c["filings"]:
                if f["year"] in (cycle - 1, cycle):
                    key = (f["report"], f["year"])
                    if key not in latest or f["filed"] > latest[key]["filed"]:
                        latest[key] = f
            if not latest:
                continue
            parsed = [report_income(f["doc"]) for f in latest.values()]
            known = [p for p in parsed if p]
            if not known:
                continue
            district = next((p["district"] for p in known if p["district"]), None)
            out.append({"name": c["name"], "chamber": c["chamber"], "district": district, "committee": c["cid"],
                        "contributions": round(sum(p["contributions"] for p in known), 2)})
        body = {"state": "SD", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
                "dataThrough": TODAY.strftime("%m/%d/%Y") if cycle >= TODAY.year else f"12/31/{cycle}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"SD-{cycle}.json"), "w"), indent=1)
        print(f"SD {cycle}: {len(out)} committees with readable reports")


if __name__ == "__main__":
    main([int(a) for a in sys.argv[1:]] or [2016, 2018, 2020, 2022, 2024, 2026])
