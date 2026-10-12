#!/usr/bin/env python3
"""
Outgoing incumbents for the 2026 state legislative elections, with REASONS, from the English
Wikipedia chamber articles ("2026 Ohio House of Representatives election" etc.): who is not
seeking re-election to their seat and why (term-limited, retiring, running for another office,
resigned, lost renomination). The Ballotpedia field (dataset D) says a seat is open; this says
why, which is what a reader of an open-seat district wants to know.

Usage:
  python3 scripts/fetch-state-leg-outgoing-2026.py [ST ...] [--cache DIR] [--report]

Reads the article wikitext through the MediaWiki API (action=parse&prop=wikitext), cached as
<cache>/<Title with underscores>.txt (default: the scratch wp/wt directory the research pass
filled). Writes data-entry/state-leg-outgoing-2026/<ST>.json:
  { "house": { "<district key>": [ {name, party, category, reason, post?} ] }, "senate": {...},
    "meta": { "fetched": ISO date, "titles": {...}, "unmatched": [...] } }
then `node scripts/build-state-leg-outgoing-2026.mjs` builds data/stateLegOutgoing2026.ts.

The articles use three line families (survey of all 88, 2026-10-10):
  A  "# District 31: [[Bill Roemer]] is term-limited."                (district first, party from the subsection)
  B  "* [[...|12th]]: [[Damon Connolly]] is running for state senate." (ordinal district)
  C  "*[[Erika Geiss]] (D–[[Taylor]]), representing district 1 since 2022, is term-limited."  (name first)
Three articles (North Dakota House and Senate, West Virginia Senate) carry the status only in a
per-district results table and are not parsed; Pennsylvania and Nevada Senate carry nothing.
"""
import argparse
import datetime
import difflib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-outgoing-2026")
DEFAULT_CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/f0dc0b69-f6dc-43ea-86e3-d48e7e098c28/scratchpad/wp/wt"
UA = "election-map-atlas/1.0 (state legislative atlas; contact via github)"

STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut",
    "DE": "Delaware", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
    "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}
# Article titles that do not follow "<State> House of Representatives" / "<State> Senate".
HOUSE_TITLE = {"CA": "California State Assembly", "MD": "Maryland House of Delegates", "NV": "Nevada Assembly", "NY": "New York State Assembly",
               "WV": "West Virginia House of Delegates", "WI": "Wisconsin State Assembly", "NE": "Nebraska Legislature"}
SENATE_TITLE = {"CA": "California State Senate", "GA": "Georgia State Senate", "MO": "Missouri State Senate", "NY": "New York State Senate",
                "OR": "Oregon State Senate", "WA": "Washington State Senate", "NE": "Nebraska Legislature"}
# Chambers with no 2026 senate election (and Nebraska's single chamber lives under "senate").
NO_SENATE_2026 = {"KS", "NM", "SC", "NE"}
NOT_UP_2026 = {"LA", "MS", "NJ", "VA"}

SECTION_RE = re.compile(r"retir|outgoing|not seeking|not running|incumbents defeated|vacanc", re.I)
PARTY_HEAD = {"democrat": "D", "democrats": "D", "democratic": "D", "dfl": "D", "republican": "R", "republicans": "R",
              "independent": "O", "independents": "O", "progressive": "O", "progressives": "O", "nonpartisan": "O"}
ORDINALS = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
            "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14, "fifteenth": 15, "sixteenth": 16, "seventeenth": 17,
            "eighteenth": 18, "nineteenth": 19, "twentieth": 20, "twenty-first": 21, "twenty-second": 22, "twenty-third": 23,
            "twenty-fourth": 24, "twenty-fifth": 25, "twenty-sixth": 26, "twenty-seventh": 27, "twenty-eighth": 28, "twenty-ninth": 29,
            "thirtieth": 30, "thirty-first": 31, "thirty-second": 32, "thirty-third": 33, "thirty-fourth": 34, "thirty-fifth": 35,
            "thirty-sixth": 36, "thirty-seventh": 37}
NH_COUNTY = {"belknap": "BE", "carroll": "CA", "cheshire": "CH", "coos": "CO", "coös": "CO", "grafton": "GR", "hillsborough": "HI",
             "merrimack": "ME", "rockingham": "RO", "strafford": "ST", "sullivan": "SU"}


def title_for(abbr, chamber):
    st = STATES[abbr]
    if chamber == "house":
        return f"2026 {HOUSE_TITLE.get(abbr, st + ' House of Representatives')} election"
    return f"2026 {SENATE_TITLE.get(abbr, st + ' Senate')} election"


def fetch_wikitext(title, cache):
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, title.replace(" ", "_") + ".txt")
    if os.path.exists(path):
        return open(path, encoding="utf-8").read()
    url = "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({"action": "parse", "prop": "wikitext", "format": "json", "redirects": 1, "page": title})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
            text = data.get("parse", {}).get("wikitext", {}).get("*")
            if text is None:
                return None
            open(path, "w", encoding="utf-8").write(text)
            time.sleep(1.0)
            return text
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                print(f"  fetch failed for {title}: {e}", file=sys.stderr)
                return None
            time.sleep(5 * (attempt + 1))
    return None


# ── wikitext cleaning ─────────────────────────────────────────────────────────

def strip_templates(s):
    # Remove {{...}} with nesting, repeatedly.
    out = []
    depth = 0
    i = 0
    while i < len(s):
        if s.startswith("{{", i):
            depth += 1
            i += 2
            continue
        if s.startswith("}}", i) and depth > 0:
            depth -= 1
            i += 2
            continue
        if depth == 0:
            out.append(s[i])
        i += 1
    return "".join(out)


def clean(line):
    line = re.sub(r"<ref[^>]*/>", "", line)
    line = re.sub(r"<ref[^>]*>.*?</ref>", "", line, flags=re.S)
    line = re.sub(r"<!--.*?-->", "", line, flags=re.S)
    line = strip_templates(line)
    line = re.sub(r"'{2,}", "", line)
    return line.strip()


LINK_RE = re.compile(r"\[\[([^\]|]*)(?:\|([^\]]*))?\]\]")


def mark_links(s):
    """[[target|label]] → «label», [[target]] → «target» (the first link after the district is the name)."""
    return LINK_RE.sub(lambda m: "«" + (m.group(2) if m.group(2) is not None else m.group(1)).strip() + "»", s)


def unmark(s):
    return s.replace("«", "").replace("»", "")


# ── classification ────────────────────────────────────────────────────────────

def classify(reason, subsection):
    r = (reason or "").lower()
    sub = (subsection or "").lower()
    if re.search(r"term.?limit|termed out", r) or "term-limit" in sub or "term limit" in sub:
        return "term-limited"
    if re.search(r"lost renomination|lost the .*primary|defeated|lost renom", r) or "defeated" in sub or "renomination" in sub or "primar" in sub:
        return "lost primary"
    if re.search(r"resign|vacated|died|passed away|appointed", r) or "resign" in sub or "vacat" in sub:
        return "resigned"
    if re.search(r"run(?:ning)? for|candidate for|seeking|ran for|campaign for|running in|is running|to run|elected justice|elected .* judge", r) or "other office" in sub or "new district" in sub:
        return "running for other office"
    if re.search(r"barred|disqualif|ineligible", r) or "disqualif" in sub:
        return "disqualified"
    if re.search(r"retir|did not file|not seeking|not running|suspend", r) or "retir" in sub:
        return "retiring"
    return "not running"


def tidy_reason(rest):
    """'is retiring to run for State Senate.' → 'retiring to run for State Senate'."""
    r = unmark(rest).strip()
    r = re.sub(r"^\((?:D|R|DFL|I|Ind\.?|Independent|Democrat(?:ic)?|Republican)(?:[–-][^)]*)?\)\s*[:,]?\s*", "", r)  # (R–Taylor), (D), (R-C.)
    r = re.sub(r"^\([^)]*\)\s*[:,]?\s*", "", r)  # (Louisville):
    r = re.sub(r"^,?\s*representing [^,]*?(?: since [^,]*)?,\s*", "", r)
    r = re.sub(r"^(?:is|was|has|had)\s+", "", r)
    r = r.strip(" .;:,")
    r = re.sub(r"\s+", " ", r)
    return r[0].lower() + r[1:] if r else ""


def inline_party(rest):
    m = re.match(r"\s*\((D|R|DFL|I|Ind|Independent|Democrat(?:ic)?|Republican)\b", rest)
    if not m:
        return None
    p = m.group(1).lower()
    return "D" if p.startswith("d") else "R" if p.startswith("r") else "O"


# ── district token → roster key ───────────────────────────────────────────────

def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower().replace(" and ", " "))


def district_candidates(token, abbr, chamber):
    """Possible roster keys for a district token, best first."""
    t = unmark(token).strip().rstrip(":").strip()
    t = re.sub(r"^\s*(?:the\s+)?", "", t, flags=re.I)
    out = []
    post = None
    m = re.match(r"^(?:district|dist\.?|hd|sd|ld)\s*(\S+?)(?:,\s*(?:position|seat|post)\s*(\w+))?$", t, re.I)
    if m:
        out.append(m.group(1))
        post = m.group(2)
    m = re.match(r"^(\d+)(?:st|nd|rd|th)?(?:\s+district)?(?:\s+\(.*\))?$", t, re.I)
    if m:
        out.append(m.group(1))
    m = re.match(r"^(?:district\s+)?(\d+)([a-z])\b", t, re.I)
    if m:
        out.append(m.group(1) + m.group(2).upper())
        if abbr == "ID":
            # Idaho's "District 6A" is district 6, seat A: the roster keys the district alone.
            out.append(m.group(1))
            post = post or m.group(2).upper()
    if abbr == "NH" and chamber == "house":
        m = re.match(r"^([A-Za-zö]+)(?:\s+county)?\s+(\d+)(?:st|nd|rd|th)?", t, re.I)
        if m and m.group(1).lower() in NH_COUNTY:
            out.append(NH_COUNTY[m.group(1).lower()] + m.group(2))
    if abbr == "MA":
        # "1st Barnstable district" → "First Barnstable"; "2nd Middlesex" → "Second Middlesex"
        m = re.match(r"^(\d+)(?:st|nd|rd|th)\s+(.+?)(?:\s+district)?$", t, re.I)
        if m:
            n = int(m.group(1))
            word = next((k for k, v in ORDINALS.items() if v == n), None)
            if word:
                out.append(f"{word.title()} {m.group(2)}")
        out.append(re.sub(r"\s+district$", "", t, flags=re.I))
    if abbr == "VT":
        out.append(re.sub(r"\s+district$", "", t, flags=re.I))
    if abbr == "AK" and chamber == "senate":
        m = re.match(r"^(?:district\s+)?([A-T])$", t, re.I)
        if m:
            out.append(m.group(1).upper())
    out.append(t)
    return out, post


def match_district(token, abbr, chamber, roster_keys, target=None):
    cands, post = district_candidates(token, abbr, chamber)
    if target:
        # The link's target spells the district even when its label is mistyped ("5th distrcit").
        m = re.search(r"(\d+)(?:st|nd|rd|th)\b", target)
        if m:
            cands.append(m.group(1))
    by_norm = {norm(k): k for k in roster_keys}
    for c in cands:
        if c in roster_keys:
            return c, post
        if norm(c) in by_norm:
            return by_norm[norm(c)], post
    # Vermont's and Massachusetts's named districts: closest spelling.
    if abbr in ("VT", "MA"):
        best = difflib.get_close_matches(norm(cands[-1]), list(by_norm.keys()), n=1, cutoff=0.85)
        if best:
            return by_norm[best[0]], post
    return None, post


# ── parsing one article ───────────────────────────────────────────────────────

HEADING_RE = re.compile(r"^(={2,5})\s*(.*?)\s*\1\s*$")


def parse_article(text, abbr, chamber, roster_keys):
    found = {}
    unmatched = []
    in_section = False
    section_level = 0
    subsection = ""
    party_from_head = None
    for raw in text.split("\n"):
        h = HEADING_RE.match(raw.strip())
        if h:
            level = len(h.group(1))
            title = clean(unmark(mark_links(h.group(2))))
            if level <= 3 and SECTION_RE.search(title) and not re.search(r"special|results|general election|primary election results", title, re.I):
                in_section = True
                section_level = level
                subsection = ""
                party_from_head = None
                continue
            if in_section and level <= section_level:
                in_section = False
                continue
            if in_section:
                key = title.lower().strip()
                if key in PARTY_HEAD:
                    party_from_head = PARTY_HEAD[key]
                else:
                    subsection = title
                    if key not in PARTY_HEAD:
                        party_from_head = None if level <= section_level + 1 else party_from_head
            continue
        if not in_section:
            continue
        s = raw.strip()
        if not re.match(r"^[#*]+\s*", s):
            continue
        s = re.sub(r"^[#*:]+\s*", "", s)
        s = clean(s)
        if not s:
            continue
        marked = mark_links(s)
        first_link = LINK_RE.search(s)
        link_target = first_link.group(1) if first_link else None
        name = party = district_token = rest = None
        # Family C: name first, "representing district N".
        mC = re.match(r"^«([^»]+)»\s*(\((?:D|R|DFL|I|Ind)[^)]*\))?,?\s*(?:who is |currently )?representing\s+(?:the\s+)?«?(?:district\s+)?([^»,]+?)»?(?:\s+district)?(?:\s*,|\s+since|\s+from)(.*)$", marked, re.I)
        if mC:
            name = mC.group(1)
            party = inline_party(mC.group(2) or "")
            district_token = mC.group(3)
            tail = mC.group(4)
            tail = re.sub(r"^[^,]*,\s*", "", tail) if re.match(r"^\s*(?:since|from)", mC.group(0)[mC.end(3):mC.end(3) + 8]) or True else tail
            rest = re.sub(r"^\s*(?:since|from)\s+[^,]*,\s*", "", mC.group(4)).strip()
            # "since «2022», is retiring" → drop the leading "since …," clause
            rest = re.sub(r"^(?:«[^»]*»|\S+)\s*,\s*", "", rest) if rest.startswith("«") or re.match(r"^\d{4},", rest) else rest
            rest = re.sub(r"^,\s*", "", rest)
        else:
            # Families A/B: "<district>: <rest>", with the colon possibly inside the district's link label.
            mA = re.match(r"^(.{1,60}?)\s*:\s*(.+)$", marked.replace(":»", "»:"))
            if not mA:
                continue
            district_token, rest = mA.group(1), mA.group(2)
            mN = re.match(r"^«([^»]+)»\s*(.*)$", rest)
            if mN:
                name, rest = mN.group(1), mN.group(2)
            else:
                mN = re.match(r"^([A-Z][\w.'\" -]+?)(?=\s+(?:\(|is\b|was\b|did\b|retired\b|resigned\b|ran\b|lost\b|suspended\b|and\b)|,|\.|$)(.*)$", unmark(rest))
                if not mN:
                    continue
                name, rest = mN.group(1).strip(), mN.group(2)
            party = inline_party(rest) or party_from_head
            # Two members on one line (Vermont, South Dakota): "[[A]] and [[B]] are retiring"
        if not name or not district_token:
            continue
        key, post = match_district(district_token, abbr, chamber, roster_keys, None if mC else link_target)
        reason = tidy_reason(rest)
        category = classify(reason, subsection)
        entries = [{"name": name.strip(), "party": party or party_from_head or "?", "category": category, "reason": reason}]
        mTwo = re.match(r"^\s*and\s+«([^»]+)»\s*(.*)$", rest)
        if mTwo:
            entries[0]["reason"] = tidy_reason(mTwo.group(2))
            entries[0]["category"] = classify(entries[0]["reason"], subsection)
            entries.append({"name": mTwo.group(1).strip(), "party": entries[0]["party"], "category": entries[0]["category"], "reason": entries[0]["reason"]})
        if post:
            for e in entries:
                e["post"] = post
        if key is None:
            unmatched.append({"district": unmark(district_token), "line": unmark(s)[:160]})
            continue
        bucket = found.setdefault(key, [])
        for e in entries:
            if not any(x["name"] == e["name"] for x in bucket):
                bucket.append(e)
    return found, unmatched


def load_roster():
    src = open(os.path.join(ROOT, "data", "stateLegDistricts.ts"), encoding="utf-8").read()
    body = src[src.index("{", src.index("export const stateLegDistricts")):]
    return json.loads(body[: body.rindex("}") + 1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("states", nargs="*")
    ap.add_argument("--cache", default=DEFAULT_CACHE)
    ap.add_argument("--report", action="store_true", help="print, do not write")
    args = ap.parse_args()
    roster = load_roster()
    abbrs = [s.upper() for s in args.states] or sorted(a for a in STATES if a not in NOT_UP_2026)
    os.makedirs(OUT_DIR, exist_ok=True)
    total = 0
    for abbr in abbrs:
        chambers = ["senate"] if abbr == "NE" else (["house"] if abbr in NO_SENATE_2026 else ["house", "senate"])
        out = {"meta": {"fetched": datetime.date.today().isoformat(), "titles": {}, "unmatched": []}}
        for chamber in chambers:
            title = title_for(abbr, chamber)
            text = fetch_wikitext(title, args.cache)
            out["meta"]["titles"][chamber] = title
            if text is None:
                print(f"{abbr} {chamber}: no article ({title})", file=sys.stderr)
                continue
            keys = [d["number"] for d in roster.get(abbr, {}).get(chamber, [])]
            found, unmatched = parse_article(text, abbr, chamber, keys)
            out[chamber] = dict(sorted(found.items()))
            out["meta"]["unmatched"].extend({"chamber": chamber, **u} for u in unmatched)
            n = sum(len(v) for v in found.values())
            total += n
            cats = {}
            for v in found.values():
                for e in v:
                    cats[e["category"]] = cats.get(e["category"], 0) + 1
            unk = sum(1 for v in found.values() for e in v if e["party"] == "?")
            print(f"{abbr} {chamber}: {n} outgoing in {len(found)} districts · {dict(sorted(cats.items()))}{f' · {unk} without party' if unk else ''}{f' · {len(unmatched)} UNMATCHED' if unmatched else ''}")
            for u in unmatched[:4]:
                print(f"    unmatched {u['district']!r}: {u['line'][:100]}")
        if not args.report:
            with open(os.path.join(OUT_DIR, f"{abbr}.json"), "w", encoding="utf-8") as f:
                json.dump(out, f, indent=1, ensure_ascii=False)
                f.write("\n")
    print(f"total outgoing incumbents: {total}")


if __name__ == "__main__":
    main()
