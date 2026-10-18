#!/usr/bin/env python3
"""
Arkansas state legislative fundraising for 2018–2022 from the ethics disclosure system's LEGACY
filings (reports filed 2017–2022 before the current system; 2024 on: scripts/fetch-state-leg-finance-ar.py).

  python3 scripts/fetch-state-leg-finance-ar-legacy.py [CYCLE ...]

POST /api/PublicLegacyFiledReport/GetPublicLegacyFiledReport (moduleName CF, registrationYear Y-1 and Y — most
candidates register in the odd year before the election) lists
every legacy report with filer, office, report type and dates; POST
/api/PublicFiledReportAndDownload/LegacyDownloadDocument returns the report as a system-generated text
PDF. Line 7 "Total Monetary Contributions" has a CUMULATIVE TOTAL column for the registration, so the
latest contribution report of each legislative registration (by period end, an amendment over the
original; carry-over and debt-retirement reports skipped; a scanned report falls back to the one
before it) is enough; its "District Number:" gives the district. Paper filers are here too, as image-only
scans with no text: when the NEWEST report is a scan, its line 7 cumulative is read by eye (--sheets, into
data-entry/state-leg-finance/manual/AR.json by filerReportGuid); until then the registration is null, never an older
report's smaller cumulative.
Jonathan Dismang, Senate 18, 2022 pre-general: $122,411.99 cumulative.

Output: data-entry/state-leg-finance/portal-raw/AR-{cycle}.json. PDFs cached in scratch portal-cache/ar/legacy/.
"""
import datetime
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ar/legacy"
API = "https://api-ethics-disclosures.sos.arkansas.gov/api"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "Arkansas Secretary of State legacy e-filed reports (cumulative contributions; paper filers missing)"
CHAMBER = {"State Representative": "house", "State Senate": "senate"}


def post(path, body, out=None):
    args = ["curl", "-sS", "--max-time", "300", "-X", "POST", "-A", UA, "-H", "Content-Type: application/json",
            "-H", "Origin: https://ethics-disclosures.sos.arkansas.gov", "-d", json.dumps(body), API + path]
    if out:
        subprocess.run(args + ["-o", out], check=True)
        return None
    return json.loads(subprocess.run(args, capture_output=True, check=True).stdout)


def reports(year):
    path = os.path.join(CACHE, f"list-{year}.json")
    if not os.path.exists(path):
        d = post("/PublicLegacyFiledReport/GetPublicLegacyFiledReport", {"pageNumber": 1, "pageSize": 10000, "moduleName": "CF", "registrationYear": str(year)})
        os.makedirs(CACHE, exist_ok=True)
        json.dump(d, open(path, "w"))
    d = json.load(open(path))
    items = d["data"]["items"] if isinstance(d.get("data"), dict) else d.get("data") or d.get("items") or []
    return items


def pdf_text(guid):
    pdf = os.path.join(CACHE, f"{guid}.pdf")
    if not os.path.exists(pdf):
        post("/PublicFiledReportAndDownload/LegacyDownloadDocument", {"filerReportGuid": guid, "fileName": "x.pdf"}, out=pdf)
    return subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True).stdout.decode("utf-8", "replace")


def date(s):
    try:
        return datetime.datetime.strptime(s, "%m/%d/%Y").date()
    except (TypeError, ValueError):
        return datetime.date.min


def fetch(cycle):
    regs = {}
    # Legacy registrations are keyed to the year the committee registered, usually the odd year before
    # the election (most 2020 candidates sit under 2019); both years are read.
    for r in reports(cycle - 1) + reports(cycle):
        if r.get("officeType") not in CHAMBER or re.search(r"carryover|debt retirement", r.get("fileName") or "", re.I):
            continue  # carry-over and debt-retirement reports have no contributions line
        if date(r.get("reportEndDate")).year not in (cycle - 1, cycle):
            continue  # a registration runs on into the next election (Ronald Caldwell's 2020 reports)
        regs.setdefault(r["legacyFilerRegistrationID"], []).append(r)
    out = []
    for rid, rs in regs.items():
        rs.sort(key=lambda r: (date(r.get("reportEndDate")), r.get("reportVersion") != "Orginal", date(r.get("filedDate"))), reverse=True)
        contrib, district, newest_scanned = None, None, None
        for i, r in enumerate(rs):  # newest first; a scanned (image-only) report has no text: the next one stands in
            t = pdf_text(r["filerReportGuid"])
            m = re.search(r"7\. Total Monetary Contributions[^\n]*?\$([\d,]+\.\d\d)\s+\$([\d,]+\.\d\d)", t)
            if m:
                dist = re.search(r"District Number:\s*\n[^\n]*?(\d+)\s*$", t, re.M)
                contrib, district = float(m.group(2).replace(",", "")), dist.group(1) if dist else None
                break
            if i == 0 and not t.strip():
                newest_scanned = r["filerReportGuid"]
        if newest_scanned and newest_scanned in MANUAL:  # the scan's line 7 cumulative, read by eye
            contrib = MANUAL[newest_scanned]["contributions"]
            newest_scanned = None
        elif newest_scanned and contrib is not None:
            contrib = None  # an older report's cumulative would understate the cycle
        r = rs[0]
        out.append({"name": re.sub(r"\s+-\s+(Primary|General).*$", "", r["filerName"]), "chamber": CHAMBER[r["officeType"]],
                    "district": district, "contributions": contrib, "newestScanned": newest_scanned})
    body = {"state": "AR", "cycle": cycle, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"AR-{cycle}.json"), "w"), indent=1)
    print(f"AR {cycle}: {len(out)} legislative registrations ({sum(1 for o in out if o['contributions'] is None)} unparsed)")


MANUAL_PATH = os.path.join(ROOT, "data-entry", "state-leg-finance", "manual", "AR.json")
MANUAL = json.load(open(MANUAL_PATH))["reports"] if os.path.exists(MANUAL_PATH) else {}


def sheets(cycles):
    """Page 1 of every newest-report scan still unread, numbered, four to a sheet (scratch ar-sheets/)."""
    from PIL import Image, ImageDraw
    d = "/private/tmp/claude-501/-Users-rickyjia-election-map/7b2956ab-e26b-44c1-94ba-2b5ad2215584/scratchpad/ar-sheets"
    os.makedirs(d, exist_ok=True)
    index, crops = [], []
    for c in cycles:
        for cand in json.load(open(os.path.join(OUT_DIR, f"AR-{c}.json")))["candidates"]:
            g = cand.get("newestScanned")
            if not g or g in MANUAL or any(i["guid"] == g for i in index):
                continue
            n = len(index) + 1
            base = os.path.join(d, f"c{n}")
            subprocess.run(["pdftoppm", "-r", "80", "-f", "1", "-l", "1", "-png", "-singlefile", os.path.join(CACHE, f"{g}.pdf"), base], capture_output=True)
            if not os.path.exists(base + ".png"):
                continue
            im = Image.open(base + ".png").convert("RGB")
            cap = Image.new("RGB", (im.size[0], im.size[1] + 18), "white")
            cap.paste(im, (0, 18))
            ImageDraw.Draw(cap).text((4, 3), f"#{n}  {cand['name']}  {cand['chamber']}  cycle {c}", fill="red")
            cap.save(base + ".png")
            crops.append(cap)
            index.append({"n": n, "guid": g, "name": cand["name"], "cycle": c})
    for i in range(0, len(crops), 2):
        gs = crops[i:i + 2]
        sh = Image.new("RGB", (sum(x.size[0] for x in gs), max(x.size[1] for x in gs)), "white")
        x0 = 0
        for x in gs:
            sh.paste(x, (x0, 0))
            x0 += x.size[0]
        sh.save(os.path.join(d, f"sheet{i // 2 + 1:03d}.png"))
    json.dump(index, open(os.path.join(d, "index.json"), "w"), indent=1)
    print(f"{len(index)} scans on {(len(crops) + 1) // 2} sheets in {d}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--sheets"]
    cycles = [int(a) for a in args] or [2018, 2020, 2022]
    if "--sheets" in sys.argv:
        sheets(cycles)
    else:
        for c in cycles:
            fetch(c)
