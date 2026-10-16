#!/usr/bin/env python3
"""
Maine state legislative fundraising from the Ethics Commission's disclosure site
(mainecampaignfinancedisclosure.com), election years 2018–2026. 2016 is not in this system (the old
portal is gone).

  python3 scripts/fetch-state-leg-finance-me.py [CYCLE ...]

Candidates: /public/candidates?q[election_year_eq]=Y, 50 per page — name, office, district, party,
financing type. Each candidate-election is its own filer, so its totals are already per cycle.
Money: the filer page's "Total Contributions" (monetary + in-kind), which leaves out the Maine Clean
Election Act payments a publicly financed candidate receives — the list's "Total Money Received"
counts those (Troy Jackson, Senate 1, 2022: $69,734.53 received, $2,917.00 of it contributions).

Output: data-entry/state-leg-finance/portal-raw/ME-{cycle}.json. Pages cached in scratch portal-cache/me/.
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
CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/me"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
BASE = "https://www.mainecampaignfinancedisclosure.com"
SOURCE = "Maine Ethics Commission (private contributions, excluding Clean Election funds)"
TODAY = datetime.date.today()


def get(path, name, refresh=False):
    p = os.path.join(CACHE, name)
    if os.path.exists(p) and not refresh:
        return open(p, encoding="utf-8").read()
    for attempt in range(6):
        r = subprocess.run(["curl", "-sS", "--max-time", "90", "-A", UA, BASE + path], capture_output=True)
        if r.returncode == 0 and b"</html>" in r.stdout and b"Just a moment" not in r.stdout:
            break
        time.sleep(60 * (attempt + 1))  # a bot check after a burst: back off
    else:
        sys.exit(f"ME: failed {path}")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    body = r.stdout.decode("utf-8", "replace")
    open(p, "w", encoding="utf-8").write(body)
    time.sleep(1.5)
    return body


def text(x):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", x))).strip()


def money(s):
    m = re.search(r"\$?(-?[\d,]+\.\d\d)", s or "")
    return float(m.group(1).replace(",", "")) if m else None


def fetch(cycle):
    current = cycle >= TODAY.year
    rows, page = [], 1
    while True:
        h = get(f"/public/candidates?q%5Belection_year_eq%5D={cycle}&page={page}&limit=50", f"list/{cycle}-{page}.html", current)
        found = 0
        for tr in re.findall(r"<tr.*?</tr>", h, re.S):
            link = re.search(r'/public/filers/(f_[a-z0-9]+)', tr)
            cells = [text(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
            if not link or len(cells) < 9:
                continue
            found += 1
            if cells[2] not in ("Representative", "Senator") or cells[1] != str(cycle):
                continue
            rows.append({"filer": link.group(1), "name": cells[0], "chamber": "house" if cells[2] == "Representative" else "senate",
                         "district": cells[3], "party": cells[4], "financing": cells[6], "received": money(cells[7]), "spent": money(cells[8])})
        if found < 50:
            break
        page += 1

    def one(r):
        h = text(get(f"/public/filers/{r['filer']}", f"filers/{r['filer']}.html", current))
        m = re.search(r"Total Contributions \$?(-?[\d,]+\.\d\d)", h)
        e = re.search(r"Total Expenditures \$?(-?[\d,]+\.\d\d)", h)
        return {"name": r["name"], "party": r["party"], "chamber": r["chamber"], "district": r["district"],
                "contributions": float(m.group(1).replace(",", "")) if m else None,
                "expenditures": float(e.group(1).replace(",", "")) if e else r["spent"], "financing": r["financing"]}

    out = [one(r) for r in rows]
    body = {"state": "ME", "cycle": cycle, "source": SOURCE, "fetched": TODAY.isoformat(),
            "dataThrough": TODAY.strftime("%m/%d/%Y") if current else f"12/31/{cycle}", "candidates": out}
    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(body, open(os.path.join(OUT_DIR, f"ME-{cycle}.json"), "w"), indent=1)
    print(f"ME {cycle}: {len(out)} legislative candidates ({sum(1 for o in out if o['contributions'] is None)} without a total)")


if __name__ == "__main__":
    for c in [int(a) for a in sys.argv[1:]] or [2018, 2020, 2022, 2024, 2026]:
        fetch(c)
