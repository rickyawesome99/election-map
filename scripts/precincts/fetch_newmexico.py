#!/usr/bin/env python3
"""New Mexico legislative precinct results from the Secretary of State's results site.

MEDSL and OpenElections both stop at district 25 for 2020: the site's legislative page shows districts
1-25 until "All Districts" is pressed, and the scrapers behind both never pressed it. This presses it,
then downloads each race's "precinct export" workbook (one sheet per county: a header row with the
candidates, then one row per precinct) into data-entry/precincts/raw/official/nm/{year}/ and writes
raw/medsl/{year}/by_state/NM.oe.parquet in the layout build_results_medsl.py reads. The export has no
party column: the builder takes each candidate's party from the site's district results.

  python3 scripts/precincts/fetch_newmexico.py 2020
  python3 scripts/precincts/build_results_medsl.py 2020 NM --variant mix --only SLDU,SLDL
"""
from __future__ import annotations

import csv
import re
import sys
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data-entry" / "precincts" / "raw"
EID = {2020: 2782}
UA = {"User-Agent": "Mozilla/5.0 (precinct results archive)"}


def hidden(html: str) -> dict[str, str]:
    return {m.group(1): m.group(2).replace("&amp;", "&").replace("&quot;", '"') for m in re.finditer(r'<input type="hidden" name="([^"]+)"[^>]*value="([^"]*)"', html)}


def main() -> None:
    year = int(sys.argv[1])
    url = f"https://electionresults.sos.nm.gov/resultsSW.aspx?type=LGX&map=CTY&eid={EID[year]}"
    dest = RAW / "official" / "nm" / str(year)
    dest.mkdir(parents=True, exist_ok=True)
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    def post(fields: dict[str, str]) -> bytes:
        req = urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode(), headers=UA)
        with opener.open(req, timeout=120) as r:
            return r.read()

    if not list(dest.glob("*.xlsx")):
        with opener.open(urllib.request.Request(url, headers=UA), timeout=120) as r:
            first = r.read().decode("utf-8", "replace")
        page = post({**hidden(first), "ctl00$MainContent$btnHouse4": "All Districts"}).decode("utf-8", "replace")
        targets = sorted(set(re.findall(r"ctl00\$MainContent\$rptRace\$ctl\d+\$PrecinctExport", page)))
        print(len(targets), "races", flush=True)
        base = hidden(page)
        for t in targets:
            body = post({**base, "__EVENTTARGET": t, "__EVENTARGUMENT": ""})
            if body[:2] == b"PK":
                (dest / (re.search(r"rptRace\$ctl(\d+)", t).group(1) + ".xlsx")).write_bytes(body)
    code = {}
    with open(ROOT / "data" / "county_presidential_results_2008_2024.csv", newline="") as f:
        for r in csv.DictReader(f):
            if r["state"] == "NM":
                code[re.sub(r"[^a-z]", "", r["county_name"].lower().replace(" county", "").replace("ñ", "n"))] = r["county_id"].zfill(5)
    rows = []
    for p in sorted(dest.glob("*.xlsx")):
        for county, sheet in pd.read_excel(p, sheet_name=None, header=None, dtype=str).items():
            sheet = sheet.fillna("")
            head = next((i for i in range(len(sheet)) if "Precinct" in set(sheet.iloc[i])), None)
            if head is None:
                continue
            h = list(sheet.iloc[head])
            m = re.match(r"State (Senator|Representative) DISTRICT (\d+)", h[0])
            if not m:
                continue
            office, district = ("SLDU" if m.group(1) == "Senator" else "SLDL"), m.group(2)
            pc = h.index("Precinct")
            for i in range(head + 1, len(sheet)):
                r = list(sheet.iloc[i])
                if not r[pc] or r[pc].upper().startswith("TOTAL"):
                    continue
                for j in range(pc + 1, len(h)):
                    if h[j] and re.fullmatch(r"[\d,.]+", r[j]):  # "*" = withheld for a very small precinct
                        rows.append((code.get(re.sub(r"[^a-z]", "", county.lower().replace("ñ", "n")), ""), county.upper(), r[pc], office, district, h[j].upper().strip(), int(float(r[j].replace(",", "")))))
    out = pd.DataFrame(rows, columns=["county", "jurisdiction", "precinct", "office", "district", "candidate", "votes"])
    out["party"], out["writein"], out["mode"] = "", False, "TOTAL"
    out = out[["county", "jurisdiction", "precinct", "office", "district", "candidate", "party", "writein", "mode", "votes"]]
    out.to_parquet(RAW / "medsl" / str(year) / "by_state" / "NM.oe.parquet", index=False)
    print("NM", year, len(out), out.groupby("office")["district"].nunique().to_dict(), "votes", int(out["votes"].sum()), "no county code:", sorted(set(out.loc[out["county"] == "", "jurisdiction"]))[:5])


if __name__ == "__main__":
    main()
