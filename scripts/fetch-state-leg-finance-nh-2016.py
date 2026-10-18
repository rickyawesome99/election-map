#!/usr/bin/env python3
"""
New Hampshire state legislative fundraising for 2016 (Transparency USA, scripts/fetch-state-leg-finance-tu.py, starts
with 2018). In 2016 filing online was voluntary: most candidates filed paper forms, which the Secretary of State has
since scanned into the current campaign finance system (cfs.sos.nh.gov) under the "2016 Election Cycle".

  python3 scripts/fetch-state-leg-finance-nh-2016.py            download + build
  python3 scripts/fetch-state-leg-finance-nh-2016.py --sheets   numbered crops of the scanned reports still unread

API (cfsapi.sos.nh.gov/api; Akamai turns away curl unless it sends a full Chrome header set, see H below):
  POST PublicFiledReportAnddownload/GetPublicFilingReport {pageSize 5000, electionID "2"} → every 2016 report:
       filer, office, report name ("11/16/2016 - General"), isPaperFile, filerReportGuid
  POST PublicFiledReportAndDownload/DownloadDocument {filerReportGuid, fileName, openInNewTab} → the PDF
The "Statement of Receipts and Expenditures for Candidates" has THIS PERIOD and TO DATE columns, and TO DATE runs
across the whole campaign, primary into general. A candidate's cycle = the TO DATE "Total receipts (E + F + G)" of
the last report (the last general one, else the last primary one) less line G (surplus carried from a previous
campaign, not money raised this cycle); the scanned paper forms were read by eye into
data-entry/state-leg-finance/manual/NH-2016.json ({guid: {total, surplus}}). An election a candidate e-filed comes
from the transaction export instead (ExportData/GetExportPublicDownloadData TCON 2016: every itemized and unitemized
receipt by election period), since the e-filed summaries' "campaign to date" does not reconcile with the receipts.
A candidate whose last report is an unread scan gets null. No district in the listing: scripts/assign-state-leg-finance.ts matches
by name (chamber from the office).
Rebecca McBeath, Rockingham 26, 11/16/2016 general: $900 to date.

Output: data-entry/state-leg-finance/portal-raw/NH-2016.json. Cached in scratch nh/.
"""
import collections
import datetime
import json
import os
import re
import subprocess
import time
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
MANUAL = os.path.join(ROOT, "data-entry", "state-leg-finance", "manual", "NH-2016.json")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/7b2956ab-e26b-44c1-94ba-2b5ad2215584/scratchpad/nh"
API = "https://cfsapi.sos.nh.gov/api/"
SOURCE = "New Hampshire Secretary of State campaign finance system, 2016 reports incl. scanned paper filings (receipts to date, primary + general)"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
H = ["-A", UA, "-H", "Accept: application/json, text/plain, */*", "-H", "Accept-Language: en-US,en;q=0.9",
     "-H", 'sec-ch-ua: "Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="24"', "-H", "sec-ch-ua-mobile: ?0",
     "-H", 'sec-ch-ua-platform: "macOS"', "-H", "Sec-Fetch-Dest: empty", "-H", "Sec-Fetch-Mode: cors", "-H", "Sec-Fetch-Site: same-site",
     "-H", "Origin: https://cfs.sos.nh.gov", "-H", "Referer: https://cfs.sos.nh.gov/", "-H", "Content-Type: application/json"]
CHAMBER = {"State Representative": "house", "State Senate": "senate"}


def post(path, body, out=None):
    args = ["curl", "-sS", "--max-time", "300", "-X", "POST", *H, "-d", json.dumps(body), API + path]
    if out:
        # HTTP/2 only (Akamai answers HTTP/1.1 with a block page); its stream resets (curl 92) come and go,
        # and a block page instead of a PDF is retried too.
        for attempt in range(6):
            if subprocess.run(args + ["-o", out]).returncode == 0 and open(out, "rb").read(5) == b"%PDF-":
                return None
            time.sleep(10 * (attempt + 1))
        raise RuntimeError(f"download failed: {body}")
    return json.loads(subprocess.run(args, capture_output=True, check=True).stdout)


def listing():
    path = os.path.join(CACHE, "reports-2016.json")
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        json.dump(post("PublicFiledReportAnddownload/GetPublicFilingReport", {"pageNumber": 1, "pageSize": 5000, "sortBy": "", "sortType": "", "electionID": "2"}), open(path, "w"))
    d = json.load(open(path))["data"]
    return d["items"] if isinstance(d, dict) else d


def due(r):
    m = re.match(r"(\d\d)/(\d\d)/(\d{4})", r["reportName"])
    return datetime.date(int(m.group(3)), int(m.group(1)), int(m.group(2))) if m else datetime.date.min


def picks():
    """filer → {primary: report, general: report}, the last report of each election (an amendment over the original)."""
    by = collections.defaultdict(dict)
    for r in listing():
        if r["officeName"] not in CHAMBER:
            continue
        el = "primary" if r["reportName"].endswith("- Primary") else "general" if r["reportName"].endswith("- General") else None
        if not el:
            continue  # 6-month reports after the election
        key = (due(r), r["reportVersion"] != "Original", r.get("filerReportVersionId") or 0, r["filedDate"] or "")
        cur = by[r["filerEntityID"]].get(el)
        if cur is None or key > cur[0]:
            by[r["filerEntityID"]][el] = (key, r)
    return {f: {el: v[1] for el, v in d.items()} for f, d in by.items()}


def pdf_of(r):
    path = os.path.join(CACHE, "pdf", r["filerReportGuid"] + ".pdf")
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        post("PublicFiledReportAndDownload/DownloadDocument", {"filerReportGuid": r["filerReportGuid"], "fileName": "report V1", "openInNewTab": True}, out=path)
    return path if open(path, "rb").read(5) == b"%PDF-" else None


AMOUNT = re.compile(r"(\(?-?\$\s*-?[\d,]+(?:\.\d\d)?\)?)")


def amount(s):
    v = float(re.sub(r"[^\d.]", "", s))
    return -v if "(" in s or "-" in s else v


def read_text(pdf):
    """TO DATE total receipts and line G (the last amount on each line) from an e-filed report's text layer, or None."""
    t = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True).stdout.decode("utf-8", "replace")
    tot = [AMOUNT.findall(ln) for ln in t.split("\n") if "TOTAL RECEIPTS (" in ln]
    tot = [a for a in tot if a]
    if not tot:
        return None
    g = [AMOUNT.findall(ln) for ln in t.split("\n") if re.search(r"^\s*G\.\s*Total Surplus", ln, re.I)]
    g = [a for a in g if a]
    return {"total": amount(tot[0][-1]), "surplus": amount(g[0][-1]) if g else 0.0}


def csv_receipts():
    """E-filed receipts by filer and election from the transaction export (all receipt kinds, in-kind included)."""
    path = os.path.join(CACHE, "tcon2016.csv")
    if not os.path.exists(path):
        # this endpoint wants HTTP/2 (an HTTP/1.1 request gets Akamai's block page)
        subprocess.run(["curl", "-sS", "--max-time", "600", "-X", "POST", *H, "-d", json.dumps({"type": "CSV", "filingYear": "2016", "transactionTypeCode": "TCON"}),
                        API + "ExportData/GetExportPublicDownloadData", "-o", path], check=True)
    out = collections.defaultdict(float)
    import csv
    for r in csv.DictReader(open(path, encoding="utf-8", errors="replace")):
        if r["Transaction Type"] != "Receipt":
            continue
        el = "general" if r["Election Period"] == "General" else "primary"  # Exploratory and blank count with the primary
        out[(int(r["Filing Entity ID"]), el)] += float(re.sub(r"[^\d.]", "", r["Amount of receipt"]) or 0)
    return out


def main(sheets):
    manual = json.load(open(MANUAL))["reports"] if os.path.exists(MANUAL) else {}
    efiled = csv_receipts()
    out, todo, stats = [], [], collections.Counter()
    for filer, els in picks().items():
        r0 = next(iter(els.values()))
        # TO DATE runs across the whole campaign (Janet Stevens: primary $6,255.16 to date, general $7,555.16 with
        # the same unitemized and in-kind lines), so the LAST report says it all: the general's, else the primary's.
        last = els.get("general") or els["primary"]
        if not last["isPaperFile"]:
            # E-filed: the receipts themselves, every election period (the e-filed summaries' "campaign to date"
            # does not reconcile with them, Peter Bixby 2016).
            total = sum(efiled.get((filer, el), 0.0) for el in ("primary", "general"))
            stats["efiled"] += 1
        else:
            v = manual.get(last["filerReportGuid"])
            stats["paper read" if v else "paper unread"] += 1
            # less the carried-over surplus — unless the filer left it out of the total (total < G)
            total = None if v is None else v["total"] - v.get("surplus", 0) if v["total"] >= v.get("surplus", 0) else v["total"]
            if v is None:
                pdf = pdf_of(last)
                if pdf:
                    todo.append((last, "general" if last is els.get("general") else "primary", pdf))
        out.append({"name": r0["filerName"], "chamber": CHAMBER[r0["officeName"]], "contributions": None if total is None else round(total, 2), "report": last["reportName"]})
    print(f"NH 2016: {len(out)} legislative filers, {sum(1 for o in out if o['contributions'] is not None)} with a total; reports {dict(stats)}")
    if sheets:
        make_sheets(todo)
        return
    body = {"state": "NH", "cycle": 2016, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": "12/31/2016", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, "NH-2016.json"), "w"), indent=1)


def make_sheets(todo):
    """The summary box (receipts rows A–G and the total, both columns) of each unread scan, 6 to a sheet."""
    from PIL import Image, ImageDraw
    d = os.path.join(CACHE, "sheets")
    os.makedirs(d, exist_ok=True)
    index, crops = [], []
    for r, el, pdf in todo:
        n = len(index) + 1
        base = os.path.join(d, f"c{n}")
        subprocess.run(["pdftoppm", "-r", "80", "-f", "1", "-l", "1", "-png", "-singlefile", pdf, base], capture_output=True)
        if not os.path.exists(base + ".png"):
            continue
        im = Image.open(base + ".png").convert("RGB")
        W, Hh = im.size
        c = im.crop((int(0.05 * W), int(0.12 * Hh), int(0.97 * W), int(0.63 * Hh)))
        cap = Image.new("RGB", (c.size[0], c.size[1] + 18), "white")
        cap.paste(c, (0, 18))
        ImageDraw.Draw(cap).text((4, 3), f"#{n} {r['filerName']} {el} {r['reportName'][:10]}", fill="red")
        cap.save(base + ".png")
        crops.append(cap)
        index.append({"n": n, "guid": r["filerReportGuid"], "filer": r["filerName"], "election": el, "report": r["reportName"]})
    for i in range(0, len(crops), 6):
        g = crops[i:i + 6]
        w, h = max(x.size[0] for x in g), max(x.size[1] for x in g)
        sh = Image.new("RGB", (w * 2, h * ((len(g) + 1) // 2)), "white")
        for j, x in enumerate(g):
            sh.paste(x, ((j % 2) * w, (j // 2) * h))
        sh.save(os.path.join(d, f"sheet{i // 6 + 1:03d}.png"))
    json.dump(index, open(os.path.join(d, "index.json"), "w"), indent=1)
    print(f"{len(index)} scans on {(len(crops) + 5) // 6} sheets in {d}")


if __name__ == "__main__":
    main("--sheets" in sys.argv)
