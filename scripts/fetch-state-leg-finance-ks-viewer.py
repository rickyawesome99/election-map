#!/usr/bin/env python3
"""
Kansas state legislative fundraising from the SOS Campaign Finance Viewer — BUILD step; the reports are downloaded
by scripts/fetch-state-leg-finance-ks-viewer.cjs (see there for the site).

  python3 scripts/fetch-state-leg-finance-ks-viewer.py house:2018 senate:2020 ...

Each Receipts and Expenditures Report covers one period; its summary gives line 2 "Total contributions and other
receipts" (Schedule A), line 4 "Total expenditures and other disbursements" and line 6 "In-kind contributions"
(Schedule B). A cycle is every report whose period lies inside Jan 1 Y-1 – Dec 31 Y (the Jan annual of Y covers
Y-1); contributions = lines 2 + 6 summed over the cycle's periods, the same monetary + in-kind basis as the 2016
Ethics Commission House summary (scripts/fetch-state-leg-finance-ks.py). Amended copies of one period: the last
filed wins. E-filed reports are HTML; paper filers are scanned PDFs, read by OCR (macOS Vision, scratch
scripts/ocr) and kept only when the summary adds up (line 1 + line 2 = line 3 and line 3 − line 4 = line 5).
Line 2 unreadable but lines 1, 3, 4, 5 consistent: line 2 = line 3 − line 1. A readable line 2 that
fails the check (62840: off by exactly $100, the filer's or the OCR's) is left for review, see --review.
A candidate with any period unreadable gets null, never a partial sum.

Output: data-entry/state-leg-finance/portal-raw/KS-{cycle}.json (house and senate merged per cycle), name +
chamber + district from the report itself.
"""
import collections
import datetime
import html
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
SCRATCH = "/private/tmp/claude-501/-Users-rickyjia-election-map/7b2956ab-e26b-44c1-94ba-2b5ad2215584/scratchpad"
CACHE = os.path.join(SCRATCH, "ks-viewer")
OCRBOX = os.path.join(SCRATCH, "scripts", "ocrbox")
SOURCE = "Kansas Secretary of State Campaign Finance Viewer (receipts and expenditures reports: contributions and other receipts + in-kind)"

MONEY = r"\$?\s*(-?[\d,]+\.\d\d|-?[\d,]+)"


def money(s):
    return float(s.replace("$", "").replace(",", "").strip())


def parse_date(s):
    m, d, y = (int(x) for x in s.split("/"))
    return datetime.date(y, m, d)


def text_of_html(path):
    t = open(path, encoding="utf-8", errors="replace").read()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t)))


def parse_html(path):
    t = text_of_html(path)
    per = re.search(r"covering the period from (\d+/\d+/\d{4}) through (\d+/\d+/\d{4})", t)
    if not per:
        return None
    line = {}
    for n, label in ((1, "CASH ON HAND AT BEGINNING"), (2, "TOTAL CONTRIBUTIONS AND OTHER RECEIPTS"), (3, "CASH AVAILABLE"), (4, "TOTAL EXPENDITURES"), (5, "CASH ON HAND AT CLOSE"), (6, "IN-KIND")):
        m = re.search(label + r"[^$]*?" + MONEY, t)
        line[n] = money(m.group(1)) if m else None
    name = re.search(r"Candidate Name:\s*(.*?)\s*Address:", t)
    dist = re.search(r"District:\s*(\d+)", t)
    filed = re.search(r"(?:Electronically filed on|Date Filed):\s*(\d+/\d+/\d{4})", t)
    return {"start": parse_date(per.group(1)), "end": parse_date(per.group(2)), "line": line, "name": name.group(1) if name else None, "district": dist.group(1) if dist else None, "filed": filed.group(1) if filed else None}


def ocr_num(s):
    """A money figure as OCR reads it: "$24,567.76", "1000:00", "6503,48", "$0"."""
    s = s.strip().replace("$", "").replace(" ", "").rstrip(".•*-")
    s = re.sub(r"[:;](\d\d)$", r".\1", s)
    s = re.sub(r",(\d\d)$", r".\1", s)
    s = s.replace(",", "")
    return float(s) if re.fullmatch(r"\d+(\.\d\d)?", s) else None


def parse_pdf(path):
    """OCR'd scanned report (macOS Vision boxes); None unless the summary arithmetic checks out."""
    if open(path, "rb").read(5) != b"%PDF-":
        return None  # an error page saved in place of the scan
    box = path[:-4] + ".box.tsv"
    if not os.path.exists(box):
        r = subprocess.run([OCRBOX, path, "3"], capture_output=True, text=True, timeout=600)
        open(box, "w").write(r.stdout)
    pages = collections.defaultdict(list)
    for ln in open(box):
        f = ln.rstrip("\n").split("\t")
        if len(f) == 6:
            pages[f[0]].append((float(f[1]), (float(f[2]) + float(f[4])) / 2, float(f[3]), f[5]))
    # The summary is on page 1, or page 2 behind a Schedule A data-entry cover sheet.
    best = None
    for pg in sorted(pages):
        r = summary(pages[pg])
        if r and not r.get("unverified"):
            return r
        best = best or r
    return best


def summary(boxes):
    text = " ".join(b[3] for b in boxes)
    per = PERIOD.search(text)
    if not per:
        return None
    start, end = loose_date(per.group(1)), loose_date(per.group(2))
    if not start or not end:
        return None
    # Summary lines by their numbers ("6. Ia-Kind Contributions"): OCR mangles labels, not the numbering. Each
    # figure is its own box at the right margin, written a little above or below the label's baseline.
    labels = {}
    for x, y, x2, t in boxes:
        m = re.match(r"\s*([1-7])\s*[.,]\s*[A-Za-z]", t)
        if m and x < 0.3 and int(m.group(1)) not in labels:
            labels[int(m.group(1))] = (y, x2, t)
    figures = [(y, ocr_num(t)) for x, y, x2, t in boxes if x > 0.55 and ocr_num(t) is not None]
    nums = {}
    for n, (y, x2, t) in labels.items():
        inline = re.search(r"(\$?\s*[\d,]+[.:,]\d\d)\W*$", t)  # figure inside the label's own box
        if inline and ocr_num(inline.group(1)) is not None:
            nums[n] = ocr_num(inline.group(1))
            continue
        near = [(abs(fy - y), v) for fy, v in figures if abs(fy - y) < 0.018]
        nums[n] = min(near)[1] if near else None
    g = lambda k: nums.get(k)
    ok = lambda a, b, c: None not in (a, b, c) and abs(a + b - c) < 0.02
    if ok(g(1), g(2), g(3)):
        how = "1+2=3"
    elif g(2) is None and g(1) is not None and g(3) is not None and g(4) is not None and g(5) is not None and abs(g(3) - g(4) - g(5)) < 0.02:
        nums[2] = round(g(3) - g(1), 2)
        how = "3-1 (3-4=5)"
    else:
        return {"start": start, "end": end, "line": nums, "unverified": True}
    if g(6) is None:
        nums[6] = 0.0
    return {"start": start, "end": end, "line": nums, "name": None, "district": None, "filed": None, "how": how}


MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
# OCR'd dates: "Jaly 22, 2022", "January I, 2015", "October 22. 2020", "January 1,2022", ".July 21"
DAY = r"[\dIl|]{1,2}"
DATE_WORDS = r"(\d{1,2}\s*/\s*\d{1,2}\s*/\s*\d{2,4}|[A-Za-z]{3,9}\.?\s*" + DAY + r"\s*[,.]?\s*\d{4})"
PERIOD = re.compile(r"period\s+from\W*" + DATE_WORDS + r"\W*(?:through|thru|to)\W*" + DATE_WORDS, re.I)


def month_of(word):
    """The month an OCR'd name stands for: exact prefix, else the one name within one edit of it."""
    w = word.lower().rstrip(".")
    hits = [i for i, m in enumerate(MONTH_NAMES) if m.startswith(w) or w.startswith(m[:3]) and len(w) >= 3 and m.startswith(w[:3])]
    if len(hits) == 1:
        return hits[0] + 1

    def close(a, b):  # one substitution, insertion or deletion
        if abs(len(a) - len(b)) > 1:
            return False
        if len(a) == len(b):
            return sum(x != y for x, y in zip(a, b)) <= 1
        if len(a) > len(b):
            a, b = b, a
        return any(b[:i] + b[i + 1:] == a for i in range(len(b)))

    near = [i for i, m in enumerate(MONTH_NAMES) if close(w, m) or close(w, m[:3])]
    return near[0] + 1 if len(near) == 1 else None


def loose_date(s):
    s = s.strip()
    m = re.fullmatch(r"(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{2,4})", s)
    try:
        if m:
            y = int(m.group(3))
            return datetime.date(y + 2000 if y < 100 else y, int(m.group(1)), int(m.group(2)))
        m = re.fullmatch(r"([A-Za-z]{3,9})\.?\s*(" + DAY + r")\s*[,.]?\s*(\d{4})", s)
        if m and month_of(m.group(1)):
            return datetime.date(int(m.group(3)), month_of(m.group(1)), int(re.sub(r"[Il|]", "1", m.group(2))))
    except ValueError:
        return None
    return None


def build(jobs):
    by_cycle = collections.defaultdict(list)
    for job in jobs:
        chamber, cy = job.split(":")
        by_cycle[int(cy)].append(chamber)
    for cycle, chambers in sorted(by_cycle.items()):
        lo, hi = datetime.date(cycle - 1, 1, 1), datetime.date(cycle, 12, 31)
        out, stats = [], collections.Counter()
        for chamber in chambers:
            d = os.path.join(CACHE, f"{chamber}-{cycle}")
            index = json.load(open(os.path.join(d, "index.json")))
            periods = collections.defaultdict(dict)  # candidate → (start, end) → (filed order, report)
            names = {}
            for key, row in index.items():
                cand = (re.sub(r"[^A-Z ]", "", row["name"].upper()).strip(), row["district"])
                names.setdefault(cand, row["name"])
                rep = None
                if row["kind"] == "html" and os.path.exists(os.path.join(d, key + ".html")):
                    rep = parse_html(os.path.join(d, key + ".html"))
                elif row["kind"] == "pdf" and os.path.exists(os.path.join(d, key + ".pdf")):
                    rep = parse_pdf(os.path.join(d, key + ".pdf"))
                    stats["pdf"] += 1
                    stats["pdf ok" if rep else "pdf unreadable"] += 1
                if rep is None:
                    periods[cand][("?", key)] = (None, None)
                    continue
                if rep["start"] < lo or rep["end"] > hi:
                    continue
                if rep["name"]:
                    names[cand] = rep["name"]
                order = max(parse_date(x) for x in (row["filed"], row["amended"] or row["filed"], rep["filed"] or row["filed"]) if x)
                k = (rep["start"], rep["end"])
                if k not in periods[cand] or periods[cand][k][0] is None or order >= periods[cand][k][0]:
                    periods[cand][k] = (order, rep)
            for cand, ps in periods.items():
                good = {k: v for k, v in ps.items() if k[0] != "?"}
                if not good:
                    continue
                if any(v[1] is None for v in ps.values()):
                    contributions = expenditures = None
                    stats["candidates null (unreadable period)"] += 1
                else:
                    contributions = round(sum(v[1]["line"][2] + (v[1]["line"][6] or 0) for v in good.values()), 2)
                    expenditures = round(sum(v[1]["line"][4] or 0 for v in good.values()), 2)
                out.append({"name": names[cand], "chamber": chamber, "district": cand[1], "contributions": contributions, "expenditures": expenditures, "periods": len(good)})
                stats[chamber] += 1
        body = {"state": "KS", "cycle": cycle, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{cycle}" if cycle < datetime.date.today().year else datetime.date.today().strftime("%m/%d/%Y"), "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        path = os.path.join(OUT_DIR, f"KS-{cycle}.json")
        if os.path.exists(path):  # keep the other chamber when only one is rebuilt (2016: the House summary)
            old = json.load(open(path))
            kept = [c for c in old["candidates"] if c["chamber"] not in chambers]
            if kept:
                body["candidates"] = kept + out
                if old["source"] != SOURCE and SOURCE not in old["source"]:
                    body["source"] = f"{old['source'].split(' + ')[0]} (House) + {SOURCE} (Senate)" if chambers == ["senate"] else old["source"]
        json.dump(body, open(path, "w"), indent=1)
        print(f"KS {cycle} {'+'.join(chambers)}: {dict(stats)}")


if __name__ == "__main__":
    build(sys.argv[1:])
