#!/usr/bin/env python3
"""2024 seat-count corrections in data-entry/state_leg.csv and data/forecastData.ts's stateLegData.

Found by checking every 2024 chamber's seats against its Wikipedia election article (infobox
seats_after, district result tables), 2026-10-19: 82 of 85 compositions matched. The 2024 seat
columns came from build-state-leg-votes-from-medsl.py's winner count, which sees only races
printed on the ballot, so a chamber whose seats were settled in a primary or left unopposed comes
up short on seats won. Vermont's House is corrected separately (scripts/fix-vermont-2024-fusion.py).

Not corrected, on purpose: California's Assembly (Wikipedia leaves out AD-32, won by Vince Fong
who stayed in Congress) and Minnesota's House (Wikipedia counts the 40B vacancy after the DFL
winner was ruled ineligible) - this file counts who won the election. North Dakota's specials
(SD-9/15, HD-9/15/23) are not in its seats won, as no special is anywhere in this file.

Idempotent. Usage: python3 scripts/fix-state-leg-2024-seat-cards.py
"""

import csv
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")
FORECAST = os.path.join(REPO, "data", "forecastData.ts")

# (state, type) -> corrected columns, with why.
FIXES = {
    ("Hawaii", "House"): ({"dem_seats": 42, "rep_seats": 9, "dem_seats_won": 42, "rep_seats_won": 9},
                         "45/6 was the pre-election split; Republicans gained HD-32, HD-40, HD-45"),
    ("Oklahoma", "Senate"): ({"dem_seats_won": 2, "rep_seats_won": 22, "seats_up": 24},
                             "13 of the 24 seats up were settled in the primary or runoff, or unopposed"),
    ("Florida", "Senate"): ({"dem_seats_won": 6, "rep_seats_won": 14, "seats_up": 20},
                            "two Democrats were unopposed, with no general-election race printed"),
}
TS_KEY = {"dem_seats": "demSeats", "rep_seats": "repSeats", "dem_seats_won": "demSeatsWon", "rep_seats_won": "repSeatsWon", "seats_up": "seatsUp"}

rows = list(csv.DictReader(open(STATE_LEG_CSV, newline="", encoding="utf-8")))
fields = list(rows[0].keys())
for r in rows:
    fix = FIXES.get((r["state_name"], r["type"])) if r["year"] == "2024" else None
    if fix:
        for k, v in fix[0].items():
            r[k] = str(v)
with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)

src = open(FORECAST, encoding="utf-8").read()
table = src.index("export const stateLegData")
for (state, typ), (cols, why) in FIXES.items():
    start = src.index(f'"{state}": [', table)
    end = src.index("]", start)
    m = re.compile(r'\{\s*"year": 2024,\s*"type": "%s",[^}]*\}' % typ).search(src, start)
    if not m or m.end() > end:
        raise SystemExit(f"forecastData.ts: {state} 2024 {typ} not found")
    row = m.group(0)
    for k, v in cols.items():
        row, n = re.subn(r'("%s": )\d+' % TS_KEY[k], lambda mm: mm.group(1) + str(v), row)
        if n != 1:
            raise SystemExit(f"forecastData.ts: {state} {typ} {k} not found once")
    src = src[:m.start()] + row + src[m.end():]
    print(f"{state} {typ} 2024: {cols} ({why})")
open(FORECAST, "w", encoding="utf-8").write(src)
