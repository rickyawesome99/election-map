#!/usr/bin/env python3
"""
Scrapes county-level 2016 Senate results from Wikipedia's "By county" tables
(e.g. https://en.wikipedia.org/wiki/2016_United_States_Senate_election_in_Arizona)
and cross-validates each state's summed totals against the existing state-level
row in data-entry/senate_past_results.csv.

Writes data-entry/county_senate_results_2016.csv with columns:
state,county_name,county_id,dem_2016,gop_2016,oth_2016,total_2016
(county_name/county_id resolved by name-matching against
data/county_presidential_results_2008_2024.csv, which already has verified FIPS).

Mirrors scrape-county-senate-2018.py's parsing logic exactly (same wikitext-format
gotchas and bugfixes apply - bold-name stripping, caption/legend-table skipping, mixed
!!/|| separators, diacritic/compound-name FIPS matching, WV-style 3-tier headers, CA-style
flat #/% headers); only YEAR, STATE_NAMES, and TITLE_OVERRIDES differ (none needed so far
- see below). See [[project_county_election_scrape]] memory for the gotcha list.

CA excluded on purpose, same as 2018: 2016's race was Kamala Harris vs. Loretta Sanchez,
both Democrats (a same-party top-two general) - doesn't fit this pipeline's dem/gop
two-party model. Not scraped at all this time (2018's version was scraped then removed
after the fact; skipping it up front here instead).

Run from project root: python3 scripts/scrape-county-senate-2016.py
"""
import csv, os, re, sys, time, unicodedata, urllib.parse, urllib.request
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(__file__), "..")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
SENATE_PAST_CSV = os.path.join(ROOT, "data-entry/senate_past_results.csv")
YEAR = 2016
OUT_CSV = os.path.join(ROOT, f"data-entry/county_senate_results_{YEAR}.csv")

STATE_NAMES = {
    # CA excluded on purpose - see module docstring.
    "AK": "Alaska", "AL": "Alabama", "AR": "Arkansas", "AZ": "Arizona",
    "CO": "Colorado", "CT": "Connecticut", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "IA": "Iowa", "ID": "Idaho", "IL": "Illinois",
    "IN": "Indiana", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
    "MD": "Maryland", "MO": "Missouri", "NC": "North Carolina", "ND": "North Dakota",
    "NH": "New Hampshire", "NV": "Nevada", "NY": "New York", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "SC": "South Carolina",
    "SD": "South Dakota", "UT": "Utah", "VT": "Vermont", "WA": "Washington",
    "WI": "Wisconsin",
}

# Pages whose title doesn't match the "{YEAR} United States Senate election in {State}"
# pattern. Empty so far for 2016 - kept for parity with prior years' scripts in case a
# state turns out to need one once run.
TITLE_OVERRIDES = {}

TEMPLATE_RE = re.compile(r"\{\{[^{}]*\}\}")
ATTR_RE = re.compile(r'^(?:[a-zA-Z-]+\s*=\s*(?:"[^"]*"|\S+)\s*)+\|')
REF_RE = re.compile(r"<ref[^>]*/?>(?:.*?</ref>)?", re.S)
BOLD_RE = re.compile(r"'''(.*?)'''")

# A handful of states have a county and an independent city sharing the same base name
# (Virginia's Fairfax/Franklin/Richmond/Roanoke, Missouri's St. Louis). The presidential
# results CSV keys both by the same bare name, so name-matching alone can't tell them
# apart; Wikipedia always disambiguates these specific pairs as "X City"/"X County".
INDEPENDENT_CITY_OVERRIDES = {
    ("VA", "Fairfax City"): "51600", ("VA", "Fairfax County"): "51059",
    ("VA", "Franklin City"): "51620", ("VA", "Franklin County"): "51067",
    ("VA", "Richmond City"): "51760", ("VA", "Richmond County"): "51159",
    ("VA", "Roanoke City"): "51770", ("VA", "Roanoke County"): "51161",
    ("MO", "St. Louis City"): "29510", ("MO", "St. Louis County"): "29189",
    ("MD", "Baltimore"): "24005", ("MD", "Baltimore City"): "24510",
    ("MD", "Baltimore (County)"): "24005", ("MD", "Baltimore (City)"): "24510",
}


def fetch_raw(title: str) -> str:
    encoded = urllib.parse.quote(title.replace(" ", "_"))
    url = f"https://en.wikipedia.org/w/index.php?title={encoded}&action=raw"
    req = urllib.request.Request(url, headers={"User-Agent": "election-map-data-pipeline/1.0"})
    with urllib.request.urlopen(req) as r:
        return r.read().decode("utf-8")


def fetch(state_abbr: str) -> str:
    title = TITLE_OVERRIDES.get(state_abbr) or f"{YEAR}_United_States_Senate_election_in_{STATE_NAMES[state_abbr]}"
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


def split_row_cells(row_lines: list[str]) -> list[str]:
    """Each raw line is one table row's worth of markup starting with '!' or '|'.
    A line may hold a single cell (one-cell-per-line style, e.g. AZ/ME/VT) or several
    cells joined with '||'/'!!' (compact inline style, e.g. RI), or even mix both
    separators on one line (TN 2020) - split on whichever appears."""
    cells = []
    for line in row_lines:
        body = line[1:]
        for part in re.split(r"!!|\|\|", body):
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
    # A few states held two Senate races that year (a regular election plus a special to
    # fill a vacancy) and nest "Regular election"/"Special election" subsections - each
    # with its own table - under "By county". Prefer the regular election's table since
    # that's what senate_past_results.csv encodes.
    reg_m = re.search(r"^=+\s*Regular election\s*=+\s*$", rest, re.I | re.M)
    if reg_m:
        rest = rest[reg_m.end():]

    # Some states put a small color-key "Legend" table (won-by-X / won-by-Y) immediately
    # before the real results table under the same "By county" heading. Walk each
    # top-level {|...|} block in turn and skip any whose caption line (|+) says "Legend"
    # rather than assuming the first table found is the real one.
    search_from = 0
    while True:
        start = rest.index("{|", search_from)
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
        caption_m = re.search(r"^\s*\|\+.*$", table, re.M)
        if caption_m and re.search(r"legend", caption_m.group(), re.I):
            search_from = i
            continue
        return table.splitlines()


def parse_state(state_abbr: str, wikitext: str):
    lines = extract_table(wikitext)
    # Split into row-groups on lines that are exactly "|-" (row separators).
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

    # Some states prepend a full-width caption row disguised as a real header line
    # (`!colspan="8"|...`) instead of using proper `|+` caption markup - drop any such
    # single-cell leading row-groups so rows[0] is the real County/candidate header.
    while len(rows) > 1 and len(split_row_cells(rows[0])) == 1:
        rows.pop(0)

    # Header rows: first row-group has one cell per column-block, in order:
    # County (single column), then candidate blocks (colspan=2) and/or a Margin block
    # (colspan=2), then optionally Total (single column). Column count/order varies by
    # state, so classify each header cell structurally (colspan >= 2 vs not) rather than
    # assuming a fixed layout. Second row-group is the #/% subheader (skippable, columns
    # already known from block order).
    blocks = []  # in order: {"kind": "county"|"candidate"|"margin"|"total"|"other", "name", "party"}
    for line in rows[0]:
        body = line[1:]
        for part in re.split(r"!!|\|\|", body):
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
                blocks.append({"kind": "candidate", "name": name, "party": party})
            elif not blocks:
                blocks.append({"kind": "county"})
            elif re.match(r"^Total", content, re.I):
                blocks.append({"kind": "total"})
            else:
                blocks.append({"kind": "other"})  # unknown single-column stat; consume but ignore

    candidates = [b for b in blocks if b["kind"] == "candidate"]

    # WV-style 3-tier header: row-group 0 is a coarse "County | Candidate | Total"
    # grouping row where County/Total are real rowspan=3 columns but the middle cell is
    # just the literal placeholder word "Candidate" (colspan=6) instead of real names -
    # those live in row-group 1 (colspan=2 per candidate), pushing the %/Votes subheader
    # to row-group 2. Splice the real candidate blocks in over the placeholder and drop
    # row-group 1 so the rest of the function (subheader/data-row logic below) sees the
    # same 2-row-group shape (block header + %/Votes subheader) every other state has.
    if len(candidates) == 1 and candidates[0]["name"].strip().lower() == "candidate":
        placeholder_idx = next(i for i, b in enumerate(blocks) if b is candidates[0])
        new_candidate_blocks = []
        for line in rows[1]:
            body = line[1:]
            for part in re.split(r"!!|\|\|", body):
                content = clean_cell(part)
                party = "D" if re.search(r"Democratic", content, re.I) else "R" if re.search(r"Republican", content, re.I) else None
                name = re.sub(r"<br\s*/?>.*$", "", content, flags=re.S).strip()
                name = re.sub(r"\[\[[^|\]]*\|([^\]]+)\]\]", r"\1", name)
                name = re.sub(r"\[\[([^\]]+)\]\]", r"\1", name)
                name = re.sub(r"^'+|'+$", "", name).strip()
                new_candidate_blocks.append({"kind": "candidate", "name": name, "party": party})
        blocks = blocks[:placeholder_idx] + new_candidate_blocks + blocks[placeholder_idx + 1:]
        candidates = new_candidate_blocks
        rows = [rows[0]] + rows[2:]

    # CA-style flat header with no colspan grouping at all (e.g. a same-party top-two
    # general: "County !! X # !! X % !! Y # !! Y % !! Margin # !! Margin % !! Total"),
    # every cell colspan=1. Fall back to pairing adjacent "X #"/"X %" cells into a
    # candidate block (mirrors the colspan-based candidate block's shape exactly, so
    # everything downstream - vote extraction, matching - works unchanged). Not expected
    # to trigger for any state actually scraped this year (CA itself is excluded - see
    # module docstring) but kept in case another state uses this format.
    if not candidates:
        flat_cells = []
        for line in rows[0]:
            body = line[1:]
            for part in re.split(r"!!|\|\|", body):
                flat_cells.append(clean_cell(part))
        blocks = []
        i = 0
        while i < len(flat_cells):
            content = flat_cells[i]
            if i == 0:
                blocks.append({"kind": "county"})
                i += 1
                continue
            m_hash = re.match(r"^(.*?)\s*#$", content)
            m_pct = re.match(r"^(.*?)\s*%$", flat_cells[i + 1]) if m_hash and i + 1 < len(flat_cells) else None
            if m_hash and m_pct and norm_name(m_hash.group(1)) == norm_name(m_pct.group(1)):
                base = m_hash.group(1).strip()
                if base.lower() == "margin":
                    blocks.append({"kind": "margin"})
                else:
                    name = re.sub(r"\[\[[^|\]]*\|([^\]]+)\]\]", r"\1", base)
                    name = re.sub(r"\[\[([^\]]+)\]\]", r"\1", name)
                    party = "D" if re.search(r"Democratic", base, re.I) else "R" if re.search(r"Republican", base, re.I) else None
                    blocks.append({"kind": "candidate", "name": name, "party": party, "vote_first": True})
                i += 2
                continue
            if re.match(r"^Total", content, re.I):
                blocks.append({"kind": "total"})
            else:
                blocks.append({"kind": "other"})
            i += 1
        candidates = [b for b in blocks if b["kind"] == "candidate"]

    # Most states have a second header row-group with #/% sub-labels for each candidate
    # column pair (and it's *usually* # before %, but not always - WA does %, # instead).
    # Some states (e.g. CT) skip this row-group entirely despite declaring rowspan="2",
    # in which case rows[1] is already real data, not a subheader.
    has_subheader = False
    if len(rows) > 1:
        first = split_row_cells(rows[1])
        first_cell = first[0].strip() if first else ""
        if re.match(r"^(#|%|Votes?|County)$", first_cell, re.I):
            has_subheader = True
            sub_idx = 1 if first_cell.lower() == "county" else 0
            for b in blocks:
                if b["kind"] in ("candidate", "margin"):
                    label = first[sub_idx].strip() if sub_idx < len(first) else "#"
                    b["vote_first"] = not label.startswith("%")
                    sub_idx += 2

    data_rows = rows[2:] if has_subheader else rows[1:]
    out = []
    for r in data_rows:
        if any("sortbottom" in line.lower() for line in r):
            continue  # totals footer row
        cells = split_row_cells(r)
        if not cells or not cells[0]:
            continue
        county = link_text(cells[0])
        # PA 2016 has a statewide total footer row styled with '!' (header) markers
        # instead of the usual sortbottom class, literally named after the state itself
        # ("Pennsylvania") - written as plain unlinked text, not a [[wikilink]]. Real
        # counties are always wikilinked, *including* the several states that really do
        # have a county sharing the state's own name (Arkansas County AR, Hawaii County
        # HI, New York County NY) - so the "no wikilink" check is what actually
        # distinguishes the footer row, not the name match alone (an earlier version of
        # this fix used name-match alone and silently dropped those three real counties).
        is_state_total_footer = (
            "[[" not in cells[0] and county.strip().lower() == STATE_NAMES.get(state_abbr, "").lower()
        )
        if county.lower() in ("total", "totals") or is_state_total_footer or not re.search(r"[A-Za-z]", county):
            continue

        rest = cells[1:]  # cells[0] already consumed as county (the "county" block)
        idx = 0
        votes, total = [], None
        for b in blocks:
            if b["kind"] == "county":
                continue
            elif b["kind"] == "candidate":
                if idx >= len(rest):
                    break
                offset = 0 if b.get("vote_first", True) else 1
                votes.append(to_int(rest[idx + offset]))
                idx += 2
            elif b["kind"] == "margin":
                idx += 2
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
    # Ambiguous names (independent city sharing a name with a county) can't be resolved
    # from the presidential CSV alone - drop them here and rely on INDEPENDENT_CITY_OVERRIDES.
    for state, name in dupe_names:
        del m[state][name]
    for (state, name), fips in INDEPENDENT_CITY_OVERRIDES.items():
        m.setdefault(state, {})[name] = fips
    return m


def load_senate_year():
    # Most states have exactly one non-Special row for the year and that's the one to
    # use. A state can also have two races the same year for two different seats - prefer
    # the non-Special one (checked: no 2016 state has two rows, but kept for parity with
    # every other year's script). A state whose ONLY row that year is itself flagged
    # Special (e.g. AZ 2020) would still be included via that row, not dropped by a
    # blanket "type != Special" filter.
    by_state = defaultdict(list)
    with open(SENATE_PAST_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["year"] == str(YEAR):
                by_state[row["state_abbr"]].append(row)
    m = {}
    for state, rows in by_state.items():
        non_special = [r for r in rows if r["type"] != "Special"]
        m[state] = non_special[0] if non_special else rows[0]
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
    # Last resort: compound names split inconsistently across sources (Wikipedia's
    # "DeWitt" vs the presidential CSV's "De Witt") - compare with spaces removed too.
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
    senate_year = load_senate_year()

    out_rows = []
    report = []
    for abbr in states:
        try:
            wikitext = fetch(abbr)
            candidates, county_rows = parse_state(abbr, wikitext)
        except Exception as e:
            report.append((abbr, f"FAILED: {e}"))
            continue

        past = senate_year.get(abbr)
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
            expected_dem, expected_gop = int(past["dem_votes"]), int(past["rep_votes"])
            ddiff = sum_dem - expected_dem
            gdiff = sum_gop - expected_gop
            status += f" | vs senate_past_results: dem_diff={ddiff} gop_diff={gdiff}"
            if abs(ddiff) > 5 or abs(gdiff) > 5:
                status = "MISMATCH " + status
        if unmatched_counties:
            status += f" | unmatched counties: {unmatched_counties}"
        report.append((abbr, status))
        time.sleep(0.3)

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}"]
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in out_rows:
            w.writerow(r)

    print(f"Wrote {len(out_rows)} rows -> {OUT_CSV}\n")
    for abbr, status in report:
        print(f"{abbr}: {status}")


if __name__ == "__main__":
    main()
