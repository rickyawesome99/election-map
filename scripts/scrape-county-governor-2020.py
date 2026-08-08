#!/usr/bin/env python3
"""
Scrapes county-level 2020 Governor results from Wikipedia's "By county" tables
(e.g. https://en.wikipedia.org/wiki/2020_Washington_gubernatorial_election)
and cross-validates each state's summed totals against the existing state-level
row in data-entry/governor_past_results.csv.

Writes data-entry/county_governor_results_2020.csv with columns:
state,county_name,county_id,dem_2020,gop_2020,oth_2020,total_2020
(county_name/county_id resolved by name-matching against
data/county_presidential_results_2008_2024.csv, which already has verified FIPS).

Same parser as scripts/scrape-county-governor-2021.py / -2022.py / -2023.py / -2024.py /
-2025.py / scrape-county-senate-2024.py (all their wikitext-format bugfixes inherited,
including 2022's MD running-mate-name stripping, NY 3-tier fusion-voting header
handling, PA duplicate-subheader-cell correction, and MA `{{election table}}`
template-opened-table support) - see those files' docstrings and
memory/project_county_election_scrape.md for the full list of gotchas this parser
already handles.

Run from project root: python3 scripts/scrape-county-governor-2020.py
"""
import csv, os, re, sys, time, unicodedata, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
GOVERNOR_PAST_CSV = os.path.join(ROOT, "data-entry/governor_past_results.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_governor_results_2020.csv")

YEAR = 2020
STATE_NAMES = {
    "DE": "Delaware", "IN": "Indiana", "MO": "Missouri", "MT": "Montana",
    "NC": "North Carolina", "ND": "North Dakota", "NH": "New Hampshire",
    "UT": "Utah", "VT": "Vermont", "WA": "Washington", "WV": "West Virginia",
}

TEMPLATE_RE = re.compile(r"\{\{[^{}]*\}\}")
ATTR_RE = re.compile(r'^(?:[a-zA-Z-]+\s*=\s*(?:"[^"]*"|\S+)\s*)+\|')
REF_RE = re.compile(r"<ref[^>]*/?>(?:.*?</ref>)?", re.S)
BOLD_RE = re.compile(r"'''(.*?)'''")

# VA disambiguates its four county/independent-city name collisions as
# "X County"/"X City" in this page's table (confirmed by inspection) - same
# convention already used by the 2024 Senate scraper's override table.
INDEPENDENT_CITY_OVERRIDES = {
    ("VA", "Fairfax City"): "51600", ("VA", "Fairfax County"): "51059",
    ("VA", "Franklin City"): "51620", ("VA", "Franklin County"): "51067",
    ("VA", "Richmond City"): "51760", ("VA", "Richmond County"): "51159",
    ("VA", "Roanoke City"): "51770", ("VA", "Roanoke County"): "51161",
    ("MO", "St. Louis City"): "29510", ("MO", "St. Louis County"): "29189",
    ("MD", "Baltimore"): "24005", ("MD", "Baltimore City"): "24510",
}


def fetch_raw(title: str) -> str:
    url = f"https://en.wikipedia.org/w/index.php?title={title.replace(' ', '_')}&action=raw"
    req = urllib.request.Request(url, headers={"User-Agent": "election-map-data-pipeline/1.0"})
    with urllib.request.urlopen(req) as r:
        return r.read().decode("utf-8")


def fetch(state_abbr: str) -> str:
    title = f"{YEAR}_{STATE_NAMES[state_abbr]}_gubernatorial_election"
    text = fetch_raw(title)
    m = re.match(r"#REDIRECT\s*\[\[([^\]|]+)", text, re.I)
    if m:
        text = fetch_raw(m.group(1).strip())
    return text


def clean_cell(part: str) -> str:
    part = TEMPLATE_RE.sub("", part).strip()
    part = part.lstrip("|").strip()
    m = ATTR_RE.match(part)
    if m:
        part = part[m.end():].strip()
    part = REF_RE.sub("", part).strip()
    return part


def line_sep(body: str) -> str:
    # A '!'-marked line usually joins its cells with '!!', but some states (e.g.
    # KY 2023) use '||' even on a '!' line - pick whichever separator the line
    # actually contains rather than assuming it from the leading marker.
    return "!!" if "!!" in body else "||"


def split_row_cells(row_lines: list[str]) -> list[str]:
    """Each raw line is one table row's worth of markup starting with '!' or '|'.
    A line may hold a single cell (one-cell-per-line style) or several cells
    joined with '||'/'!!' (compact inline style). Handle both."""
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
    # Wikitext wraps notable values in '' (italic), ''' (bold), or ''''' (bold+italic) -
    # strip.strip("'") removes any run of leading/trailing apostrophes regardless of count.
    text = cell.strip().strip("'").strip()
    text = text.replace(",", "").replace("−", "-")
    if text in ("", "-", "–"):
        return None
    try:
        return int(float(text.rstrip("%")))
    except ValueError:
        return None


def extract_table(wikitext: str) -> list[str]:
    # Some pages have multiple "By county" headings (e.g. one per primary, one for the
    # general). The general election's table is always the last one in the article.
    matches = list(re.finditer(r"^=+\s*(?:Results\s+)?By county\b.*=+\s*$", wikitext, re.I | re.M))
    if not matches:
        raise ValueError("no 'By county' heading found")
    m = matches[-1]
    rest = wikitext[m.end():]
    reg_m = re.search(r"^=+\s*Regular election\s*=+\s*$", rest, re.I | re.M)
    if reg_m:
        rest = rest[reg_m.end():]

    # Some pages (e.g. MA 2022) open the table via a `{{election table}}` template
    # call instead of a literal '{|' - the template stands in for the opening, so
    # there's no '{|' to depth-count; the body just runs to the first literal '|}'.
    tmpl_m = re.search(r"\{\{\s*election table[^}]*\}\}", rest, re.I)
    lit_idx = rest.find("{|")
    if tmpl_m and (lit_idx == -1 or tmpl_m.start() < lit_idx):
        body_start = tmpl_m.end()
        end = rest.index("|}", body_start)
        table = rest[body_start:end]
        return table.splitlines()

    start = lit_idx
    depth = 0
    i = start
    while i < len(rest):
        if rest[i:i+2] == "{|":
            depth += 1
            i += 2
            continue
        if rest[i:i+2] == "|}":
            depth -= 1
            i += 2
            if depth == 0:
                break
            continue
        i += 1
    table = rest[start:i]
    return table.splitlines()


def parse_state(state_abbr: str, wikitext: str):
    lines = extract_table(wikitext)
    rows, cur = [], []
    for line in lines:
        s = line.strip()
        if s.startswith("|-"):
            if cur:
                rows.append(cur)
            cur = []
        elif s.startswith("|+"):
            continue  # table caption, not a cell
        elif s.startswith("!") or s.startswith("|"):
            cur.append(s)
    if cur:
        rows.append(cur)

    while len(rows) > 1 and len(split_row_cells(rows[0])) == 1:
        rows.pop(0)

    blocks = []  # in order: {"kind": "county"|"candidate"|"margin"|"total"|"other", "name", "party"}
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
                name = re.sub(r"^'+|'+$", "", name).strip()  # strip '' / ''' bold-italic wrap
                # Governor tables sometimes label a column "Moore/Miller" (Governor/Lt.
                # Governor ticket) instead of just the gubernatorial candidate's name -
                # drop the running mate so name-matching against governor_past_results.csv's
                # single-name dem_candidate/rep_candidate still works (MD 2022).
                name = re.sub(r"\s*/.*$", "", name).strip()
                blocks.append({"kind": "candidate", "name": name, "party": party, "span": colspan})
            elif not blocks:
                blocks.append({"kind": "county"})
            elif re.match(r"^Total", content, re.I):
                blocks.append({"kind": "total"})
            else:
                blocks.append({"kind": "other"})  # unknown single-column stat; consume but ignore

    candidates = [b for b in blocks if b["kind"] == "candidate"]

    # Find the leaf #/% subheader row-group. Usually it's rows[1] directly, but
    # fusion-voting states (e.g. NY) nest an extra tier of per-party sub-labels
    # (Democratic/WFP/Total) between the candidate-name row and the #/% row - walk
    # forward until every cell in a row-group is just "#" or "%".
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
        # A rare Wikipedia markup glitch (PA 2022) can insert one duplicate leaf
        # cell right after sub_idx, shifting every later #/% pairing by one column -
        # drop it if that's exactly what would make the cell count line up.
        if len(first) - sub_idx == expected + 1 and sub_idx + 1 < len(first) and first[sub_idx] == first[sub_idx + 1]:
            first = first[:sub_idx] + first[sub_idx + 1:]
        for b in blocks:
            if b["kind"] in ("candidate", "margin"):
                span = b.get("span", 2)
                # A compound block (fusion sub-party lines before a combined "Total"
                # column, e.g. NY's Democratic+WFP+Total) spans more than 2 leaf
                # columns - the vote count we want is the LAST #/% pair in its span
                # (the one that already sums every sub-party line), not the first.
                label_idx = sub_idx + span - 2
                label = first[label_idx].strip() if label_idx < len(first) else "#"
                b["vote_first"] = not label.startswith("%")
                sub_idx += span

    data_rows = rows[subheader_idx + 1:] if has_subheader else rows[1:]

    # Cross-check vote_first against a real data row rather than fully trusting the
    # subheader labels - some pages (e.g. IN 2020) have a subheader whose #/% order
    # doesn't actually match its own data (a one-off Wikipedia markup error, not a
    # legitimate alternate layout like WA's globally-reversed-but-self-consistent
    # table). A percent cell always contains a literal '%' regardless of what the
    # subheader claims, so use that as ground truth once a real data row is found.
    for r in data_rows:
        if any("sortbottom" in line.lower() for line in r):
            continue
        cells = split_row_cells(r)
        if not cells or not cells[0]:
            continue
        county = link_text(cells[0])
        if county.lower() in ("total", "totals") or not re.search(r"[A-Za-z]", county):
            continue
        rest = cells[1:]
        idx = 0
        for b in blocks:
            if b["kind"] == "county":
                continue
            elif b["kind"] in ("candidate", "margin"):
                span = b.get("span", 2)
                pair_start = idx + (span - 2)
                if pair_start + 1 < len(rest):
                    a, c = rest[pair_start], rest[pair_start + 1]
                    if "%" in a and "%" not in c:
                        b["vote_first"] = False
                    elif "%" in c and "%" not in a:
                        b["vote_first"] = True
                idx += span
            else:
                idx += 1
        break  # one real data row is enough to establish the column order

    out = []
    for r in data_rows:
        if any("sortbottom" in line.lower() for line in r):
            continue  # totals footer row
        cells = split_row_cells(r)
        if not cells or not cells[0]:
            continue
        county = link_text(cells[0])
        if county.lower() in ("total", "totals") or not re.search(r"[A-Za-z]", county):
            continue

        rest = cells[1:]  # cells[0] already consumed as county (the "county" block)
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


def load_governor_year():
    m = {}
    with open(GOVERNOR_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["year"] == str(YEAR) and row["type"] != "Special":
                m[row["state_abbr"]] = row
    return m


def norm_name(name: str) -> str:
    name = re.sub(r"\s*\([^)]*\)\s*", "", name)  # strip "(I)" etc.
    return name.strip().lower()


def norm_county(name: str) -> str:
    name = name.replace("ʻ", "").replace("’", "").replace("'", "")
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))  # Coös -> Coos
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
    return norm_name(full_name).split()[-1] if full_name.strip() else ""


def main():
    states = sys.argv[1:] or list(STATE_NAMES.keys())
    pres_fips = load_pres_fips()
    governor_year = load_governor_year()

    out_rows = []
    report = []
    for abbr in states:
        try:
            wikitext = fetch(abbr)
            candidates, county_rows = parse_state(abbr, wikitext)
        except Exception as e:
            report.append((abbr, f"FAILED: {e}"))
            continue

        past = governor_year.get(abbr)
        dem_name = norm_name(past["dem_candidate"]) if past else None
        rep_name = norm_name(past["rep_candidate"]) if past else None
        dem_last = last_name(past["dem_candidate"]) if past else None
        rep_last = last_name(past["rep_candidate"]) if past else None

        dem_matched = bool(dem_name) and any(norm_name(c["name"]) == dem_name for c in candidates)
        rep_matched = bool(rep_name) and any(norm_name(c["name"]) == rep_name for c in candidates)

        bucket_of = []
        for c in candidates:
            n = norm_name(c["name"])
            if dem_name and n == dem_name:
                bucket_of.append("dem")
            elif rep_name and n == rep_name:
                bucket_of.append("gop")
            elif not dem_matched and c["party"] == "D":
                bucket_of.append("dem")
            elif not rep_matched and c["party"] == "R":
                bucket_of.append("gop")
            elif not dem_matched and dem_last and last_name(c["name"]) == dem_last:
                bucket_of.append("dem")
            elif not rep_matched and rep_last and last_name(c["name"]) == rep_last:
                bucket_of.append("gop")
            else:
                bucket_of.append("oth")

        fips_map = pres_fips.get(abbr, {})
        sum_dem = sum_gop = sum_oth = sum_total = 0
        unmatched_counties = []
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
            sum_dem += dem
            sum_gop += gop
            sum_oth += oth
            sum_total += total
            if not fips:
                unmatched_counties.append(row["county"])
                continue
            out_rows.append({
                "state": abbr, "county_name": row["county"], "county_id": fips,
                f"dem_{YEAR}": dem, f"gop_{YEAR}": gop, f"oth_{YEAR}": oth, f"total_{YEAR}": total,
            })

        status = f"{len(county_rows)} counties, dem={sum_dem} gop={sum_gop} oth={sum_oth} total={sum_total}"
        if past:
            expected_dem = int(past["dem_votes"].replace(",", ""))
            expected_gop = int(past["rep_votes"].replace(",", ""))
            ddiff = sum_dem - expected_dem
            gdiff = sum_gop - expected_gop
            status += f" | vs governor_past_results: dem_diff={ddiff} gop_diff={gdiff}"
            if abs(ddiff) > 5 or abs(gdiff) > 5:
                status = "MISMATCH " + status
        if unmatched_counties:
            status += f" | unmatched counties: {unmatched_counties}"
        report.append((abbr, status))
        time.sleep(0.3)

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}"]
    # Merge rather than overwrite - other scripts may hold rows for states not
    # handled here (e.g. patch-county-governor-*-la.py, fetch-openelections-*.py).
    existing_rows = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    handled_states = set(states)
    kept = [r for r in existing_rows if r["state"] not in handled_states]

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + out_rows:
            w.writerow(r)

    print(f"Wrote {len(out_rows)} rows -> {OUT_CSV} (file now has {len(kept) + len(out_rows)} total)\n")
    for abbr, status in report:
        print(f"{abbr}: {status}")


if __name__ == "__main__":
    main()
