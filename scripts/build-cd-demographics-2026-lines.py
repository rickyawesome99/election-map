#!/usr/bin/env python3
"""
Re-aggregates ACS 2020-24 5-year TRACT data onto the 2026 congressional lines for the states
that redrew after the 119th Congress convened, and writes data-entry/demographics_cd_2026_lines.csv.

Why: the ACS publishes congressional districts on 119th Congress lines only, so
fetch-acs-demographics.py measures AL/CA/FL/LA/MO/NC/OH/TN/TX/UT on maps those states no longer
use. generate-demographics-data.py overlays this file on those states' district rows.

Method: every census tract is assigned to a district by its Census internal point (2024
Gazetteer), in two passes. Districts the redraw left alone (identical 2024 presidential vote
totals on the old and the new map) claim their tracts first, from the Census's own 119th
Congress cartographic lines - the site's drawing file is simplified to a few dozen vertices per
district, which in a dense city moves tens of thousands of people across a border. The remaining
tracts are placed in the redrawn districts with the site's 2026 boundary file
(public/congressional-districts-2026.json), the only geometry there is for the new plans; a point
in no polygon goes to the nearest redrawn district. Counts are summed and shares recomputed;
median household income is interpolated from the pooled B19001 brackets, the way the Census
derives a median for a combined geography. Definitions match the Data Profile fields the rest
of the pipeline uses:
  college_pct   B15003 bachelor's-or-higher / population 25+        (= DP02_0068PE)
  white/black/asian_pct   B03002 not-Hispanic alone categories      (= DP05_0096/97/99PE)
  hispanic_pct  B03002_012                                          (= DP05_0090PE)

Unchanged districts are written with `lines_unchanged = yes`; generate-demographics-data.py keeps
the published ACS figure for those (it is exact) and uses this file only for the redrawn ones.
Their tract sums are the method's error bar, printed as the "check" block: against the published
figure, shares differ by 0.1-0.2 pts on average (max 1.3) and median income by ~$400 when the
lines are precise. With the site's simplified drawing file instead - the only option for a
redrawn district - the same check gave 0.2-0.3 pts on average, max 2.3. `pop_dev_pct` (a
district's population against its state's mean) flags where the drawing file is loosest:
equal-population districts drift a few percent apart by 2020-24 growth alone, so +/-10%
(CA-48/CA-50) means roughly a tenth of the district's people sit on the wrong side of a
simplified border.

Requires CENSUS_API_KEY (env or .env.local) and shapely. Raw tract pulls and the gazetteer are
cached under the OS temp dir, so a rerun makes no API calls.
Run from project root, before generate-demographics-data.py:
  python3 scripts/build-cd-demographics-2026-lines.py
"""
import csv, io, json, os, re, subprocess, tempfile, time, urllib.parse, urllib.request, zipfile

try:
    from shapely.geometry import shape, Point
    from shapely.strtree import STRtree
    from shapely.validation import make_valid
except ImportError:
    raise SystemExit("needs shapely: pip install shapely")

ROOT = os.path.join(os.path.dirname(__file__), "..")
DST = os.path.join(ROOT, "data-entry/demographics_cd_2026_lines.csv")
ACS_CD_SRC = os.path.join(ROOT, "data-entry/demographics.csv")
FORECAST_SRC = os.path.join(ROOT, "data/forecastData.ts")
PRES_OLD = os.path.join(ROOT, "data-entry/pres_by_boundary_vintage.csv")
PRES_NEW = os.path.join(ROOT, "data-entry/house_pres_2026_dist.csv")
BOUNDARIES = os.path.join(ROOT, "public/congressional-districts-2026.json")
CACHE = os.path.join(tempfile.gettempdir(), "election-map-acs-tracts")
VINTAGE = 2024
BASE = f"https://api.census.gov/data/{VINTAGE}/acs/acs5"
GAZETTEER = f"https://www2.census.gov/geo/docs/maps-data/data/gazetteer/{VINTAGE}_Gazetteer/{VINTAGE}_Gaz_tracts_national.zip"
# The Census's own 119th Congress lines (1:500k cartographic) - far finer than the site's drawing
# file, and exact for every district the redraw left alone.
CD119 = "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip"
ELECTION_YEAR = 2026

ABBR_BY_FIPS = dict(re.findall(r'"(\d{2})": \{ abbr: "([A-Z]{2})"', open(os.path.join(ROOT, "lib/fips.ts")).read()))

# B19001 household-income brackets: (variable suffix, lower bound, upper bound).
INCOME_BRACKETS = [
    ("002", 0, 10000), ("003", 10000, 15000), ("004", 15000, 20000), ("005", 20000, 25000),
    ("006", 25000, 30000), ("007", 30000, 35000), ("008", 35000, 40000), ("009", 40000, 45000),
    ("010", 45000, 50000), ("011", 50000, 60000), ("012", 60000, 75000), ("013", 75000, 100000),
    ("014", 100000, 125000), ("015", 125000, 150000), ("016", 150000, 200000), ("017", 200000, None),
]
COUNT_VARS = {
    "population": ["B01003_001E"],
    "race_total": ["B03002_001E"],
    "white": ["B03002_003E"],
    "black": ["B03002_004E"],
    "asian": ["B03002_006E"],
    "hispanic": ["B03002_012E"],
    "adults25": ["B15003_001E"],
    "college": ["B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E"],
    "households": ["B19001_001E"],
}
ALL_VARS = sorted({v for vs in COUNT_VARS.values() for v in vs} | {f"B19001_{s}E" for s, _, _ in INCOME_BRACKETS})


def load_env_key():
    key = os.environ.get("CENSUS_API_KEY")
    if key:
        return key
    env_path = os.path.join(ROOT, ".env.local")
    if os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith("CENSUS_API_KEY="):
                return line.strip().split("=", 1)[1]
    raise SystemExit("CENSUS_API_KEY not set (env var or .env.local)")


def redrawn_states():
    """State FIPS codes with a houseDistrictInfo entry for the election year - the same test
    generate-demographics-data.py uses, so the two never disagree about which states these are."""
    src = open(FORECAST_SRC).read()
    info = json.loads(re.search(r"export const houseDistrictInfo[^=]*= (\{.*?\n\});", src, re.S).group(1))
    return sorted({rid[:2] for rid, entries in info.items() for e in entries if e.get("year") == ELECTION_YEAR})


def fetch_tracts(state_fips, key):
    """All tracts of one state; cached as JSON."""
    path = os.path.join(CACHE, f"tracts_{VINTAGE}_{state_fips}.json")
    if os.path.exists(path):
        return json.load(open(path))
    params = {"get": ",".join(ALL_VARS), "for": "tract:*", "in": f"state:{state_fips}", "key": key}
    url = f"{BASE}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=180) as resp:
                data = json.load(resp)
            break
        except (OSError, json.JSONDecodeError) as e:
            if attempt == 3:
                raise SystemExit(f"Census API failed for state {state_fips}: {e}")
            time.sleep(2 + 3 * attempt)
    json.dump(data, open(path, "w"))
    return data


def load_gazetteer():
    """tract GEOID -> (lon, lat) internal point."""
    path = os.path.join(CACHE, os.path.basename(GAZETTEER))
    if not os.path.exists(path):
        # curl, not urllib: www2.census.gov rejects Python's default client.
        subprocess.run(["curl", "-sSL", "--fail", "-o", path, GAZETTEER], check=True)
    points = {}
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.endswith(".txt"))
        reader = csv.reader(io.TextIOWrapper(z.open(name), encoding="utf-8"), delimiter="\t")
        header = [h.strip() for h in next(reader)]
        gi, lat_i, lon_i = header.index("GEOID"), header.index("INTPTLAT"), header.index("INTPTLONG")
        for row in reader:
            points[row[gi].strip()] = (float(row[lon_i]), float(row[lat_i]))
    return points


def load_cd119():
    """The Census cartographic 119th Congress file as GeoJSON (downloaded and converted once)."""
    out = os.path.join(CACHE, "cd119.geojson")
    if not os.path.exists(out):
        zpath = os.path.join(CACHE, os.path.basename(CD119))
        if not os.path.exists(zpath):
            subprocess.run(["curl", "-sSL", "--fail", "-o", zpath, CD119], check=True)
        folder = os.path.join(CACHE, "cd119")
        with zipfile.ZipFile(zpath) as z:
            z.extractall(folder)
        shp = next(os.path.join(folder, n) for n in os.listdir(folder) if n.endswith(".shp"))
        subprocess.run(["mapshaper", shp, "-o", out, "format=geojson", "force"], check=True, capture_output=True)
    return out


def load_districts(states, path=None):
    """state FIPS -> [(race id, geometry)]. Default source is the site's own 2026 boundary file
    (TopoJSON or GeoJSON; converted through mapshaper when it is TopoJSON)."""
    raw = json.load(open(path or BOUNDARIES))
    if raw.get("type") == "Topology":
        tmp = os.path.join(CACHE, "cd2026.geojson")
        subprocess.run(["mapshaper", BOUNDARIES, "-o", tmp, "format=geojson", "force"], check=True, capture_output=True)
        raw = json.load(open(tmp))
    out = {}
    for f in raw["features"]:
        geoid = str(f["properties"].get("GEOID") or f.get("id"))
        st = geoid[:2]
        if st not in states or not f.get("geometry"):
            continue
        code = geoid[2:]
        out.setdefault(st, []).append((st + ("01" if code == "00" else code), make_valid(shape(f["geometry"]))))
    return out


def assign(points, districts, fallback_nearest=True):
    """tract GEOID -> race id, by containing polygon; with fallback_nearest, a point in no polygon
    goes to the nearest one, otherwise it is left unassigned."""
    ids = [d[0] for d in districts]
    geoms = [d[1] for d in districts]
    out, nearest = {}, 0
    if not geoms:
        return out, nearest
    tree = STRtree(geoms)
    for geoid, (lon, lat) in points.items():
        p = Point(lon, lat)
        hit = next((i for i in tree.query(p) if geoms[i].contains(p)), None)
        if hit is None:
            if not fallback_nearest:
                continue
            hit = min(range(len(geoms)), key=lambda i: geoms[i].distance(p))
            nearest += 1
        out[geoid] = ids[hit]
    return out, nearest


def median_from_brackets(counts):
    """Linear interpolation inside the bracket holding the 50th percentile household."""
    total = sum(counts)
    if total <= 0:
        return None
    half, run = total / 2, 0
    for n, (_, lo, hi) in zip(counts, INCOME_BRACKETS):
        if run + n >= half and n > 0:
            if hi is None:
                return lo
            return lo + (half - run) / n * (hi - lo)
        run += n
    return None


def main():
    os.makedirs(CACHE, exist_ok=True)
    key = load_env_key()
    states = redrawn_states()
    print("redrawn for", ELECTION_YEAR, ":", " ".join(ABBR_BY_FIPS[s] for s in states))
    gaz = load_gazetteer()
    districts = load_districts(set(states))
    precise = load_districts(set(states), load_cd119())

    # Districts the redraw left alone: identical 2024 presidential totals on the old and new map.
    old_tot = {r["district_id"].zfill(4): int(r["total_votes"]) for r in csv.DictReader(open(PRES_OLD)) if r["boundary_year"] == "2024" and r["pres_year"] == "2024"}
    new_tot = {r["district_id"].zfill(4): int(r["pres24_total"]) for r in csv.DictReader(open(PRES_NEW))}
    unchanged = {k for k in new_tot if k[:2] in states and k in old_tot and abs(old_tot[k] - new_tot[k]) <= 0.001 * old_tot[k]}

    sums = {}  # race id -> {count name: value, "brackets": [...]}
    for st in states:
        data = fetch_tracts(st, key)
        header, rows = data[0], data[1:]
        col = {h: i for i, h in enumerate(header)}
        pts = {}
        for r in rows:
            geoid = r[col["state"]] + r[col["county"]] + r[col["tract"]]
            if geoid in gaz:
                pts[geoid] = gaz[geoid]
        placed, _ = assign(pts, [d for d in precise[st] if d[0] in unchanged], fallback_nearest=False)
        rest = {g: p for g, p in pts.items() if g not in placed}
        redrawn = [d for d in districts[st] if d[0] not in unchanged]
        placed_rest, nearest = assign(rest, redrawn or districts[st])
        placed.update(placed_rest)
        missing_pop = 0
        for r in rows:
            geoid = r[col["state"]] + r[col["county"]] + r[col["tract"]]
            val = lambda v: max(0.0, float(r[col[v]] or 0))  # negative = ACS "not available" sentinel
            if geoid not in placed:
                missing_pop += val("B01003_001E")
                continue
            acc = sums.setdefault(placed[geoid], {k: 0.0 for k in COUNT_VARS} | {"brackets": [0.0] * len(INCOME_BRACKETS), "tracts": 0})
            for name, vs in COUNT_VARS.items():
                acc[name] += sum(val(v) for v in vs)
            for i, (s, _, _) in enumerate(INCOME_BRACKETS):
                acc["brackets"][i] += val(f"B19001_{s}E")
            acc["tracts"] += 1
        print(f"  {ABBR_BY_FIPS[st]}: {len(rows)} tracts, {nearest} placed by nearest district, {int(missing_pop)} people in tracts with no internal point")

    # Published ACS figures on 119th lines, and which districts kept their lines (identical 2024
    # presidential totals on the old and the new map) - the method's own error bar.
    published = {}
    for row in csv.DictReader(open(ACS_CD_SRC)):
        if row["level"] == "cd":
            published[row["state_fips"] + ("01" if row["code"] == "00" else row["code"])] = row

    fields = ["population", "college_pct", "white_pct", "black_pct", "hispanic_pct", "asian_pct", "median_household_income"]
    out_rows, errs = [], {f: [] for f in fields[1:]}
    for rid in sorted(sums):
        a = sums[rid]
        pct = lambda num, den: round(100 * a[num] / a[den], 1) if a[den] else ""
        med = median_from_brackets(a["brackets"])
        row = {
            "race_id": rid,
            "district": f"{ABBR_BY_FIPS[rid[:2]]}-{rid[2:]}",
            "tracts": a["tracts"],
            "population": int(round(a["population"])),
            "college_pct": pct("college", "adults25"),
            "white_pct": pct("white", "race_total"),
            "black_pct": pct("black", "race_total"),
            "hispanic_pct": pct("hispanic", "race_total"),
            "asian_pct": pct("asian", "race_total"),
            "median_household_income": int(round(med)) if med is not None else "",
            "lines_unchanged": "yes" if rid in unchanged else "",
        }
        state_pops = [sums[k]["population"] for k in sums if k[:2] == rid[:2]]
        row["pop_dev_pct"] = round(100 * (a["population"] / (sum(state_pops) / len(state_pops)) - 1), 1)
        if rid in unchanged and rid in published:
            for f in fields[1:]:
                if published[rid][f] != "" and row[f] != "":
                    errs[f].append(float(row[f]) - float(published[rid][f]))
        out_rows.append(row)

    with open(DST, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(out_rows[0].keys()))
        w.writeheader()
        w.writerows(out_rows)
    print(f"\nwrote {len(out_rows)} districts to {os.path.relpath(DST, ROOT)}")

    pops = [r["population"] for r in out_rows]
    print(f"district population: min {min(pops):,}  max {max(pops):,}")
    print(f"\ncheck - tract re-aggregation vs the published ACS figure, {len(unchanged)} districts whose lines did not move:")
    for f in fields[1:]:
        e = errs[f]
        if e:
            mae = sum(abs(x) for x in e) / len(e)
            print(f"  {f:26s} mean abs diff {mae:8.2f}   max {max(abs(x) for x in e):8.2f}   bias {sum(e) / len(e):+8.2f}")


if __name__ == "__main__":
    main()
