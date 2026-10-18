#!/usr/bin/env python3
"""
Mississippi state legislative fundraising from the Secretary of State's campaign finance portal — BUILD step; the
reports are downloaded by scripts/fetch-state-leg-finance-ms.cjs (see there for the site).

  python3 scripts/fetch-state-leg-finance-ms.py [2019 2023]
  python3 scripts/fetch-state-leg-finance-ms.py --review [2019 2023]     list reports the OCR could not verify
  python3 scripts/fetch-state-leg-finance-ms.py --sheets [2019 2023]     the same, as numbered table crops (scratch ms/sheets/)

Legislative candidates file scanned paper forms, mostly handwritten. The summary page has one table per fund
(contributions accumulated before / after Jan 1, 2018), each with a "Jan. 1, YYYY cash on hand balance", rows
"Total amt of contributions" and "Total amt of disbursements" in four columns (Itemized, Non-Itemized, This
Period, Calendar Year-to-Date) and a closing "Cash on hand balance". A report is read with macOS Vision (scratch
scripts/ocrbox: text boxes with coordinates); each number is placed by its row label and column header, and a
table counts only when its own arithmetic holds: Jan 1 balance + YTD contributions − YTD disbursements = closing
balance (or, for a contributions row, itemized + non-itemized = this period = year-to-date on an annual report).
Reports that fail go to --review and are read by eye into data-entry/state-leg-finance/manual/MS.json
({FilingId: calendar-YTD contributions, summed over the fund tables}).

A cycle is the four calendar years up to the election (the term; Louisiana's rule too): for each year, the
calendar-YTD contributions of the report that closes it (the annual report or the January periodic report filed
the next year; the last amendment wins), or of the last report filed in the year when nothing closes it. A
candidate with any year unread gets null, never a partial sum.

Output: data-entry/state-leg-finance/portal-raw/MS-{year}.json (name, party, chamber, district from the search).
"""
import collections
import datetime
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
MANUAL = os.path.join(ROOT, "data-entry", "state-leg-finance", "manual", "MS.json")
SCRATCH = "/private/tmp/claude-501/-Users-rickyjia-election-map/7b2956ab-e26b-44c1-94ba-2b5ad2215584/scratchpad"
CACHE = os.path.join(SCRATCH, "ms")
OCRBOX = os.path.join(SCRATCH, "scripts", "ocrbox")
SOURCE = "Mississippi Secretary of State campaign finance reports (calendar year-to-date contributions, four-year cycle)"


def num(s):
    """A handwritten amount as Vision reads it: "$ 14,950.", "$47702.20", "23,250.00", "Ø", "-0-", "0"."""
    t = s.strip().replace("$", "").replace(" ", "").strip(".-•*")
    if t in ("Ø", "ø", "0", "O", "o", "◯", "○", "D", "-0-", "0-", "-0", "Φ", "φ", "θ", "none", "None", "NONE", "N/A", "n/a", "00", "0.00", "Q", "-", "—", "–"):
        return 0.0
    t = re.sub(r"[:;](\d\d)$", r".\1", t)
    t = re.sub(r",(\d\d)$", r".\1", t)
    t = re.sub(r"(\d)\.(\d{3})(\.\d\d)?$", lambda m: m.group(1) + m.group(2) + (m.group(3) or ""), t)  # 14.950.00
    t = t.replace(",", "")
    return float(t) if re.fullmatch(r"\d+(\.\d{1,2})?", t) else None


def boxes_of(pdf):
    box = pdf[:-4] + ".box.tsv"
    if not os.path.exists(box):
        r = subprocess.run([OCRBOX, pdf, "3"], capture_output=True, text=True, timeout=600)
        open(box, "w").write(r.stdout)
    pages = collections.defaultdict(list)
    for ln in open(box):
        f = ln.rstrip("\n").split("\t")
        if len(f) == 6:
            x1, y1, x2, y2 = map(float, f[1:5])
            pages[int(f[0])].append({"x1": x1, "x2": x2, "xc": (x1 + x2) / 2, "y": (y1 + y2) / 2, "h": y2 - y1, "t": f[5]})
    return pages


def tables(page):
    """Every fund table on a page: {jan1, contrib: [it, non, period, ytd], disb: [...], close}."""
    rows = lambda pat: sorted((b for b in page if re.search(pat, b["t"], re.I)), key=lambda b: -b["y"])
    contrib = rows(r"total\s*amt\.?\s*of\s*contrib|total\s*amount\s*of\s*contrib")
    out = []
    for c in contrib:
        # this table's header row (the nearest "Calendar Year-to-Date" above the row) gives the column x's
        heads = [b for b in page if b["y"] > c["y"] and b["y"] - c["y"] < 0.06]
        col = {}
        for name, pat in (("it", r"^itemized"), ("non", r"non.?itemized"), ("per", r"this\s*period"), ("ytd", r"year.?to.?date|calendar")):
            hs = [b for b in heads if re.search(pat, b["t"], re.I)]
            if hs:
                col[name] = min(hs, key=lambda b: b["y"] - c["y"])["xc"]
        if "ytd" not in col:
            continue

        def values(label):
            band = [b for b in page if abs(b["y"] - label["y"]) < max(0.012, label["h"]) and b["x1"] > label["x2"] - 0.01 and num(b["t"]) is not None]
            got = {}
            for b in band:
                k = min(col, key=lambda n: abs(col[n] - b["xc"]))
                if abs(col[k] - b["xc"]) < 0.09 and k not in got:
                    got[k] = num(b["t"])
            return got

        cv = values(c)
        disb = [b for b in rows(r"total\s*am(ou)?n?t\.?\s*of\s*disb") if 0 < c["y"] - b["y"] < 0.08]
        dv = values(disb[0]) if disb else {}
        jan = [b for b in rows(r"jan\.?\s*1.*cash\s*on\s*hand") if 0 < b["y"] - c["y"] < 0.09]
        close = [b for b in rows(r"cash\s*on\s*hand\s*bal") if 0 < c["y"] - b["y"] < 0.12 and not re.search(r"jan", b["t"], re.I)]

        def far_right(label):
            if not label:
                return None
            band = [b for b in page if abs(b["y"] - label[0]["y"]) < 0.014 and b["x1"] > 0.6 and num(b["t"]) is not None]
            return num(max(band, key=lambda b: b["x1"])["t"]) if band else None

        out.append({"jan1": far_right(jan), "contrib": cv, "disb": dv, "close": far_right(close), "y": c["y"]})
    return out


def read_report(pdf):
    """→ (calendar-YTD contributions summed over the fund tables, how) or (None, why)."""
    if open(pdf, "rb").read(5) != b"%PDF-":
        return None, "not a pdf"
    pages = boxes_of(pdf)
    found = [t for p in sorted(pages) for t in tables(pages[p])]
    if not found:
        return None, "no table"
    total, hows = 0.0, []
    for t in found:
        c, d = t["contrib"], t["disb"]
        ytd = c.get("ytd")
        if ytd is not None and t["jan1"] is not None and t["close"] is not None and d.get("ytd") is not None and abs(t["jan1"] + ytd - d["ytd"] - t["close"]) < 1.0:
            hows.append("balance")
        elif ytd is not None and c.get("per") is not None and c.get("it") is not None and c.get("non") is not None and abs(c["it"] + c["non"] - c["per"]) < 0.02 and ytd >= c["per"] - 0.02 and (ytd > 0 or c["per"] == 0):
            hows.append("columns")
        elif ytd == 0 and all(v == 0 for v in c.values()) and t["jan1"] is not None and t["close"] is not None and d.get("ytd") is not None and abs(t["jan1"] - d["ytd"] - t["close"]) < 1.0:
            hows.append("zero")
        else:
            return None, f"unverified {t}"
        total += ytd
    return round(total, 2), "+".join(hows)


def crops(pdf, out_png, label):
    """Every page that carries a totals row (contributions, disbursements or cash on hand), whole, stacked under a
    caption, for reading by eye. Whole pages: cutting at the printed labels lost the post-2018 table whenever it
    ran onto the next page."""
    from PIL import Image, ImageDraw
    pages = boxes_of(pdf)
    parts = []
    for pg in sorted(pages):
        if not any(re.search(r"total\s*am(ou)?n?t\.?\s*of\s*(contrib|disb)|cash\s*on\s*hand|year.?to.?date", b["t"], re.I) for b in pages[pg]):
            continue
        base = out_png[:-4] + f"-p{pg}"
        subprocess.run(["pdftoppm", "-r", "90", "-f", str(pg), "-l", str(pg), "-png", "-singlefile", pdf, base], capture_output=True)
        if os.path.exists(base + ".png"):
            parts.append(Image.open(base + ".png").convert("RGB"))
            os.remove(base + ".png")
    if not parts:
        return False
    W = max(p.size[0] for p in parts)
    cap = 34
    sheet = Image.new("RGB", (W, cap + sum(p.size[1] for p in parts)), "white")
    ImageDraw.Draw(sheet).text((8, 8), label, fill="red")
    y = cap
    for p in parts:
        sheet.paste(p, (0, y))
        y += p.size[1]
    sheet.save(out_png)
    return True


MONTHS_FULL = {m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"])}


def read_efiled(pdf):
    """A typed e-filed "Report of Contributions and Disbursements": (report date, kind, period contributions over
    the Current and Previous funds), or None for a scanned report."""
    t = subprocess.run(["pdftotext", "-layout", "-l", "2", pdf, "-"], capture_output=True).stdout.decode("utf-8", "replace")
    if "Contributions and Disbursements Summary" not in t:
        return None
    d = re.search(r"Report Date:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*(.*)", t)
    if not d or d.group(1).lower() not in MONTHS_FULL:
        return None
    total = 0.0
    for sec in ("Previous Contributions", "Current Contributions"):
        m = re.search(sec + r"\s*\n[^\n]*Period Total[^\n]*\n\s*([^\n]+)", t)
        if m:
            amts = re.findall(r"\(?-?\$[\d,]+(?:\.\d\d)?\)?", m.group(1))
            if len(amts) >= 4:
                a = amts[3]
                v = float(re.sub(r"[^\d.]", "", a))
                total += -v if "(" in a or "-" in a else v
    return datetime.date(int(d.group(3)), MONTHS_FULL[d.group(1).lower()], int(d.group(2))), d.group(4).strip(), total


def efiled_years(fs, cycle):
    """{year: contributions} for the years of the cycle covered by e-filed reports: each report's Period Total,
    by the year it covers (a January periodic or an annual report covers the year before); amended copies of
    one report date count once, the last filed."""
    reps, absent = {}, set()
    for f in sorted(fs, key=lambda f: f["date"]):
        pdf = os.path.join(CACHE, "pdf", f["id"] + ".pdf")
        if not os.path.exists(pdf):
            # a filing not downloaded: the year it falls in cannot be summed (its year by filing date, a Jan–Mar
            # filing possibly the year before)
            absent.update({f["date"].year, f["date"].year - 1} if f["date"].month <= 3 else {f["date"].year})
            continue
        r = read_efiled(pdf)
        if r is None:
            continue
        rdate, kind, v = r
        reps[(rdate, kind.split()[0] if kind else "")] = (rdate, kind, v)  # later filings replace amendments
    out = collections.defaultdict(float)
    for rdate, kind, v in reps.values():
        y = rdate.year - 1 if rdate.month == 1 or re.search(r"annual", kind, re.I) else rdate.year
        if cycle - 3 <= y <= cycle:
            out[y] += v
    return {y: v for y, v in out.items() if y not in absent} | {y: None for y in out if y in absent}


def filings(html):
    out = []
    for row in re.split(r"<tr[\s>]", html, flags=re.I)[1:]:
        fid = re.search(r'data-val="([0-9A-Fa-f-]{36})"', row)
        if not fid:
            continue
        cells = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", c)).replace("&amp;", "&").strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S | re.I)]
        m, d, y = (int(x) for x in cells[0].split("/"))
        out.append({"id": fid.group(1), "date": datetime.date(y, m, d), "title": cells[1]})
    return out


def party_of(html):
    m = re.search(r"<td[^>]*>\s*(Republican|Democrat\w*|Independent|Libertarian|Green|Reform|Constitution|Nonpartisan)\s*</td>", html, re.I)
    return m.group(1) if m else None


def build(years, review=False, sheets=False):
    manual = json.load(open(MANUAL)) if os.path.exists(MANUAL) else {}
    todo = []
    for year in years:
        ents = json.load(open(os.path.join(CACHE, f"{year}-entities.json")))
        out, stats = [], collections.Counter()
        for seat, lst in ents.items():
            for e in lst:
                chamber, district = e.get("seat", seat).split("-")  # name-search hits ("name:House-12:lamar") carry their seat
                html = open(os.path.join(CACHE, "cand", e["EntityId"] + ".html"), encoding="utf-8", errors="replace").read()
                fs = filings(html)
                total, missing = 0.0, []
                # E-filed (typed) summaries: each report's own Period Total, summed by the year it covers
                efiled = efiled_years(fs, year)
                for y in range(year - 3, year + 1):
                    if y in efiled:
                        if efiled[y] is None:
                            missing.append(y)
                            stats["e-filed year with a filing not downloaded"] += 1
                        else:
                            total += efiled[y]
                            stats["e-filed year"] += 1
                        continue
                    closing = [f for f in fs if datetime.date(y + 1, 1, 1) <= f["date"] <= datetime.date(y + 1, 3, 31)]
                    # filed in y after the Jan–Mar window, which belongs to y-1's closing reports
                    in_year = sorted((f for f in fs if f["date"].year == y and f["date"] > datetime.date(y, 3, 31)), key=lambda f: f["date"])
                    pick = sorted(closing, key=lambda f: f["date"]) or in_year[-1:]
                    if not pick:
                        continue  # not a filer that year (not yet a candidate)
                    best = None
                    for f in reversed(pick):  # the last amendment first
                        pdf = os.path.join(CACHE, "pdf", f["id"] + ".pdf")
                        if f["id"] in manual:
                            best = manual[f["id"]]
                            stats["manual"] += 1
                            break
                        if not os.path.exists(pdf):
                            continue
                        v, how = read_report(pdf)
                        if v is not None:
                            best = v
                            stats[how] += 1
                            break
                        todo.append((year, e["EntityName"], seat, y, f["id"], f["title"], how[:200]))
                        stats["unverified"] += 1
                        break
                    if best is None:
                        missing.append(y)
                    else:
                        total += best
                contributions = None if missing else round(total, 2)
                stats["null" if missing else "ok"] += 1
                out.append({"name": e["EntityName"], "party": party_of(html), "chamber": chamber.lower(), "district": district, "contributions": contributions})
        print(f"MS {year}: {dict(stats)}")
        if not review and not sheets:
            body = {"state": "MS", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
            os.makedirs(OUT_DIR, exist_ok=True)
            json.dump(body, open(os.path.join(OUT_DIR, f"MS-{year}.json"), "w"), indent=1)
    if review:
        for t in todo:
            print("\t".join(map(str, t)))
    if sheets:
        # numbered crops, four reports to a sheet, for reading by eye → manual/MS.json (--import)
        from PIL import Image
        d = os.path.join(CACHE, "sheets")
        os.makedirs(d, exist_ok=True)
        index, imgs = [], []
        for t in todo:
            if t[4] in manual:
                continue
            n = len(index) + 1
            png = os.path.join(d, f"r{n}.png")
            if crops(os.path.join(CACHE, "pdf", t[4] + ".pdf"), png, f"#{n}  {t[1]}  {t[2]}  year {t[3]}"):
                index.append({"n": n, "filing": t[4], "candidate": t[1], "seat": t[2], "year": t[3]})
                imgs.append(png)
        for i in range(0, len(imgs), 4):
            group = [Image.open(x) for x in imgs[i:i + 4]]
            W = max(g.size[0] for g in group)
            sheet = Image.new("RGB", (W, sum(g.size[1] + 12 for g in group)), "white")
            y = 0
            for g in group:
                sheet.paste(g, (0, y))
                y += g.size[1] + 12
            sheet.save(os.path.join(d, f"sheet{i // 4 + 1:03d}.png"))
        json.dump(index, open(os.path.join(d, "index.json"), "w"), indent=1)
        print(f"{len(index)} reports on {(len(imgs) + 3) // 4} sheets in {d}")


def import_reads(jsonl, index_json):
    """Fold by-eye transcriptions (one JSON line per report: n, tables [{fund, jan1, contrib_itemized,
    contrib_nonitemized, contrib_period, contrib_ytd, disb_period, disb_ytd, close}], note) into the manual file.
    The report's value = calendar-YTD contributions summed over its fund tables; a table the filer copied into
    both funds (same YTD and closing figures) counts once. A table's YTD is kept when one of the form's own
    identities holds — jan1 + contrib YTD − disb YTD = close; the same with the Jan 1 balance left out (filers
    often leave it blank or drop it from the close); itemized + non-itemized = this period with YTD ≥ it; on an
    annual form, itemized + non-itemized = YTD — or the table is empty of activity (YTD 0). The rest, and every
    report whose reader flagged an ambiguous digit, is printed for a second look."""
    manual = json.load(open(MANUAL)) if os.path.exists(MANUAL) else {}
    index = {i["n"]: i for i in json.load(open(index_json))}
    near = lambda a, b: a is not None and b is not None and abs(a - b) < 1.0
    kept, stats = 0, collections.Counter()
    for ln in open(jsonl):
        r = json.loads(ln)
        it = index[r["n"]]
        ts = [t for t in (r.get("tables") or []) if any(t.get(k) is not None for k in ("contrib_ytd", "contrib_period", "contrib_itemized"))]
        note = r.get("note") or ""
        ok, total, seen = bool(ts) and not re.search(r"ambiguous|illegible|could be|or possibly|unclear", note, re.I), 0.0, set()
        # a 2018+ form whose post-2018 table is missing (crop cut off, page 2 lost) would count the old fund only
        if it["year"] >= 2018 and not any(t.get("fund") in ("post2018", "single") and t.get("contrib_ytd") is not None for t in ts):
            ok = False
        for t in ts if ok else []:
            ytd = t.get("contrib_ytd")
            if ytd is None:
                ok = False
                break
            j1, d, c = t.get("jan1"), t.get("disb_ytd"), t.get("close")
            it_, non, per = t.get("contrib_itemized"), t.get("contrib_nonitemized"), t.get("contrib_period")
            checks = [
                None not in (j1, d, c) and near(j1 + ytd - d, c),
                None not in (d, c) and near(ytd - d, c),
                None not in (it_, non, per) and near(it_ + non, per) and ytd >= per - 1.0,
                (per is None or per == 0) and None not in (it_, non) and near(it_ + non, ytd),
                ytd == 0,
                # e-filed summaries: the opening and closing cash are the period's, so the balance holds on
                # the period's figures (and the aggregate YTD runs at least as high)
                None not in (j1, per, t.get("disb_period"), c) and near(j1 + per - t["disb_period"], c) and ytd >= per - 1.0,
            ]
            if not any(checks):
                ok = False
                break
            key = (round(ytd, 2), None if c is None else round(c, 2))
            if key in seen and ytd:
                stats["duplicate table counted once"] += 1
                continue
            seen.add(key)
            total += ytd
        if not ok:
            stats["to review"] += 1
            print("check", r["n"], it["candidate"], it["seat"], it["year"], it["filing"], json.dumps(r.get("tables")), note[:300])
            continue
        manual[it["filing"]] = round(total, 2)
        kept += 1
    os.makedirs(os.path.dirname(MANUAL), exist_ok=True)
    json.dump(manual, open(MANUAL, "w"), indent=1, sort_keys=True)
    print(f"kept {kept}; {dict(stats)}; manual file now {len(manual)} reports")


if __name__ == "__main__":
    if sys.argv[1:2] == ["--import"]:
        import_reads(sys.argv[2], sys.argv[3])
        sys.exit()
    args = sys.argv[1:]
    review = "--review" in args
    years = [int(a) for a in args if a.isdigit()] or [2019, 2023]
    build(years, review, "--sheets" in args)
