#!/usr/bin/env python3
"""Election-eve prediction-market prices for every race-level market we can still recover.

Writes data-entry/prediction_markets.csv and data/predictionMarkets.ts (one row per market).
lib/predictionMarkets.ts joins the rows to the race calendar and scores them.

Sources and what "election eve" means for each:
  polymarket 2024  CLOB price history, last point at or before midnight ET starting Election Day
  kalshi     2024  hourly candlesticks (historical API), last trade at or before the same cutoff
  polymarket 2022  the old on-chain market makers: last trade in each pool's Polygon event log
                   at or before the cutoff (its price-history API has nothing this old)
  predictit  2018  Wayback Machine capture of the all-markets feed, 6:17 pm ET on Nov 5, 2018
  predictit  2020  same feed, 11:27 pm ET on Nov 2, 2020
  predictit  2022  no capture of the feed exists within four weeks of the election, so these are
                   PredictIt's state prices as relayed (and rescaled to 100%) by
                   ElectionBettingOdds.com, captured 10:23 pm ET (Senate) and 8:04 pm ET
                   (governor) on Nov 7, 2022
  predictit  2024  same feed, 5:27 am ET on Nov 4, 2024 (the closest capture; four race markets)

Not recoverable (2026-10): any 2022 House market, and Kalshi before October 2024 (it listed no
race-level election markets).

Usage: python3 scripts/fetch-prediction-markets.py [--cache DIR] [--offline]
  --offline regenerates the .ts from the committed CSV without touching the network.
"""
import argparse
import csv
import gzip
import html
import json
import os
import re
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT, "data-entry", "prediction_markets.csv")
TS_PATH = os.path.join(ROOT, "data", "predictionMarkets.ts")

STATES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO",
    "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA",
    "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
    "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
    "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA",
    "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX",
    "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC", "Washington DC": "DC",
    "Washington D.C.": "DC", "Washington, D.C.": "DC", "DC": "DC",
}
ABBRS = set(STATES.values())
STATE_RE = "|".join(sorted((re.escape(s) for s in STATES), key=len, reverse=True))

# Midnight Eastern (EST, UTC-5) at the start of Election Day.
CUTOFF_2024 = int(datetime(2024, 11, 5, 5, 0, tzinfo=timezone.utc).timestamp())

# Races where the calendar's Democratic slot is an independent the market priced as "Other".
OTHER_IS_DEM_SLOT = {("S", "NE", "regular", 2024)}

FIELDS = ["year", "source", "kind", "state", "seat", "framing", "subject", "dem", "rep", "yes",
          "as_of", "volume", "market_id", "url", "title"]

CACHE = None


def fetch(url, cache_key=None, tries=5):
    """GET with an on-disk cache; backs off on throttling (Wayback and Kalshi both 429 readily)."""
    path = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9._-]", "_", cache_key or url)[:200])
    if os.path.exists(path):
        with open(path, "rb") as f:
            return f.read()
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            body = urllib.request.urlopen(req, timeout=60).read()
            if body[:2] == b"\x1f\x8b":  # Wayback's id_ replay hands back the stored gzip stream
                body = gzip.decompress(body)
            with open(path, "wb") as f:
                f.write(body)
            return body
        except Exception as err:  # noqa: BLE001 - retry anything, report the last failure
            last = err
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"failed {url}: {last}")


def get_json(url, cache_key=None):
    return json.loads(fetch(url, cache_key))


def state_of(text):
    if re.search(r"District of Columbia|\bD\.?C\b", text):  # before "Washington" can match
        return "DC"
    m = re.search(rf"(?<![A-Za-z])({STATE_RE})(?![A-Za-z])", text)
    return STATES[m.group(1)] if m else None


def district(st, num):
    return f"{st}-{int(num):02d}"


def row(**kw):
    out = {k: "" for k in FIELDS}
    out.update(kw)
    return out


# ───────────────────────────── PredictIt (Wayback captures of the all-markets feed)

PREDICTIT_CAPTURES = {2018: "20181105231706", 2020: "20201103042741", 2024: "20241104102748"}
ORDINAL = r"(\d+)(?:st|nd|rd|th)"


def predictit_markets(year):
    stamp = PREDICTIT_CAPTURES[year]
    raw = fetch(f"https://web.archive.org/web/{stamp}id_/https://www.predictit.org/api/marketdata/all/", f"predictit_{year}.xml")
    text = raw.decode("utf-8", "ignore").lstrip("﻿")
    if not text.lstrip().startswith("<MarketList"):
        raise RuntimeError(f"PredictIt {year} capture is not the market feed: {text[:80]!r}")
    as_of = datetime.strptime(stamp, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for m in ET.fromstring(text).iter("MarketData"):
        contracts = {c.findtext("Name"): c.findtext("LastTradePrice") for c in m.iter("MarketContract")}
        yield m.findtext("ID"), re.sub(r"\s+", " ", m.findtext("Name")).strip(), m.findtext("URL"), contracts, as_of


def classify_predictit(name, year):
    """(kind, state, seat, framing, subject) for a race-level market, else None."""
    y = str(year)
    if y not in name and "to Congress" not in name and "House from" not in name:
        return None
    m = re.match(rf"Which party will win ({STATE_RE}|[A-Z]{{2}}-\d\d) in the {y} presidential election\?", name)
    if m:
        tok = m.group(1)
        if re.match(r"[A-Z]{2}-\d\d", tok):
            return "P", tok[:2], f"cd{int(tok[3:])}", "party", ""
        return "P", STATES[tok], "statewide", "party", ""
    if re.match(r"Which party (will win|wins) .*Senate", name):
        st = state_of(name)
        return ("S", st, "special" if "special" in name else "regular", "party", "") if st else None
    m = re.match(rf"Which party will win the {y} ({STATE_RE}) gubernatorial", name)
    if m:
        return "G", STATES[m.group(1)], "gov", "party", ""
    m = re.match(rf"Which party will win (?:the )?{y} House.* in (.+?)'s? (?:{ORDINAL}|(at-large)) [Dd]istrict\?", name)
    if m:
        st = STATES.get(m.group(1), m.group(1))
        return ("H", st, district(st, m.group(2) or 1), "party", "") if st in ABBRS else None
    m = re.match(rf"Will (.+?) be (?:re-)?elected to the U\.S\. Senate in ({STATE_RE}) in {y}\?", name)
    if m:
        return "S", STATES[m.group(2)], "", "candidate", m.group(1)
    m = re.match(rf"Will (.+?) be re-elected to the House(?: of Reps)? from ([A-Z]{{2}})'s {ORDINAL} district\?", name)
    if m:
        return "H", m.group(2), district(m.group(2), m.group(3)), "candidate", m.group(1)
    m = re.match(rf"Will (.+?) be re-elected to Congress in {y}\?", name)
    if m:  # no state in the title; lib/predictionMarkets.ts finds the district by name
        return "H", "", "", "candidate", m.group(1)
    return None


def predictit_rows():
    out = []
    for year in PREDICTIT_CAPTURES:
        for mid, name, url, contracts, as_of in predictit_markets(year):
            hit = classify_predictit(name, year)
            if not hit:
                continue
            kind, st, seat, framing, subject = hit
            base = dict(year=year, source="predictit", kind=kind, state=st, seat=seat, framing=framing,
                        subject=subject, as_of=as_of, market_id=mid, url=url or f"https://www.predictit.org/markets/detail/{mid}", title=name)
            if framing == "party":
                if "Democratic" not in contracts or "Republican" not in contracts:
                    continue
                out.append(row(**base, dem=contracts["Democratic"], rep=contracts["Republican"]))
            elif len(contracts) == 1:
                out.append(row(**base, yes=next(iter(contracts.values()))))
    return out


# ───────────────────────────── PredictIt 2022, as relayed by ElectionBettingOdds.com

EBO_CAPTURES = {
    "S": ("20221108033324", "https://electionbettingodds.com/", "2022-11-08T03:23:00Z"),
    "G": ("20221108020519", "https://electionbettingodds.com/GovernorsMap2022.html", "2022-11-08T01:04:00Z"),
}
# Utah's challenger was an independent with no Democrat running: everything not Republican is his.
EBO_DEM_IS_REMAINDER = {("S", "UT")}


def ebo_rows():
    """Each page's state map carries a hover string per state: red is the Republican, blue the Democrat."""
    out = []
    for kind, (stamp, url, as_of) in EBO_CAPTURES.items():
        page = fetch(f"https://web.archive.org/web/{stamp}id_/{url}", f"ebo_2022_{kind}.html").decode("utf-8", "ignore")
        if not re.search(r"State betting is from\s*(<[^>]+>\s*)*PredictIt", page):
            raise RuntimeError(f"ElectionBettingOdds {kind} capture is not the state map")
        for st, desc in re.findall(r"case '([A-Z]{2})':\s*description = '(.*?)';\s*break", page, flags=re.S):
            price = {color: float(pct) / 100 for color, pct in re.findall(r"<font color=#(ff0000|0000ff)>[^<]*?([\d.]+)%</font>", desc)}
            if len(price) != 2:
                continue  # "No bets; considered safe" or no race
            rep_price = price["ff0000"]
            dem_price = 1 - rep_price if (kind, st) in EBO_DEM_IS_REMAINDER else price["0000ff"]
            title = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", desc.split("</b>")[0]))).strip()
            out.append(row(year=2022, source="predictit", kind=kind, state=st, seat="regular" if kind == "S" else "gov", framing="party",
                           dem=round(dem_price, 4), rep=round(rep_price, 4), as_of=as_of, market_id=f"ebo-{kind}-{st}",
                           url=f"https://web.archive.org/web/{stamp}/{url}", title=f"{title} (via ElectionBettingOdds)"))
    return out


# ───────────────────────────── Polymarket 2022 (on-chain market makers)

POLYGON_RPC = "https://polygon-bor-rpc.publicnode.com"  # serves old logs; allows 10,000 blocks per eth_getLogs
CUTOFF_2022 = int(datetime(2022, 11, 8, 5, 0, tzinfo=timezone.utc).timestamp())
POLY_2022_EVENTS = ["2022-us-senate-elections-will-a-dem-or-rep-win-this-state", "2022-us-gubernatorial-elections-will-a-democrat-or-republican-win-this-state"]
# FPMMBuy / FPMMSell(trader, amount, fee, outcomeIndex, outcomeTokens) on Gnosis fixed-product market makers.
FPMM_BUY = "0x4f62630f51608fc8a7603a9391a5101e58bd7c276139366fc107dc3b67c3dcf8"
FPMM_SELL = "0xadcf2a240ed9300d681d9a3f5382b6c1beed1b7e46643e0c7b42cbe6e2d766b4"


def rpc(method, params, cache_key=None):
    path = os.path.join(CACHE, cache_key) if cache_key else None
    if path and os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    for attempt in range(5):
        try:
            req = urllib.request.Request(POLYGON_RPC, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
                                         headers={"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"})
            result = json.loads(urllib.request.urlopen(req, timeout=60).read())["result"]
            if path:
                with open(path, "w") as f:
                    json.dump(result, f)
            return result
        except Exception as err:  # noqa: BLE001
            last = err
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"polygon rpc {method} failed: {last}")


def block_at(ts):
    """Last Polygon block at or before `ts`."""
    lo, hi = 35_000_000, 36_000_000
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if int(rpc("eth_getBlockByNumber", [hex(mid), False], f"polygon_block_{mid}.json")["timestamp"], 16) <= ts:
            lo = mid
        else:
            hi = mid - 1
    return lo


def fpmm_last_trade(pool, end_block, max_chunks=40):
    """(price of outcome 0, block) from the pool's last buy or sell at or before end_block.

    A trade's average price is collateral net of the fee over outcome tokens; on a two-outcome
    pool the other side is its complement. Looks back up to ~10 days.
    """
    for i in range(max_chunks):
        hi = end_block - i * 10_000
        logs = rpc("eth_getLogs", [{"address": pool, "fromBlock": hex(hi - 9_999), "toBlock": hex(hi), "topics": [[FPMM_BUY, FPMM_SELL]]}], f"polygon_logs_{pool}_{hi}.json")
        if not logs:
            continue
        log = logs[-1]
        amount, fee, tokens = (int(log["data"][2 + 64 * k:66 + 64 * k], 16) for k in range(3))
        if not tokens:
            continue
        price = (amount - fee) / tokens if log["topics"][0] == FPMM_BUY else (amount + fee) / tokens
        return (price if int(log["topics"][2], 16) == 0 else 1 - price), int(log["blockNumber"], 16)
    return None, None


def polymarket_2022_rows():
    out, end_block = [], block_at(CUTOFF_2022)
    for slug in POLY_2022_EVENTS:
        event = get_json(f"https://gamma-api.polymarket.com/events?slug={slug}", f"poly_event_{slug[:40]}.json")[0]
        for market in event["markets"]:
            m = re.match(r"(Senate|Governor):\s+Will an? (Democrat|Independent) \(.+?\) or Republican \(.+?\) win in (.+?)\?", market["question"])
            if not m or m.group(3) not in STATES or json.loads(market["outcomes"])[1] != "Republican":
                print(f"  polymarket 2022: skipped {market['question']}", file=sys.stderr)
                continue
            dem, block = fpmm_last_trade(market["marketMakerAddress"].lower(), end_block)
            if dem is None:
                print(f"  polymarket 2022: no trade before the cutoff for {market['question']}", file=sys.stderr)
                continue
            stamp = int(rpc("eth_getBlockByNumber", [hex(block), False], f"polygon_block_{block}.json")["timestamp"], 16)
            kind = "S" if m.group(1) == "Senate" else "G"
            out.append(row(year=2022, source="polymarket", kind=kind, state=STATES[m.group(3)], seat="regular" if kind == "S" else "gov", framing="party",
                           dem=round(dem, 4), rep=round(1 - dem, 4), as_of=datetime.fromtimestamp(stamp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                           volume=round(float(market.get("volume") or 0)), market_id=market["slug"], url=f"https://polymarket.com/event/{slug}",
                           title=re.sub(r"\s+", " ", market["question"])))
    return out


# ───────────────────────────── Polymarket (2024)

POLY_TAGS = ["state-presidential-election", "senate-elections", "governor", "gubernatorial", "house", "us-elections", "elections", "congress"]


def polymarket_events():
    seen = {}
    for tag in POLY_TAGS:
        offset = 0
        while True:
            page = get_json(f"https://gamma-api.polymarket.com/events?closed=true&limit=100&offset={offset}&tag_slug={tag}", f"poly_events_{tag}_{offset}.json")
            for e in page:
                seen[e["id"]] = e
            if len(page) < 100:
                break
            offset += 100
    return [e for e in seen.values() if (e.get("endDate") or "")[:4] == "2024"]


def polymarket_eve_price(token):
    hist = get_json(f"https://clob.polymarket.com/prices-history?market={token}&startTs={CUTOFF_2024 - 4 * 86400}&endTs={CUTOFF_2024}&fidelity=60", f"poly_hist_{token[:40]}.json")["history"]
    pts = [p for p in hist if p["t"] <= CUTOFF_2024]
    return (pts[-1]["p"], pts[-1]["t"]) if pts else (None, None)


def classify_polymarket(event):
    title = re.sub(r"\s+", " ", event["title"]).strip()
    if "Senate" not in title and "Governor" not in title and any(t["slug"] == "state-presidential-election" for t in event.get("tags") or []):
        # Swing states are titled "Who will win Pennsylvania?"; the rest "<State> Presidential Election Winner".
        st, cd = state_of(title), re.search(r"(\d)(?:st|nd|rd) Congressional District", title)
        return ("P", st, f"cd{cd.group(1)}" if cd else "statewide") if st else None
    m = re.match(r"([A-Z]{2})-(\d{1,2}) election: .+\(D\) vs\. .+\(R\)$", title)
    if m and m.group(1) in ABBRS:
        return "H", m.group(1), district(m.group(1), m.group(2))
    m = re.match(r"(.+?) Senate Election Winner$", title)
    if m and m.group(1) in STATES:
        return "S", STATES[m.group(1)], "regular"
    m = re.match(r"(.+?) Governor Election Winner$", title)
    if m and m.group(1) in STATES:
        return "G", STATES[m.group(1)], "gov"
    return None


def polymarket_rows():
    out = []
    for event in polymarket_events():
        hit = classify_polymarket(event)
        if not hit:
            continue
        kind, st, seat = hit
        prices, stamp, volume = {}, None, 0.0
        for market in event["markets"]:
            tokens = json.loads(market["clobTokenIds"])
            m = re.match(r"Will a (Democrat|Republican|candidate from another party) win", market["question"])
            if kind == "H":  # one two-outcome market, Democrat listed first
                sides = list(zip(("Democrat", "Republican"), tokens))
            elif m:
                sides = [(m.group(1), tokens[0])]
            else:
                continue
            for side, token in sides:
                price, t = polymarket_eve_price(token)
                prices[side] = price
                stamp = max(stamp or 0, t or 0)
            volume += float(market.get("volume") or 0)
        dem = prices.get("candidate from another party") if (kind, st, seat, 2024) in OTHER_IS_DEM_SLOT else prices.get("Democrat")
        rep = prices.get("Republican")
        if dem is None or rep is None:
            print(f"  polymarket: no eve price for {event['slug']}", file=sys.stderr)
            continue
        out.append(row(year=2024, source="polymarket", kind=kind, state=st, seat=seat, framing="party", dem=dem, rep=rep,
                       as_of=datetime.fromtimestamp(stamp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), volume=round(volume),
                       market_id=event["slug"], url=f"https://polymarket.com/event/{event['slug']}", title=re.sub(r"\s+", " ", event["title"]).strip()))
    return out


# ───────────────────────────── Kalshi (2024)

KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
KALSHI_SERIES = re.compile(r"^(?:KX)?(SENATE|HOUSE|GOVPARTY|PRESPARTY)")


def kalshi_series():
    out = []
    for category in ("Elections", "Politics"):
        for s in get_json(f"{KALSHI}/series?category={category}", f"kalshi_series_{category}.json").get("series") or []:
            if KALSHI_SERIES.match(s["ticker"]):
                out.append(s["ticker"])
    return sorted(set(out))


def classify_kalshi(series, title):
    kind = {"SENATE": "S", "HOUSE": "H", "GOVPARTY": "G", "PRESPARTY": "P"}[KALSHI_SERIES.match(series).group(1)]
    if kind == "H":
        m = re.search(r"\b([A-Z]{2})-(\d{1,2}|AL)\b", title)
        return ("H", m.group(1), district(m.group(1), 1 if m.group(2) == "AL" else m.group(2))) if m and m.group(1) in ABBRS else None
    if kind == "P":
        m = re.search(r"\b(ME|NE)-(\d)\b", title)
        if m:
            return "P", m.group(1), f"cd{m.group(2)}"
    st = state_of(title)
    seat = "special" if kind == "S" and "special" in title.lower() else {"S": "regular", "G": "gov", "P": "statewide"}[kind]
    return (kind, st, seat) if st else None


def kalshi_eve_price(series, ticker):
    """Last trade at or before the cutoff, else the last quoted midpoint."""
    url = f"{KALSHI}/historical/markets/{ticker}/candlesticks?start_ts={CUTOFF_2024 - 4 * 86400}&end_ts={CUTOFF_2024}&period_interval=60"
    candles = [c for c in get_json(url, f"kalshi_candles_{ticker}.json").get("candlesticks") or [] if c["end_period_ts"] <= CUTOFF_2024]
    for c in reversed(candles):
        close = (c.get("price") or {}).get("close")
        if close is not None:
            return float(close), c["end_period_ts"]
    for c in reversed(candles):
        bid, ask = (c.get("yes_bid") or {}).get("close"), (c.get("yes_ask") or {}).get("close")
        if bid is not None and ask is not None:
            return (float(bid) + float(ask)) / 2, c["end_period_ts"]
    return None, None


def kalshi_rows():
    best = {}
    for series in kalshi_series():
        events = get_json(f"{KALSHI}/events?series_ticker={series}&limit=200", f"kalshi_events_{series}.json").get("events") or []
        time.sleep(0.05)
        for event in events:
            if not re.search(r"-24$", event["event_ticker"]):
                continue
            hit = classify_kalshi(series, event["title"])
            if not hit:
                continue
            kind, st, seat = hit
            markets = get_json(f"{KALSHI}/historical/markets?event_ticker={event['event_ticker']}&limit=100", f"kalshi_markets_{event['event_ticker']}.json").get("markets") or []
            prices, stamp, volume = {}, None, 0.0
            for market in markets:
                party = (market.get("custom_strike") or {}).get("Party") or ""
                side = "dem" if party.startswith("Dem") else "rep" if party.startswith("Rep") else "other"  # the feed has typos ("Republicn")
                price, t = kalshi_eve_price(series, market["ticker"])
                if price is None:
                    continue
                prices[side] = price
                stamp = max(stamp or 0, t)
                volume += float(market.get("volume_fp") or market.get("volume") or 0)
            dem = prices.get("other") if (kind, st, seat, 2024) in OTHER_IS_DEM_SLOT else prices.get("dem")
            if dem is None or prices.get("rep") is None:
                continue
            candidate = row(year=2024, source="kalshi", kind=kind, state=st, seat=seat, framing="party", dem=dem, rep=prices["rep"],
                            as_of=datetime.fromtimestamp(stamp, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), volume=round(volume),
                            market_id=event["event_ticker"], url=f"https://kalshi.com/markets/{series.lower()}", title=event["title"])
            key = (kind, st, seat)  # some races were listed under two series; keep the busier one
            if key not in best or candidate["volume"] > best[key]["volume"]:
                best[key] = candidate
    return list(best.values())


# ───────────────────────────── output

def write_ts(rows):
    lines = [
        "// Auto-generated by scripts/fetch-prediction-markets.py — do not edit by hand.",
        "// Source: data-entry/prediction_markets.csv",
        "//",
        "// One row per race-level prediction market, priced on election eve. Prices are the cost of a",
        "// $1 contract, so 0.62 reads as a 62% chance. lib/predictionMarkets.ts joins these to the",
        "// race calendar and scores them; see the script header for sources and cutoffs.",
        "",
        'export type MarketSource = "polymarket" | "kalshi" | "predictit";',
        "",
        "export type MarketQuote = {",
        "  year: number;",
        "  source: MarketSource;",
        '  kind: "P" | "S" | "G" | "H";',
        "  /** Two-letter state; blank for the few candidate markets whose title names no place. */",
        "  state: string;",
        '  /** P: "statewide" | "cd1".. · S: "regular" | "special" | "" · G: "gov" · H: "GA-07" | "". */',
        "  seat: string;",
        '  /** "party": dem/rep contract prices. "candidate": one yes/no contract on `subject` winning. */',
        '  framing: "party" | "candidate";',
        "  subject: string;",
        "  dem: number | null;",
        "  rep: number | null;",
        "  yes: number | null;",
        "  /** When the price was read, UTC. */",
        "  asOf: string;",
        "  /** Lifetime volume in the venue's own units (Polymarket dollars, Kalshi contracts); null for PredictIt. */",
        "  volume: number | null;",
        "  marketId: string;",
        "  url: string;",
        "  title: string;",
        "};",
        "",
        "export const marketQuotes: MarketQuote[] = [",
    ]
    num = lambda v: "null" if v in ("", None) else repr(round(float(v), 4)).rstrip("0").rstrip(".") if "." in repr(round(float(v), 4)) else repr(round(float(v), 4))
    for r in rows:
        lines.append(
            f'  {{ year: {r["year"]}, source: "{r["source"]}", kind: "{r["kind"]}", state: "{r["state"]}", seat: "{r["seat"]}", '
            f'framing: "{r["framing"]}", subject: {json.dumps(r["subject"], ensure_ascii=False)}, dem: {num(r["dem"])}, rep: {num(r["rep"])}, yes: {num(r["yes"])}, '
            f'asOf: "{r["as_of"]}", volume: {num(r["volume"])}, marketId: {json.dumps(str(r["market_id"]))}, url: {json.dumps(r["url"])}, title: {json.dumps(r["title"], ensure_ascii=False)} }},'
        )
    lines += ["];", ""]
    with open(TS_PATH, "w") as f:
        f.write("\n".join(lines))


def main():
    global CACHE
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(tempfile.gettempdir(), "prediction-markets-cache"))
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()
    CACHE = args.cache
    os.makedirs(CACHE, exist_ok=True)

    if args.offline:
        with open(CSV_PATH) as f:
            rows = list(csv.DictReader(f))
    else:
        rows = []
        for name, fn in (("predictit", predictit_rows), ("predictit 2022 (relayed)", ebo_rows), ("polymarket 2022", polymarket_2022_rows),
                         ("polymarket", polymarket_rows), ("kalshi", kalshi_rows)):
            got = fn()
            print(f"{name}: {len(got)} markets")
            rows += got
        rows.sort(key=lambda r: (int(r["year"]), r["source"], r["kind"], r["state"], r["seat"], str(r["market_id"])))
        with open(CSV_PATH, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            w.writeheader()
            w.writerows(rows)
    write_ts(rows)
    print(f"wrote {len(rows)} rows to {os.path.relpath(CSV_PATH, ROOT)} and {os.path.relpath(TS_PATH, ROOT)}")


if __name__ == "__main__":
    main()
