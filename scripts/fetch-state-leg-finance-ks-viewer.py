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
MANUAL = os.path.join(ROOT, "data-entry", "state-leg-finance", "manual", "KS.json")
OCR_CACHE = os.path.join(SCRATCH, "ks-ocr")
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
    # OCR is cached by the file's SHA-1, so a refetched copy of the same scan is not read again
    os.makedirs(OCR_CACHE, exist_ok=True)
    box = os.path.join(OCR_CACHE, sha1(path) + ".boxall.tsv")
    if not os.path.exists(box):
        r = subprocess.run([OCRBOX, path, "60"], capture_output=True, text=True, timeout=1800)
        open(box, "w").write(r.stdout)
    pages = collections.defaultdict(list)
    for ln in open(box):
        f = ln.rstrip("\n").split("\t")
        if len(f) == 6:
            pages[f[0]].append((float(f[1]), (float(f[2]) + float(f[4])) / 2, float(f[3]), f[5]))
    # The summary is usually page 1 (page 2 behind a Schedule A data-entry cover sheet, anywhere in a bundle).
    # A file with no page bearing the form's printed summary wording is an attachment filed as its own row
    # (schedules, invoices, letters): skipped, not an unread report.
    marked = [pg for pg in pages if re.search(r"summary\s*\(?\s*covering|cash\s*on\s*hand\s*at\s*beg", " ".join(b[3] for b in pages[pg]), re.I)]
    if not marked:
        return {"skip": True}
    best = None
    for pg in sorted(marked):
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
        m = re.match(r"\s*([1-7Il|])\s*[.,]\s*[A-Za-z]", t)  # "I. Cash on band": OCR's 1 is often I
        n = 1 if m and m.group(1) in "Il|" else int(m.group(1)) if m else None
        if m and x < 0.3 and n not in labels:
            labels[n] = (y, x2, t)
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
    elif None not in (g(1), g(2), g(4), g(5)) and abs(g(1) + g(2) - g(4) - g(5)) < 0.02:
        how = "1+2=4+5"  # line 3 misread
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


def sha1(path):
    import hashlib
    return hashlib.sha1(open(path, "rb").read()).hexdigest()


def build(jobs, sheets=False):
    manual = json.load(open(MANUAL))["reports"] if os.path.exists(MANUAL) else {}
    review = []
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
            pending = collections.defaultdict(list)  # candidate → unverified scans
            names = {}
            for key, row in index.items():
                # the grid spells one filer several ways ("ABEGG JAELYNN", "ABEGG, JAELYNN", "ABEGG JAELYNN E"):
                # surname + first initial + district
                t = re.sub(r"[^A-Z ]", " ", row["name"].upper()).split()
                cand = (t[0] if t else "", t[1][:1] if len(t) > 1 else "", row["district"])
                names.setdefault(cand, row["name"])
                rep = None
                if row["kind"] == "html" and os.path.exists(os.path.join(d, key + ".html")):
                    rep = parse_html(os.path.join(d, key + ".html"))
                elif row["kind"] == "pdf" and os.path.exists(os.path.join(d, key + ".pdf")):
                    pdf = os.path.join(d, key + ".pdf")
                    h = sha1(pdf)
                    if h in manual and manual[h].get("skip"):
                        stats["pdf attachment (read by eye)"] += 1
                        continue
                    if h in manual:
                        m = manual[h]
                        rep = {"start": datetime.date.fromisoformat(m["start"]), "end": datetime.date.fromisoformat(m["end"]), "line": {2: m["line2"], 4: m.get("line4"), 6: m.get("line6") or 0.0}, "name": None, "filed": None}
                        stats["pdf read by eye"] += 1
                    else:
                        rep = parse_pdf(pdf)
                        if rep and rep.get("skip"):
                            stats["pdf attachment (no summary page)"] += 1
                            continue
                        if rep and rep.get("unverified"):
                            pending[cand].append((key, row, rep, pdf, h))
                            continue
                        stats["pdf ocr ok" if rep else "pdf unread"] += 1
                        if rep is None:
                            review.append((cycle, chamber, row["name"], row["district"], row["filed"], pdf, h))
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
            # Unverified scans: cash carries from one report to the next (line 1 = the previous report's line 5),
            # so a missing line 1 or 5 can be checked against the candidate's other reports.
            for cand, items in pending.items():
                ln = [r["line"] for _, _, r, _, _ in items] + [v[1]["line"] for v in periods[cand].values() if v[1]]
                opens = {round(x[1], 2) for x in ln if x.get(1) is not None}
                closes = {round(x[5], 2) for x in ln if x.get(5) is not None}
                for key, row, rep, pdf, h in items:
                    L = rep["line"]
                    good = False
                    if L.get(2) is not None and L.get(3) is not None and L.get(1) is None and round(L[3] - L[2], 2) in closes - {round(L.get(5) or -1, 2)}:
                        good = L.get(4) is None or L.get(5) is None or abs(L[3] - L[4] - L[5]) < 0.02
                    elif None not in (L.get(1), L.get(2), L.get(4)) and L.get(5) is None and round(L[1] + L[2] - L[4], 2) in opens - {round(L[1], 2)}:
                        good = True
                    stats["pdf ocr ok (continuity)" if good else "pdf unread"] += 1
                    if not good:
                        review.append((cycle, chamber, row["name"], row["district"], row["filed"], pdf, h))
                        periods[cand][("?", key)] = (None, None)
                        continue
                    if L.get(6) is None:
                        L[6] = 0.0
                    if rep["start"] < lo or rep["end"] > hi:
                        continue
                    order = max(parse_date(x) for x in (row["filed"], row["amended"] or row["filed"]) if x)
                    k = (rep["start"], rep["end"])
                    if k not in periods[cand] or periods[cand][k][0] is None or order >= periods[cand][k][0]:
                        periods[cand][k] = (order, rep)
            for cand, ps in periods.items():
                good = {k: v for k, v in ps.items() if k[0] != "?"}
                # Overlapping periods are one report filed twice under different covers (Vicki Schmidt's 2015:
                # Aug 4–Dec 31 and Jan 1–Dec 31): keep the longer.
                keep = {}
                for k in sorted(good, key=lambda k: (k[1] - k[0]), reverse=True):
                    if all(k[1] < j[0] or k[0] > j[1] for j in keep):
                        keep[k] = good[k]
                    else:
                        stats["overlapping period dropped"] += 1
                good = keep
                if not good:
                    continue
                if any(v[1] is None for v in ps.values()):
                    contributions = expenditures = None
                    stats["candidates null (unreadable period)"] += 1
                else:
                    contributions = round(sum(v[1]["line"][2] + (v[1]["line"].get(6) or 0) for v in good.values()), 2)
                    expenditures = round(sum(v[1]["line"].get(4) or 0 for v in good.values()), 2)
                out.append({"name": names[cand], "chamber": chamber, "district": cand[2], "contributions": contributions, "expenditures": expenditures, "periods": len(good)})
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
                    body["source"] = f"{old['source']} (House) + {SOURCE} (Senate)" if chambers == ["senate"] else old["source"]
        if not sheets:
            json.dump(body, open(path, "w"), indent=1)
        print(f"KS {cycle} {'+'.join(chambers)}: {dict(stats)}")
    if sheets:
        make_sheets(review)


def make_sheets(review):
    """The top of page 1 (name, office, period, summary lines 1–7) of every scan the OCR could not check, numbered,
    four to a sheet, for reading into data-entry/state-leg-finance/manual/KS.json."""
    from PIL import Image, ImageDraw
    d = os.path.join(SCRATCH, "ks-sheets")
    os.makedirs(d, exist_ok=True)
    seen, index, crops = set(), [], []
    for cycle, chamber, name, district, filed, pdf, h in review:
        if h in seen:
            continue
        seen.add(h)
        n = len(index) + 1
        base = os.path.join(d, f"c{n}")
        # the page holding the summary: the one whose OCR found "Summary", else page 1
        pg = 1
        box = os.path.join(OCR_CACHE, h + ".boxall.tsv")
        if os.path.exists(box):
            for ln in open(box):
                f = ln.split("\t")
                if len(f) == 6 and re.search(r"summary", f[5], re.I):
                    pg = int(f[0])
                    break
        subprocess.run(["pdftoppm", "-r", "75", "-f", str(pg), "-l", str(pg), "-png", "-singlefile", pdf, base], capture_output=True)
        if not os.path.exists(base + ".png"):
            continue
        im = Image.open(base + ".png").convert("RGB")
        W, H = im.size
        c = im.crop((0, int(0.12 * H), W, int(0.72 * H)))
        cap = Image.new("RGB", (c.size[0], c.size[1] + 18), "white")
        cap.paste(c, (0, 18))
        ImageDraw.Draw(cap).text((4, 3), f"#{n}  {name}  {chamber}-{district}  filed {filed}", fill="red")
        cap.save(base + ".png")
        crops.append(cap)
        index.append({"n": n, "sha1": h, "name": name, "seat": f"{chamber}-{district}", "filed": filed, "cycle": cycle})
    for i in range(0, len(crops), 4):
        g = crops[i:i + 4]
        w, hh = max(x.size[0] for x in g), max(x.size[1] for x in g)
        sh = Image.new("RGB", (w * 2, hh * ((len(g) + 1) // 2)), "white")
        for j, x in enumerate(g):
            sh.paste(x, ((j % 2) * w, (j // 2) * hh))
        sh.save(os.path.join(d, f"sheet{i // 4 + 1:03d}.png"))
    json.dump(index, open(os.path.join(d, "index.json"), "w"), indent=1)
    print(f"{len(index)} scans on {(len(crops) + 3) // 4} sheets in {d}")


def import_reads(jsonl, index_json):
    """Fold a batch of by-eye transcriptions (one JSON line per crop: n, period_start, period_end, line1–line6,
    note) into the manual file. A report is kept when its own arithmetic holds (1+2=3, 1+2=4+5, or 3−4=5 with
    line 2 present); an all-blank crop the reader called not a summary page is an attachment; the rest is
    printed for a second look."""
    manual = json.load(open(MANUAL)) if os.path.exists(MANUAL) else {"_about": "Kansas scanned reports read by eye (summary lines 1-6 and the period), keyed by the SHA-1 of the PDF. skip = an attachment with no summary page. Built by scripts/fetch-state-leg-finance-ks-viewer.py --import.", "reports": {}}
    index = {i["n"]: i for i in json.load(open(index_json))}
    near = lambda a, b: abs(a - b) < 0.02
    kept = skipped = 0
    for ln in open(jsonl):
        r = json.loads(ln)
        it = index[r["n"]]
        L = {k: r.get(f"line{k}") for k in range(1, 7)}
        if all(v is None for v in L.values()):
            if re.search(r"not a summary|schedule|invoice|letter|notice|attachment", r.get("note") or "", re.I):
                manual["reports"][it["sha1"]] = {"skip": True, "name": it["name"], "note": r.get("note")}
                skipped += 1
            else:
                print("unread", r["n"], it["name"], r.get("note"))
            continue
        ok = (None not in (L[1], L[2], L[3]) and near(L[1] + L[2], L[3])) or \
             (None not in (L[1], L[2], L[4], L[5]) and near(L[1] + L[2], L[4] + L[5])) or \
             (None not in (L[2], L[3], L[4], L[5]) and near(L[3] - L[4], L[5]))
        try:
            datetime.date.fromisoformat(r["period_start"]); datetime.date.fromisoformat(r["period_end"])
        except (TypeError, ValueError):
            ok = False
        if not ok:
            print("check", r["n"], it["name"], it["seat"], L, r.get("period_start"), r.get("period_end"), r.get("note"))
            continue
        manual["reports"][it["sha1"]] = {"start": r["period_start"], "end": r["period_end"], "line1": L[1], "line2": L[2], "line3": L[3], "line4": L[4], "line5": L[5], "line6": L[6] or 0.0, "name": it["name"], "seat": it["seat"]}
        kept += 1
    os.makedirs(os.path.dirname(MANUAL), exist_ok=True)
    json.dump(manual, open(MANUAL, "w"), indent=1)
    print(f"kept {kept}, attachments {skipped}; manual file now {len(manual['reports'])} reports")


if __name__ == "__main__":
    if sys.argv[1] == "--import":
        import_reads(sys.argv[2], sys.argv[3])
        sys.exit()
    build([a for a in sys.argv[1:] if ":" in a], "--sheets" in sys.argv)
