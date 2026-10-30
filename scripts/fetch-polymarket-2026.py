#!/usr/bin/env python3
"""Current Polymarket prices for every 2026 Senate, governor and House race.

Reads the open events under Polymarket's `midterms` tag (gamma API, no key) and rewrites the
poly_dem / poly_rep columns of data-entry/{senate,governor,house}_seats.csv. Every other column is
left untouched. Also writes the House and Senate control markets ("Which party will win the House in
2026?") to data/polymarketControl.json, read by the Overview's Other Forecasts panel; governors have
no control market (only a seat-count bucket market whose 24-25 bucket straddles the majority). Then run `node data-entry/build.js` and bump POLYMARKET_2026_READ in lib/marketBoard.ts.

Conventions (same as the historical scrape, scripts/fetch-prediction-markets.py):
  - price = the market's displayed Yes price (gamma `outcomePrices[0]`, Polymarket's midpoint);
  - poly_dem = P(the R slot loses) = 1 - R price / sum of the field's prices, rounded to 2 decimals
    (in a two-way race this is the usual dem / (dem + rep)); when the R slot is an independent
    (CA-06, MA-01) it is the D slot's own share instead;
  - sides are the calendar's D/R slots (dem_name / rep_name), matched by surname, else by party
    contract; same-party contests (a "(D)" R slot or "(R)" D slot) are fixed at 1.00 / 0.00;
  - a statewide race with no winner event (CA-Gov) is read off its margin-of-victory event;
  - LA/GA "first-round" events are skipped; the winner event is the general/runoff winner.

Usage: python3 scripts/fetch-polymarket-2026.py [--dry-run]
"""

import csv, json, re, sys, unicodedata, urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data-entry"
API = "https://gamma-api.polymarket.com/events?tag_slug=midterms&closed=false&limit=100&offset={}"
CONTROL_API = "https://gamma-api.polymarket.com/events?slug={}"
CONTROL_EVENTS = {"house": "which-party-will-win-the-house-in-2026", "senate": "which-party-will-win-the-senate-in-2026"}

STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA", "colorado": "CO",
    "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
    "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new-hampshire": "NH", "new-jersey": "NJ", "new-mexico": "NM", "new-york": "NY", "north-carolina": "NC",
    "north-dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "rhode-island": "RI", "south-carolina": "SC", "south-dakota": "SD", "tennessee": "TN", "texas": "TX",
    "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA", "west-virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY",
}


def fetch_events():
    events, off = [], 0
    while True:
        req = urllib.request.Request(API.format(off), headers={"User-Agent": "election-map/1.0"})
        page = json.load(urllib.request.urlopen(req, timeout=60))
        events += page
        if len(page) < 100:
            return events
        off += 100


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", " ", s)


def surname(name):
    parts = [p for p in norm(name).split() if p not in ("jr", "sr", "ii", "iii", "sen", "rep", "gov")]
    return parts[-1] if parts else ""


def slot_party(name):
    """The party word a calendar slot's market uses: '(I)' marks an independent in that slot."""
    m = re.search(r"\((\w)\)\s*$", name or "")
    return {"I": "independent", "D": "democrat", "R": "republican"}.get(m.group(1)) if m else None


def slot_price(markets, name, party):
    """Yes price of the market for one calendar slot: its candidate by surname, else its party contract."""
    last = surname(re.sub(r"\(\w\)\s*$", "", name or ""))
    by_name = [yes for yes, q, t in markets if last and last in t.split()]
    if by_name:
        return max(by_name)
    by_party = [yes for yes, q, t in markets if re.search(rf"\b{party}", q)]
    return max(by_party) if by_party else None


def p_dem(event, dem_name, rep_name, fallback_rep_market=False):
    """P(the D slot wins), or None when the event can't be read.

    The R slot's price over the whole field, subtracted from 1 ("the R slot loses"), so a strong
    independent in a three-way race (MT-Sen's Bodnar) counts against R the way the calendar's D slot
    does. When the R slot is an independent (CA-06's Kiley, MA-01), the D slot's own price is used."""
    markets = []
    for m in event["markets"]:
        if not m.get("active") or m.get("closed") or not m.get("outcomePrices"):
            continue
        markets.append((float(json.loads(m["outcomePrices"])[0]), m["question"].lower(), norm(m.get("groupItemTitle"))))
    total = sum(yes for yes, _, _ in markets)
    if total <= 0:
        return None
    if fallback_rep_market:  # margin-of-victory event: the R side is one "<Surname> Wins" bucket
        last = surname(rep_name)
        rep = next((yes for yes, _, t in markets if last in t.split() and "wins" in t.split()), None)
        return None if rep is None else 1 - rep / total
    if slot_party(rep_name) == "independent":
        dem = slot_price(markets, dem_name, slot_party(dem_name) or "democrat")
        return None if dem is None else dem / total
    rep = slot_price(markets, rep_name, "republican")
    return None if rep is None else 1 - rep / total


def index_events(events):
    senate, governor, house, margins = {}, {}, {}, {}
    for e in events:
        s = e["slug"]
        if m := re.fullmatch(r"([a-z-]+?)-(senate|governor)-margin-of-victory-2026", s):
            if m.group(1) in STATES:
                margins[(m.group(2), STATES[m.group(1)])] = e
            continue
        if m := re.fullmatch(r"([a-z-]+?)-senate-election-winner(-\d+)?", s):
            if m.group(1) in STATES:
                senate[STATES[m.group(1)]] = e
        elif m := re.fullmatch(r"([a-z-]+?)-governor-(?:election-)?winner(-2026)?", s):
            if m.group(1) in STATES:
                governor[STATES[m.group(1)]] = e
        elif "house" in s and ("house-election-winner" in s or "house-race-for-the" in s) and "first-round" not in s:
            m = re.search(r"\b([A-Z]{2})-(\d\d|AL)\b", e["title"])
            if not m:
                continue
            key = f"{m.group(1)}-{'01' if m.group(2) == 'AL' else m.group(2)}"
            # CA top-two districts also carry a by-candidate event; the party event is the canonical one.
            if "individual" in s:
                continue
            house[key] = e
    return senate, governor, house, margins


def update(path, key_of, events, margins, label, dry):
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        fields, rows = reader.fieldnames, list(reader)
    changed, missing, fixed = [], [], []
    for r in rows:
        if r.get("poly_dem") in (None, "", "N/A"):
            continue  # not a 2026 race on the sheet
        key = key_of(r)
        dem_name, rep_name = r.get("dem_name"), r.get("rep_name")
        # Same-party contests (CA top-two D vs D, CA-40 R vs R): the party outcome is settled.
        if slot_party(rep_name) == "democrat" or slot_party(dem_name) == "republican":
            d = 1.0 if slot_party(rep_name) == "democrat" else 0.0
            fixed.append(key)
        else:
            e = events.get(key)
            p = p_dem(e, dem_name, rep_name) if e else None
            if p is None and (label.lower(), key) in margins:
                p = p_dem(margins[(label.lower(), key)], dem_name, rep_name, fallback_rep_market=True)
            if p is None:
                missing.append(key)
                continue
            d = round(p, 2)
        new_d, new_r = f"{d:.2f}", f"{1 - d:.2f}"
        if new_d != r["poly_dem"]:
            changed.append((key, r["poly_dem"], new_d))
        r["poly_dem"], r["poly_rep"] = new_d, new_r
    print(f"{label}: {len(changed)} changed, {len(fixed)} same-party fixed, unreadable (kept): {', '.join(missing) or 'none'}")
    for k, old, new in sorted(changed, key=lambda c: -abs(float(c[2]) - float(c[1])))[:15]:
        print(f"    {k:8} {old} -> {new}")
    if not dry:
        with open(path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
            w.writeheader()
            w.writerows(rows)


def control(dry):
    # P(Democrats win the chamber) = D price / (D + R), the same two-way normalisation as the races.
    out = {"read": date.today().isoformat()}
    for chamber, slug in CONTROL_EVENTS.items():
        req = urllib.request.Request(CONTROL_API.format(slug), headers={"User-Agent": "election-map/1.0"})
        markets = json.load(urllib.request.urlopen(req, timeout=60))[0]["markets"]
        price = {m.get("groupItemTitle"): float(json.loads(m["outcomePrices"])[0]) for m in markets if m.get("outcomePrices")}
        dem, rep = price["Democratic Party"], price["Republican Party"]
        out[chamber] = round(dem / (dem + rep), 3)
        print(f"{chamber.title()} control: D {out[chamber]:.3f}")
    if not dry:
        (ROOT / "data" / "polymarketControl.json").write_text(json.dumps(out, indent=2) + "\n")


def main():
    dry = "--dry-run" in sys.argv
    control(dry)
    senate, governor, house, margins = index_events(fetch_events())
    # Two Senate rows share a state only for specials (FL, OH), and Polymarket lists one event per state.
    update(DATA / "senate_seats.csv", lambda r: r["state_abbr"], senate, margins, "Senate", dry)
    update(DATA / "governor_seats.csv", lambda r: r["state_abbr"], governor, margins, "Governor", dry)
    update(DATA / "house_seats.csv", lambda r: r["district_name"], house, {}, "House", dry)


if __name__ == "__main__":
    main()
