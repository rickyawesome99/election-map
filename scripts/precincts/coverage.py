"""The coverage grid (data/precincts/coverage.json): one status per state x year x office.

Shared by every results builder. A cell is "reconciled" when the statewide precinct sums for both
parties sit within RECONCILE_TOL of the site's own totals (as a share of the site's two-party vote),
"loaded" when votes are in but differ or there is nothing to compare, "explained" when a documented
note covers the difference. Cells the builder does not touch keep whatever they held.
"""
from __future__ import annotations

import datetime as dt
import fcntl
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COVERAGE = ROOT / "data" / "precincts" / "coverage.json"
RECONCILE_TOL = 0.005


def update_cells(st: str, year: int, n: int, sums: dict[str, dict], truth: dict, explained: dict | None = None, suspect: dict | None = None) -> str:
    # Builders for different years run side by side: one at a time through the read-change-write.
    lock = open(COVERAGE.with_suffix(".lock"), "w")
    fcntl.flock(lock, fcntl.LOCK_EX)
    cov = json.loads(COVERAGE.read_text()) if COVERAGE.exists() else {"states": {}}
    ycell = cov["states"].setdefault(st, {"n": n, "years": {}}).setdefault("years", {}).setdefault(str(year), {})
    line = []
    for office, s in sums.items():
        if s["d"] + s["r"] + s["o"] == 0:
            continue
        tr = truth.get(year, {}).get(office, {}).get(st)
        cell = {"status": "loaded", "d": s["d"], "r": s["r"], "o": s["o"], "src": s.get("src", ""), "basis": s.get("basis", "party"), "withVotes": round(s["precincts_with_votes"] / n, 4)}
        for k in ("matched", "local", "est", "stage"):
            if k in s:
                cell[k] = s[k]
        if tr and (tr["d"] + tr["r"]) > 0:
            two = tr["d"] + tr["r"]
            cell["truthD"], cell["truthR"] = tr["d"], tr["r"]
            cell["diffD"] = round((s["d"] - tr["d"]) / two, 5)
            cell["diffR"] = round((s["r"] - tr["r"]) / two, 5)
            if abs(cell["diffD"]) <= RECONCILE_TOL and abs(cell["diffR"]) <= RECONCILE_TOL:
                cell["status"] = "reconciled"
        note = (explained or {}).get((st, office)) or (suspect or {}).get((st, office))
        if cell["status"] == "loaded" and note:
            cell["note"] = note
            if (st, office) in (explained or {}):
                cell["status"] = "explained"
        ycell[office] = cell
        line.append(f"{office}:{'ok' if cell['status'] == 'reconciled' else cell['status'].upper() + ' ' + format(cell.get('diffD', float('nan')) * 100, '+.1f') + '/' + format(cell.get('diffR', float('nan')) * 100, '+.1f')}")
    cov["generated"] = dt.date.today().isoformat()
    COVERAGE.write_text(json.dumps(cov, separators=(",", ":"), sort_keys=True) + "\n")
    fcntl.flock(lock, fcntl.LOCK_UN)
    lock.close()
    return "  ".join(line)
