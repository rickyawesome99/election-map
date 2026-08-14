#!/usr/bin/env python3
"""
Scrapes county-level 2024 U.S. House results from Wikipedia for the states
OpenElections has no usable 2024 data for at all (see
scripts/fetch-openelections-house-2024.py's docstring for the states that DO have
OpenElections coverage). Reuses the same wikitext table parser this project's
Senate/Governor scrapers already built up (scripts/scrape-county-governor-2022.py
has the most complete version - all its bugfixes inherited verbatim: colspan-based
candidate-block classification, 3-tier NY-style fusion-voting headers, `{{election
table}}`-template-opened tables, bold/quoted-nickname stripping, single-cell caption
row dropping, `!`-vs-`||` cell separators).

Structurally different from Senate/Governor's one-page-per-state model, since House
isn't a single statewide race:
- **Multi-district states** (most of them) have ONE combined page per state,
  "{year} United States House of Representatives elections in {State}", with a
  "==District N==" section per district, each with its own nested "====By county===="
  subsection - `split_districts()` slices the page into per-district wikitext before
  handing each slice to the same `extract_table`/`parse_race` pair Governor already
  uses (they operate on whatever wikitext string they're given, no state/govt-specific
  assumptions inside them).
- **At-large states** (DE, ND, VT in this batch - single district, no district split
  needed) use the same singular-titled page pattern as Senate/Governor,
  "{year} United States House of Representatives election in {State}", with one
  top-level "By county" table for the whole page.

Each district's candidates are matched against its own row in
data-entry/house_past_results.csv (keyed by (state, district number) - a district's
number comes from the "==District N==" heading text, or 1 for at-large pages).
Votes are SUMMED PER COUNTY ACROSS EVERY DISTRICT that touches it, per this project's
established House convention (see fetch-openelections-house-2024.py) - a county
spanning multiple districts gets one combined row, not one row per district.

Writes/merges into data-entry/county_house_results_2024.csv (same columns as the
OpenElections House pipeline: state,county_name,county_id,dem_2024,gop_2024,oth_2024,
total_2024). Validates each state's summed county totals against
data-entry/house_del_history.csv's state-level aggregate (dem_votes/rep_votes/
total_votes), same validation source the OpenElections script uses.

Run from project root: python3 scripts/scrape-county-house-2024.py [STATE_ABBR ...]
"""
import csv, os, re, sys, time, unicodedata, urllib.request
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
HOUSE_PAST_CSV = os.path.join(ROOT, "data-entry/house_past_results.csv")
HOUSE_DEL_CSV = os.path.join(ROOT, "data-entry/house_del_history.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_house_results_2024.csv")

YEAR = 2024

# AK excluded (no counties, established gap throughout this whole project).
MULTI_DISTRICT_STATES = {
    "AL": "Alabama", "AR": "Arkansas", "CA": "California", "FL": "Florida",
    "HI": "Hawaii", "IA": "Iowa", "ID": "Idaho", "IL": "Illinois", "KS": "Kansas",
    "LA": "Louisiana", "MA": "Massachusetts", "MD": "Maryland", "ME": "Maine",
    "MN": "Minnesota", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NC": "North Carolina", "OH": "Ohio", "OK": "Oklahoma", "VA": "Virginia",
    "WA": "Washington", "WI": "Wisconsin",
}
AT_LARGE_STATES = {"DE": "Delaware", "ND": "North Dakota", "VT": "Vermont"}
STATE_NAMES = {**MULTI_DISTRICT_STATES, **AT_LARGE_STATES}

# VA/MO/MD independent-city name collisions - same overrides already used by this
# project's Senate/Governor Wikipedia scrapers.
INDEPENDENT_CITY_OVERRIDES = {
    ("VA", "Fairfax City"): "51600", ("VA", "Fairfax County"): "51059",
    ("VA", "Franklin City"): "51620", ("VA", "Franklin County"): "51067",
    ("VA", "Richmond City"): "51760", ("VA", "Richmond County"): "51159",
    ("VA", "Roanoke City"): "51770", ("VA", "Roanoke County"): "51161",
    ("MD", "Baltimore"): "24005", ("MD", "Baltimore City"): "24510",
}

# CA (26/52 districts have a "By county" table) and WI (1/8) only have PARTIAL
# district coverage on Wikipedia - a county whose OTHER touching district(s) lack a
# table gets summed short, not wrong per se, just incomplete (e.g. CA's Los Angeles
# County alone touches ~13 different districts; missing even one of them visibly
# undercounts the whole county). Caught by the same per-county sanity-ratio check
# (this year's House total vs. that county's 2024 presidential total) used to catch
# IN's Hendricks/Monroe/Cass/Sullivan file-quality bugs earlier this project - but
# this is a different category (expected partial-coverage math, not a source bug) so
# it's listed here rather than reusing fetch-openelections-house-2024.py's
# COUNTY_EXCLUSIONS naming. Every county below the ~0.85 ratio threshold in these two
# states was excluded; single/double-district rural counties whose only district(s)
# already succeeded are NOT in this list and stay published normally. WI's Winnebago
# and, later, all of CA (added to fill-county-house-2024-medsl.py's TARGET_STATES,
# which wholesale-replaces every CA county including the 48 this script covers, not
# just these 10) were resolved via MEDSL - this list is now historical (documents WHY
# those specific counties were excluded here) rather than a live gap list. Don't
# re-run this script for CA alone without re-running the MEDSL fill afterward, same
# WI-regression caveat documented in the county-scrape memory.
PARTIAL_COVERAGE_EXCLUSIONS = {
    ("CA", "Alameda"), ("CA", "Los Angeles"), ("CA", "Orange"), ("CA", "Riverside"),
    ("CA", "Sacramento"), ("CA", "San Bernardino"), ("CA", "San Diego"),
    ("CA", "San Francisco"), ("CA", "San Mateo"), ("CA", "Santa Clara"),
    ("WI", "Winnebago"),
}

TEMPLATE_RE = re.compile(r"\{\{[^{}]*\}\}")
ATTR_RE = re.compile(r'^(?:[a-zA-Z-]+\s*=\s*(?:"[^"]*"|\S+)\s*)+\|')
REF_RE = re.compile(r"<ref[^>]*/?>(?:.*?</ref>)?", re.S)
BOLD_RE = re.compile(r"'''(.*?)'''")
DISTRICT_HEADING_RE = re.compile(r"^==\s*District\s+(\d+)\s*==\s*$", re.M | re.I)


def fetch_raw(title: str) -> str:
    url = f"https://en.wikipedia.org/w/index.php?title={title.replace(' ', '_')}&action=raw"
    req = urllib.request.Request(url, headers={"User-Agent": "election-map-data-pipeline/1.0"})
    with urllib.request.urlopen(req) as r:
        return r.read().decode("utf-8")


def fetch(title: str) -> str:
    text = fetch_raw(title)
    m = re.match(r"#REDIRECT\s*\[\[([^\]|]+)", text, re.I)
    if m:
        text = fetch_raw(m.group(1).strip())
    return text


def split_districts(wikitext: str) -> dict:
    """{district_number: wikitext_slice} - one entry per "==District N==" section."""
    matches = list(DISTRICT_HEADING_RE.finditer(wikitext))
    sections = {}
    for i, m in enumerate(matches):
        dnum = int(m.group(1))
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(wikitext)
        sections[dnum] = wikitext[start:end]
    return sections


def clean_cell(part: str) -> str:
    part = TEMPLATE_RE.sub("", part).strip()
    part = part.lstrip("|").strip()
    m = ATTR_RE.match(part)
    if m:
        part = part[m.end():].strip()
    part = REF_RE.sub("", part).strip()
    return part


def line_sep(body: str) -> str:
    return "!!" if "!!" in body else "||"


def split_row_cells(row_lines: list) -> list:
    cells = []
    for line in row_lines:
        body = line[1:]
        for part in body.split(line_sep(body)):
            cells.append(clean_cell(part))
    return cells


def cell_colspan(raw_line: str) -> int:
    m = re.search(r'colspan\s*=\s*"?(\d+)"?', raw_line, re.I)
    return int(m.group(1)) if m else 1


def link_text(cell: str) -> str:
    m = re.search(r"\[\[[^|\]]*\|([^\]]+)\]\]", cell)
    if m:
        return m.group(1).strip()
    m = re.search(r"\[\[([^\]]+)\]\]", cell)
    if m:
        return m.group(1).strip()
    m = BOLD_RE.search(cell)
    if m:
        return m.group(1).strip()
    return cell.strip()


def to_int(cell: str):
    text = cell.strip().strip("'").strip()
    text = text.replace(",", "").replace("−", "-")
    if text in ("", "-", "–"):
        return None
    try:
        return int(float(text.rstrip("%")))
    except ValueError:
        return None


def extract_table(wikitext: str) -> list:
    matches = list(re.finditer(r"^=+\s*(?:Results\s+)?By county\b.*=+\s*$", wikitext, re.I | re.M))
    if not matches:
        raise ValueError("no 'By county' heading found")
    m = matches[-1]
    rest = wikitext[m.end():]
    reg_m = re.search(r"^=+\s*Regular election\s*=+\s*$", rest, re.I | re.M)
    if reg_m:
        rest = rest[reg_m.end():]

    tmpl_m = re.search(r"\{\{\s*election table[^}]*\}\}", rest, re.I)
    lit_idx = rest.find("{|")
    if tmpl_m and (lit_idx == -1 or tmpl_m.start() < lit_idx):
        body_start = tmpl_m.end()
        end = rest.index("|}", body_start)
        return rest[body_start:end].splitlines()

    start = lit_idx
    if start == -1:
        raise ValueError("no '{|' table found after 'By county' heading")
    depth, i = 0, start
    while i < len(rest):
        if rest[i:i + 2] == "{|":
            depth += 1
            i += 2
            continue
        if rest[i:i + 2] == "|}":
            depth -= 1
            i += 2
            if depth == 0:
                break
            continue
        i += 1
    return rest[start:i].splitlines()


def parse_race(wikitext: str):
    """Returns (candidates, county_rows) for one district's (or at-large state's)
    "By county" table. Race-agnostic - identical to Governor's parse_state() minus the
    state-abbr-specific pieces (VA/MO/MD overrides and running-mate stripping live in
    the caller/FIPS-map layer instead, since House candidates don't have running mates)."""
    lines = extract_table(wikitext)
    rows, cur = [], []
    for line in lines:
        s = line.strip()
        if s.startswith("|-"):
            if cur:
                rows.append(cur)
            cur = []
        elif s.startswith("|+"):
            continue
        elif s.startswith("!") or s.startswith("|"):
            cur.append(s)
    if cur:
        rows.append(cur)

    while len(rows) > 1 and len(split_row_cells(rows[0])) == 1:
        rows.pop(0)

    blocks = []
    for line in rows[0]:
        body = line[1:]
        for part in body.split(line_sep(body)):
            colspan = cell_colspan(part)
            content = clean_cell(part)
            if colspan >= 2:
                if re.match(r"^Margin$", content, re.I):
                    blocks.append({"kind": "margin"})
                    continue
                party = None
                if re.search(r"Democratic", content, re.I):
                    party = "D"
                elif re.search(r"Republican", content, re.I):
                    party = "R"
                name = re.sub(r"<br\s*/?>.*$", "", content, flags=re.S).strip()
                name = re.sub(r"\[\[[^|\]]*\|([^\]]+)\]\]", r"\1", name)
                name = re.sub(r"\[\[([^\]]+)\]\]", r"\1", name)
                name = re.sub(r"^'+|'+$", "", name).strip()
                blocks.append({"kind": "candidate", "name": name, "party": party, "span": colspan})
            elif not blocks:
                blocks.append({"kind": "county"})
            elif re.match(r"^Total", content, re.I):
                blocks.append({"kind": "total"})
            else:
                blocks.append({"kind": "other"})

    candidates = [b for b in blocks if b["kind"] == "candidate"]

    subheader_idx = None
    for i in range(1, min(len(rows), 4)):
        cells = split_row_cells(rows[i])
        if not cells:
            continue
        trimmed = cells[1:] if cells[0].strip().lower() == "county" else cells
        if trimmed and all(re.match(r"^(#|%|Votes?)$", c.strip(), re.I) for c in trimmed):
            subheader_idx = i
            break

    has_subheader = subheader_idx is not None
    if has_subheader:
        first = split_row_cells(rows[subheader_idx])
        sub_idx = 1 if first[0].strip().lower() == "county" else 0
        expected = sum(b.get("span", 2) for b in blocks if b["kind"] in ("candidate", "margin"))
        if len(first) - sub_idx == expected + 1 and sub_idx + 1 < len(first) and first[sub_idx] == first[sub_idx + 1]:
            first = first[:sub_idx] + first[sub_idx + 1:]
        for b in blocks:
            if b["kind"] in ("candidate", "margin"):
                span = b.get("span", 2)
                label_idx = sub_idx + span - 2
                label = first[label_idx].strip() if label_idx < len(first) else "#"
                b["vote_first"] = not label.startswith("%")
                sub_idx += span

    data_rows = rows[subheader_idx + 1:] if has_subheader else rows[1:]
    out = []
    for r in data_rows:
        if any("sortbottom" in line.lower() for line in r):
            continue
        cells = split_row_cells(r)
        if not cells or not cells[0]:
            continue
        county = link_text(cells[0])
        # Split-county rows are suffixed "(part)" (CA) - strip before county matching;
        # a county appearing more than once (split across multiple districts) still
        # gets summed correctly since by_county accumulates across every district.
        county = re.sub(r"\s*\(part\)\s*$", "", county, flags=re.I).strip()
        if county.lower() in ("total", "totals") or not re.search(r"[A-Za-z]", county):
            continue

        rest = cells[1:]
        idx = 0
        votes, total = [], None
        for b in blocks:
            if b["kind"] == "county":
                continue
            elif b["kind"] == "candidate":
                span = b.get("span", 2)
                if idx >= len(rest):
                    break
                offset = (span - 2) + (0 if b.get("vote_first", True) else 1)
                votes.append(to_int(rest[idx + offset]))
                idx += span
            elif b["kind"] == "margin":
                idx += b.get("span", 2)
            elif b["kind"] == "total":
                if idx < len(rest):
                    total = to_int(rest[idx])
                idx += 1
            elif b["kind"] == "other":
                idx += 1
        if len(votes) != len(candidates):
            continue
        if total is None:
            total = sum(v or 0 for v in votes)
        out.append({"county": county, "votes": votes, "total": total})
    return candidates, out


def load_pres_fips():
    m = {}
    dupe_names = set()
    with open(PRES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            state_map = m.setdefault(row["state"], {})
            if row["county_name"] in state_map:
                dupe_names.add((row["state"], row["county_name"]))
            state_map[row["county_name"]] = row["county_id"]
    for state, name in dupe_names:
        del m[state][name]
    for (state, name), fips in INDEPENDENT_CITY_OVERRIDES.items():
        m.setdefault(state, {})[name] = fips
    return m


def load_house_2024():
    """{(state_abbr, district_number:int): row} for 2024, plus state_abbr->state_name."""
    m, names = {}, {}
    with open(HOUSE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            names[row["state_abbr"]] = row["state_name"]
            if row["year"] != str(YEAR):
                continue
            dnum = int(row["district_name"].split("-")[1])
            m[(row["state_abbr"], dnum)] = row
    return m, names


def load_house_del_history():
    m = {}
    with open(HOUSE_DEL_CSV, newline="") as f:
        for row in csv.DictReader(f):
            m[(row["state_name"], int(row["year"]))] = row
    return m


def norm_name(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)\s*", " ", name)  # "(I)" etc - see fetch-openelections
    # -house-2024.py's docstring for why this must be a space, not "", to avoid gluing
    # a mid-name nickname's surrounding words together.
    return re.sub(r"\s+", " ", name).strip().lower()


def norm_county(name: str) -> str:
    name = name.replace("ʻ", "").replace("’", "").replace("'", "")
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", name).strip().lower()


def resolve_fips(fips_map: dict, county: str):
    if county in fips_map:
        return fips_map[county]
    target = norm_county(county)
    for name, fips in fips_map.items():
        if norm_county(name) == target:
            return fips
    target_nospace = target.replace(" ", "")
    for name, fips in fips_map.items():
        if norm_county(name).replace(" ", "") == target_nospace:
            return fips
    return None


def last_name(full_name: str) -> str:
    n = norm_name(full_name)
    return n.split()[-1] if n.strip() else ""


TRUE_PARTY_RE = re.compile(r"\((D|R)\)\s*$")


def true_party_bucket(raw_name: str, default_bucket: str) -> str:
    """Top-two/jungle-primary states (CA, WA) can put two same-party candidates in a
    general election - house_past_results.csv still files them under dem_candidate/
    rep_candidate (needs one of each column), but marks the one sitting in the "wrong"
    column with a trailing "(D)"/"(R)" noting their REAL party (e.g. WA-04 2024:
    dem_candidate="Jerrod Sessler (R)", rep_candidate="Dan Newhouse" - both Republicans).
    Confirmed against data-entry/house_del_history.csv's state-level dem/rep totals,
    which already reflect true party (WA's 8D/2R real delegation) - a naive column-
    position bucketing would have shown 9D/1R for WA, an actually-impossible result."""
    m = TRUE_PARTY_RE.search(raw_name.strip())
    if m:
        return "dem" if m.group(1) == "D" else "gop"
    return default_bucket


def bucket_candidates(candidates: list, past: dict):
    """Returns a list of "dem"/"gop"/"oth" parallel to `candidates`, matched against
    one district's house_past_results.csv row - same priority order as the
    OpenElections House script: exact name, then party-label (only for a slot the
    other side didn't already claim by exact name), then last name (only when the two
    major candidates' last names actually differ, else the same-surname collision this
    project has hit before, e.g. SD-01 2024, would steal votes across candidates)."""
    dem_col_bucket = true_party_bucket(past["dem_candidate"], "dem")
    rep_col_bucket = true_party_bucket(past["rep_candidate"], "gop")
    dem_name, rep_name = norm_name(past["dem_candidate"]), norm_name(past["rep_candidate"])
    dem_last, rep_last = last_name(past["dem_candidate"]), last_name(past["rep_candidate"])
    dem_matched = bool(dem_name) and any(norm_name(c["name"]) == dem_name for c in candidates)
    rep_matched = bool(rep_name) and any(norm_name(c["name"]) == rep_name for c in candidates)
    distinct_last = bool(dem_last) and bool(rep_last) and dem_last != rep_last

    out = []
    for c in candidates:
        n = norm_name(c["name"])
        if dem_name and n == dem_name:
            out.append(dem_col_bucket)
        elif rep_name and n == rep_name:
            out.append(rep_col_bucket)
        elif not dem_matched and c["party"] == "D":
            out.append("dem")
        elif not rep_matched and c["party"] == "R":
            out.append("gop")
        elif distinct_last and last_name(c["name"]) == dem_last:
            out.append(dem_col_bucket)
        elif distinct_last and last_name(c["name"]) == rep_last:
            out.append(rep_col_bucket)
        else:
            out.append("oth")
    return out


def process_race(abbr, dnum, wikitext, house_2024, fips_map, by_county):
    """Parses one district's (or at-large state's) By-county table and folds its
    per-county votes into `by_county` (shared across every district in the state)."""
    past = house_2024.get((abbr, dnum))
    if past is None:
        return "no house_past_results.csv row"
    candidates, county_rows = parse_race(wikitext)
    bucket_of = bucket_candidates(candidates, past)
    for row in county_rows:
        fips = resolve_fips(fips_map, row["county"])
        dem = gop = oth = 0
        for bucket, v in zip(bucket_of, row["votes"]):
            v = v or 0
            if bucket == "dem":
                dem += v
            elif bucket == "gop":
                gop += v
            else:
                oth += v
        total = row["total"] if row["total"] is not None else dem + gop + oth
        by_county[row["county"]]["dem"] += dem
        by_county[row["county"]]["gop"] += gop
        by_county[row["county"]]["oth"] += oth
        by_county[row["county"]]["total"] += total
        by_county[row["county"]]["fips"] = fips or by_county[row["county"]]["fips"]
        by_county[row["county"]]["districts"].add(dnum)
    return None


def main():
    only = set(sys.argv[1:])
    states = {k: v for k, v in STATE_NAMES.items() if not only or k in only}
    pres_fips = load_pres_fips()
    house_2024, state_names = load_house_2024()
    house_del = load_house_del_history()

    out_rows = []
    report = []
    for abbr, state_name in states.items():
        by_county = defaultdict(lambda: {"dem": 0, "gop": 0, "oth": 0, "total": 0, "fips": None, "districts": set()})
        district_status = []

        if abbr in AT_LARGE_STATES:
            try:
                wikitext = fetch(f"{YEAR}_United_States_House_of_Representatives_election_in_{state_name}")
                err = process_race(abbr, 1, wikitext, house_2024, pres_fips.get(abbr, {}), by_county)
                district_status.append(f"D1:{'ok' if not err else err}")
            except Exception as e:
                district_status.append(f"D1:FAILED {e}")
        else:
            try:
                wikitext = fetch(f"{YEAR}_United_States_House_of_Representatives_elections_in_{state_name}")
            except Exception as e:
                report.append((abbr, f"FAILED to fetch state page: {e}"))
                continue
            sections = split_districts(wikitext)
            expected_districts = {d for (s, d) in house_2024 if s == abbr}
            for dnum in sorted(expected_districts):
                if dnum not in sections:
                    district_status.append(f"D{dnum}:no section found")
                    continue
                try:
                    err = process_race(abbr, dnum, sections[dnum], house_2024, pres_fips.get(abbr, {}), by_county)
                    district_status.append(f"D{dnum}:{'ok' if not err else err}")
                except Exception as e:
                    district_status.append(f"D{dnum}:FAILED {e}")

        sum_dem = sum_gop = sum_oth = sum_total = 0
        unmatched_counties = []
        for county, v in by_county.items():
            sum_dem += v["dem"]
            sum_gop += v["gop"]
            sum_oth += v["oth"]
            sum_total += v["total"]
            if not v["fips"]:
                unmatched_counties.append(county)
                continue
            if (abbr, county) in PARTIAL_COVERAGE_EXCLUSIONS:
                continue
            districts = ";".join(str(d) for d in sorted(v["districts"]))
            out_rows.append({
                "state": abbr, "county_name": county, "county_id": v["fips"],
                f"dem_{YEAR}": v["dem"], f"gop_{YEAR}": v["gop"], f"oth_{YEAR}": v["oth"], f"total_{YEAR}": v["total"],
                f"districts_{YEAR}": districts,
            })

        del_row = house_del.get((state_names.get(abbr, state_name), YEAR))
        status = f"{len(by_county)} counties, dem={sum_dem} gop={sum_gop} oth={sum_oth} total={sum_total}"
        if del_row:
            expected_dem, expected_gop, expected_total = int(del_row["dem_votes"]), int(del_row["rep_votes"]), int(del_row["total_votes"])
            ddiff, gdiff, tdiff = sum_dem - expected_dem, sum_gop - expected_gop, sum_total - expected_total
            status += f" | dem_diff={ddiff} gop_diff={gdiff} total_diff={tdiff}"
            if (abs(ddiff) > max(500, expected_dem * 0.01) or abs(gdiff) > max(500, expected_gop * 0.01)
                    or abs(tdiff) > max(500, expected_total * 0.01)):
                status = "MISMATCH " + status
        if unmatched_counties:
            status += f" | unmatched counties: {unmatched_counties}"
        status += f" | districts: {', '.join(district_status)}"
        report.append((abbr, status))
        time.sleep(0.3)

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}", f"districts_{YEAR}"]
    existing_rows = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    handled_states = set(states.keys())
    kept = [r for r in existing_rows if r["state"] not in handled_states]

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + out_rows:
            w.writerow(r)

    print(f"Wrote {len(out_rows)} rows for {len(states)} states -> {OUT_CSV} (file now has {len(kept) + len(out_rows)} total)\n")
    for abbr, status in report:
        print(f"{abbr}: {status}")


if __name__ == "__main__":
    main()
