#!/usr/bin/env python3
"""
State legislative candidate fundraising from Transparency USA (transparencyusa.org), which
republishes the state campaign-finance filings for 25 states: every legislative race page of a
cycle with each candidate's total contributions and expenditures, incumbency and ballot status,
per election (general and primaries).

  python3 scripts/fetch-state-leg-finance-tu.py --cycle 2026 [ST ...]      one cycle, all/some states
  python3 scripts/fetch-state-leg-finance-tu.py --cycle 2024 --cycle 2022    several cycles
  python3 scripts/fetch-state-leg-finance-tu.py --cycle all                  every cycle TU carries

Output: data-entry/state-leg-finance/tu/{ST}-{cycle}.json
  { state, cycle, fetched, dataThrough, races: [ { chamber, office, district, post?, url,
      totalContributions, totalExpenditures, stage, elections: [ { label, date,
      candidates: [ { name, party, incumbent, contributions, expenditures, status, url } ] } ] } ] }

How it reads the site (2026-10-11):
  * Race ids are PER CYCLE: /oh/race/ohio-house-of-representatives-district-1-74896 is the 2026
    race; the 2018 race of the same seat has another id. So each cycle's race list comes from
    /{st}/races?cycle={cycle}-election-cycle&type=State%20Legislative%20(Lower|Upper). A past
    cycle's race links already carry ?cycle=…, the current cycle's do not; appending a second
    one returns an empty race page (the first crawl's mistake).
  * Even-year states have cycles 2018…2026; Virginia has 2017…2025 (odd years). "Cycle" is the
    election year; TU's own "2017 to now" rollup is not used.
  * Plain curl with a browser User-Agent works; headless Chromium gets a Cloudflare challenge.
    Pages answer in ~0.25 s but the site rate-limits bursts (429 at ~1 request/s), so requests are
    spaced DELAY apart and a 429 waits 20 s × attempt. Budget ~2 hours per cycle for all 25 states.
  * HTML is cached under --cache (default: the scratch tu-cache dir) so re-runs only fetch what is
    missing; delete a state's files there to refetch (data through dates move during a cycle).
  * District keys follow the atlas roster: "District 12" → "12"; Minnesota/Idaho "12a" → "12A";
    Washington "District 1 Position 2" → "1" with post "2"; New Hampshire "Hillsborough 40" →
    "HI40"; Idaho's "10a"/"10b" are district 10 with post A/B (its roster keys the district).
"""
import argparse
import datetime
import html as htmlmod
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "tu")
DEFAULT_CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/f0dc0b69-f6dc-43ea-86e3-d48e7e098c28/scratchpad/tu-cache"
BASE = "https://www.transparencyusa.org"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
DELAY = 2.0

TU_STATES = ["AL", "AZ", "CA", "CO", "FL", "GA", "IA", "ID", "IL", "IN", "MI", "MN", "NC", "NH", "NM", "NV", "NY", "OH", "PA", "SC", "TX", "VA", "WA", "WI", "WY"]
ODD_YEAR = {"VA"}
NH_COUNTY = {"belknap": "BE", "carroll": "CA", "cheshire": "CH", "coos": "CO", "grafton": "GR", "hillsborough": "HI", "merrimack": "ME", "rockingham": "RO", "strafford": "ST", "sullivan": "SU"}


def cycles_for(st):
    return [2017, 2019, 2021, 2023, 2025] if st in ODD_YEAR else [2018, 2020, 2022, 2024, 2026]


def fetch(url, cache):
    os.makedirs(cache, exist_ok=True)
    name = re.sub(r"[^A-Za-z0-9]+", "_", url.replace(BASE, "")).strip("_")[:200] + ".html"
    path = os.path.join(cache, name)
    if os.path.exists(path) and os.path.getsize(path) > 2000:
        return open(path, encoding="utf-8", errors="replace").read()
    for attempt in range(5):
        r = subprocess.run(["curl", "-s", "-A", UA, "--max-time", "90", "-w", "\n%{http_code}", url], capture_output=True, text=True)
        body, _, code = r.stdout.rpartition("\n")
        if code == "200" and len(body) > 2000:
            open(path, "w", encoding="utf-8").write(body)
            time.sleep(DELAY)
            return body
        # 429 = rate limited: back off hard, the crawl is long and polite beats fast.
        wait = (20 if code == "429" else 10) * (attempt + 1)
        print(f"    {code or 'no response'} for {url}; retry in {wait}s", file=sys.stderr)
        time.sleep(wait)
    return None


def text(s):
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", htmlmod.unescape(s)).strip()


def money(s):
    m = re.search(r"-?\$?[\d,]+(?:\.\d+)?", s.replace("$", ""))
    if not m:
        return None
    try:
        return round(float(m.group(0).replace(",", "")), 2)
    except ValueError:
        return None


def district_key(st, office):
    """The atlas roster key for a TU office name, plus a post where the office is one seat of a district."""
    o = office.strip()
    if st == "NH":
        m = re.search(r"House of Representatives\s+([A-Za-zö]+)\s+(\d+)", o)
        if m and m.group(1).lower() in NH_COUNTY:
            return NH_COUNTY[m.group(1).lower()] + m.group(2), None
    m = re.search(r"District\s+(\d+)\s*(?:[,-]?\s*(?:Position|Seat|Post)\s*([A-Za-z0-9]+))?$", o, re.I)
    if m:
        return m.group(1), (m.group(2).upper() if m.group(2) else None)
    m = re.search(r"District\s+(\d+)([A-Za-z])$", o, re.I)
    if m:
        if st == "ID":
            return m.group(1), m.group(2).upper()
        return m.group(1) + m.group(2).upper(), None
    m = re.search(r"District\s+([A-Za-z0-9-]+)$", o, re.I)
    if m:
        return m.group(1), None
    return None, None


def parse_race(page, url):
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
    office = text(h1.group(1)) if h1 else ""
    through = re.search(r"Data through\s*([\d/]+)", page)
    stage = re.search(r'<div class="label">Stage</div>\s*<div class="value">(.*?)</div>', page, re.S)
    stats = re.findall(r'<span class="user-display-stat-counter">(.*?)</span>\s*<span class="user-display-stat-title">(.*?)</span>', page, re.S)
    totals = {text(k): money(text(v)) for v, k in stats}
    elections = []
    for block in re.split(r"<details\b", page)[1:]:
        head = re.search(r"<h[2-4][^>]*>(.*?)</h[2-4]>", block, re.S)
        if not head or "<table" not in block:
            continue
        label_html = head.group(1)
        date = re.search(r'<span class="subtitle">(.*?)</span>', label_html, re.S)
        label = text(re.sub(r'<span class="subtitle">.*?</span>', "", label_html, flags=re.S))
        cands = []
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", block, re.S):
            if "/candidate/" not in row:
                continue
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
            if len(cells) < 4:
                continue
            link = re.search(r'href="([^"]*/candidate/[^"]*)"[^>]*>(.*?)</a>', cells[0], re.S)
            name = text(link.group(2)) if link else text(cells[0])
            incumbent = "Incumbent" in cells[0]
            party = text(cells[1]) if len(cells) > 1 else ""
            if not party:
                mp = re.search(r'<div class="d-lg-none">(.*?)</div>', cells[0], re.S)
                party = text(mp.group(1)) if mp else ""
            contributions = money(text(cells[2]))
            expenditures = money(text(cells[3])) if len(cells) > 3 else None
            status = text(cells[4]) if len(cells) > 4 else ""
            cands.append({"name": name, "party": party, "incumbent": incumbent, "contributions": contributions, "expenditures": expenditures, "status": status, "url": link.group(1) if link else None})
        if cands:
            elections.append({"label": label, "date": text(date.group(1)) if date else None, "candidates": cands})
    return {"office": office, "url": url, "dataThrough": through.group(1) if through else None, "stage": text(stage.group(1)) if stage else None,
            "totalContributions": totals.get("Total Contributions"), "totalExpenditures": totals.get("Total Expenditures"), "elections": elections}


def race_links(st, cycle, chamber_type, cache):
    hrefs = []
    page_no = 1
    while True:
        url = f"{BASE}/{st.lower()}/races?cycle={cycle}-election-cycle&type=State%20Legislative%20({chamber_type})" + (f"&page={page_no}" if page_no > 1 else "")
        body = fetch(url, cache)
        if not body:
            # An index that could not be fetched is a failure, never "no races".
            return None if page_no == 1 else hrefs
        found = sorted(set(re.findall(rf'href="(/{st.lower()}/race/[^"]+)"', body)))
        hrefs.extend(h for h in found if h not in hrefs)
        if not re.search(rf"page={page_no + 1}\b", body):
            break
        page_no += 1
    return hrefs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("states", nargs="*")
    ap.add_argument("--cycle", action="append", required=True, help="election year, or 'all'")
    ap.add_argument("--cache", default=DEFAULT_CACHE)
    args = ap.parse_args()
    states = [s.upper() for s in args.states] or TU_STATES
    os.makedirs(OUT_DIR, exist_ok=True)
    for st in states:
        if st not in TU_STATES:
            print(f"{st}: not a Transparency USA state", file=sys.stderr)
            continue
        cycles = cycles_for(st) if "all" in args.cycle else [int(c) for c in args.cycle]
        for cycle in cycles:
            if cycle not in cycles_for(st):
                # An even cycle asked of Virginia (or vice versa): take the odd year before it.
                alt = cycle - 1 if st in ODD_YEAR else None
                if alt is None or alt not in cycles_for(st):
                    continue
                cycle = alt
            out = {"state": st, "cycle": cycle, "fetched": datetime.date.today().isoformat(), "dataThrough": None, "races": []}
            n_c = 0
            failed = False
            for chamber, ctype in (("house", "Lower"), ("senate", "Upper")):
                links = race_links(st, cycle, ctype, args.cache)
                if links is None:
                    print(f"  {st} {cycle} {chamber}: race index could not be fetched; nothing written", file=sys.stderr)
                    failed = True
                    break
                for href in links:
                    # Past cycles' index links already carry ?cycle=…; the current cycle's do not.
                    page = fetch(f"{BASE}{href}" + ("" if "?" in href else f"?cycle={cycle}-election-cycle"), args.cache)
                    href = href.split("?")[0]
                    if not page:
                        continue
                    race = parse_race(page, href)
                    key, post = district_key(st, race["office"])
                    race.update({"chamber": chamber, "district": key})
                    if post:
                        race["post"] = post
                    if race["dataThrough"]:
                        out["dataThrough"] = race["dataThrough"]
                    out["races"].append(race)
                    n_c += sum(len(e["candidates"]) for e in race["elections"] if e["label"].lower().startswith("general"))
                print(f"{st} {cycle} {chamber}: {len(links)} races", flush=True)
            if failed:
                continue
            unkeyed = [r["office"] for r in out["races"] if not r["district"]]
            if unkeyed:
                print(f"  {st} {cycle}: {len(unkeyed)} races without a district key, e.g. {unkeyed[:3]}", file=sys.stderr)
            with open(os.path.join(OUT_DIR, f"{st}-{cycle}.json"), "w", encoding="utf-8") as f:
                json.dump(out, f, indent=1, ensure_ascii=False)
                f.write("\n")
            print(f"{st} {cycle}: {len(out['races'])} races, {n_c} general-election candidates, data through {out['dataThrough']}", flush=True)


if __name__ == "__main__":
    main()
