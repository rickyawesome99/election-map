#!/usr/bin/env python3
"""
Downloads official photos for all 50 sitting U.S. governors and registers
them in lib/candidatePhotos.ts.

Governors aren't covered by the unitedstates/congress-legislators dataset
(that's Congress only), so this uses Wikidata + Wikimedia Commons instead.

Primary match: a single SPARQL query asks each US state item for its P6
("head of government") -- Wikidata's live pointer to the current governor --
plus that person's P18 (image). This is verified against our own ground
truth (data/forecastData.ts) by last name, since P6 can lag reality for very
recent transitions (e.g. a governor who just left for a cabinet post).

Fallback (when P6 doesn't match our ground-truth name, i.e. Wikidata is
stale for that seat): search Wikidata by name and confirm the match via a
P39 ("position held") claim resolving to "Governor of <State>", then use
that person's P18.

Unlike official congressional portraits (federal government works, public
domain), Commons images carry a per-file license -- often CC BY or CC BY-SA
from the state governor's office, sometimes something less permissive. Each
file's license is checked via the Commons API; only known-open licenses are
auto-downloaded. Anything else is flagged for manual review along with the
required attribution (credit + license) instead of silently skipped.

Run from project root: python3 scripts/fetch_governor_photos.py
"""
import json
import re
import os
import time
import unicodedata
import urllib.parse
import urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
FORECAST_DATA = os.path.join(ROOT, "data/forecastData.ts")
CANDIDATE_PHOTOS = os.path.join(ROOT, "lib/candidatePhotos.ts")
PHOTOS_DIR = os.path.join(ROOT, "public/candidates")

UA = "election-map-photo-sync/1.0 (contact: wenxia.wl@gmail.com)"
WIKIDATA_SEARCH = "https://www.wikidata.org/w/api.php"
WIKIDATA_ENTITY = "https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"
WIKIDATA_LABELS = "https://www.wikidata.org/w/api.php"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"

SPARQL_GOVERNORS = """
SELECT ?stateLabel ?gov ?govLabel ?image WHERE {
  ?state wdt:P31 wd:Q35657 .
  ?state wdt:P6 ?gov .
  OPTIONAL { ?gov wdt:P18 ?image }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""

# License short names we consider safe to auto-download (open/attribution-only).
ALLOWED_LICENSES = {
    "cc0",
    "public domain",
    "cc by 2.0", "cc by 3.0", "cc by 4.0",
    "cc by-sa 2.0", "cc by-sa 3.0", "cc by-sa 4.0",
}


def fetch_json(url, params=None, headers=None):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    hdrs = {"User-Agent": UA}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_binary(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def ascii_lower(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").lower()


def slugify(name):
    return re.sub(r"[^a-z0-9]+", "-", ascii_lower(name)).strip("-")


def last_name_overlaps(name_a, name_b):
    return bool(set(ascii_lower(name_a).split()) & set(ascii_lower(name_b).split()))


def extract_export(src, name):
    marker = f"export const {name}"
    start = src.index(marker)
    eq = src.index("=", start) + 1
    next_idx = src.index("\nexport const", eq)
    json_str = src[eq:next_idx].strip()
    if json_str.endswith(";"):
        json_str = json_str[:-1]
    return json.loads(json_str)


def load_governors():
    src = open(FORECAST_DATA, encoding="utf-8").read()
    governor_data = extract_export(src, "governorData")
    no_election = extract_export(src, "governorNoElection")

    governors = []
    for race in governor_data:
        if race.get("seatHolder"):
            governors.append((race["seatHolder"], race.get("seatParty"), race["state"]))
    for entry in no_election:
        if entry.get("incumbent"):
            governors.append((entry["incumbent"], entry.get("party"), entry["state"]))
    return governors


def load_existing_photo_names():
    src = open(CANDIDATE_PHOTOS, encoding="utf-8").read()
    return set(re.findall(r'^\s*"([^"]+)":\s*"/candidates/', src, re.MULTILINE))


def load_wikidata_current_governors():
    """One SPARQL query -> {state_name: {"label": ..., "qid": ..., "image_filename": ...}}"""
    result = fetch_json(
        WIKIDATA_SPARQL,
        {"query": SPARQL_GOVERNORS},
        headers={"Accept": "application/sparql-results+json"},
    )
    by_state = {}
    for row in result["results"]["bindings"]:
        state = row["stateLabel"]["value"]
        qid = row["gov"]["value"].rsplit("/", 1)[-1]
        image_filename = None
        if "image" in row:
            image_filename = urllib.parse.unquote(row["image"]["value"].rsplit("/", 1)[-1])
        by_state[state] = {"label": row["govLabel"]["value"], "qid": qid, "image_filename": image_filename}
    return by_state


def find_by_name_search(name, state):
    """Fallback for states where Wikidata's P6 hasn't caught up yet."""
    result = fetch_json(WIKIDATA_SEARCH, {
        "action": "wbsearchentities",
        "search": name,
        "language": "en",
        "format": "json",
        "limit": 5,
        "type": "item",
    })
    for hit in result.get("search", []):
        qid = hit["id"]
        entity = fetch_json(WIKIDATA_ENTITY.format(qid=qid))
        claims = entity["entities"][qid]["claims"]
        p39 = claims.get("P39", [])
        position_qids = [
            c["mainsnak"]["datavalue"]["value"]["id"]
            for c in p39
            if c["mainsnak"].get("snaktype") == "value"
        ]
        if not position_qids:
            continue
        labels_result = fetch_json(WIKIDATA_LABELS, {
            "action": "wbgetentities",
            "ids": "|".join(position_qids),
            "props": "labels",
            "languages": "en",
            "format": "json",
        })
        position_labels = [
            e.get("labels", {}).get("en", {}).get("value", "")
            for e in labels_result["entities"].values()
        ]
        target = ascii_lower(f"governor of {state}")
        if any(ascii_lower(label) == target for label in position_labels):
            p18 = claims.get("P18")
            image_filename = p18[0]["mainsnak"]["datavalue"]["value"] if p18 else None
            return {"qid": qid, "image_filename": image_filename}
    return None


def get_commons_file_info(filename):
    result = fetch_json(COMMONS_API, {
        "action": "query",
        "titles": f"File:{filename}",
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "format": "json",
    })
    pages = result["query"]["pages"]
    page = next(iter(pages.values()))
    imageinfo = page.get("imageinfo")
    if not imageinfo:
        return None
    info = imageinfo[0]
    meta = info.get("extmetadata", {})
    return {
        "url": info["url"],
        "license": meta.get("LicenseShortName", {}).get("value", "unknown"),
        "credit": meta.get("Artist", {}).get("value") or meta.get("Credit", {}).get("value") or "unknown",
    }


def main():
    governors = load_governors()
    existing = load_existing_photo_names()
    os.makedirs(PHOTOS_DIR, exist_ok=True)

    print("Fetching current governors from Wikidata (SPARQL) ...")
    wd_by_state = load_wikidata_current_governors()

    already_had = []
    no_match = []
    no_image = []
    needs_manual_review = []  # (name, state, url, license, credit)
    new_entries = []

    for name, party, state in governors:
        if name in existing:
            already_had.append(name)
            continue

        wd_entry = wd_by_state.get(state)
        image_filename = None
        source = None
        if wd_entry and last_name_overlaps(name, wd_entry["label"]):
            image_filename = wd_entry["image_filename"]
            source = "wikidata P6"
        else:
            try:
                fallback = find_by_name_search(name, state)
            except Exception as e:
                print(f"  ERROR searching Wikidata for {name}: {e}")
                fallback = None
            time.sleep(0.2)
            if fallback:
                image_filename = fallback["image_filename"]
                source = "name search + P39 verify"

        if source is None:
            no_match.append((name, state))
            continue
        if not image_filename:
            no_image.append((name, state))
            continue

        try:
            file_info = get_commons_file_info(image_filename)
        except Exception as e:
            print(f"  ERROR fetching file info for {image_filename} ({name}): {e}")
            no_image.append((name, state))
            continue
        time.sleep(0.2)

        if not file_info:
            no_image.append((name, state))
            continue

        license_key = ascii_lower(file_info["license"])
        if license_key not in ALLOWED_LICENSES:
            needs_manual_review.append((name, state, file_info["url"], file_info["license"], file_info["credit"]))
            continue

        ext = os.path.splitext(urllib.parse.urlparse(file_info["url"]).path)[1].lower() or ".jpg"
        slug = slugify(name)
        dest = os.path.join(PHOTOS_DIR, f"{slug}{ext}")
        try:
            img = fetch_binary(file_info["url"])
            with open(dest, "wb") as f:
                f.write(img)
        except Exception as e:
            print(f"  FAILED to download {name} ({state}): {e}")
            needs_manual_review.append((name, state, file_info["url"], file_info["license"], file_info["credit"]))
            continue

        print(f"  {name} ({state}) [{source}] -> {image_filename}  [{file_info['license']}, credit: {file_info['credit']}]")
        new_entries.append((name, party, ext))

    print(f"\nTotal governors: {len(governors)}")
    print(f"Already had photos: {len(already_had)}")
    print(f"Downloaded: {len(new_entries)}")
    print(f"No Wikidata match: {len(no_match)}")
    for n, s in no_match:
        print(f"  - {s}: {n}")
    print(f"No usable image on Wikidata: {len(no_image)}")
    for n, s in no_image:
        print(f"  - {s}: {n}")
    print(f"Needs manual review (license not auto-approved): {len(needs_manual_review)}")
    for n, s, url, lic, credit in needs_manual_review:
        print(f"  - {s}: {n} | license: {lic} | credit: {credit} | {url}")

    if new_entries:
        dems = sorted([n for n, p, _ in new_entries if p == "D"], key=lambda n: n.split()[-1])
        reps = sorted([n for n, p, _ in new_entries if p == "R"], key=lambda n: n.split()[-1])
        others = sorted([n for n, p, _ in new_entries if p not in ("D", "R")], key=lambda n: n.split()[-1])
        ext_by_name = {n: ext for n, _, ext in new_entries}

        lines = ['  // ── Governors ─────────────────────────────────────────────────────────────']
        if dems:
            lines.append("  // Democrats")
            for n in dems:
                lines.append(f'  "{n}": "/candidates/{slugify(n)}{ext_by_name[n]}",')
        if reps:
            lines.append("  // Republicans")
            for n in reps:
                lines.append(f'  "{n}": "/candidates/{slugify(n)}{ext_by_name[n]}",')
        if others:
            lines.append("  // Other")
            for n in others:
                lines.append(f'  "{n}": "/candidates/{slugify(n)}{ext_by_name[n]}",')
        block = "\n".join(lines) + "\n"

        src = open(CANDIDATE_PHOTOS, encoding="utf-8").read()
        assert src.rstrip().endswith("};")
        src = src.rstrip()[: -len("};")] + block + "};\n"
        with open(CANDIDATE_PHOTOS, "w", encoding="utf-8") as f:
            f.write(src)
        print(f"\nAppended {len(new_entries)} entries to lib/candidatePhotos.ts")


if __name__ == "__main__":
    main()
