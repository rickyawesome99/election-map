#!/usr/bin/env python3
"""Alaska's ranked-choice races, final round, by precinct (2022 on), from the Division of Elections'
cast vote record (CVR).

The site's rule (2026-11-14): Alaska ranked-choice results are FINAL-ROUND totals, never first choices.
The precinct sources (MEDSL 2022, RDH 2024) only carry first choices, so this rebuilds every contest
on the ballot from the ballots themselves:

  1. every scanned ballot (the adjudicated version where one exists) is read into one ranking per contest;
  2. each ranking is cleaned under Alaska's rules (AS 15.15.350): an overvote at a rank ends it, two or
     more consecutive skipped ranks end it, a repeat of a candidate already ranked is passed over;
  3. the contest is tabulated statewide (or district-wide) the official way: each round every active
     ballot counts for its highest continuing choice; it stops when one candidate holds a majority of
     active ballots, otherwise the last-place candidate is eliminated. That stopping round is the
     final round (a race won outright in round 1 keeps its first choices);
  4. each ballot is credited to whichever final-round candidate it counts for (exhausted ballots drop),
     in its precinct. Absentee, early, question and remote ballots are filed by House district, not
     precinct, in the CVR: those are spread over that district's precincts by each precinct's own
     scanned election-day ballots for the contest, carrying the district group's own final-round split.

Slots follow the site's convention (build_results_2024.slot_columns): U.S. Senate / House / Governor =
the final-round Democrat (or the leading non-Republican) in the D slot, the leading Republican in the R
slot, a second Republican in the D slot when two Republicans are the finalists; legislature = party sums
of the final-round candidates. Hand-counted ballots are not in the CVR, so totals run a little short.

Writes the offices into public/precincts/results/AK/{year}.json (other offices untouched) and the
coverage grid.

  python3 scripts/precincts/build_alaska_rcv.py 2022
  python3 scripts/precincts/build_alaska_rcv.py 2024
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build_results_2024 as B  # noqa: E402
from coverage import update_cells  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
# Exports taken before certification, scaled to the certified first choices. 2022's export matches the
# Division's official RCV reports to a few votes (Senate final 136,333 / 117,536 vs 136,330 / 117,534),
# so it is used as it is; 2024's (2024-11-30) holds ~1.3% more ballots than the certified count.
SCALE_YEARS = {2024}
CVR = ROOT / "data-entry" / "precincts" / "raw" / "official" / "ak_cvr"
OUT = ROOT / "public" / "precincts" / "results" / "AK"


def office_of(desc: str) -> tuple[str, str] | None:
    """Contest description → (office, district code as the results files write it)."""
    d = desc.strip()
    if d.startswith("U.S. Senator"):
        return "USS", ""
    if d.startswith("U.S. Representative"):
        return "USH", "AL"
    if d.startswith("Governor"):
        return "GOV", ""
    m = re.match(r"^Senate District ([A-T])$", d)
    if m:
        return "SLDU", m.group(1)
    m = re.match(r"^House District (\d+)$", d)
    if m:
        return "SLDL", m.group(1).zfill(2)
    return None


def read_cvr(year: int):
    z = zipfile.ZipFile(CVR / str(year) / "CVR_Export.zip")
    man = lambda name: json.loads(z.read(name))["List"]  # noqa: E731
    contests = {c["Id"]: c for c in man("ContestManifest.json")}
    cands = {c["Id"]: c for c in man("CandidateManifest.json")}
    portions = {p["Id"]: p for p in man("PrecinctPortionManifest.json")}
    groups = {g["Id"]: g["Description"] for g in man("CountingGroupManifest.json")}
    # Party ids differ by year (2022: 6 Democrat, 14 Republican; 2024: 7 and 15): read them from the manifest.
    PARTY = {p["Id"]: ("D" if "Democrat" in p["Description"] else "R" if "Republican" in p["Description"] else "O") for p in man("PartyManifest.json")}
    # (contest, portion, counting group, cleaned ranking) → ballots
    ballots: Counter = Counter()
    party_of: dict[int, str] = {}
    files = [n for n in z.namelist() if re.search(r"CvrExport_\d+\.json$", n)]
    for k, name in enumerate(files):
        for s in json.loads(z.read(name))["Sessions"]:
            ver = s["Modified"] if s.get("Modified", {}).get("IsCurrent") else s["Original"]
            portion, group = ver["PrecinctPortionId"], s["CountingGroupId"]
            for card in ver.get("Cards", []):
                for c in card.get("Contests", []):
                    nranks = contests[c["Id"]].get("NumOfRanks", 1) or 1
                    by_rank: dict[int, list[int]] = defaultdict(list)
                    for m in c.get("Marks", []):
                        if m.get("IsAmbiguous"):
                            continue
                        by_rank[m.get("Rank", 1)].append(m["CandidateId"])
                        party_of.setdefault(m["CandidateId"], PARTY.get(m.get("PartyId"), "O"))
                    seq, skipped = [], 0
                    for r in range(1, nranks + 1):
                        here = list(dict.fromkeys(by_rank.get(r, [])))
                        if not here:
                            skipped += 1
                            if skipped >= 2:
                                break
                            continue
                        skipped = 0
                        if len(here) > 1:
                            break  # overvote: the ballot stops here
                        if here[0] not in seq:
                            seq.append(here[0])
                    ballots[(c["Id"], portion, group, tuple(seq))] += 1
        if k % 200 == 0:
            print(f"  read {k}/{len(files)} files", flush=True)
    return contests, cands, portions, groups, ballots, party_of


def tabulate(seqs: Counter) -> tuple[list[int], list[dict[int, int]]]:
    """Official rounds over {ranking: ballots}: returns (final-round candidates, per-round tallies)."""
    alive = {c for seq in seqs for c in seq}
    rounds = []
    while True:
        t: Counter = Counter()
        for seq, n in seqs.items():
            top = next((c for c in seq if c in alive), None)
            if top is not None:
                t[top] += n
        rounds.append(dict(t))
        active = sum(t.values())
        if not t or len(t) <= 2 or max(t.values()) * 2 > active:
            return [c for c in t], rounds
        # last place out (ties: the one with fewer first choices, then the higher id)
        low = min(t.values())
        losers = sorted([c for c, v in t.items() if v == low], key=lambda c: (rounds[0].get(c, 0), -c))
        alive.discard(losers[0])
        # candidates with no ballots left at all are already gone from t; drop them from alive too
        alive &= set(t) - {losers[0]}


def precinct_key(desc: str) -> tuple[str, str]:
    """'37-700 Akutan' → ('700', 'akutan'): precinct number without the House district, folded name."""
    m = re.match(r"^\s*(\d+)-(\d+)\s+(.*)$", desc)
    if not m:
        return "", re.sub(r"[^a-z0-9]", "", desc.lower())
    return m.group(2), re.sub(r"[^a-z0-9]", "", m.group(3).lower())


def main() -> None:
    year = int(sys.argv[1])
    path = OUT / f"{year}.json"
    doc = json.loads(path.read_text())
    n, first = doc["n"], doc["first_pid"]
    anchors = json.loads((ROOT / "data-entry" / "precincts" / "anchors" / "AK.json").read_text())["precincts"]
    by_num: dict[str, list[int]] = defaultdict(list)
    by_name: dict[str, list[int]] = defaultdict(list)
    for pid, p in anchors.items():
        num, name = precinct_key(p["name"])
        by_num[num].append(int(pid) - first)
        by_name[name].append(int(pid) - first)

    contests, cands, portions, groups, ballots, party_of = read_cvr(year)

    # CVR portion → 2024 precinct index (number + name, then name, then number alone)
    portion_idx: dict[int, int | None] = {}
    district_of: dict[int, str] = {}
    unmatched = []
    for pid_, p in portions.items():
        desc = p["Description"]
        m = re.match(r"^District (\d+) - ", desc) or re.match(r"^\s*(\d+)-\d+\s", desc)
        district_of[pid_] = m.group(1).zfill(2) if m else "99"
        num, name = precinct_key(desc)
        if not num:
            portion_idx[pid_] = None  # a district-level group (absentee, early, question, remote, overseas)
            continue
        hit = [i for i in by_num.get(num, []) if i in by_name.get(name, [])] or by_name.get(name, []) or by_num.get(num, [])
        portion_idx[pid_] = hit[0] if len(hit) >= 1 else None
        if not hit:
            unmatched.append(desc)
    print(f"{len(portions)} portions; {len(unmatched)} precinct portions with no 2024 precinct: {unmatched[:8]}")

    by_contest: dict[int, Counter] = defaultdict(Counter)
    for (cid, portion, group, seq), k in ballots.items():
        by_contest[cid][seq] += k

    offices: dict[str, list[list[float]]] = {}
    labels: dict[str, list[str]] = {}
    label_votes: dict[str, list[float]] = {}
    spread_share: dict[str, list[float]] = {}
    first_choice: dict[str, list[float]] = {}
    report = []
    for cid, c in sorted(contests.items()):
        oc = office_of(c["Description"])
        if not oc:
            continue
        office, dist = oc
        final, rounds = tabulate(by_contest[cid])
        if not final:
            continue
        # A statewide race won in round 1 already IS its final round in the precinct file (first choices),
        # which also holds the hand-counted ballots the CVR lacks: leave it. The legislature is rebuilt
        # whole, so every district of a chamber comes from one source.
        if office in ("USS", "USH", "GOV") and len(rounds) == 1:
            print(f"  {office} decided in round 1: precinct file kept")
            continue
        # slots for this contest
        fin_sorted = sorted(final, key=lambda x: -rounds[-1][x])
        if office in ("USS", "USH", "GOV", "PRES"):
            reps = [x for x in fin_sorted if party_of.get(x) == "R"]
            non = [x for x in fin_sorted if party_of.get(x) != "R"]
            dem = next((x for x in non if party_of.get(x) == "D"), None) or (non[0] if non else None)
            r_slot = reps[0] if reps else (non[1] if len(non) > 1 else None)
            d_slot = dem if dem is not None else (reps[1] if len(reps) > 1 else None)
            side = {x: (0 if x == d_slot else 1 if x == r_slot else 2) for x in final}
        else:
            side = {x: {"D": 0, "R": 1}.get(party_of.get(x, "O"), 2) for x in final}
        arr = offices.setdefault(office, [[0.0, 0.0, 0.0] for _ in range(n)])
        lab = labels.setdefault(office, [""] * n)
        lv = label_votes.setdefault(office, [0.0] * n)
        spr = spread_share.setdefault(office, [0.0] * n)
        fca = first_choice.setdefault(office, [0.0] * n)
        # per portion final-round tallies
        tallies: dict[int, list[float]] = defaultdict(lambda: [0.0, 0.0, 0.0])
        fc_t: Counter = Counter()  # ballots active in round 1 (first choices), the scale's denominator
        for (cid2, portion, group, seq), k in ballots.items():
            if cid2 != cid:
                continue
            if seq:
                fc_t[portion] += k
            top = next((x for x in seq if x in side), None)
            if top is not None:
                tallies[portion][side[top]] += k
        # precinct portions first; their totals are the spreading weights for district groups
        ed_weight: dict[str, dict[int, float]] = defaultdict(lambda: defaultdict(float))
        for portion, t in tallies.items():
            i = portion_idx.get(portion)
            if i is None:
                continue
            for s_ in range(3):
                arr[i][s_] += t[s_]
            fca[i] += fc_t[portion]
            ed_weight[district_of[portion]][i] += sum(t)
            ed_weight["all"][i] += sum(t)
        for portion, t in tallies.items():
            if portion_idx.get(portion) is not None:
                continue
            w = ed_weight.get(district_of[portion]) or ed_weight["all"]
            tot = sum(w.values())
            for i, wi in w.items():
                f = wi / tot
                for s_ in range(3):
                    arr[i][s_] += t[s_] * f
                fca[i] += fc_t[portion] * f
                spr[i] += sum(t) * f
        if dist:
            for i, wi in ed_weight["all"].items():
                if wi > lv[i]:
                    lv[i], lab[i] = wi, dist
            for portion in tallies:
                if portion_idx.get(portion) is None:
                    pass
        names = {x: cands[x]["Description"] for x in final}
        tot = {s_: sum(t[s_] for t in tallies.values()) for s_ in range(3)}
        report.append((office, dist, len(rounds), {names[x]: rounds[-1][x] for x in fin_sorted}, tot))

    for office, dist, nr, fin, tot in report:
        if office in ("USS", "USH", "GOV", "PRES") or nr > 1:
            print(f"  {office:4s} {dist:3s} rounds {nr}  final {fin}")

    # write: round to integers (largest remainder per office and side keeps the statewide sums)
    import numpy as np
    from build_results_vest import largest_remainder
    # The 2024 CVR is not the certified count (taken before certification, it holds ~1.3% more
    # ballots; SCALE_YEARS). Keep the ballots' transfers but scale
    # each House district's final round to the certified first-choice turnout already in the precinct
    # file: factor = certified first choices / CVR first choices, over that district's precincts.
    # The certified first choices and House-district labels are read from the source build once and kept
    # beside the CVR, so a rerun (after which the file holds final rounds) scales against the same thing.
    keep = CVR / str(year) / "certified_first_choice.json"
    if not keep.exists():
        keep.write_text(json.dumps({"offices": {o: [sum(r) for r in doc["offices"][o]] for o in offices if o in doc["offices"]},
                                    "hd": doc.get("districts", {}).get("SLDL", [""] * n)}))
    kept = json.loads(keep.read_text())
    hd = [str(x).lstrip("0") for x in kept["hd"]]
    sums = {}
    for office, arr in offices.items():
        a = np.array(arr)
        orig = [[v] for v in kept["offices"][office]] if office in kept["offices"] and year in SCALE_YEARS else None
        if orig:
            cert = np.array([sum(r) for r in orig], dtype=float)
            fc = np.array(first_choice[office])
            for h in set(hd):
                idx = [i for i in range(n) if hd[i] == h]
                den = fc[idx].sum()
                if den > 0 and cert[idx].sum() > 0:
                    a[idx] *= cert[idx].sum() / den
            print(f"  {office}: scaled to certified first choices ({cert.sum():.0f} vs CVR {fc.sum():.0f})")
        cols = [largest_remainder(a[:, s_], int(round(a[:, s_].sum()))) for s_ in range(3)]
        doc["offices"][office] = [[int(x), int(y), int(z)] for x, y, z in zip(*cols)]
        tot_i = a.sum(axis=1)
        doc.setdefault("est", {})[office] = [int(round(100 * s_ / t_)) if t_ > 0 else 0 for s_, t_ in zip(spread_share[office], tot_i)]
        doc.setdefault("basis", {})[office] = "slot" if office in ("USS", "USH", "GOV", "PRES") else "party"
        if office in ("SLDU", "SLDL"):
            doc.setdefault("districts", {})[office] = labels[office]
            doc.get("split", {}).pop(office, None)
        sums[office] = {"d": int(cols[0].sum()), "r": int(cols[1].sum()), "o": int(cols[2].sum()), "precincts_with_votes": int(((cols[0] + cols[1] + cols[2]) > 0).sum()),
                        "src": f"ak-cvr-{year}", "basis": doc["basis"][office], "est": round(float(np.sum(spread_share[office]) / tot_i.sum()), 4) if tot_i.sum() else 0.0, "stage": "rcv-final"}
    doc["src"] = sorted(set(doc.get("src", [])) | {f"ak-cvr-{year}"})
    path.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    truth = B.load_truth()
    explained = {
        # The site's files hold the final rounds too since 2026-11-26 (correct_site_alaska_rcv.py); what is left is
        # the 2024 export predating certification, scaled by House district here and by contest in the site's files.
        ("AK", o): "Ranked choice, final round from the cast vote record. The 2024 export predates certification: scaled to the certified first choices by House district here, by contest in the site's results."
        for o in ("USS", "USH", "SLDU", "SLDL", "GOV")
    }
    print("coverage:", update_cells("AK", year, n, sums, truth, explained=explained))


if __name__ == "__main__":
    main()
