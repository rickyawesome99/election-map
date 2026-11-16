#!/usr/bin/env python3
"""Correct the site's certified U.S. House totals (data-entry/house_past_results.csv) for Texas 2024.

Ten Texas districts held a count from before the final canvass. The figures here were read from the Clerk of
the House's "Statistics of the Presidential and Congressional Election of November 5, 2024" (published
10 March 2025, clerk.house.gov/member_info/electionInfo/2024/statistics2024.pdf) and compared with the Texas
precinct file (Redistricting Data Hub / Texas Legislative Council). In districts 7, 12, 29, 31 and 33 the
precinct file equals the Clerk to the vote; in 10, 35 and 36 within 20 votes; in 19 it equals the Clerk for
Lewis and is 89 above for Arrington; in 28 it is 245 / 105 above the Clerk. The site's old figure matched
neither source in any of the ten. The other 28 Texas districts already equal the Clerk.

Each row keeps the site's convention (the two leading candidates; total = every vote the Clerk lists).
The rows as they stood at the 2026 forecast lock are kept in data-entry/house_past_results_locked2026.csv.

  python3 scripts/precincts/correct_site_house_certified.py --report | --write
Then: node data-entry/build.js   (and see lib/locked2026HousePast.ts for what the frozen model reads)
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAST = ROOT / "data-entry" / "house_past_results.csv"
LOCKED = ROOT / "data-entry" / "house_past_results_locked2026.csv"
# district → (votes in the "dem" slot, votes in the "rep" slot, every vote the Clerk lists for the district)
CLERK_TX_2024 = {
    7: (149820, 94651, 149820 + 94651),
    10: (118280, 221229, 118280 + 221229 + 8309),
    12: (124154, 215564, 124154 + 215564),
    19: (27461, 214950, 27461 + 214950 + 23964),   # no Democrat: independent Nathan Lewis holds the first slot, as before
    28: (125280, 112018, 125280 + 112018),
    29: (99379, 52830, 99379 + 52830),
    31: (126470, 229087, 126470 + 229087),
    33: (114289, 51864, 114289 + 51864),
    35: (170509, 82610, 170509 + 82610),
    36: (91009, 206009, 91009 + 206009),
}


def main() -> None:
    write = "--write" in sys.argv
    text = PAST.read_text()
    lines = text.split("\n")
    fields = lines[0].rstrip("\r").split(",")
    at = {k: fields.index(k) for k in ("state_abbr", "year", "district_name", "dem_candidate", "rep_candidate", "dem_pct", "rep_pct", "margin", "dem_votes", "rep_votes", "vote_margin", "total_votes")}
    old_lines = []
    for n, line in enumerate(lines):
        cells = line.rstrip("\r").split(",")
        if len(cells) != len(fields) or cells[at["state_abbr"]] != "TX" or cells[at["year"]] != "2024":
            continue  # the file is edited line by line: it has hand-quoted names elsewhere that a CSV rewrite would alter
        d = int(cells[at["district_name"]].split("-")[1])
        if d not in CLERK_TX_2024:
            continue
        dv, rv, tot = CLERK_TX_2024[d]
        dp, rp = round(dv / tot * 100, 2), round(rv / tot * 100, 2)
        new = {"dem_votes": str(dv), "rep_votes": str(rv), "total_votes": str(tot), "vote_margin": str(rv - dv), "dem_pct": f"{dp:.2f}", "rep_pct": f"{rp:.2f}", "margin": f"{rp - dp:.2f}"}
        if all(cells[at[k]] == v for k, v in new.items()):
            continue
        print(f"TX-{d:02d}: {cells[at['dem_candidate']]} {int(cells[at['dem_votes']]):,} → {dv:,}   {cells[at['rep_candidate']]} {int(cells[at['rep_votes']]):,} → {rv:,}"
              f"   total {int(cells[at['total_votes']]):,} → {tot:,}   margin {cells[at['margin']]} → {new['margin']}")
        old_lines.append(line.rstrip("\r"))
        for k, v in new.items():
            cells[at[k]] = v
        lines[n] = ",".join(cells) + ("\r" if line.endswith("\r") else "")
    if write and old_lines:
        PAST.write_text("\n".join(lines))
        if not LOCKED.exists():
            LOCKED.write_text(lines[0].rstrip("\r") + "\n" + "\n".join(old_lines) + "\n")
        print(f"written: {len(old_lines)} rows; at-lock copy in {LOCKED.name}")


if __name__ == "__main__":
    main()
