#!/usr/bin/env python3
"""Build the 2026 official-results files from scripts/results_2026/fetch.py's raw downloads.

    python3 scripts/results_2026/build.py

Source rule (Call the Map's): every count is an official count. A state on data-entry/results-2026/
sources.csv with kind=direct is read from its election office's own file; every other state, and
any race a direct file lacks, from civicAPI (which gathers the states' and counties' official
counts). No news organization's counts are used. The NYT/AP state-leg snapshot
(results_2026_state_leg.csv) is only the roster of expected races and a check column.

Writes to data-entry/results-2026/ (columns in its README.md):
    races.csv          one row per race: candidates by party, percentages, margin (R−D), checks
    candidates.csv     one row per race × candidate, statewide
    counties.csv       one row per race × county × candidate
    precincts/ST.csv.gz  one row per race × precinct × candidate, direct sources only
    county_{senate,senate_special,governor,house}_results_2026.csv, house_district_county_results_2026.csv
                       the same county figures in the layout of the past-year files
    coverage.csv       per state × office: races expected, found, source, levels, check spread
    build_log.txt      unmatched counties, skipped feed races, the largest check differences
"""
import csv, json, re
from collections import defaultdict
from datetime import datetime, timezone

import adapter_civicapi
from adapters_direct import ADAPTERS
from common import ENTRY, OFFICES, OUT, RAW, STATES, is_overunder, is_write_in, name_key, nyt_seat, party_simple, sources, tidy_name, write_csv

LOG = []


def log(msg):
    LOG.append(msg)
    print(msg)


# ---------------------------------------------------------------- roster

def roster():
    """Every 2026 general-election race we expect, keyed (office, state, seat, special)."""
    out = {}
    with (ENTRY / "results_2026_seats.csv").open() as f:
        for r in csv.DictReader(f):
            seat = str(int(r["race_id"][2:])) if r["office"] == "house" else ""
            out[(r["office"], r["state"], seat, int(r["special"]))] = {"race_id": r["race_id"], "label": r["label"], "ap_total": "", "ap_seats": 1, "uncontested": False}
    with (ENTRY / "results_2026_state_leg.csv").open() as f:
        for r in csv.DictReader(f):
            if "Primary" in r["race_type"]:
                continue
            office = "state_house" if r["chamber"] == "house" else "state_senate"
            seat = nyt_seat(r["seat"])
            special = 1 if "Special" in r["race_type"] else 0
            out[(office, r["state"], seat, special)] = {
                "race_id": f"{r['state']}-{'H' if office == 'state_house' else 'S'}-{seat}" + ("-SP" if special else ""),
                "label": f"{r['state']} {'House' if office == 'state_house' else 'Senate'} {r['seat']}" + (" (special)" if special else ""),
                "ap_total": r["total_votes"], "ap_seats": int(r["seats"] or 1), "uncontested": r["uncontested"] == "1",
                "ap_candidates": r["candidates"], "ap_winners": r["winners"], "ap_fetched": r["fetched_at"]}
    return out


def reconcile(races, ros):
    """AP marks some seats special that a source prints as regular (CO SD-17, VA HD-20) and the
    reverse; when a seat has one race only, take the roster's flag."""
    for k in list(races):
        alt = (k[0], k[1], k[2], 1 - k[3])
        if k not in ros and alt in ros and alt not in races:
            races[alt] = races.pop(k)
    return races


# ---------------------------------------------------------------- per-race assembly

class Race:
    def __init__(self, key):
        self.key = key
        self.state = defaultdict(int)                 # candidate → votes
        self.party = {}                               # candidate → party as printed
        self.county = defaultdict(int)                # (fips, candidate) → votes
        self.county_name = {}
        self.precinct = defaultdict(int)              # (fips, pid, pname, candidate) → votes
        self.vote_for = 1
        self.winner, self.incumbent = {}, {}
        self.state_contest = None
        self.contests = set()

    def add(self, r):
        if is_overunder(r.candidate):
            return
        self.vote_for = max(self.vote_for, int(r.vote_for or 1))
        self.party.setdefault(r.candidate, r.party)
        self.contests.add(r.contest)
        if r.winner:
            self.winner[r.candidate] = r.winner
        if r.incumbent:
            self.incumbent[r.candidate] = r.incumbent
        if r.level == "state":
            # A seat printed under two contest names statewide would double count; keep the first.
            if self.state_contest is None:
                self.state_contest = r.contest
            if r.contest == self.state_contest:
                self.state[r.candidate] += r.votes
        elif r.level == "county":
            self.county[(r.unit, r.candidate)] += r.votes
            self.county_name[r.unit] = r.unit_name
        else:
            fips, pid = r.unit.split(":", 1)
            self.precinct[(fips, pid, r.unit_name, r.candidate)] += r.votes

    def fill_levels(self):
        """Sum precincts up to counties and counties up to the state where a file lacks a level.
        Precincts with no county (HI overseas) count statewide only."""
        if not self.county and self.precinct:
            for (fips, _, _, c), v in self.precinct.items():
                if fips:
                    self.county[(fips, c)] += v
        if not self.state:
            if self.precinct:
                for (_, _, _, c), v in self.precinct.items():
                    self.state[c] += v
            else:
                for (_, c), v in self.county.items():
                    self.state[c] += v


def assemble(rows):
    races = {}
    for r in rows:
        k = (r.office, r.state, r.seat, r.special)
        races.setdefault(k, Race(k)).add(r)
    for race in races.values():
        race.fill_levels()
    return races


# ---------------------------------------------------------------- AP fill-in

AP_SRC = {"kind": "ap", "source": "AP via NYT (unofficial)", "url": "https://static01.nyt.com/elections-assets/pages/data/2026-11-03/"}


def ap_race(key, r):
    """A Race from the NYT/AP snapshot's candidate string ("Name (R) 2800; Name (NP) 1778")."""
    race = Race(key)
    race.vote_for = r.get("ap_seats", 1)
    for part in (r.get("ap_candidates") or "").split(";"):
        m = re.match(r"^(.*) \(([^()]*)\) (\d+)$", part.strip())
        if m:
            race.state[m.group(1)] += int(m.group(3))
            race.party.setdefault(m.group(1), m.group(2))
    won = {re.sub(r" \([^()]*\)$", "", w.strip()) for w in (r.get("ap_winners") or "").split(";") if w.strip()}
    race.winner = {c: "1" if c in won else "0" for c in race.state} if won else {}
    return race


# ---------------------------------------------------------------- candidates across sources

def match_names(direct, civic):
    """Direct source name → civicAPI's display name (and its call/incumbent flags), by surname
    and party; unmatched names are tidied (ALL CAPS → title case)."""
    out = {}
    pool = defaultdict(list)
    if civic:
        for c in civic.state:
            pool[(name_key(c), party_simple(civic.party.get(c), c))].append(c)
            pool[(name_key(c), None)].append(c)
    for c in direct.state:
        p = party_simple(direct.party.get(c), c)
        hit = pool.get((name_key(c), p)) or pool.get((name_key(c), None)) or []
        out[c] = hit[0] if len(hit) == 1 and not is_write_in(c) else tidy_name(c)
    return out


def rename(race, names, civic):
    def nm(c):
        return names.get(c, c)
    new = Race(race.key)
    new.vote_for = race.vote_for
    new.contests = race.contests
    for c, v in race.state.items():
        new.state[nm(c)] += v
        new.party.setdefault(nm(c), race.party.get(c, ""))
    for (f, c), v in race.county.items():
        new.county[(f, nm(c))] += v
    new.county_name = race.county_name
    for (f, pid, pn, c), v in race.precinct.items():
        new.precinct[(f, pid, pn, nm(c))] += v
    if civic:
        new.winner = {c: w for c, w in civic.winner.items() if c in new.state}
        new.incumbent = {c: i for c, i in civic.incumbent.items() if c in new.state}
    return new


# ---------------------------------------------------------------- figures

def party_totals(votes, party):
    t = {"D": 0, "R": 0, "O": 0}
    for c, v in votes.items():
        p = party_simple(party.get(c), c)
        t[p if p in ("D", "R") else "O"] += v
    return t


def pct(v, total):
    return round(100 * v / total, 2) if total else 0


def race_row(key, race, meta, src, civic, ros, fetched):
    office, state, seat, special = key
    votes = race.state
    total = sum(votes.values())
    ranked = sorted(votes, key=lambda c: -votes[c])
    named = [c for c in ranked if not is_write_in(c)]
    by_party = defaultdict(list)
    for c in ranked:
        by_party[party_simple(race.party.get(c), c)].append(c)
    t = party_totals(votes, race.party)
    vf = max(race.vote_for, ros.get("ap_seats", 1) if ros else 1)
    called = [c for c in ranked if race.winner.get(c) == "1"]
    parties = {party_simple(race.party.get(c), c) for c in named}
    contest = "uncontested" if len(named) <= vf else "same_party" if len(parties) == 1 else "contested"
    civic_total = sum(civic.state.values()) if civic else ""
    ap_total = int(ros["ap_total"]) if ros and ros.get("ap_total") else ""
    county_sum = sum(race.county.values())
    flags = []
    if src["kind"] == "ap":
        flags.append("unofficial_ap")
        if (meta or {}).get("ap_reason") == "replaced zero official count":
            flags.append("official_count_zero")
        ap_total = ""
    if not total:
        flags.append("ap_no_count" if src["kind"] == "ap" else "zero_votes")
    elif not race.county:
        flags.append("no_counties")
    elif abs(county_sum - total) > 0.005 * total:
        flags.append(f"county_sum_off({100 * (county_sum - total) / total:+.1f}%)")
    if src["kind"] == "direct" and civic_total and abs(total - civic_total) > 0.005 * civic_total:
        flags.append("differs_from_civicapi")
    if ap_total and total and total < 0.99 * ap_total:
        flags.append("behind_ap")
    if race.precinct and total and sum(race.precinct.values()) < 0.99 * total:
        flags.append("precincts_incomplete")
    if (meta or {}).get("county_dropped"):
        flags.append("feed_counties_all_zero")
    return {
        "office": office, "state": state, "seat": seat, "special": special,
        "race_id": ros["race_id"] if ros else f"{state}-{office}-{seat}",
        "label": ros["label"] if ros else "",
        "vote_for": vf, "contest": contest, "candidates_n": len(named),
        "dem_candidate": " / ".join(by_party["D"][:vf]), "rep_candidate": " / ".join(by_party["R"][:vf]),
        "dem_votes": t["D"], "rep_votes": t["R"], "oth_votes": t["O"], "total_votes": total,
        "dem_pct": pct(t["D"], total), "rep_pct": pct(t["R"], total), "oth_pct": pct(t["O"], total),
        "margin": round(pct(t["R"], total) - pct(t["D"], total), 2), "vote_margin": t["R"] - t["D"],
        "leader": " / ".join(named[:vf]), "leader_party": "/".join(party_simple(race.party.get(c), c) for c in named[:vf]),
        "called_winner": " / ".join(called), "called_party": "/".join(party_simple(race.party.get(c), c) for c in called),
        "source_kind": src["kind"], "source": src["source"], "source_url": src["url"], "fetched_at": fetched,
        "pct_reporting_feed": (meta or {}).get("pct_reporting", "") if src["kind"] == "civicapi" else "",
        "county_rows": len({f for f, _ in race.county}), "precinct_rows": len({(f, p) for f, p, _, _ in race.precinct}),
        "precinct_vote_share": round(sum(race.precinct.values()) / total, 4) if race.precinct and total else "",
        "check_civicapi_total": civic_total if src["kind"] == "direct" else "",
        "check_civicapi_diff_pct": round(100 * (total - civic_total) / civic_total, 3) if src["kind"] == "direct" and civic_total else "",
        "check_ap_total": ap_total,
        "check_ap_diff_pct": round(100 * (total - ap_total) / ap_total, 3) if ap_total else "",
        "flags": " ".join(flags),
        "candidates": "; ".join(f"{c} ({race.party.get(c) or '-'}) {votes[c]}" for c in ranked),
    }


RACE_FIELDS = ["office", "state", "seat", "special", "race_id", "label", "vote_for", "contest", "candidates_n",
               "dem_candidate", "rep_candidate", "dem_votes", "rep_votes", "oth_votes", "total_votes", "dem_pct", "rep_pct", "oth_pct",
               "margin", "vote_margin", "leader", "leader_party", "called_winner", "called_party",
               "source_kind", "source", "source_url", "fetched_at", "pct_reporting_feed", "county_rows", "precinct_rows", "precinct_vote_share",
               "check_civicapi_total", "check_civicapi_diff_pct", "check_ap_total", "check_ap_diff_pct", "flags", "candidates"]
KEY_FIELDS = ["office", "state", "seat", "special", "race_id"]


def main():
    manifest = json.loads((RAW / "manifest.json").read_text())
    src_by_state = {s["state"]: s for s in sources()}
    civic_src = {"kind": "civicapi", "source": "civicAPI", "url": "https://civicapi.org"}
    ros = roster()

    civ_rows, civ_meta, skipped = adapter_civicapi.load()
    civic = reconcile(assemble(civ_rows), ros)
    log(f"civicAPI: {len(civic)} races from {len(civ_meta)} payloads; {len(skipped)} skipped")
    for s in skipped:
        log(f"  skipped civicAPI {s['civic_id']} {s.get('name')}: {s.get('why', '')}")

    chosen = {}  # key → (race, src, meta, fetched)
    for k, race in civic.items():
        m = civ_meta.get(k, {})
        f = manifest.get(f"civicapi/race/{m.get('civic_id')}", {}).get("fetched_at", "")
        chosen[k] = (race, {**civic_src, "url": f"https://civicapi.org/race/{m.get('civic_id')}"}, m, f)

    for st, s in src_by_state.items():
        if s["kind"] != "direct":
            continue
        if f"direct/{st}" not in manifest:
            log(f"{st}: direct source not downloaded; civicAPI kept")
            continue
        rows, unmatched = ADAPTERS[s["adapter"]](st)
        for u in sorted(unmatched):
            log(f"  {st}: county name not matched to FIPS: {u!r}")
        direct = reconcile(assemble(rows), ros)
        fetched = manifest[f"direct/{st}"]["fetched_at"]
        n = 0
        for k, race in direct.items():
            if not race.state:
                continue
            c = civic.get(k)
            race = rename(race, match_names(race, c), c)
            chosen[k] = (race, s, civ_meta.get(k), fetched)
            n += 1
        log(f"{st}: {n} races from {s['source']}")

    # AP fill-in (user's call, 2026-11-12): a state-leg race no official source has (AK, DE, MA,
    # NH, VT), or one the official feed has at 0 votes while AP has a count (KY, MI), takes AP's
    # counts from the NYT snapshot, toplines only, as source_kind "ap" with the unofficial_ap
    # flag. In a chamber AP fills, an unopposed race AP didn't count stays in at 0 votes.
    official = {(k[0], k[1]) for k, (race, *_rest) in chosen.items() if sum(race.state.values())}
    filled = defaultdict(int)
    for k, r in ros.items():
        if not r.get("ap_candidates"):
            continue
        cur = chosen.get(k)
        if cur and sum(cur[0].state.values()):
            continue
        race = ap_race(k, r)
        if not sum(race.state.values()) and ((k[0], k[1]) in official or cur):
            continue
        chosen[k] = (race, AP_SRC, {"ap_reason": "replaced zero official count" if cur else "no official source"}, r.get("ap_fetched", ""))
        filled[k[1]] += 1
    log(f"AP fill-in (unofficial): {sum(filled.values())} races: " + " ".join(f"{st} {n}" for st, n in sorted(filled.items())))

    races, cands, counties = [], [], []
    precincts = defaultdict(list)
    tmpl = {}
    with (ENTRY.parent / "data" / "county_template.csv").open() as f:
        for r in csv.DictReader(f):
            tmpl[r["county_id"]] = r["county_name"]

    for k in sorted(chosen, key=lambda k: (OFFICES.index(k[0]), k[1], _seat_sort(k[2]), k[3])):
        race, src, meta, fetched = chosen[k]
        row = race_row(k, race, meta, src, civic.get(k), ros.get(k), fetched)
        races.append(row)
        keyd = {f: row[f] for f in KEY_FIELDS}
        total = row["total_votes"]
        ranked = sorted(race.state, key=lambda c: -race.state[c])
        for i, c in enumerate(ranked, 1):
            cands.append({**keyd, "candidate": c, "party": race.party.get(c, ""), "party_simple": party_simple(race.party.get(c), c),
                          "votes": race.state[c], "pct": pct(race.state[c], total), "rank": i,
                          "called_winner": race.winner.get(c, ""), "incumbent": race.incumbent.get(c, ""), "source": src["source"]})
        ctot = defaultdict(int)
        for (fips, c), v in race.county.items():
            ctot[fips] += v
        for (fips, c), v in sorted(race.county.items(), key=lambda x: (x[0][0], -x[1])):
            counties.append({**keyd, "county_fips": fips, "county_name": tmpl.get(fips) or race.county_name.get(fips, ""),
                             "candidate": c, "party_simple": party_simple(race.party.get(c), c), "votes": v,
                             "pct": pct(v, ctot[fips]), "county_total": ctot[fips], "source": src["source"]})
        for (fips, pid, pname, c), v in race.precinct.items():
            precincts[k[1]].append({**keyd, "county_fips": fips, "county_name": tmpl.get(fips, ""), "precinct_id": pid, "precinct_name": pname,
                                    "candidate": c, "party_simple": party_simple(race.party.get(c), c), "votes": v})

    nob = 0
    for k, r in ros.items():
        if k in chosen or (k[0], k[1]) not in official or not r.get("uncontested") or r.get("ap_total") not in ("", "0"):
            continue
        # Unopposed seats that never reach the ballot (FL, OK, AR) or were settled in the primary
        # (HI): no official count exists. AP's roster supplies the name only.
        nob += 1
        names = [re.sub(r"\s+\d+$", "", c).strip() for c in (r.get("ap_candidates") or "").split(";") if c.strip()]
        names = [n for n in names if not re.search(r"write-?ins?", n, re.I)]
        races.append({"office": k[0], "state": k[1], "seat": k[2], "special": k[3], "race_id": r["race_id"], "label": r["label"],
                      "vote_for": r.get("ap_seats", 1), "contest": "not_on_ballot", "candidates_n": len(names),
                      "leader": r.get("ap_winners") or " / ".join(names), "called_winner": r.get("ap_winners", ""),
                      "source_kind": "roster", "source": "AP roster (no ballot contest)", "total_votes": 0, "candidates": "; ".join(names)})
    races.sort(key=lambda r: (OFFICES.index(r["office"]), r["state"], _seat_sort(r["seat"]), int(r["special"])))
    log(f"not on the ballot (unopposed, AP roster names only): {nob}")
    write_csv(OUT / "races.csv", RACE_FIELDS, races)
    write_csv(OUT / "candidates.csv", KEY_FIELDS + ["candidate", "party", "party_simple", "votes", "pct", "rank", "called_winner", "incumbent", "source"], cands)
    write_csv(OUT / "counties.csv", KEY_FIELDS + ["county_fips", "county_name", "candidate", "party_simple", "votes", "pct", "county_total", "source"], counties)
    for st, rs in precincts.items():
        write_csv(OUT / "precincts" / f"{st}.csv.gz", KEY_FIELDS + ["county_fips", "county_name", "precinct_id", "precinct_name", "candidate", "party_simple", "votes"], rs, gz=True)
    write_compat(chosen, tmpl)
    write_coverage(races, ros, src_by_state)
    checks(races, ros)
    (OUT / "build_log.txt").write_text(f"built {datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}\n" + "\n".join(LOG) + "\n")
    log(f"wrote {len(races)} races, {len(cands)} candidate rows, {len(counties)} county rows, "
        f"{sum(len(v) for v in precincts.values())} precinct rows ({len(precincts)} states)")


def _seat_sort(seat):
    m = re.match(r"(\d+)(.*)", seat)
    return (int(m.group(1)), m.group(2)) if m else (10**6, seat)


# ---------------------------------------------------------------- past-year layouts

def write_compat(chosen, tmpl):
    """County figures in the same layout as data-entry/county_*_results_YYYY.csv and
    house_district_county_results.csv. dem/gop are party sums (CA's same-party seats put both
    finalists in one column, as partyVotes() does)."""
    def party_split(race):
        out = defaultdict(lambda: {"D": 0, "R": 0, "O": 0})
        for (fips, c), v in race.county.items():
            p = party_simple(race.party.get(c), c)
            out[fips][p if p in ("D", "R") else "O"] += v
        return out

    for office, special, name in (("senate", 0, "senate"), ("senate", 1, "senate_special"), ("governor", 0, "governor")):
        rows = []
        for k, (race, *_rest) in chosen.items():
            if k[0] != office or k[3] != special:
                continue
            for fips, t in party_split(race).items():
                rows.append({"state": k[1], "county_name": tmpl.get(fips) or race.county_name.get(fips, ""), "county_id": fips,
                             "dem_2026": t["D"], "gop_2026": t["R"], "oth_2026": t["O"], "total_2026": t["D"] + t["R"] + t["O"]})
        rows.sort(key=lambda r: (r["state"], r["county_name"]))
        write_csv(OUT / f"county_{name}_results_2026.csv", ["state", "county_name", "county_id", "dem_2026", "gop_2026", "oth_2026", "total_2026"], rows)

    pieces, county = [], defaultdict(lambda: {"D": 0, "R": 0, "O": 0, "n": 0, "state": ""})
    for k, (race, src, *_rest) in chosen.items():
        if k[0] != "house":
            continue
        for fips, t in party_split(race).items():
            pieces.append({"year": 2026, "state": k[1], "district": k[2], "county_fips": fips, "county_name": tmpl.get(fips) or race.county_name.get(fips, ""),
                           "dem": t["D"], "gop": t["R"], "oth": t["O"], "total": t["D"] + t["R"] + t["O"], "source": src["source"]})
            c = county[fips]
            c["state"] = k[1]
            c["name"] = tmpl.get(fips) or race.county_name.get(fips, "")
            for p in "DRO":
                c[p] += t[p]
            c["n"] += 1
    pieces.sort(key=lambda r: (r["state"], int(r["district"]), r["county_name"]))
    write_csv(OUT / "house_district_county_results_2026.csv", ["year", "state", "district", "county_fips", "county_name", "dem", "gop", "oth", "total", "source"], pieces)
    rows = [{"state": c["state"], "county_name": c["name"], "county_id": f, "dem_2026": c["D"], "gop_2026": c["R"], "oth_2026": c["O"],
             "total_2026": c["D"] + c["R"] + c["O"], "districts_2026": c["n"]} for f, c in county.items()]
    rows.sort(key=lambda r: (r["state"], r["county_name"]))
    write_csv(OUT / "county_house_results_2026.csv", ["state", "county_name", "county_id", "dem_2026", "gop_2026", "oth_2026", "total_2026", "districts_2026"], rows)


# ---------------------------------------------------------------- coverage + checks

def write_coverage(races, ros, src_by_state):
    have = defaultdict(list)
    for r in races:
        have[(r["state"], r["office"])].append(r)
    want = defaultdict(set)
    for k in ros:
        want[(k[1], k[0])].add(k)
    rows = []
    for st in STATES:
        for office in OFFICES:
            got = have.get((st, office), [])
            exp = want.get((st, office), set())
            if not got and not exp:
                continue
            gotk = {(r["office"], r["state"], r["seat"], int(r["special"])) for r in got}
            diffs = [abs(float(r["check_civicapi_diff_pct"])) for r in got if r.get("check_civicapi_diff_pct", "") != ""]
            apd = [abs(float(r["check_ap_diff_pct"])) for r in got if r.get("check_ap_diff_pct", "") != ""]
            rows.append({"state": st, "office": office, "expected": len(exp), "found": len(gotk & exp),
                         "missing": " ".join(sorted(k[2] + ("sp" if k[3] else "") for k in exp - gotk)),
                         "not_in_roster": " ".join(sorted(k[2] + ("sp" if k[3] else "") for k in gotk - exp)),
                         "source": "/".join(sorted({r["source"] for r in got if r["source_kind"] != "roster"})),
                         "not_on_ballot": sum(1 for r in got if r["contest"] == "not_on_ballot"),
                         "flagged": sum(1 for r in got if r.get("flags")),
                         "with_counties": sum(1 for r in got if r.get("county_rows")), "with_precincts": sum(1 for r in got if r.get("precinct_rows")),
                         "max_civicapi_diff_pct": max(diffs) if diffs else "", "max_ap_diff_pct": max(apd) if apd else ""})
    write_csv(OUT / "coverage.csv", list(rows[0]), rows)
    exp = sum(r["expected"] for r in rows)
    found = sum(r["found"] for r in rows)
    log(f"coverage: {found} of {exp} expected races have results")


def checks(races, ros):
    big = sorted((r for r in races if r.get("check_civicapi_diff_pct", "") != "" and abs(r["check_civicapi_diff_pct"]) > 0.5),
                 key=lambda r: -abs(r["check_civicapi_diff_pct"]))
    log(f"direct vs civicAPI: {len(big)} races differ by over 0.5%")
    for r in big[:40]:
        log(f"  {r['race_id']} {r['label']}: direct {r['total_votes']:,} vs civicAPI {r['check_civicapi_total']:,} ({r['check_civicapi_diff_pct']:+}%)")
    big = sorted((r for r in races if r.get("check_ap_diff_pct", "") != "" and abs(r["check_ap_diff_pct"]) > 1),
                 key=lambda r: -abs(r["check_ap_diff_pct"]))
    log(f"vs AP state-leg snapshot (2026-11-12): {len(big)} races differ by over 1%")
    for r in big[:40]:
        log(f"  {r['race_id']}: {r['source']} {r['total_votes']:,} vs AP {r['check_ap_total']:,} ({r['check_ap_diff_pct']:+}%)")


if __name__ == "__main__":
    main()
