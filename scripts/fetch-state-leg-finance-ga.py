#!/usr/bin/env python3
"""
Georgia state legislative fundraising for the 2016 cycle (Transparency USA covers 2018 on) from the State
Ethics Commission's LEGACY search (media.ethics.ga.gov/search/Campaign/; the new PeachFile has no campaign
bulk data).

  npx tsx --conditions=react-server scripts/dump-state-leg-candidates.ts GA > /tmp/ga.json
  python3 scripts/fetch-state-leg-finance-ga.py /tmp/ga.json [YEAR ...]       default 2016

1. Campaign_ByName.aspx, searched by the surname of each of our general-election candidates for the year
   (the office search lists only filers whose declaration is dated that year, which misses long-serving
   incumbents such as David Ralston, filer since 2006); each result's "View" postback redirects to the
   candidate page with its NameID and FilerID. Registrations whose first name disagrees are skipped.
2. Campaign_Name.aspx lists every report (year, name, original/amended, newest first); a report's
   "View" postback answers with a redirect carrying its CDRID.
3. CCDR_Report_Summary.aspx (plain GET) — line 5, "Total contributions reported this period", cash +
   in-kind. A cycle = the reports from June 30 of Y-1 through December 31 of Y (the January 31 report of
   Y-1 covers the year before). Line 6, cycle-to-date, is not used: it carries the prior balance.
David Ralston, HD-7, 2016: $1,008,793.84.

Output: data-entry/state-leg-finance/portal-raw/GA-{year}.json. Pages cached in scratch portal-cache/ga/.
"""
import datetime
import html
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ga"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://media.ethics.ga.gov/search/Campaign/"
SOURCE = "Georgia State Ethics Commission legacy reports (contributions, cash + in-kind)"
OFFICES = {"130": ("State Representative", "house"), "120": ("State Senate", "senate")}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
op_noredir = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect)


def get(url, data=None, opener=op, referer=None):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode() if data else None, headers={"User-Agent": UA, "Referer": referer or url})
    for attempt in range(4):
        try:
            return opener.open(req, timeout=90)
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303):
                return e
            time.sleep(10 * (attempt + 1))
        except Exception:  # noqa: BLE001
            time.sleep(10 * (attempt + 1))
    sys.exit(f"GA: failed {url}")


def hidden(s):
    out = {}
    for t in re.findall(r'<input[^>]*type="hidden"[^>]*>', s):
        n = re.search(r'name="([^"]+)"', t)
        v = re.search(r'value="([^"]*)"', t)
        if n:
            out[n.group(1)] = html.unescape(v.group(1) if v else "")
    return out


def text(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()


def search(last):
    """Candidate registrations with this surname: [{nid, fid, name}] from Campaign_ByName.aspx."""
    path = os.path.join(CACHE, "names", re.sub(r"[^a-z]", "_", last.lower()) + ".json")
    if os.path.exists(path):
        return json.load(open(path))
    url = BASE + "Campaign_ByName.aspx"
    s = get(url).read().decode("utf-8", "replace")
    form = {k: v for k, v in hidden(s).items()}
    for t in re.findall(r'<input[^>]*type="text"[^>]*>', s):
        n = re.search(r'name="([^"]+)"', t)
        if n:
            form[n.group(1)] = ""
    form.update({"ctl00$ContentPlaceHolder1$txtLast": last, "ctl00$ContentPlaceHolder1$Search": "Search Candidates"})
    r = get(url, form)
    results_url, t = r.geturl(), r.read().decode("utf-8", "replace")
    out = []
    for tr in re.findall(r"<tr.*?</tr>", t, re.S):
        target = re.search(r"__doPostBack\('([^']*lnkViewID)'", tr)
        cells = [text(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if not target or len(cells) < 2:
            continue
        d = hidden(t)
        d.update({"__EVENTTARGET": target.group(1), "__EVENTARGUMENT": ""})
        loc = get(results_url, d, op_noredir).headers.get("Location", "")
        m = re.search(r"NameID=(\d+)&FilerID=(\w+)", loc)
        if m:
            ln, _, fn = cells[1].partition(",")
            out.append({"nid": m.group(1), "fid": m.group(2), "name": f"{fn.strip()} {ln.strip()}".strip()})
        time.sleep(0.3)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, "w"))
    return out


def candidate_total(f, year):
    path = os.path.join(CACHE, "cand", f"{f['fid']}-{year}.json")
    if os.path.exists(path):
        return json.load(open(path))
    url = f"{BASE}Campaign_Name.aspx?NameID={f['nid']}&FilerID={f['fid']}&Type=candidate"
    s = get(url).read().decode("utf-8", "replace")
    rows = re.findall(r"__doPostBack\('([^']*dgReports\$ctl\d+\$View)'.*?Label1\">(\w+)</span></td><td[^>]*>(\d{4})</td><td[^>]*>([^<]*)</td>", s, re.S)
    latest = {}
    for target, _kind, yr, rep in rows:  # newest first: the first of each (year, report) is the latest version
        if int(yr) in (year - 1, year) and (yr, rep) not in latest:
            if int(yr) == year - 1 and re.search(r"January", rep, re.I):
                continue  # covers the last months of the year before
            latest[(yr, rep)] = target
    total, n = 0.0, 0
    base = hidden(s)
    for (yr, rep), target in latest.items():
        d = dict(base)
        d.update({"__EVENTTARGET": target, "__EVENTARGUMENT": ""})
        loc = get(url, d, op_noredir).headers.get("Location", "")
        m = re.search(r"CDRID=(\d+)", loc)
        if not m:
            continue
        q = urllib.parse.urlencode({"NameID": f["nid"], "FilerID": f["fid"], "CDRID": m.group(1), "Name": "x", "Year": yr, "Report": rep})
        t = text(get(BASE + "CCDR_Report_Summary.aspx?" + q).read().decode("utf-8", "replace"))
        mm = re.search(r"Total contributions reported this period.*?\$([\d,.]+) \$([\d,.]+)", t)
        if mm:
            total += sum(float(x.replace(",", "")) for x in mm.groups())
            n += 1
        time.sleep(0.3)
    district = re.search(r"District\s*:?\s*(\d+)", text(s))
    res = {"total": round(total, 2) if n else None, "reports": n, "district": district.group(1) if district else None}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(res, open(path, "w"))
    return res


def main(cands_file, years):
    pool = json.load(open(cands_file))
    for year in years:
        people = [c for c in pool if c["year"] == year]
        out, seen = [], set()
        for last in sorted({c["name"].replace(",", " ").split()[-1] for c in people if c["name"].split()}):
            firsts = {c["name"].split()[0].lower().strip(".") for c in people if c["name"].replace(",", " ").split()[-1] == last}
            for f in search(last):
                # the registration of one of OUR candidates with this surname (first name or initial agrees)
                fn = (f["name"].split() or [""])[0].lower().strip(".")
                if f["fid"] in seen or not any(fn == x or (fn[:1] == x[:1] and (len(fn) == 1 or len(x) == 1)) for x in firsts):
                    continue
                seen.add(f["fid"])
                r = candidate_total(f, year)
                if r["total"] is not None:
                    out.append({"name": f["name"], "district": None, "committee": f["fid"], "contributions": r["total"]})
        body = {"state": "GA", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"12/31/{year}", "candidates": out}
        os.makedirs(OUT_DIR, exist_ok=True)
        json.dump(body, open(os.path.join(OUT_DIR, f"GA-{year}.json"), "w"), indent=1)
        print(f"GA {year}: {len(out)} registrations with reports in the cycle")


if __name__ == "__main__":
    main(sys.argv[1], [int(a) for a in sys.argv[2:]] or [2016])
