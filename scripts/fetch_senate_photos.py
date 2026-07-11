#!/usr/bin/env python3
"""
Downloads official headshots for all 100 sitting U.S. Senators and registers
them in lib/candidatePhotos.ts.

Source of truth for names: data/forecastData.ts -- the "seatHolder" field on
senateData (seats up for election in 2026) plus the "incumbent" field on
senateNoElection and senateHoldovers (seats not up in 2026).

Matching is done by NAME, not by state: a senator can be a very recent
appointee/special-election winner not yet reflected the same way across
datasets, so name matching (first name or nickname + last name) against the
combined current + historical legislators pool is more robust than relying
on state alone. State is only used as a last-resort tiebreaker for ambiguous
name matches.

Photos come from the unitedstates/images project (official government
portraits, public domain), served off GitHub raw at a stable URL keyed by
bioguide ID.

Run from project root: python3 scripts/fetch_senate_photos.py
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
    return re.sub(r"[^a-z0-9]+", "-", ascii_lower(name)).strip("-")


def extract_export(src, name):
    marker = f"export const {name}"
    start = src.index(marker)
    eq = src.index("=", start) + 1
    next_idx = src.index("\nexport const", eq)
    json_str = src[eq:next_idx].strip()
    if json_str.endswith(";"):
        json_str = json_str[:-1]
    return json.loads(json_str)


def load_senators():
    """Returns a flat list of (name, party, abbr) for all 100 sitting senators."""
    src = open(FORECAST_DATA, encoding="utf-8").read()
    senate_data = extract_export(src, "senateData")
    no_election = extract_export(src, "senateNoElection")
    holdovers = extract_export(src, "senateHoldovers")

    senators = []
    for race in senate_data:
        if race.get("seatHolder"):
            state_abbr = (race.get("id") or "").split("-")[0]  # "DE-2" -> "DE"
            senators.append((race["seatHolder"], race.get("seatParty"), state_abbr))
    for entry in no_election + holdovers:
        if entry.get("incumbent"):
            senators.append((entry["incumbent"], entry.get("party"), entry.get("abbr")))
    return senators


def load_existing_photo_names():
    src = open(CANDIDATE_PHOTOS, encoding="utf-8").read()
    return set(re.findall(r'^\s*"([^"]+)":\s*"/candidates/', src, re.MULTILINE))


def sens_from(legislators):
    """Extract senator records. Scans all terms (not just the last) since a
    legislator's most recent term might not be type=='sen' (e.g. House->Senate)."""
    records = []
    for legislator in legislators:
        sen_terms = [t for t in legislator["terms"] if t["type"] == "sen"]
        if not sen_terms:
            continue
        last_sen_term = sen_terms[-1]
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
                "state": last_sen_term.get("state"),
                "end": last_sen_term.get("end", ""),
            }
        )
    return records


def load_legislators():
    print("Fetching legislators-current.yaml ...")
    current = sens_from(yaml.safe_load(fetch(CURRENT_URL)))
    print("Fetching legislators-historical.yaml ...")
    historical = sens_from(yaml.safe_load(fetch(HISTORICAL_URL)))
    return current, historical


def find_by_name(name, state_hint, pool):
    tokens = set(ascii_lower(name).split())
    candidates = [
        r
        for r in pool
        if {ascii_lower(f) for f in r["first_names"]} & tokens
        and set(ascii_lower(r["last"]).split()) & tokens
    ]
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        narrowed = [r for r in candidates if r["state"] == state_hint]
        if len(narrowed) == 1:
            return narrowed[0]
        return sorted(candidates, key=lambda r: r["end"], reverse=True)[0]

    # No first-name/nickname token matched (e.g. informal names not captured
    # as a "nickname" in the source data -- Chris/Christopher, Dick/Richard).
    # A state only ever has two senators, so last name + state is unique
    # enough to trust without a first-name match.
    last_word_candidates = [
        r for r in pool if set(ascii_lower(r["last"]).split()) & tokens and r["state"] == state_hint
    ]
    if len(last_word_candidates) == 1:
        return last_word_candidates[0]
    if len(last_word_candidates) > 1:
        return sorted(last_word_candidates, key=lambda r: r["end"], reverse=True)[0]
    return None


def main():
    senators = load_senators()
    existing = load_existing_photo_names()
    current_sens, historical_sens = load_legislators()
    os.makedirs(PHOTOS_DIR, exist_ok=True)

    to_download = []  # (name, party, state, source, bioguide)
    already_had = []
    unmatched = []
    seen_names = set()

    for name, party, state in senators:
        if name in seen_names:
            continue
        seen_names.add(name)
        if name in existing:
            already_had.append(name)
            continue

        match = find_by_name(name, state, current_sens)
        source = "current"
        if not match:
            match = find_by_name(name, state, historical_sens)
            source = "historical"
        if not match:
            unmatched.append((state, name))
            continue

        to_download.append((name, party, state, source, match["bioguide"]))

    print(f"\nTotal senators: {len(seen_names)}")
    print(f"Already had photos: {len(already_had)}")
    print(f"To download: {len(to_download)}")
    print(f"Unmatched (no name match in current or historical data): {len(unmatched)}")
    for s, n in unmatched:
        print(f"  - {s}: {n}")

    new_entries = []
    failed_downloads = []
    for name, party, state, source, bioguide in to_download:
        slug = slugify(name)
        dest = os.path.join(PHOTOS_DIR, f"{slug}.jpg")
        if not os.path.exists(dest):
            try:
                img = fetch(PHOTO_URL.format(bioguide=bioguide), binary=True)
                with open(dest, "wb") as f:
                    f.write(img)
            except Exception as e:
                print(f"  FAILED to download {name} ({state}, {bioguide}, {source}): {e}")
                failed_downloads.append((state, name))
                continue
        tag = "" if source == "current" else "  [former member, historical data]"
        print(f"  {name} ({state}) -> {bioguide}{tag}")
        new_entries.append((name, party))

    print(f"\nDownloaded: {len(new_entries)}")
    if failed_downloads:
        print(f"Failed downloads: {len(failed_downloads)}")
        for s, n in failed_downloads:
            print(f"  - {s}: {n}")

    if new_entries:
        dems = sorted([n for n, p in new_entries if p == "D"], key=lambda n: n.split()[-1])
        reps = sorted([n for n, p in new_entries if p == "R"], key=lambda n: n.split()[-1])
        others = sorted([n for n, p in new_entries if p not in ("D", "R")], key=lambda n: n.split()[-1])

        lines = ['  // ── Senators ──────────────────────────────────────────────────────────────']
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
