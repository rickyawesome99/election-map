#!/usr/bin/env python3
"""OpenElections precinct files → the per-state layout the MEDSL builder reads.

MEDSL does not cover odd-year elections. OpenElections (volunteer-transcribed official returns, public
on GitHub) has precinct files for some of them. This downloads a state-year's general-election precinct
CSVs (county, precinct, office, district, candidate, party, votes) and writes
data-entry/precincts/raw/medsl/{year}/by_state/{ST}.parquet in the layout of split_medsl.py, so
build_results_medsl.py can place them like any other year.

  python3 scripts/precincts/split_openelections.py MS 2019
  python3 scripts/precincts/split_openelections.py KY 2023
  python3 scripts/precincts/split_openelections.py MI 2018 precinct oe   # second input beside MEDSL's: build with --variant oe --only SLDU
  python3 scripts/precincts/split_openelections.py NJ 2017 municipal   # town-level rows (no precinct file exists)
"""
from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-entry" / "precincts" / "raw"
OFFICE = {"governor": "GOV", "state house": "SLDL", "state senate": "SLDU", "state representative": "SLDL", "state senator": "SLDU", "house of delegates": "SLDL",
          "general assembly": "SLDL", "state assembly": "SLDL", "assembly": "SLDL", "u.s. house": "USH", "us house": "USH", "u.s. senate": "USS", "us senate": "USS", "president": "PRES", "governor and lieutenant governor": "GOV"}
PARTY = {"R": "REPUBLICAN", "REP": "REPUBLICAN", "D": "DEMOCRAT", "DEM": "DEMOCRAT", "IND": "INDEPENDENT", "I": "INDEPENDENT", "NPA": "INDEPENDENT", "L": "LIBERTARIAN", "LBT": "LIBERTARIAN", "LIB": "LIBERTARIAN"}
NOT_A_CANDIDATE = re.compile(r"^(total|totals|registered voters|ballots cast.*|over ?votes?|under ?votes?|blank.*|turnout)$", re.I)


# County files to read beside the statewide one, where the statewide file leaves counties out (Texas 2016:
# Tarrant and Jefferson, which hold House districts 22, 90-99 and 101).
EXTRA = {("NY", 2018): ["2018/counties/20181106__ny__general__orange__precinct.csv", "2018/counties/20181106__ny__general__wyoming_precinct.csv"],
         ("TX", 2016): ["2016/counties/20161108__tx__general__tarrant__precinct.csv", "2016/counties/20161108__tx__general__jefferson__precinct.csv"]}


def files(st: str, year: int, level: str = "precinct") -> list[Path]:
    """General-election precinct files of that year in openelections-data-{st}: one statewide file if there is one, else the county files."""
    dest = RAW / "openelections" / st / (str(year) if level == "precinct" else f"{year}-{level}")
    dest.mkdir(parents=True, exist_ok=True)
    have = sorted(dest.glob("*.csv"))
    if have:
        return have
    req = urllib.request.Request(f"https://api.github.com/repos/openelections/openelections-data-{st.lower()}/git/trees/master?recursive=1", headers={"User-Agent": "precinct pipeline"})
    with urllib.request.urlopen(req, timeout=60) as r:
        tree = [x["path"] for x in json.load(r)["tree"]]
    names = [p for p in tree if re.match(rf"{year}/(counties/|General/)?{year}1[01]\d{{2}}__{st.lower()}__general_+(\w+__)?precinct\.csv$", p)]
    statewide = [p for p in names if re.search(rf"__{st.lower()}__general__precinct\.csv$", p)]
    if level == "municipal":  # New Jersey: no statewide precinct file; one row per municipality
        statewide = [p for p in tree if re.match(rf"{year}/{year}\d{{4}}__{st.lower()}__general__municipal\.csv$", p)]
    for p in (statewide or names) + EXTRA.get((st, year), []):
        subprocess.run(["curl", "-sL", "-o", str(dest / Path(p).name), f"https://raw.githubusercontent.com/openelections/openelections-data-{st.lower()}/master/{p}"], check=True)
    return sorted(dest.glob("*.csv"))


def fold(x: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", x) if not unicodedata.combining(c))


def county_codes(st: str) -> dict[str, str]:
    out = {}
    with open(ROOT / "data" / "county_presidential_results_2008_2024.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["state"] == st:
                out[re.sub(r"[^a-z]", "", fold(r["county_name"]).lower().replace(" county", "").replace(" parish", ""))] = r["county_id"].zfill(5)
    return out


def main() -> None:
    st, year = sys.argv[1].upper(), int(sys.argv[2])
    level = sys.argv[3] if len(sys.argv) > 3 else "precinct"
    variant = sys.argv[4] if len(sys.argv) > 4 else ""  # "oe": written beside the MEDSL file ({ST}.oe.parquet) to fill contests MEDSL lacks
    code = county_codes(st)
    frames = []
    extra = {Path(x).name for x in EXTRA.get((st, year), [])}
    seen: set[tuple[str, str, str]] = set()
    for p in sorted(files(st, year, level), key=lambda q: q.name in extra):  # the statewide file first
        d = pd.read_csv(p, dtype=str, na_filter=False)
        d.columns = [c.strip().lower() for c in d.columns]
        if level == "municipal":  # the municipality stands in for the precinct; the builder keeps its votes inside that town
            d = d[d["office"].str.lower().isin(["state senate", "general assembly"])].rename(columns={"municipality": "precinct"})
        if st == "MA" and "town" in d.columns:  # town / ward / precinct columns, a "TOTALS" line per contest, no county
            d = d[d["town"].str.upper().str.strip() != "TOTALS"].copy()
            idx = json.loads((ROOT / "public" / "precincts" / "index" / "MA.json").read_text())
            tk = lambda t: re.sub(r"[^a-z]", "", t.lower())  # noqa: E731
            town_county = {}
            for n, c in zip(idx["names"], idx["county"]):
                town_county.setdefault(tk(re.split(r"\s+(?:ward|precinct|pct|w\d|p\d|\d)", n, flags=re.I)[0]), idx["counties"][c][1])
            d["county"] = [town_county.get(tk(t), "") for t in d["town"]]
            d["precinct"] = [f"{t} {('Ward ' + w + ' ') if w else ''}Precinct {p_}".strip() for t, w, p_ in zip(d["town"], d.get("ward", ""), d["precinct"])]
        if "county" not in d.columns:
            m = re.search(r"general_+(\w+?)__precinct", p.name)
            d["county"] = m.group(1).replace("_", " ") if m else ""
        for c in ("district", "party", "precinct"):
            if c not in d.columns:
                d[c] = ""
        d["office"] = d["office"].str.strip().str.lower().str.strip(" ,")
        if st == "NY":  # Monroe files the same-day special for the unexpired term under district "25-Unexpired"
            d = d[~d["district"].astype(str).str.contains("unexpired", case=False)].copy()
        if st == "ND":  # the seats given two-year terms after redistricting are that year's regular contests
            d["office"] = d["office"].str.replace(r" unexpired 2-year term$", "", regex=True)
        d["office"] = d["office"].map(OFFICE)
        d = d[d["office"].notna()]
        ck = list(zip(d["county"].str.lower().str.strip(), d["office"], d["district"].str.strip().str.lstrip("0")))
        if p.name in extra:  # an extra county file adds only the contests the statewide file lacks for that county
            d = d[[k not in seen for k in ck]]
        seen.update(ck)
        frames.append(d[["county", "precinct", "office", "district", "candidate", "party", "votes"]])
    d = pd.concat(frames, ignore_index=True)
    if (st, year) == ("TX", 2016):  # the statewide file carries every precinct line twice
        d = d.drop_duplicates(["county", "precinct", "office", "district", "candidate", "party", "votes"]).reset_index(drop=True)
    d = d[d["candidate"].str.strip() != ""].reset_index(drop=True)
    # A line with no precinct, in a county whose precincts are listed for the same contest and candidate, is that county's total.
    kk = ["county", "office", "district", "candidate"]
    named = set(map(tuple, d.loc[~d["precinct"].str.strip().str.fullmatch(r"(|totals?:?|county totals?:?|grand totals?:?|total county ?wide)", case=False), kk].drop_duplicates().to_numpy()))
    blank_total = d["precinct"].str.strip().str.fullmatch(r"(|totals?:?|county totals?:?|grand totals?:?|total county ?wide)", case=False) & pd.Series([tuple(x) in named for x in d[kk].to_numpy()], index=d.index)
    d = d[~blank_total].reset_index(drop=True)
    if st == "ME":  # each district block ends with its own total, filed under the last town's name: town, STATE UOCAVA, total
        v = pd.to_numeric(d["votes"].str.replace(",", ""), errors="coerce").fillna(0)
        g = [d[c] for c in ("office", "district", "candidate", "party")]
        last = ~d.duplicated(["office", "district", "candidate", "party"], keep="last")
        before = v.groupby(g).transform("sum") - v
        d = d[~(last & (v == before) & (v > 0))].reset_index(drop=True)
    d = d[~d["candidate"].map(lambda c: bool(NOT_A_CANDIDATE.match(c.strip())))]
    import difflib
    ckey = d["county"].map(fold).str.lower().str.replace(r"[^a-z]", "", regex=True)
    close = {k: (difflib.get_close_matches(k, list(code), n=1, cutoff=0.75) or [k])[0] for k in set(ckey) if k not in code}  # "Gd. Traverse"
    ckey = ckey.replace(close)
    if st == "IL":  # city election boards report apart from their county
        ckey = ckey.replace({"cityofchicago": "cook", "cityofbloomington": "mclean", "cityofdanville": "vermilion", "cityofeaststlouis": "stclair", "cityofgalesburg": "knox", "cityofrockford": "winnebago"})
    out = pd.DataFrame({
        "county": ckey.map(code).fillna(""), "jurisdiction": d["county"].str.upper().str.strip(), "precinct": d["precinct"].str.strip(), "office": d["office"],
        "district": d["district"].str.strip(), "candidate": d["candidate"].str.upper().str.strip(),
        "party": d["party"].str.strip().str.upper().map(lambda x: PARTY.get(x, x)), "writein": d["candidate"].str.contains(r"write.?in", case=False, regex=True),
        "mode": "TOTAL", "votes": pd.to_numeric(d["votes"].str.replace(",", ""), errors="coerce").fillna(0).round().astype("int64"),
    })
    dest = RAW / "medsl" / str(year) / "by_state"
    dest.mkdir(parents=True, exist_ok=True)
    out.to_parquet(dest / (f"{st}.{variant}.parquet" if variant else f"{st}.parquet"), index=False)
    missing = sorted(set(d["county"][out["county"].to_numpy() == ""]))
    print(st, year, len(out), out["office"].value_counts().to_dict(), "counties without a code:", missing[:8])


if __name__ == "__main__":
    main()
