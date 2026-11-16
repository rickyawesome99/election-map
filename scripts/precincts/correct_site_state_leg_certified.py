#!/usr/bin/env python3
"""Correct four state-legislative district results on the site against the certified canvass.

Found by the precinct reconciliation (/audit/precincts) and written only after each figure was read
from the state's official canvass AND a second source, and equals the precinct sum:

  Arizona House 18, 2018   the site's (Klarner) row left out Republican Jill Norgaard, 44,269 votes.
                           Signed official canvass, 3 Dec 2018, p. 8 (azsos.gov); Wikipedia.
  Montana House 3, 2020    Debo Powers (D) held 12,393 on the site; certified 2,393. Mitchell (R, 3,586) won.
  Montana House 19, 2020   Wendy McKamey (R) held 14,288; certified 4,288. Libertarian Schultz (762) was missing.
  Montana House 84, 2020   Charlie Hull (R) held 12,819; certified 2,819. Dunwell (D, 3,256) won.
                           2020 Legislative General Election Canvass (sosmt.gov); Wikipedia. The three
                           Montana figures were each exactly 10,000 too high, which flipped two winners.

Checked and deliberately NOT changed (the site was right, the precinct source was not):
  Arkansas House 9 and 99, 2016 (the precinct file merges a same-day special election) and
  Oregon House 34, 35, 47, 2016 (the challengers' first party was the Independent Party).

  python3 scripts/precincts/correct_site_state_leg_certified.py --report | --write
Then: node scripts/build-state-leg-results.mjs && python3 scripts/correct-statewide-from-districts.py --write
      && node data-entry/build.js, and the usual derived builds. The chamber blocks as they stood at the
      2026 lock are in data/stateLegResultsLocked2026.ts.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXES = {
    ("AZ", 2018, "house", "18"): {"demVotes": 103245, "repVotes": 83847, "othVotes": 0, "totalVotes": 187092, "candidates": [
        {"name": "Denise Epstein", "party": "D", "votes": 52992, "incumbent": True, "winner": True},
        {"name": "Jennifer Jermaine", "party": "D", "votes": 50253, "winner": True},
        {"name": "Jill Norgaard", "party": "R", "votes": 44269, "incumbent": True},
        {"name": "Greg Patterson", "party": "R", "votes": 39578}]},
    ("MT", 2020, "house", "3"): {"demVotes": 2393, "repVotes": 3586, "othVotes": 0, "totalVotes": 5979, "candidates": [
        {"name": "Braxton Mitchell", "party": "R", "votes": 3586, "winner": True},
        {"name": "Debo Powers", "party": "D", "votes": 2393, "incumbent": True}]},
    ("MT", 2020, "house", "19"): {"demVotes": 0, "repVotes": 4288, "othVotes": 762, "totalVotes": 5050, "uncontested": True, "candidates": [
        {"name": "Wendy McKamey", "party": "R", "votes": 4288, "incumbent": True, "winner": True},
        {"name": "George Anthony Schultz", "party": "O", "votes": 762}]},
    ("MT", 2020, "house", "84"): {"demVotes": 3256, "repVotes": 2819, "othVotes": 0, "totalVotes": 6075, "candidates": [
        {"name": "Mary Ann Dunwell", "party": "D", "votes": 3256, "incumbent": True, "winner": True},
        {"name": "Charlie Hull", "party": "R", "votes": 2819}]},
}


def main() -> None:
    write = "--write" in sys.argv
    for (st, year, chamber, d), new in FIXES.items():
        path = ROOT / "data-entry" / "state-leg-results" / f"{st}-{year}.json"
        j = json.loads(path.read_text())
        old = j[chamber]["districts"][d]
        print(f"{st} {year} {chamber} {d}: D {old['demVotes']:,} → {new['demVotes']:,}   R {old['repVotes']:,} → {new['repVotes']:,}   other {old['othVotes']:,} → {new['othVotes']:,}"
              f"   winner {[c['name'] for c in old['candidates'] if c.get('winner')]} → {[c['name'] for c in new['candidates'] if c.get('winner')]}")
        if write and old != new:
            j[chamber]["districts"][d] = new
            path.write_text(json.dumps(j, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
