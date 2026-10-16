#!/usr/bin/env python3
"""
New Jersey state legislative fundraising from ELEC's general-election "20-day post-election" summary
PDFs, elections 2017, 2019, 2021, 2023, 2025 (New Jersey elects its legislature in odd years).

  python3 scripts/fetch-state-leg-finance-nj.py [YEAR ...]

Each PDF lists every legislative candidate committee and joint slate committee with district,
office (S / A / S/A/A), party, incumbency, win/lose and CUMULATIVE RECEIVED for the election as of
the 20-day post-election report (later reports are not included: a small undercount). ELEC's HTML
is behind Incapsula, but the PDFs download with plain curl; parsed with pdftotext -layout.
Rows with a filing code A1/A2 (exempt: under the reporting threshold) carry no amounts → null.

Joint slates ("SIMONSEN & MCCLELLAN", office A/A) raise much of the money in New Jersey. A slate's
cumulative receipts are split evenly among its members, matched by surname within the district and
party, and added to each member's own committee; a member with no committee of their own is
placed by the slate name's order (one surname per office slot) and matched by surname in the district. Nicholas Scutari, S-22, 2023: $2,645,000.

Output: data-entry/state-leg-finance/portal-raw/NJ-{year}.json. PDFs cached in scratch portal-cache/nj/.
"""
import datetime
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-finance", "portal-raw")
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/nj"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
SOURCE = "New Jersey ELEC 20-day post-election report (cumulative receipts; joint slates split evenly)"
FILES = {
    2017: "G2017_20-Day_Public.pdf", 2019: "G2019_20Day_public.pdf", 2021: "G2021_20Day_public.pdf",
    2023: "G2023_20Day_public.pdf", 2025: "G2025_20Day_public.pdf",
}
ROW = re.compile(r"^\s*(\d{1,2})\s+(.+?)\s{2,}(S/A/A|S/A|A/A|S|A)\s+([A-Z]{1,3})\s+([CI](?:/[CI])*)\s+([WL](?:/[WL])*)?(.*)$")


def amount(tok):
    tok = tok.strip().replace(",", "")
    if tok in ("-", "‐", ""):
        return 0.0
    neg = tok.startswith("(")
    try:
        v = float(tok.strip("()"))
    except ValueError:
        return None
    return -v if neg else v


def parse(year):
    os.makedirs(CACHE, exist_ok=True)
    pdf = os.path.join(CACHE, FILES[year])
    if not os.path.exists(pdf):
        subprocess.run(["curl", "-sSf", "-A", UA, "-o", pdf, f"https://elec.nj.gov/pdffiles/legislative_statistics/{FILES[year]}"], check=True)
    txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, check=True).stdout.decode("utf-8", "replace")
    rows = []
    for line in txt.splitlines():
        m = ROW.match(line)
        if not m:
            continue
        district, name, office, party, _inc, win, rest = m.groups()
        filing = re.search(r"\b(R|A1|A2)\s*$", rest)
        vals = [amount(v) for v in re.findall(r"\$\s*(\(?[\d,]+\)?|[-‐])", rest)]
        vals = [v for v in vals if v is not None]
        if not vals:
            cum = None  # an A-1/A-2 exemption or no report
        elif len(vals) >= 5:
            cum = vals[2]  # received, expended, CUMULATIVE RECEIVED, cumulative expended, closing (, transfer)
        else:
            cum = vals[0]  # no activity this period: the period columns are blank
        rows.append({"district": str(int(district)), "name": name.strip(), "office": office, "party": party, "win": win, "cumulative": cum, "filing": filing.group(1) if filing else None})
    if not rows:
        sys.exit(f"NJ {year}: no rows parsed")
    return rows


def surname(name):
    return re.sub(r"[^A-Z]", "", name.split(",")[0].upper())


def fetch(year):
    rows = parse(year)
    people = [r for r in rows if r["office"] in ("S", "A")]
    slates = [r for r in rows if "/" in r["office"]]
    share = defaultdict(float)
    unplaced = 0
    synthetic = []
    for s in slates:
        if not s["cumulative"]:
            continue
        offices = s["office"].split("/")
        n = len(offices)
        squashed = re.sub(r"[^A-Z ]", "", s["name"].upper()).replace(" ", "")
        members = [p for p in people if p["district"] == s["district"] and p["party"] == s["party"] and surname(p["name"]) and surname(p["name"]) in squashed]
        if len(members) != n:
            # Members with no committee of their own: the slate name lists them in office order
            # ("FITZPATRICK HARRELL & BENDER", S/A/A), one surname each.
            tokens = [t for t in re.split(r"\s+|&|\bAND\b", s["name"].upper()) if t and t != "AND"]
            if len(tokens) != n:
                unplaced += 1
                continue
            members = []
            for tok, off in zip(tokens, offices):
                hit = next((p for p in people if p["district"] == s["district"] and p["party"] == s["party"] and surname(p["name"]) == re.sub(r"[^A-Z]", "", tok)), None)
                if not hit:
                    hit = {"district": s["district"], "name": tok.title(), "office": off, "party": s["party"], "win": None, "cumulative": None, "filing": None}
                    synthetic.append(hit)
                members.append(hit)
        for p in members:
            share[id(p)] += s["cumulative"] / n
    people = people + synthetic
    out = []
    for p in people:
        own = p["cumulative"]
        total = None if own is None and id(p) not in share else (own or 0) + share.get(id(p), 0)
        out.append({"name": p["name"], "party": p["party"], "chamber": "senate" if p["office"] == "S" else "house", "district": p["district"],
                    "contributions": round(total, 2) if total is not None else None, "slateShare": round(share.get(id(p), 0), 2) or None})
    body = {"state": "NJ", "cycle": year, "source": SOURCE, "fetched": datetime.date.today().isoformat(), "dataThrough": f"20 days after the {year} general", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"NJ-{year}.json"), "w"), indent=1)
    print(f"NJ {year}: {len(people)} candidates, {len(slates)} slates ({unplaced} not split: members not found)")


if __name__ == "__main__":
    for y in [int(a) for a in sys.argv[1:]] or sorted(FILES):
        fetch(y)
