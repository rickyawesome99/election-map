#!/usr/bin/env python3
"""Fill in the seat columns of data-entry/state_leg.csv for every chamber-year.

The file already carried `dem_seats` / `rep_seats`. This adds the rest of the seat picture:

    oth_seats        seats held by independents / third parties AFTER the election
    total_seats      the chamber's size that year
    dem/rep/oth_seats_won   seats WON in this cycle
    seats_up         how many of the chamber's seats were on the ballot

SEATS AFTER vs SEATS WON ARE DIFFERENT NUMBERS and the file needs both. `dem_seats` /
`rep_seats` / `oth_seats` describe the chamber's composition once the new members are
seated, holdovers included. `*_seats_won` counts only the seats actually contested that
cycle. For a chamber that elects everything at once the two coincide; for a staggered one
they diverge sharply - Wisconsin's 2020 Senate is a 33-seat body sitting 12D/21R, but only
16 seats were up and Democrats won 6 of them. Reporting either number as the other is the
single easiest way to corrupt this file, which is why they are separate columns.

SOURCES, in priority order per field:
  * seats won + seats up + total seats, 2015-2022 -> `data-entry/state_leg_klarner.csv`,
    the aggregate written by build-state-leg-votes-from-klarner.py. Its seats-won figure
    is `dwin * (dseats if mmdpost is null else 1)`, a rule verified to reproduce Klarner's
    own `seatsup` for all 454 chamber-years from 2014 on.
  * total seats, any year -> falls back to the verified `totalSeats` in
    `data/stateLegMapInfo.ts` (99 chambers, researched during the boundary project). That
    is the CURRENT chamber size, so it is only used where Klarner has no row for the year;
    a chamber that changed size mid-range would need care (Wyoming went 60->62 House and
    30->31 Senate in 2022, and West Virginia converted 67 multi-member House districts to
    100 single-member seats the same year).
  * other-party seats after -> derived as total - dem - rep, only when total_seats is
    known and the remainder is non-negative.
  * the handful of rows with no dem/rep seats at all -> Klarner's seats won, but ONLY for
    a chamber whose whole membership was up that year, where won and after coincide.

Usage:
    python3 scripts/build-state-leg-seats.py --report
    python3 scripts/build-state-leg-seats.py --write
"""

import argparse
import csv
import json
import os
import re
import subprocess
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_LEG_CSV = os.path.join(REPO, "data-entry", "state_leg.csv")
KLARNER_CSV = os.path.join(REPO, "data-entry", "state_leg_klarner.csv")
MAP_INFO_TS = os.path.join(REPO, "data", "stateLegMapInfo.ts")

NEW_COLS = ["oth_seats", "total_seats",
            "dem_seats_won", "rep_seats_won", "oth_seats_won", "seats_up"]

ABBR_TO_NAME = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin",
    "WY": "Wyoming",
}


# Composition-after figures for the two staggered chamber-years no dataset covers and no
# Wikipedia article exists for. Both were established rather than guessed:
#   Arkansas Senate 2016 -> 9D/26R, from the identity "composition after = seats won this
#     cycle + seats won last cycle", which holds for a two-cycle staggered chamber. It
#     reproduces Arkansas's OWN 2018 (9D/26R) and 2020 (7D/28R) compositions exactly, so it
#     is applied to 2016 = won'16 (4D/13R) + won'14 (5D/13R).
#   North Dakota House 2016 -> 13D/81R, looked up. The same identity does NOT work here:
#     North Dakota put 48 seats up in 2014 and 48 again in 2016, which sums to 96 against a
#     94-seat chamber, so it overstates by two.
ADJUDICATED_SEATS_AFTER = {
    ("Arkansas", 2016, "Senate"): (9, 26, 0),
    ("North Dakota", 2016, "House"): (13, 81, 0),
}


# Seats WON for the one staggered chamber-year no source can give directly.
#   Nebraska 2018 -> 7D/17R/0O of 24. CONFIRMED against the seat-by-seat member list in
#   `data-entry/nebraska_2018_members.csv` (24 districts; the elected column is 17 Rep /
#   7 Dem). It was originally derived from the identity "composition after = seats won this
#   cycle + seats won last cycle" - after'18 (18D/30R/1O) - won'16 (11D/13R/1O) = 7D/17R/0O,
#   with 25+24 filling the 49-seat body - and the member list then matched it exactly, which
#   is a useful check on that identity as well.
#   Nebraska 2018's VOTES remain the one unsourced cell in 2016-2025: its ballot is
#   nonpartisan and the 2018 article uses the `no party` templates, so party comes only from
#   outside. The member list attributes every winner and the incumbents who lost, taking the
#   vote from 70% unattributed down to 27.5%; what is still missing is the party of 16
#   defeated candidates (listed in the project memory).
ADJUDICATED_SEATS_WON = {
    ("Nebraska", 2018, "House"): (7, 17, 0, 24),
}


def load_map_info():
    """{(state_name, 'House'|'Senate'): totalSeats} out of the TypeScript module.

    Read by evaluating the module rather than regexing it, so a formatting change in the
    file cannot silently produce a partial map.
    """
    js = f"""
    import {{ stateLegMapInfo }} from {json.dumps(MAP_INFO_TS)};
    const out = {{}};
    for (const [abbr, chambers] of Object.entries(stateLegMapInfo)) {{
      for (const [ch, info] of Object.entries(chambers || {{}})) {{
        if (info && info.totalSeats != null) out[abbr + "|" + ch] = info.totalSeats;
      }}
    }}
    console.log(JSON.stringify(out));
    """
    with tempfile.NamedTemporaryFile("w", suffix=".mjs", dir=REPO, delete=False) as fh:
        fh.write(js)
        tmp = fh.name
    try:
        raw = subprocess.run(["npx", "tsx", tmp], cwd=REPO, capture_output=True, text=True)
        if raw.returncode != 0:
            # tsx not available - fall back to a tolerant parse of the literal.
            return _parse_map_info_regex()
        data = json.loads(raw.stdout.strip().splitlines()[-1])
    finally:
        os.unlink(tmp)
    out = {}
    for k, v in data.items():
        abbr, ch = k.split("|")
        name = ABBR_TO_NAME.get(abbr)
        if name:
            out[(name, "House" if ch == "house" else "Senate")] = int(v)
    _add_nebraska(out)
    return out


def _add_nebraska(out):
    """Nebraska's unicameral Legislature is filed under the `senate` key in the boundary
    data (Census classifies it SLDU) but under `House` in state_leg.csv, so the lookup
    misses unless the same seat count is registered under both."""
    ne = out.get(("Nebraska", "Senate"))
    if ne and ("Nebraska", "House") not in out:
        out[("Nebraska", "House")] = ne


def _parse_map_info_regex():
    """Fallback reader: walk the literal tracking the current state and chamber."""
    out = {}
    abbr = chamber = None
    _seen_regex = True
    for line in open(MAP_INFO_TS, encoding="utf-8"):
        m = re.match(r"\s*([A-Z]{2}):\s*\{", line)
        if m:
            abbr, chamber = m.group(1), None
            continue
        m = re.match(r"\s*(house|senate):\s*\{", line)
        if m:
            chamber = m.group(1)
            continue
        m = re.search(r"totalSeats:\s*(\d+)", line)
        if m and abbr and chamber:
            name = ABBR_TO_NAME.get(abbr)
            if name:
                out[(name, "House" if chamber == "house" else "Senate")] = int(m.group(1))
    _add_nebraska(out)
    return out


def load_klarner():
    out = {}
    if not os.path.exists(KLARNER_CSV):
        return out
    with open(KLARNER_CSV, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            out[(r["state_name"], int(r["year"]), r["type"])] = r
    return out


def i(v):
    v = (v or "").strip().replace(",", "")
    return int(v) if v.lstrip("-").isdigit() else None


def f2i(v):
    """Klarner's seats-won are floats ('28.0') because multi-member contests carry
    fractional wins before being scaled by seats-per-contest; they always land on a
    whole number once summed, so anything else is a real problem worth seeing."""
    v = (v or "").strip()
    if not v:
        return None
    try:
        x = float(v)
    except ValueError:
        return None
    return int(round(x)) if abs(x - round(x)) < 0.01 else None


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--report", action="store_true")
    g.add_argument("--write", action="store_true")
    args = ap.parse_args()

    kl = load_klarner()
    seats_by_chamber = load_map_info()
    print(f"Klarner chamber-years: {len(kl)}   stateLegMapInfo chambers: {len(seats_by_chamber)}")

    with open(STATE_LEG_CSV, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
        fields = list(rows[0].keys())
    for c, after in (("oth_seats", "rep_seats"), ("total_seats", "oth_seats"),
                     ("dem_seats_won", "total_seats"), ("rep_seats_won", "dem_seats_won"),
                     ("oth_seats_won", "rep_seats_won"), ("seats_up", "oth_seats_won")):
        if c not in fields:
            fields.insert(fields.index(after) + 1, c)

    # Chambers whose whole membership goes up at once, learned from Klarner's own
    # seats_up vs total_seats rather than assumed.
    whole_chamber = {}
    for (st, _yr, ch), k in kl.items():
        su, ts = i(k["seats_up"]), i(k["total_seats"])
        if su and ts:
            whole_chamber[(st, ch)] = whole_chamber.get((st, ch), True) and (su == ts)
    # Louisiana and Nebraska never appear in Klarner; both elect their entire membership
    # in one go (LA every four years, NE's 49 seats staggered - so NE is NOT whole-chamber).
    whole_chamber[("Louisiana", "House")] = True
    whole_chamber[("Louisiana", "Senate")] = True

    stats = {k: 0 for k in ("won", "total", "oth", "filled_after", "neg_oth", "won_from_after")}
    neg = []
    for r in rows:
        for c in NEW_COLS:
            r.setdefault(c, "")
        if r["note"].strip() == "Unicameral":
            continue     # Nebraska's empty upper-chamber placeholders
        year = i(r["year"])
        key = (r["state_name"], year, r["type"])
        k = kl.get(key)

        if k:
            dw, rw, ow = f2i(k["dem_seats_won"]), f2i(k["rep_seats_won"]), f2i(k["oth_seats_won"])
            if None not in (dw, rw, ow):
                r["dem_seats_won"], r["rep_seats_won"], r["oth_seats_won"] = str(dw), str(rw), str(ow)
                r["seats_up"] = k["seats_up"]
                stats["won"] += 1

        total = i(k["total_seats"]) if k else None
        if total is None:
            total = seats_by_chamber.get((r["state_name"], r["type"]))
        if total:
            r["total_seats"] = str(total)
            stats["total"] += 1

        adjw = ADJUDICATED_SEATS_WON.get(key)
        if adjw and not r["dem_seats_won"].strip():
            r["dem_seats_won"], r["rep_seats_won"] = str(adjw[0]), str(adjw[1])
            r["oth_seats_won"], r["seats_up"] = str(adjw[2]), str(adjw[3])
            stats["won"] += 1

        adj = ADJUDICATED_SEATS_AFTER.get(key)
        if adj and not r["dem_seats"].strip():
            r["dem_seats"], r["rep_seats"], r["oth_seats"] = str(adj[0]), str(adj[1]), str(adj[2])
            stats["filled_after"] += 1

        ds, rs = i(r["dem_seats"]), i(r["rep_seats"])
        # A chamber fully up this cycle seats exactly who it just elected, so Klarner's
        # seats-won doubles as the composition for the rows that have no seats at all.
        if ds is None and k and i(k["seats_up"]) == i(k["total_seats"]):
            dw, rw = f2i(k["dem_seats_won"]), f2i(k["rep_seats_won"])
            if dw is not None and rw is not None:
                r["dem_seats"], r["rep_seats"] = str(dw), str(rw)
                ds, rs = dw, rw
                stats["filled_after"] += 1

        # A chamber that elects its ENTIRE membership seats exactly whom it just elected,
        # so where Klarner has no row (2023-2025, Louisiana, Nebraska) the composition is
        # also the seats-won figure. Whether a chamber works that way is taken from its own
        # Klarner history rather than assumed - `whole_chamber` below.
        if not r["dem_seats_won"].strip() and whole_chamber.get((r["state_name"], r["type"])) \
                and ds is not None and rs is not None and total:
            o_after = total - ds - rs
            if o_after >= 0:
                r["dem_seats_won"], r["rep_seats_won"] = str(ds), str(rs)
                r["oth_seats_won"], r["seats_up"] = str(o_after), str(total)
                stats["won_from_after"] += 1

        if total and ds is not None and rs is not None:
            o = total - ds - rs
            if o >= 0:
                r["oth_seats"] = str(o)
                stats["oth"] += 1
            else:
                stats["neg_oth"] += 1
                neg.append((r["state_name"], r["year"], r["type"], ds, rs, total))

    print(f"\nseats_won filled:      {stats['won']}")
    print(f"total_seats filled:    {stats['total']}")
    print(f"oth_seats derived:     {stats['oth']}")
    print(f"dem/rep_seats filled:  {stats['filled_after']} (whole-chamber-up rows that had none)")
    print(f"seats_won from after:  {stats['won_from_after']} (whole-chamber-up rows Klarner doesn't cover)")
    if neg:
        print(f"\nD+R seats EXCEED total_seats in {len(neg)} rows - composition or chamber size is off:")
        for n in neg:
            print(f"   {n[0]:16s}{n[1]} {n[2]:7s} D{n[3]}+R{n[4]} > {n[5]}")

    missing = [(r["year"], r["state_name"], r["type"]) for r in rows
               if r["note"].strip() != "Unicameral" and not r["dem_seats"].strip()]
    print(f"\nrows still with no seats-after: {len(missing)} {missing}")

    if args.write:
        with open(STATE_LEG_CSV, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        print(f"\nwrote {STATE_LEG_CSV}")


if __name__ == "__main__":
    main()
