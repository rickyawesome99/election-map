#!/usr/bin/env python3
"""One-off snapshot of 2026 state legislative results from the NYT results pages' per-state JSON
(results and race calls from The Associated Press). Re-run only to take a new snapshot; nothing
reads the feed live. Writes data-entry/results_2026_state_leg.csv, one row per race:

    state, chamber (house/senate), seat (NYT's label), race_type, seats, uncontested, status, ...

`margin` is R-positive on all votes, by party total, like results_2026_seats.csv (blank when the
race is unopposed or has no votes). `decisive_margin` is unsigned: top two candidates in a
single-seat race, last winner over first loser in a multi-member one. `winners` are AP's calls (the
feed's outcome.won), which come seat by seat: a multi-member race can have one seat called and the
other not. `leaders` are the top vote-getters for the seats still uncalled.
`in_party_control` is the feed's flag for a race that counts toward the chamber: a special for a
seat also on the regular ballot (TX HD-93) does not. NYT's seat_number is not a stable key (VT
"526", MN "501"). Nebraska's ballot has no parties, so its candidates take theirs from
data-entry/nebraska_2026_candidate_parties.csv. Also writes results_2026_state_leg_chambers.csv:
each chamber's seats not up by party (holdovers), and NYT's own seat tally as a check.
"""
import csv, json, sys, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-{}.json"
UA = {"User-Agent": "Mozilla/5.0"}
STATES = ["alabama","alaska","arizona","arkansas","california","colorado","connecticut","delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan","minnesota","mississippi","missouri","montana","nebraska","nevada","new-hampshire","new-jersey","new-mexico","new-york","north-carolina","north-dakota","ohio","oklahoma","oregon","pennsylvania","rhode-island","south-carolina","south-dakota","tennessee","texas","utah","vermont","virginia","washington","west-virginia","wisconsin","wyoming"]
CHAMBER = {"SH": "house", "SS": "senate"}
PARTY = {"DEM": "D", "GOP": "R"}
ENTRY = Path(__file__).resolve().parent.parent / "data-entry"
OUT = ENTRY / "results_2026_state_leg.csv"
OUT_CHAMBERS = ENTRY / "results_2026_state_leg_chambers.csv"
FIELDS_CHAMBERS = ["state", "chamber", "total", "up", "called", "not_up_dem", "not_up_rep", "not_up_oth", "seats_dem", "seats_rep", "seats_oth"]
FIELDS = ["state", "chamber", "seat", "race_type", "seats", "uncontested", "status", "pct_expected", "total_votes", "dem_votes", "rep_votes", "other_votes", "margin", "decisive_margin", "winner_party", "winners", "leaders", "incumbents", "in_party_control", "candidates", "nyt_id", "updated_at", "fetched_at"]

def get(slug, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(BASE.format(slug), headers=UA), timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if i == tries - 1: raise
            print(f"  retry {slug}: {e}", file=sys.stderr); time.sleep(3 * (i + 1))

def nebraska_parties():
    with (ENTRY / "nebraska_2026_candidate_parties.csv").open() as f:
        return [r for r in csv.DictReader(f) if r["party"]]

def row(race, fetched_at, ne_party):
    unit = race["reporting_units"][0]
    meta = race["candidate_metadata"]
    cands = []
    for c in unit["candidates"]:
        m = meta[c["nyt_id"]]
        code = (m.get("party") or {}).get("nyt_id") or ""
        name = " ".join(x for x in (m.get("first_name"), m.get("last_name")) if x)
        nid = c["nyt_id"]
        party = PARTY.get(code, code or "O")
        if race["nyt_id"].startswith("NE-") and "write-in" not in name.lower():
            # The file's names can be fuller than the feed's (R. Brad von Gillern, George Dungan III).
            hit = [r["party"] for r in ne_party if r["district"] == race["seat_number"] and m.get("last_name") in r["candidate"]]
            if hit: party = hit[0]
            else: print(f"  no Nebraska party: {name} ({race['seat']})", file=sys.stderr)
        cands.append({"id": nid, "name": name, "party": party, "incumbent": bool(m.get("incumbent")), "votes": c["votes"]["total"], "writein": name.lower() in ("total write-ins", "write-ins", "write-in")})
    cands.sort(key=lambda c: -c["votes"])
    real = [c for c in cands if not c["writein"]]
    seats = race["max_winners"] or 1
    total = unit["total_votes"]
    dem = sum(c["votes"] for c in cands if c["party"] == "D")
    rep = sum(c["votes"] for c in cands if c["party"] == "R")
    uncontested = bool(race["uncontested"])
    margin = round((rep - dem) / total * 100, 3) if total and not uncontested else ""
    decisive = round((real[seats - 1]["votes"] - real[seats]["votes"]) / total * 100, 3) if total and len(real) > seats else ""
    won = set((race.get("outcome") or {}).get("won") or [])
    winners = [c for c in cands if c["id"] in won]
    leaders = [c for c in real if c["id"] not in won and c["votes"] > 0][:seats - len(winners)]
    parties = sorted({w["party"] for w in winners})
    return {
        "state": race["nyt_id"][:2], "chamber": CHAMBER[race["office_id"]], "seat": race["seat"], "race_type": race["type"],
        "seats": seats, "uncontested": int(uncontested), "status": race["race_call_status"], "pct_expected": unit.get("eevp"),
        "total_votes": total, "dem_votes": dem, "rep_votes": rep, "other_votes": total - dem - rep, "margin": margin, "decisive_margin": decisive,
        "winner_party": "/".join(parties), "winners": "; ".join(f"{w['name']} ({w['party']})" for w in winners),
        "leaders": "; ".join(f"{c['name']} ({c['party']})" for c in leaders), "in_party_control": int(bool(race.get("in_party_control"))),
        "incumbents": "; ".join(f"{c['name']} ({c['party']})" for c in cands if c["incumbent"]),
        "candidates": "; ".join(f"{c['name']} ({c['party']}) {c['votes']}" for c in cands),
        "nyt_id": race["nyt_id"], "updated_at": race.get("updated_at") or "", "fetched_at": fetched_at,
    }

def chamber_rows(data):
    results = (data.get("partyControlData") or {}).get("results") or []
    for res in results:
        for office_id, o in res["offices"].items():
            if office_id not in CHAMBER: continue
            pb = o["party_balance"]
            yield {
                "state": res["state_postal"], "chamber": CHAMBER[office_id], "total": o["total"], "up": o["open_seats"], "called": o["num_races_called"],
                **{f"not_up_{k}": pb.get(p, {}).get("no_election", 0) for k, p in (("dem", "DEM"), ("rep", "GOP"), ("oth", "OTH"))},
                **{f"seats_{k}": pb.get(p, {}).get("seats", 0) for k, p in (("dem", "DEM"), ("rep", "GOP"), ("oth", "OTH"))},
            }

def main():
    ne_party = nebraska_parties()
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows, chambers = [], []
    for slug in STATES:
        data = get(slug)
        hits = [r for r in data["races"] if r.get("office_id") in CHAMBER]
        chambers += chamber_rows(data)
        print(f"{slug}: {len(hits)} legislative races", file=sys.stderr)
        rows += [row(r, fetched_at, ne_party) for r in hits]
        time.sleep(0.2)
    rows.sort(key=lambda r: (r["state"], r["chamber"], r["seat"]))
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader(); w.writerows(rows)
    chambers.sort(key=lambda r: (r["state"], r["chamber"]))
    with OUT_CHAMBERS.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS_CHAMBERS)
        w.writeheader(); w.writerows(chambers)
    print(f"wrote {len(rows)} rows → {OUT}, {len(chambers)} chambers → {OUT_CHAMBERS}", file=sys.stderr)

if __name__ == "__main__":
    main()
