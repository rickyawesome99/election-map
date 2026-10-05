#!/usr/bin/env python3
"""
RACE POLLS — Wikipedia scrape → data-entry/race_polls.csv (append-only merge)

    python3 scripts/fetch-race-polls.py            # fetch, merge, write the CSV
    python3 scripts/fetch-race-polls.py --dry-run  # fetch + report, write nothing

Source: the individual-poll wikitables on each 2026 race's Wikipedia page (raw wikitext via
index.php?action=raw; RealClearPolling blocks scripted fetches). Races and nominees come from
data-entry/{senate,governor,house}_seats.csv, so run this AFTER any nominee change.
Pages: Senate "2026 United States Senate [special ]election in {State}", Governor
"2026 {State} gubernatorial election", House "2026 United States House of Representatives
elections in {State}" split on ==District N== / ===District N=== (at-large states: singular "election in").

Table rules (the Phase 5 rules, see docs/TPL_MODEL_SPEC.md):
  - a table counts only when its header names BOTH nominees by surname; aggregate tables
    ("aggregation" in the header) and {{hidden begin}}…{{hidden end}} hypothetical blocks skip
  - a poll printed in several matchup tables keeps its full-field version (most candidates)
  - one row per poll: the poll's FIRST row (first population, first question variant);
    rowspan continuation rows (second population, leaners, alternate fields) are skipped
  - two-candidate tables keep the raw shares; a table with more than one candidate of a
    party (top-four/top-two fields) is party-summed and two-party normalised
  - an independent sitting in an empty major-party slot (Osborn) fills that slot
  - pollster = the cell text with refs/links/markup stripped; the LAST "(D)"/"(R)" marker
    becomes the partisan column (build-race-polls.js un-flags the bipartisan pairs)

Merge rules:
  - APPEND-ONLY: rows already in the CSV are never edited or removed (hand corrections survive);
    a scraped poll is new when no existing row of the same race has the same start + end
    dates and the same normalised pollster, nor the same dates and the same dem/rep shares
  - same-party generals (CA top-two D-v-D, CA-40 R-v-R) are skipped: decided races, polls unused
  - Alaska Senate (S,AK,Senate) is NEVER scraped — those rows are hand-entered RCV final
    rounds only (user rule 2026-09-21); add new ones by hand from the pollster's release
  - scraped polls disagreeing with an existing row (same race/pollster/end date, different
    numbers) are listed for review, not applied
"""

import csv
import io
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data-entry"
CSV_PATH = DATA / "race_polls.csv"
STAMP_PATH = DATA / "race_polls_checked.txt"
FIELDS = ["office", "state", "race", "pollster", "partisan", "start", "end", "sample", "population", "dem", "rep"]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) election-map poll refresh"
YEAR = 2026
AT_LARGE = {"AK", "DE", "ND", "SD", "VT", "WY"}
SKIP_RACES = {("S", "AK", "Senate")}  # hand-entered RCV final rounds only
MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"], 1)}
for _m, _i in list(MONTHS.items()):
    MONTHS[_m[:3]] = _i
MONTHS["sept"] = 9


# ── fetch ─────────────────────────────────────────────────────────────────────

_cache = {}


def fetch_raw(title, depth=0):
    if title in _cache:
        return _cache[title]
    url = "https://en.wikipedia.org/w/index.php?" + urllib.parse.urlencode({"title": title, "action": "raw"})
    text = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                text = r.read().decode("utf-8")
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:
                break
            time.sleep(2 * (attempt + 1))
        except Exception:
            time.sleep(2 * (attempt + 1))
    time.sleep(0.15)
    if text is not None:
        m = re.match(r"\s*#REDIRECT\s*\[\[([^\]|#]+)", text, re.I)
        if m and depth < 3:
            text = fetch_raw(m.group(1).strip(), depth + 1)
    _cache[title] = text
    return text


# ── wikitext cleaning ─────────────────────────────────────────────────────────

def strip_templates_named(s, names):
    """Remove {{name …}} templates (brace-matched, nested-safe) for the given lowercase names."""
    out, i = [], 0
    pat = re.compile(r"\{\{\s*(" + "|".join(names) + r")\b", re.I)
    while True:
        m = pat.search(s, i)
        if not m:
            out.append(s[i:])
            return "".join(out)
        out.append(s[i:m.start()])
        depth, j = 0, m.start()
        limit = min(len(s), m.start() + 5000)  # an unclosed template must not swallow the rest of the page
        while j < limit:
            if s.startswith("{{", j):
                depth += 1; j += 2
            elif s.startswith("}}", j):
                depth -= 1; j += 2
                if depth == 0:
                    break
            else:
                j += 1
        if depth:  # unbalanced: drop only the opening line
            nl = s.find("\n", m.start())
            j = len(s) if nl < 0 else nl
        i = j


def preclean(text):
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<ref\b(?:[^>\"]|\"[^\"]*\")*/\s*>", "", text)  # self-closing, even with "/" in the name
    text = re.sub(r"<ref\b[^>]*>.*?</ref\s*>", "", text, flags=re.S)
    return strip_templates_named(text, ["efn", "refn", "efn-ua", "efn-lr", "sfn", "citation needed", "cn"])


def plain(s):
    """Cell markup → display text."""
    s = re.sub(r"<br\b[^>]*>", " ", s, flags=re.I)  # also the malformed "<br/ >"
    s = re.sub(r"<wbr\s*/?>", "", s, flags=re.I)
    s = re.sub(r"</?[a-z][^>]*>", "", s, flags=re.I)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[https?://\S+\s+([^\]]*)\]", r"\1", s)
    s = re.sub(r"\[https?://\S+\]", "", s)
    s = re.sub(r"\{\{\s*(?:nowrap|nobr|small|abbr)\s*\|([^|}]*)(?:\|[^}]*)?\}\}", r"\1", s, flags=re.I)
    s = re.sub(r"\{\{\s*(?:nbsp|snd|spaced ndash)\s*\}\}", " ", s, flags=re.I)
    s = re.sub(r"\{\{\s*(?:sdash|ndash|mdash|n/a|na|–)\s*\}\}", "–", s, flags=re.I)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = s.replace("&nbsp;", " ").replace("&ndash;", "–").replace("&mdash;", "—").replace("&amp;", "&")
    s = s.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", s).strip()


def fold(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def split_top(s, sep):
    """Split on sep outside [[ ]] / {{ }}."""
    parts, cur, depth, i = [], [], 0, 0
    while i < len(s):
        if s.startswith("[[", i) or s.startswith("{{", i):
            depth += 1; cur.append(s[i:i + 2]); i += 2; continue
        if (s.startswith("]]", i) or s.startswith("}}", i)) and depth:
            depth -= 1; cur.append(s[i:i + 2]); i += 2; continue
        if depth == 0 and s.startswith(sep, i):
            parts.append("".join(cur)); cur = []; i += len(sep); continue
        cur.append(s[i]); i += 1
    parts.append("".join(cur))
    return parts


def parse_cell(raw):
    """'style=… | content' → (attrs, content). A leading {{party shading/…}} counts as attrs."""
    parts = split_top(raw, "|")
    if len(parts) >= 2:
        head = parts[0]
        if re.search(r"\b(style|rowspan|colspan|class|align|bgcolor|valign|scope|data-sort-value|width)\s*=", head, re.I) \
                or re.fullmatch(r"\s*\{\{\s*party shading[^}]*\}\}\s*", head, re.I):
            return head, "|".join(parts[1:])
    return "", raw


def span(attrs, name):
    m = re.search(name + r"\s*=\s*\"?(\d+)", attrs, re.I)
    return int(m.group(1)) if m else 1


# ── tables ────────────────────────────────────────────────────────────────────

def iter_tables(text):
    """Yield top-level wikitable bodies, skipping those inside {{hidden begin}}…{{hidden end}}."""
    lines = text.split("\n")
    # hidden-block depth BEFORE each line; markers can sit on a table's own lines (e.g. "|}{{hidden end}}")
    depth_at, hidden = [], 0
    for ln in lines:
        depth_at.append(hidden)
        hidden += len(re.findall(r"\{\{\s*(?:hidden begin|collapse top|cot)\b", ln, re.I))
        hidden -= len(re.findall(r"\{\{\s*(?:hidden end|end hidden|collapse bottom|cob)\s*\}\}", ln, re.I))
        hidden = max(hidden, 0)
    i = 0
    while i < len(lines):
        ln = lines[i].strip()
        hidden = depth_at[i] + len(re.findall(r"\{\{\s*(?:hidden begin|collapse top|cot)\b", lines[i].split("{|")[0], re.I))
        if ln.startswith("{|"):
            depth, body, j = 1, [], i + 1
            while j < len(lines) and depth:
                s = lines[j].strip()
                if s.startswith("{|"):
                    depth += 1
                elif s.startswith("|}"):
                    depth -= 1
                if depth:
                    body.append(lines[j])
                j += 1
            if hidden == 0:
                yield body
            i = j
            continue
        i += 1


def table_rows(body):
    """→ (header cells, data rows); each row is a list of (attrs, content) physical cells."""
    header, rows, cur, in_header_block = [], [], None, True
    for raw in body:
        s = raw.strip()
        if s.startswith("|+"):
            continue
        if s.startswith("|-"):
            if cur is not None and cur:
                rows.append(cur)
            cur = []
            continue
        if s.startswith("!"):
            for c in split_top(s[1:], "!!"):
                a, t = parse_cell(c)
                header.append((a, t))
            continue
        if s.startswith("|"):
            if cur is None:
                cur = []
            for c in split_top(s[1:], "||"):
                cur.append(parse_cell(c))
        elif cur:  # continuation of the previous cell's content
            a, t = cur[-1]
            cur[-1] = (a, t + " " + s)
    if cur:
        rows.append(cur)
    return header, rows


def grid(rows, ncols):
    """Expand rowspans. → list of (cells[ncols] of text, is_first_row_of_poll)."""
    carry = {}  # col → [remaining, text]
    out = []
    for phys in rows:
        cells, k, col = [None] * ncols, 0, 0
        starts_poll = 0 not in carry
        while col < ncols:
            if col in carry:
                cells[col] = carry[col][1]
                carry[col][0] -= 1
                if carry[col][0] == 0:
                    del carry[col]
                col += 1
                continue
            if k >= len(phys):
                break
            a, t = phys[k]; k += 1
            rs, cs = span(a, "rowspan"), span(a, "colspan")
            for c in range(col, min(col + cs, ncols)):
                cells[c] = t
                if rs > 1:
                    carry[c] = [rs - 1, t]
            col += cs
        out.append((cells, starts_poll))
    return out


# ── field parsing ─────────────────────────────────────────────────────────────

def parse_dates(s):
    s = fold(re.sub(r"[–—‒−]", "-", plain(s)))  # dashes first: fold() drops non-ASCII
    s = re.sub(r"\s*-\s*", "-", s)
    yrs = re.findall(r"\b(20\d\d)\b", s)
    year = int(yrs[-1]) if yrs else YEAR
    s = re.sub(r",?\s*\b20\d\d\b", "", s)
    toks = re.findall(r"[a-z]+|\d+|-", s)
    md, month = [], None
    for t in toks:
        if t.isalpha() and (t[:4] in MONTHS or t[:3] in MONTHS):
            month = MONTHS.get(t[:4], MONTHS.get(t[:3]))
        elif t.isdigit() and month:
            md.append((month, int(t)))
    if not md:
        return None
    (m1, d1), (m2, d2) = md[0], md[-1]
    y1 = int(yrs[0]) if len(yrs) > 1 else (year - 1 if m1 > m2 else year)
    try:
        return date(y1, m1, d1).isoformat(), date(year, m2, d2).isoformat()
    except ValueError:
        return None


def parse_sample(s):
    t = plain(s)
    n = re.search(r"(\d[\d,]*)", t)
    p = re.search(r"\((LV|RV|A|V)\)|\b(LV|RV)\b", t)
    pop = (p.group(1) or p.group(2)).lower() if p else ""
    return (n.group(1).replace(",", "") if n else ""), pop


def parse_pct(s):
    t = plain(s or "")
    m = re.match(r"^\s*<?\s*(\d+(?:\.\d+)?)\s*%", t)
    return float(m.group(1)) if m else None


def surname(name):
    n = re.sub(r"\(.*?\)", "", name)
    n = re.sub(r",?\s+(jr\.?|sr\.?|ii|iii|iv)\s*$", "", n.strip(), flags=re.I)
    return fold(n.split()[-1]) if n.split() else ""


def party_of(header_text):
    m = re.findall(r"\(([A-Z])\)", header_text)
    return m[-1] if m else None


def clean_pollster(cell):
    t = plain(cell)
    marks = list(re.finditer(r"\s*\(([DR])\)\s*", t))
    partisan = ""
    if marks:
        last = marks[-1]
        if not t[last.end():].strip():  # the marker ends the cell
            partisan = last.group(1)
            t = t[:last.start()] + t[last.end():]
    return re.sub(r"\s+", " ", t).strip(" ,"), partisan


def norm_pollster(p):
    return re.sub(r"[^a-z0-9]", "", fold(re.sub(r"\([A-Z]\)", "", p)))


# ── per-race extraction ───────────────────────────────────────────────────────

def extract(text, dem_name, rep_name):
    """→ list of poll dicts from every qualifying table in this text."""
    ds, rs = surname(dem_name), surname(rep_name)
    polls = []
    for body in iter_tables(text):
        header, rows = table_rows(body)
        if not header or not rows:
            continue
        htexts = [plain(t) for _, t in header]
        if any("aggregat" in fold(h) for h in htexts):
            continue
        # expand header colspans to column positions
        cols = []
        for (a, _), h in zip(header, htexts):
            cols += [h] * span(a, "colspan")
        if len(cols) < 5:
            continue
        lower = [fold(h) for h in cols]
        try:
            ci_poll = next(i for i, h in enumerate(lower) if "poll" in h and "source" in h or h.startswith("poll"))
            ci_date = next(i for i, h in enumerate(lower) if "date" in h)
        except StopIteration:
            continue
        ci_samp = next((i for i, h in enumerate(lower) if "sample" in h), None)
        d_cols = [i for i, h in enumerate(lower) if ds and re.search(r"\b" + re.escape(ds) + r"\b", h)]
        r_cols = [i for i, h in enumerate(lower) if rs and re.search(r"\b" + re.escape(rs) + r"\b", h)]
        if len(d_cols) != 1 or len(r_cols) != 1 or d_cols == r_cols:
            continue
        cand_cols = {i: party_of(cols[i]) for i in range(len(cols))
                     if i > max(ci_date, ci_samp or 0) and party_of(cols[i]) in ("D", "R")}
        extra_d = [i for i, p in cand_cols.items() if p == "D" and i not in d_cols + r_cols]
        extra_r = [i for i, p in cand_cols.items() if p == "R" and i not in d_cols + r_cols]
        summed = bool(extra_d or extra_r)
        ncand = sum(1 for i in range(max(ci_date, ci_samp or 0) + 1, len(cols))
                    if not re.search(r"other|undecided|margin|lead|moe|error|would not|none|someone", lower[i]))
        for cells, first in grid(rows, len(cols)):
            if not first or cells[ci_poll] is None:
                continue
            dem = parse_pct(cells[d_cols[0]]); rep = parse_pct(cells[r_cols[0]])
            if dem is None or rep is None:
                continue
            if summed:
                dem += sum(parse_pct(cells[i]) or 0 for i in extra_d)
                rep += sum(parse_pct(cells[i]) or 0 for i in extra_r)
                tot = dem + rep
                if not tot:
                    continue
                dem, rep = round(100 * dem / tot, 1), round(100 * rep / tot, 1)
            dates = parse_dates(cells[ci_date] or "")
            if not dates:
                continue
            pollster, partisan = clean_pollster(cells[ci_poll])
            if not pollster:
                continue
            sample, pop = parse_sample(cells[ci_samp]) if ci_samp is not None else ("", "")
            polls.append({"pollster": pollster, "partisan": partisan, "start": dates[0], "end": dates[1],
                          "sample": sample, "population": pop,
                          "dem": f"{dem:.1f}", "rep": f"{rep:.1f}", "_summed": summed, "_ncand": ncand})
    # the same poll in several matchup tables (two-way and with an independent / minor parties):
    # keep the FULL-FIELD version — the most candidate columns — which is the ballot voters see
    best = {}
    for p in polls:
        k = (p["start"], p["end"], norm_pollster(p["pollster"]))
        if k not in best or p["_ncand"] > best[k]["_ncand"]:
            best[k] = p
    return list(best.values())


def house_sections(text):
    # "==District 4==", or "===District 48===" under "==Districts 27–52==" (California)
    out, parts = {}, re.split(r"^={2,3}\s*District\s+(\d+)\s*={2,3}\s*$", text, flags=re.M)
    for k in range(1, len(parts) - 1, 2):
        out[int(parts[k])] = parts[k + 1]
    return out


def house_district_text(title, dist):
    """District section; follows {{main|… (districts 27–52)}} split pages (California)."""
    text = fetch_raw(title)
    if text is None:
        return None
    sec = house_sections(text).get(dist)
    if sec is not None:
        return sec
    for sub, a, b in re.findall(r"\{\{\s*main\s*\|\s*([^}|]*\(districts\s+(\d+)\s*[–-]\s*(\d+)\))", text, re.I):
        if int(a) <= dist <= int(b):
            sub_text = fetch_raw(sub.strip())
            return house_sections(sub_text).get(dist) if sub_text else None
    return None


# ── races ─────────────────────────────────────────────────────────────────────

def read_csv(name):
    with open(DATA / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


same_party = {}  # (office, state, label) → True for a D-v-D / R-v-R general (decided; polls unused)


def nominee(name):
    n = re.sub(r"\s*\((?:I|D|R)\)\s*$", "", (name or "").strip())
    return n


def races():
    out = []  # (office, state, race label, title, district or None, dem, rep)
    def mark(key, r):  # the CSV writes a same-party general as "Name (D)" in the R slot or vice versa
        same_party[key] = bool(re.search(r"\(D\)\s*$", r["rep_name"]) or re.search(r"\(R\)\s*$", r["dem_name"]))
    for r in read_csv("senate_seats.csv"):
        if r["next_election"] != str(YEAR):
            continue
        special = r["type"].strip().lower() == "special"
        title = f"{YEAR} United States Senate {'special ' if special else ''}election in {r['state_name']}"
        mark(("S", r["state_abbr"], "Senate Special" if special else "Senate"), r)
        out.append(("S", r["state_abbr"], "Senate Special" if special else "Senate", title, None,
                    nominee(r["dem_name"]), nominee(r["rep_name"])))
    for r in read_csv("governor_seats.csv"):
        if r["next_election"] != str(YEAR):
            continue
        mark(("G", r["state_abbr"], "Governor"), r)
        out.append(("G", r["state_abbr"], "Governor", f"{YEAR} {r['state_name']} gubernatorial election", None,
                    nominee(r["dem_name"]), nominee(r["rep_name"])))
    for r in read_csv("house_seats.csv"):
        if r["year"] != str(YEAR):
            continue
        st = r["state_abbr"]
        title = (f"{YEAR} United States House of Representatives election in {r['state_name']}" if st in AT_LARGE
                 else f"{YEAR} United States House of Representatives elections in {r['state_name']}")
        dist = None if st in AT_LARGE else int(r["district_name"].split("-")[1])
        mark(("H", st, f"House {r['district_name']}"), r)
        out.append(("H", st, f"House {r['district_name']}", title, dist,
                    nominee(r["dem_name"]), nominee(r["rep_name"])))
    return out


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    dry = "--dry-run" in sys.argv
    existing = read_csv("race_polls.csv")
    by_race = {}
    for r in existing:
        by_race.setdefault((r["office"], r["state"], r["race"]), []).append(r)

    added, conflicts, missing_pages, scanned, found = [], [], [], 0, 0
    all_races = races()
    for i, (office, st, label, title, dist, dem, rep) in enumerate(all_races):
        key = (office, st, label)
        if key in SKIP_RACES or not dem or not rep or same_party.get(key):
            continue
        if fetch_raw(title) is None:
            missing_pages.append(title); continue
        text = fetch_raw(title) if dist is None else house_district_text(title, dist)
        if text is None:
            continue
        scanned += 1
        polls = extract(preclean(text), dem, rep)
        found += len(polls)
        have = by_race.get(key, [])
        for p in polls:
            k1 = (p["start"], p["end"], norm_pollster(p["pollster"]))
            k2 = (p["start"], p["end"], float(p["dem"]), float(p["rep"]))
            dup = [h for h in have if (h["start"], h["end"], norm_pollster(h["pollster"])) == k1
                   or (h["start"], h["end"], float(h["dem"] or 0), float(h["rep"] or 0)) == k2]
            if dup:
                h = dup[0]
                if (float(h["dem"] or 0), float(h["rep"] or 0)) != (float(p["dem"]), float(p["rep"])) \
                        and h["start"] >= f"{YEAR}-01-01":
                    conflicts.append((key, h, p))
                continue
            # a poll whose end date matches an existing row from a similarly named pollster is
            # probably the same poll under an edited name/date — report it rather than double-count
            near = [h for h in have if h["end"] == p["end"] and
                    (norm_pollster(h["pollster"])[:6] == norm_pollster(p["pollster"])[:6])]
            if near:
                conflicts.append((key, near[0], p)); continue
            row = {"office": office, "state": st, "race": label, **{f: p[f] for f in FIELDS[3:]}}
            added.append((row, p["_summed"]))
            have.append(row)
        if (i + 1) % 50 == 0:
            print(f"  … {i + 1}/{len(all_races)} races", file=sys.stderr)

    # report
    print(f"Races scanned: {scanned}  ·  polls parsed: {found}  ·  new: {len(added)}  ·  to review: {len(conflicts)}")
    for t in missing_pages:
        print(f"  page not found: {t}")
    latest = max((r["end"] for r, _ in added), default=None)
    for row, summed in sorted(added, key=lambda x: (x[0]["office"], x[0]["state"], x[0]["race"], x[0]["end"])):
        tag = " [party-summed]" if summed else ""
        print(f"  + {row['office']},{row['state']},{row['race']}: {row['pollster']}"
              f"{' (' + row['partisan'] + ')' if row['partisan'] else ''} {row['start']}→{row['end']}"
              f" {row['sample']}{row['population']} D {row['dem']} R {row['rep']}{tag}")
    for key, h, p in conflicts:
        print(f"  ? {','.join(key)}: on file {h['pollster']} {h['start']}→{h['end']} D {h['dem']} R {h['rep']}"
              f"  |  wiki {p['pollster']} {p['start']}→{p['end']} D {p['dem']} R {p['rep']}")
    if latest:
        print(f"Newest added poll ends {latest}")
    if dry:
        print("Dry run — CSV not written.")
        return
    # the scrape date, shown on the overview as "checked" (build-race-polls.js reads it) — stamped
    # even when nothing is new, so the page can tell "no new polls" from "nobody looked"
    STAMP_PATH.write_text(date.today().isoformat() + "\n", encoding="utf-8")
    if not added:
        print("Nothing new — CSV unchanged.")
        return

    rows = existing + [r for r, _ in added]
    rows.sort(key=lambda r: (r["office"], r["state"], r["race"], r["end"]))  # stable: on-file order kept
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=FIELDS, lineterminator="\r\n")
    w.writeheader()
    w.writerows({f: r.get(f, "") for f in FIELDS} for r in rows)
    CSV_PATH.write_text(buf.getvalue(), encoding="utf-8", newline="")
    print(f"Wrote {CSV_PATH.relative_to(ROOT)} ({len(rows)} rows)")


if __name__ == "__main__":
    main()
