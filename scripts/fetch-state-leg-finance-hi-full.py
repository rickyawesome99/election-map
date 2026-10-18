#!/usr/bin/env python3
"""
Hawaii state legislative fundraising, FULL totals (the open data in scripts/fetch-state-leg-finance-hi.py
has only itemized gifts over $100), from the Campaign Spending Commission's Candidate Filing System
report pages (csc.hawaii.gov/CFSPublic), cycles 2016–2026.

  npx tsx --conditions=react-server scripts/dump-state-leg-candidates.ts HI > /tmp/hi.json
  python3 scripts/fetch-state-leg-finance-hi-full.py /tmp/hi.json [CYCLE ...]

report_list/ (Scriptcase; one "rows per page" ajax call puts all ~2,000 candidates on one page) → each
House/Senate candidate whose surname is on our list → report_detail/ (the same trick lists every report)
→ for each cycle Y, the Disclosure whose reporting period ends last within Y-1..Y (a later filing of the
same period, an amendment, wins) → its static DIS.html page, line 12 "Total Contributions", Column B
"election period total to date". Election periods run two years for the House and often four for the
Senate. Della Au Belatti, House, 2014–2016 election period: $56,780 (her itemized sum was ~20% lower).

Output: data-entry/state-leg-finance/portal-raw/HI-{cycle}.json (replaces the itemized-only files).
Pages cached in scratch portal-cache/hi/.
"""
import datetime
import html
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/hi"
BASE = "https://csc.hawaii.gov/CFSPublic/"
SOURCE = "Hawaii Campaign Spending Commission disclosure reports (total contributions, election period to date)"
TODAY = datetime.date.today()

op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
op.addheaders = [("User-Agent", "Mozilla/5.0"), ("Referer", BASE + "report_list/")]


def req(url, data=None):
    for attempt in range(4):
        try:
            return op.open(url, urllib.parse.urlencode(data).encode() if data else None, timeout=120).read().decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            time.sleep(10 * (attempt + 1))
    sys.exit(f"HI: failed {url}")


def all_rows(page, init):
    req(BASE + page + "/index.php", {"nmgp_opcao": "ajax_navigate", "script_case_init": init, "opc": "muda_qt_linhas", "parm": "2100"})
    return req(f"{BASE}{page}/?script_case_init={init}")


def cells(tr):
    return [" ".join(re.sub(r"<[^>]*>", " ", html.unescape(c)).split()) for c in re.findall(r"<TD[^>]*>(.*?)</TD>", tr, re.S)]


def end_date(label):
    m = re.search(r"-\s*([A-Z][a-z]+ \d{1,2}, \d{4})\s*$", label) or re.search(r"([A-Z][a-z]+ \d{1,2}, \d{4})\s*$", label)
    try:
        return datetime.datetime.strptime(m.group(1), "%B %d, %Y").date() if m else None
    except ValueError:
        return None


def reports(parms, list_init, key):
    path = os.path.join(CACHE, "detail", f"{key}.json")
    if os.path.exists(path):
        return json.load(open(path))
    d = req(BASE + "report_detail/", {"nmgp_parms": parms, "nmgp_opcao": "grid", "script_case_init": list_init, "nmgp_url_saida": "/CFSPublic/report_list/"})
    init = re.search(r'name="script_case_init" value="(\d+)"', d).group(1)
    d = re.sub(r"<script.*?</script>|<style.*?</style>", "", all_rows("report_detail", init), flags=re.S)
    out = []
    for tr in re.findall(r"<TR[^>]*scGridField[^>]*>(.*?)</TR>", d, re.S):
        c = [x for x in cells(tr) if x and x != "&nbsp;"]
        link = re.search(r"https://csc\.hawaii\.gov/Report/[^\"']*DIS\.html", tr)
        if link and c and c[0] == "Disclosure" and len(c) >= 4:
            e = end_date(c[1])
            out.append({"label": c[1], "end": e.isoformat() if e else None, "filed": c[-1], "url": link.group(0)})
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, "w"))
    time.sleep(0.3)
    return out


def to_date(url):
    path = os.path.join(CACHE, "dis", re.sub(r"\W", "_", url.split("/Report/")[-1]))
    if os.path.exists(path):
        t = open(path).read()
    else:
        t = req(url)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "w").write(t)
        time.sleep(0.2)
    x = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t)))
    m = re.search(r"12\. Total Contributions[^$]*\$([\d,.]+)\s+\$([\d,.]+)", x)
    return float(m.group(2).replace(",", "")) if m else None


def filed(s):
    try:
        return datetime.datetime.strptime(s, "%m/%d/%Y").date()
    except ValueError:
        return datetime.date.min


def main(cands_file, cycles):
    pool = json.load(open(cands_file))
    surnames = {re.sub(r"[^a-z]", "", c["name"].split()[-1].lower()) for c in pool if c["name"].split()}
    s = req(BASE + "report_list/")
    init = re.search(r'name="script_case_init" value="(\d+)"', s).group(1)
    s = all_rows("report_list", init)
    rows = re.findall(r"nm_gp_submit5\('/CFSPublic/report_detail/', '/CFSPublic/report_list/', '([^']*)'[^>]*>([^<]*)</a>\s*</TD>\s*<TD[^>]*>(?:<[^>]*>)*([^<]*)", s)
    cands = [(p, html.unescape(n).strip(), o.strip()) for p, n, o in rows if o.strip() in ("House", "Senate")]
    cands = [c for c in cands if re.sub(r"[^a-z]", "", c[1].split(",")[0].lower()) in surnames]
    print(f"HI: {len(rows)} candidates listed, {len(cands)} House/Senate on our list")
    results = {y: [] for y in cycles}
    for parms, name, office in cands:
        reps = reports(parms, init, re.sub(r"\W", "_", name + "_" + office))
        for y in cycles:
            inside = [r for r in reps if r["end"] and f"{y - 1}-01-01" <= r["end"] <= f"{y}-12-31"]
            if not inside:
                continue
            last = max(inside, key=lambda r: (r["end"], r["url"]))  # the URL embeds the filing timestamp: an amendment sorts last
            v = to_date(last["url"])
            if v is not None:
                ln, _, fn = name.partition(",")
                results[y].append({"name": f"{fn.strip()} {ln.strip()}", "chamber": "house" if office == "House" else "senate", "contributions": v})
    for y, out in results.items():
        body = {"state": "HI", "cycle": y, "source": SOURCE, "fetched": TODAY.isoformat(),
                "dataThrough": TODAY.strftime("%m/%d/%Y") if y >= TODAY.year else f"12/31/{y}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"HI-{y}.json"), "w"), indent=1)
        print(f"HI {y}: {len(out)} candidates")


if __name__ == "__main__":
    main(sys.argv[1], [int(a) for a in sys.argv[2:]] or [2016, 2018, 2020, 2022, 2024, 2026])
