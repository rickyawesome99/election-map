#!/usr/bin/env python3
"""Louisiana odd-year results by precinct, from the Secretary of State's results service.

Louisiana elects its governor and legislature in odd years, in an October all-party primary with a
November runoff where nobody won a majority. No national collection has these by precinct. The state's
results site serves one JSON file per race and parish:

  https://voterportal.sos.la.gov/ElectionResults/ElectionResults/Data?blob={date}/…
    ElectionRaces.htm                         races of the election (Level 100 governor, 200 state senator, 205 state representative)
    RacesCandidates_Multiparish.htm           candidates of multi-parish races ("Name (REP)")
    RacesCandidates/ByParish_{PP}.htm         candidates of single-parish races
    VotesRaceByParish/Votes_{race}.htm        the parishes of a race
    VotesRaceByPrecinct/Votes_{race}_{PP}.htm precinct votes ("01/01" = ward/precinct; "Early Voting" is one parish-wide line)

The October primary is kept for every seat, because that is what the site's legislative totals are
(the governor is different: the site holds the runoff where there was one, and build_results_vest.py
supplies 2019). Unopposed seats are not on the ballot and do not appear. Responses
are cached in data-entry/precincts/raw/official/la/{date}/. Output is the per-state file the MEDSL
builder reads: data-entry/precincts/raw/medsl/{year}/by_state/LA.parquet.

  python3 scripts/precincts/fetch_louisiana.py 2019
  python3 scripts/precincts/fetch_louisiana.py 2023
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-entry" / "precincts" / "raw"
BASE = "https://voterportal.sos.la.gov/ElectionResults/ElectionResults/Data?blob="
DATES = {2019: ("20191012", "20191116"), 2023: ("20231014", "20231118")}
LEVEL = {"100": "GOV", "200": "SLDU", "205": "SLDL"}
PARTY = {"REP": "REPUBLICAN", "DEM": "DEMOCRAT", "IND": "INDEPENDENT", "NOPTY": "INDEPENDENT", "LBT": "LIBERTARIAN", "GRN": "GREEN"}


def get(date: str, path: str) -> dict | None:
    cache = RAW / "official" / "la" / date / path.replace("/", "__").replace(".htm", ".json")
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        out = subprocess.run(["curl", "-s", "-A", "Mozilla/5.0 (precinct pipeline)", "--max-time", "60", BASE + f"{date}/{path}"], capture_output=True, text=True).stdout
        time.sleep(0.15)
        if not out.lstrip().startswith("{"):  # one retry: a failed download cached as empty once dropped a whole parish (Webster, Senate 36, 2023)
            time.sleep(2)
            out = subprocess.run(["curl", "-s", "-A", "Mozilla/5.0 (precinct pipeline)", "--max-time", "60", BASE + f"{date}/{path}"], capture_output=True, text=True).stdout
        cache.write_text(out if out.lstrip().startswith("{") else "null")
    try:
        return json.loads(cache.read_text())
    except json.JSONDecodeError:
        return None


def as_list(x: object) -> list:
    return x if isinstance(x, list) else [] if x is None else [x]


def election(date: str) -> dict[tuple[str, str], list[tuple]]:
    """(office, district) → rows (parish code, precinct, candidate, party, votes)."""
    races = get(date, "ElectionRaces.htm")
    out: dict[tuple[str, str], list[tuple]] = {}
    if not races:
        return out
    names: dict[str, str] = {}

    def learn(doc: dict | None) -> None:
        for r in as_list(((doc or {}).get("Races") or {}).get("Race")):
            for c in as_list(r.get("Choice")):
                names[c["ID"]] = c.get("Desc", "")

    learn(get(date, "RacesCandidates_Multiparish.htm"))
    for r in as_list(races["Races"]["Race"]):
        office = LEVEL.get(r.get("Level"))
        if not office:
            continue
        m = re.search(r"(\d+)(?:st|nd|rd|th)", r["OfficeTitleAndDesc"])
        district = m.group(1) if (m and office != "GOV") else ""
        par = get(date, f"VotesRaceByParish/Votes_{r['RaceID']}.htm")
        rows = []
        for p in as_list(((par or {}).get("Parishes") or {}).get("Parish")):
            pp = p["ParishValue"]
            doc = get(date, f"VotesRaceByPrecinct/Votes_{r['RaceID']}_{pp}.htm")
            precincts = as_list(((doc or {}).get("Precincts") or {}).get("Precinct"))
            if any(c["ID"] not in names for pr in precincts for c in as_list(pr.get("Choice"))):
                learn(get(date, f"RacesCandidates/ByParish_{pp}.htm"))
            for pr in precincts:
                for c in as_list(pr.get("Choice")):
                    desc = names.get(c["ID"], c["ID"])
                    pm = re.search(r"\(([A-Z]+)\)\s*$", desc)
                    rows.append((pp, pr["Precinct"], re.sub(r"\s*\([A-Z]+\)\s*$", "", desc).replace('"', "").strip(), pm.group(1) if pm else "", int(c.get("VoteTotal") or 0)))
        if rows:
            out[(office, district)] = rows
    return out


def main() -> None:
    year = int(sys.argv[1])
    primary, runoff = (election(d) for d in DATES[year])
    rows = []
    stage = {}
    for key in sorted(set(primary) | set(runoff)):
        # The October primary is what the site holds for every legislative seat, runoff or not (all 49 seats that
        # went to a runoff in 2019 and 2023 match its primary totals), so the primary is kept; a seat that
        # somehow only appears in November falls back to that.
        use = primary.get(key) or runoff[key]
        stage[key] = "runoff" if key in runoff else "primary"
        for pp, precinct, cand, party, votes in use:
            rows.append((f"22{2 * int(pp) - 1:03d}", f"PARISH {pp}", precinct, key[0], key[1], cand.upper(), PARTY.get(party, party), False, "TOTAL", votes))
    df = pd.DataFrame(rows, columns=["county", "jurisdiction", "precinct", "office", "district", "candidate", "party", "writein", "mode", "votes"])
    dest = RAW / "medsl" / str(year) / "by_state"
    dest.mkdir(parents=True, exist_ok=True)
    df.to_parquet(dest / "LA.parquet", index=False)
    n_run = sum(1 for v in stage.values() if v == "runoff")
    print(f"LA {year}: {len(df)} rows, {df['office'].value_counts().to_dict()}, seats {len(stage)} ({n_run} also went to a runoff)")


if __name__ == "__main__":
    main()
