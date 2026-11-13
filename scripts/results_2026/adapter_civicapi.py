"""civicAPI race payloads (raw/civicapi/race/<id>.json.gz) → Rows.

Federal and governor races take their seat from data-entry/results_2026_seats.csv by civic_id, so
the Senate specials (FL, OH) stay apart from regular seats. State-leg seats come from the feed's
district code ("WI-AD-025" → "25", "ID-HD-034A" → "34A"); WA's position is only in the election
name. Nebraska's unicameral ("NE-UL-24") is state_senate, as in our other state-leg files.

County rows are the feed's County / Borough / Parish regions with a 5-digit FIPS. A race whose
county rows sum to zero while its topline has votes (WI Assembly: every county reads 0) keeps its
topline and drops the counties.
"""
import csv, glob, re

from common import ENTRY, RAW, SPECIAL_RE, Row, read_json

OFFICE = {"US Senate": "senate", "Governor": "governor", "House of Representatives": "house", "State House": "state_house", "State Senate": "state_senate"}
COUNTY_TYPES = {"County", "Borough", "Parish", "Census Area", "Independent City", "City", "Municipality"}


def federal_seats():
    out = {}
    with (ENTRY / "results_2026_seats.csv").open() as f:
        for r in csv.DictReader(f):
            seat = str(int(r["race_id"][2:])) if r["office"] == "house" else ""
            out[r["civic_id"]] = (r["office"], r["state"], seat, int(r["special"]))
    return out


def state_leg_seat(race):
    m = re.fullmatch(r"([A-Z]{2})-(HD|SD|AD|UL)-0*(\d+)([A-Z]?)", race.get("district") or "")
    if not m:
        return None
    seat = m.group(3) + m.group(4)
    pos = re.search(r"\bPosition\s+(\d+)", race.get("election_name") or "")
    if pos:
        seat += f"-P{pos.group(1)}"
    office = "state_senate" if m.group(2) in ("SD", "UL") else "state_house"
    return office, m.group(1), seat, 1 if SPECIAL_RE.search(race.get("election_name") or "") else 0


def rows(path, fed):
    race = read_json(path)
    rid = path.split("/")[-1].split(".")[0]
    if race.get("test_data"):
        return [], None
    office = OFFICE.get(race.get("election_type")) or OFFICE.get(race.get("type"))
    if office in ("senate", "governor", "house"):
        key = fed.get(rid)
    else:
        key = state_leg_seat(race)
    if not key:
        return [], {"civic_id": rid, "name": race.get("election_name"), "why": "no seat"}
    office, state, seat, special = key
    meta = {"civic_id": rid, "name": race.get("election_name"), "pct_reporting": race.get("percent_reporting"),
            "last_updated": race.get("last_updated"), "called_at": race.get("called_at"), "seats": race.get("seats") or 1}
    out = []
    vote_for = int(race.get("seats") or 1)
    base = dict(office=office, state=state, seat=seat, special=special, vote_for=vote_for, contest=race.get("election_name") or "")
    for c in race.get("candidates") or []:
        out.append(Row(level="state", unit="", unit_name=state, candidate=c["name"], party=c.get("party") or "",
                       votes=int(c.get("votes") or 0), winner="1" if c.get("winner") else "0",
                       incumbent="1" if c.get("incumbent") else "0", **base))
    counties = []
    for reg in (race.get("region_results") or {}).values():
        fips = reg.get("fips") or ""
        if reg.get("type") not in COUNTY_TYPES or not re.fullmatch(r"\d{5}", fips):
            continue
        for c in reg.get("candidates") or []:
            counties.append(Row(level="county", unit=fips, unit_name=reg.get("name") or "", county_fips=fips,
                                candidate=c["name"], party=c.get("party") or "", votes=int(c.get("votes") or 0), **base))
    if counties and (sum(r.votes for r in counties) > 0 or sum(r.votes for r in out) == 0):
        out += counties
    elif counties:
        meta["county_dropped"] = "county rows all zero"
    return out, meta


def load():
    fed = federal_seats()
    allrows, metas, skipped = [], {}, []
    for p in sorted(glob.glob(str(RAW / "civicapi" / "race" / "*.json.gz"))):
        rs, meta = rows(p, fed)
        if not rs:
            if meta:
                skipped.append(meta)
            continue
        k = (rs[0].office, rs[0].state, rs[0].seat, rs[0].special)
        if k in metas:
            # Two feed races on one seat: keep the one with more votes, log the other.
            old = sum(r.votes for r in allrows if r.level == "state" and (r.office, r.state, r.seat, r.special) == k)
            new = sum(r.votes for r in rs if r.level == "state")
            skipped.append({**meta, "why": f"duplicate seat {k} ({new:,} vs {old:,} votes)"})
            if new <= old:
                continue
            allrows = [r for r in allrows if (r.office, r.state, r.seat, r.special) != k]
        metas[k] = meta
        allrows += rs
    return allrows, metas, skipped
