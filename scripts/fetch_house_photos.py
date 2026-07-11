#!/usr/bin/env python3
"""
Downloads official headshots for U.S. House incumbents (data/forecastData.ts
houseData "seatHolder" field) and registers them in lib/candidatePhotos.ts.

Matching is done by NAME, not by district: several states (e.g. California)
have redistricted mid-decade, so district numbers in our data don't reliably
line up with district numbers in the legislators dataset. District is only
used as a last-resort tiebreaker if a name matches multiple people.

Some listed incumbents have since left Congress (resigned, special election,
etc.) and no longer appear in legislators-current.yaml -- those are looked up
in legislators-historical.yaml instead, since they still have a candidate
page on the site (via past election results) and should still get a photo.

Photos come from the unitedstates/images project (official government
portraits, public domain), served off GitHub raw at a stable URL keyed by
bioguide ID.

Run from project root: python3 scripts/fetch_house_photos.py
"""
import json
import re
import os
import unicodedata
import urllib.request
import yaml

ROOT = os.path.join(os.path.dirname(__file__), "..")
FORECAST_DATA = os.path.join(ROOT, "data/forecastData.ts")
CANDIDATE_PHOTOS = os.path.join(ROOT, "lib/candidatePhotos.ts")
PHOTOS_DIR = os.path.join(ROOT, "public/candidates")

CURRENT_URL = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml"
HISTORICAL_URL = "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-historical.yaml"
PHOTO_URL = "https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/450x550/{bioguide}.jpg"


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": "election-map-photo-sync/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
    return data if binary else data.decode("utf-8")


def ascii_lower(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").lower()


def slugify(name):
    # ASCII-normalize for a clean filename; the candidatePhotos.ts *key* keeps
    # the original (possibly accented) name so it exact-matches forecastData.ts.
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_lower(name)).strip("-")
    return slug


def load_house_data():
    src = open(FORECAST_DATA, encoding="utf-8").read()
    marker = "export const houseData: RaceForecast[] = "
    start = src.index(marker) + len(marker)
    end = src.index("\nexport const", start)
    json_str = src[start:end].strip()
    if json_str.endswith(";"):
        json_str = json_str[:-1]
    return json.loads(json_str)


def load_existing_photo_names():
    src = open(CANDIDATE_PHOTOS, encoding="utf-8").read()
    return set(re.findall(r'^\s*"([^"]+)":\s*"/candidates/', src, re.MULTILINE))


def reps_from(legislators, prefer_recent=False):
    """Extract rep records. Each legislator may have held a House seat in any
    term (not necessarily their last), so scan all terms and use the most
    recent House term for state/district/end date."""
    records = []
    for legislator in legislators:
        rep_terms = [t for t in legislator["terms"] if t["type"] == "rep"]
        if not rep_terms:
            continue
        last_rep_term = rep_terms[-1]
        district = last_rep_term.get("district") or 1  # 0 = at-large; site uses "-01"
        first_names = {legislator["name"]["first"]}
        if legislator["name"].get("nickname"):
            first_names.add(legislator["name"]["nickname"])
        records.append(
            {
                "bioguide": legislator["id"]["bioguide"],
                "official_full": legislator["name"].get("official_full")
                or f"{legislator['name']['first']} {legislator['name']['last']}",
                "first_names": first_names,
                "last": legislator["name"]["last"],
                "state": last_rep_term.get("state"),
                "district": district,
                "end": last_rep_term.get("end", ""),
            }
        )
    return records


def load_legislators():
    print("Fetching legislators-current.yaml ...")
    current = reps_from(yaml.safe_load(fetch(CURRENT_URL)))
    print("Fetching legislators-historical.yaml ...")
    historical = reps_from(yaml.safe_load(fetch(HISTORICAL_URL)))
    return current, historical


def find_by_name(name, district_hint, pool):
    tokens = set(ascii_lower(name).split())
    candidates = [
        r
        for r in pool
        if {ascii_lower(f) for f in r["first_names"]} & tokens
        and set(ascii_lower(r["last"]).split()) & tokens
    ]
    if len(candidates) <= 1:
        return candidates[0] if candidates else None
    # Ambiguous name match (rare) -- use district as a tiebreaker.
    state, _, dist_num = district_hint.partition("-")
    narrowed = [r for r in candidates if r["state"] == state and r["district"] == int(dist_num)]
    if len(narrowed) == 1:
        return narrowed[0]
    # Still ambiguous: prefer the most recently serving match.
    return sorted(candidates, key=lambda r: r["end"], reverse=True)[0]


def main():
    house_data = load_house_data()
    existing = load_existing_photo_names()
    current_reps, historical_reps = load_legislators()
    os.makedirs(PHOTOS_DIR, exist_ok=True)

    to_download = []  # (name, party, district, source, bioguide)
    already_had = []
    unmatched = []

    for race in house_data:
        name = race.get("seatHolder")
        party = race.get("seatParty")
        district = race["name"]
        if not name:
            unmatched.append((district, "(no seatHolder)"))
            continue
        if name in existing:
            already_had.append(name)
            continue

        match = find_by_name(name, district, current_reps)
        source = "current"
        if not match:
            match = find_by_name(name, district, historical_reps)
            source = "historical"
        if not match:
            unmatched.append((district, name))
            continue

        to_download.append((name, party, district, source, match["bioguide"]))

    print(f"\nTotal House races: {len(house_data)}")
    print(f"Already had photos: {len(already_had)}")
    print(f"To download: {len(to_download)}")
    print(f"Unmatched (no name match in current or historical data): {len(unmatched)}")
    for d, n in unmatched:
        print(f"  - {d}: {n}")

    new_entries = []
    failed_downloads = []
    for name, party, district, source, bioguide in to_download:
        slug = slugify(name)
        dest = os.path.join(PHOTOS_DIR, f"{slug}.jpg")
        if not os.path.exists(dest):
            try:
                img = fetch(PHOTO_URL.format(bioguide=bioguide), binary=True)
                with open(dest, "wb") as f:
                    f.write(img)
            except Exception as e:
                print(f"  FAILED to download {name} ({district}, {bioguide}, {source}): {e}")
                failed_downloads.append((district, name))
                continue
        tag = "" if source == "current" else "  [former member, historical data]"
        print(f"  {name} ({district}) -> {bioguide}{tag}")
        new_entries.append((name, party))

    print(f"\nDownloaded: {len(new_entries)}")
    if failed_downloads:
        print(f"Failed downloads: {len(failed_downloads)}")
        for d, n in failed_downloads:
            print(f"  - {d}: {n}")

    # Insert new entries into candidatePhotos.ts, split by party, sorted by last name.
    if new_entries:
        dems = sorted([n for n, p in new_entries if p == "D"], key=lambda n: n.split()[-1])
        reps = sorted([n for n, p in new_entries if p == "R"], key=lambda n: n.split()[-1])
        others = sorted([n for n, p in new_entries if p not in ("D", "R")], key=lambda n: n.split()[-1])

        lines = ['  // ── House Incumbents ──────────────────────────────────────────────────────']
        if dems:
            lines.append("  // Democrats")
            for n in dems:
                lines.append(f'  "{n}": "/candidates/{slugify(n)}.jpg",')
        if reps:
            lines.append("  // Republicans")
            for n in reps:
                lines.append(f'  "{n}": "/candidates/{slugify(n)}.jpg",')
        if others:
            lines.append("  // Other")
            for n in others:
                lines.append(f'  "{n}": "/candidates/{slugify(n)}.jpg",')
        block = "\n".join(lines) + "\n"

        src = open(CANDIDATE_PHOTOS, encoding="utf-8").read()
        assert src.rstrip().endswith("};")
        src = src.rstrip()[: -len("};")] + block + "};\n"
        with open(CANDIDATE_PHOTOS, "w", encoding="utf-8") as f:
            f.write(src)
        print(f"\nAppended {len(new_entries)} entries to lib/candidatePhotos.ts")


if __name__ == "__main__":
    main()
