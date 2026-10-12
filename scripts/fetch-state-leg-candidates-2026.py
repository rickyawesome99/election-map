#!/usr/bin/env python3
"""2026 general-election candidates for every state legislative district, from Ballotpedia's
chamber election pages ("<State> House of Representatives elections, 2026", "<State> State
Senate elections, 2026" and the Assembly / House of Delegates / General Assembly variants).

Each page carries a "<Chamber> general election 2026" table: one row per district with the
Democratic, Republican and Other candidates, "(i)" after an incumbent's name, "(N seats)" on a
multi-member district, and a party or "(Write-in)" tag on the Other column's entries. That table
is read here; the race boxes on the same page only exist for the districts Ballotpedia profiles.
(Ballotpedia refuses `action=raw`, so the rendered HTML is fetched with a browser user agent and
cached in --cache; a chamber not on the 2026 ballot has no page and is skipped.)

District keys are matched to the boundary data's own keys (data/stateLegDistricts.ts): numbers
directly, New Hampshire's "Belknap 1" -> "BE1", named districts by the same normalisation the
results join uses. Unmatched rows are reported, never guessed.

Output: data-entry/state-leg-candidates-2026/{ST}.json, chamber -> district -> {seats, candidates:
[{name, party D/R/O, partyLabel, incumbent, writeIn}]}. Built into data/stateLegCandidates2026.ts by
scripts/build-state-leg-candidates-2026.mjs.

Usage:
  python3 scripts/fetch-state-leg-candidates-2026.py            # every chamber
  python3 scripts/fetch-state-leg-candidates-2026.py OH NH      # some states
"""

import html as htmllib
import importlib.util
import json
import os
import re
import sys
import time
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, "data-entry", "state-leg-candidates-2026")
CACHE = os.environ.get("BP_CACHE", "/private/tmp/claude-501/-Users-rickyjia-election-map/adf92712-f251-4b6b-b71d-0031860b78a1/scratchpad/bp")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
YEAR = 2026

LOWER_NAMES = {
    "New Jersey": "General Assembly", "Virginia": "House of Delegates", "Maryland": "House of Delegates",
    "West Virginia": "House of Delegates", "California": "State Assembly", "New York": "State Assembly",
    "Nevada": "State Assembly", "Wisconsin": "State Assembly",
}
NH_COUNTY = {"Belknap": "BE", "Carroll": "CA", "Cheshire": "CH", "Coos": "CO", "Grafton": "GR",
             "Hillsborough": "HI", "Merrimack": "ME", "Rockingham": "RO", "Strafford": "ST", "Sullivan": "SU"}


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(REPO, "scripts", filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


flags = _load("flags", "derive-state-leg-candidate-flags.py")


def state_names():
    text = open(os.path.join(REPO, "data", "statesData.ts"), encoding="utf-8").read()
    return {m.group(2): m.group(1) for m in re.finditer(r'name: "([^"]+)",\s*abbr: "([A-Z]{2})"', text)}


def fetch(title):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, title.replace(" ", "_").replace("/", "_") + ".html")
    if os.path.exists(path):
        return open(path, encoding="utf-8", errors="replace").read()
    url = "https://ballotpedia.org/" + urllib.request.quote(title.replace(" ", "_"))
    time.sleep(1.2)
    try:
        req = urllib.request.Request(url, headers=UA)
        body = urllib.request.urlopen(req).read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            open(path, "w").write("")
            return ""
        raise
    open(path, "w", encoding="utf-8").write(body)
    return body


def strip(s):
    return htmllib.unescape(re.sub(r"<[^>]+>", "", s)).replace("\xa0", " ").strip()


def normalize(s):
    return re.sub(r"[^a-z0-9]", "", re.sub(r"\band\b", " ", s.lower()))


WORD_ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
            "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"]


DIGIT_ORD = {1: "First", 2: "Second", 3: "Third", 4: "Fourth", 5: "Fifth", 6: "Sixth", 7: "Seventh", 8: "Eighth",
             9: "Ninth", 10: "Tenth", 11: "Eleventh", 12: "Twelfth", 13: "Thirteenth", 14: "Fourteenth", 15: "Fifteenth",
             16: "Sixteenth", 17: "Seventeenth", 18: "Eighteenth", 19: "Nineteenth", 20: "Twentieth"}


def split_post(abbr, chamber, office):
    """Idaho 'District 1A' / Washington 'District 1-Position 1' are per-post races in one district:
    -> ('District 1', 'A' / '1'). Everything else -> (office, None)."""
    if (abbr, chamber) == ("ID", "house"):
        m = re.match(r"^(District\s+\d+)([AB])$", office)
        if m:
            return m.group(1), m.group(2)
    if (abbr, chamber) == ("WA", "house"):
        m = re.match(r"^(District\s+\d+)-Position\s+(\d)$", office)
        if m:
            return m.group(1), m.group(2)
    return office, None


def district_key(abbr, chamber, office, roster_keys):
    """'District 31' -> '31'; 'District 1 (2 seats)' -> '1'; NH 'Belknap 1' -> 'BE1'; names by lookup."""
    office = re.sub(r"\(\d+ seats?\)", "", office).strip()
    office, _post = split_post(abbr, chamber, office)
    m = re.match(r"^District\s+([0-9]+[A-Za-z]?)$", office)
    if m:
        k = m.group(1).lstrip("0") or "0"
        if k in roster_keys:
            return k
        # Hillsborough-style zero padding or lettered keys.
        for cand in (k, k.upper(), k.zfill(2)):
            if cand in roster_keys:
                return cand
        return k if k in roster_keys else None
    if abbr == "NH" and chamber == "house":
        m = re.match(r"^(\w+)\s+(\d+)$", office)
        if m and m.group(1) in NH_COUNTY:
            n = int(m.group(2))
            for cand in (f"{NH_COUNTY[m.group(1)]}{n}", f"{NH_COUNTY[m.group(1)]}{n:02d}"):
                if cand in roster_keys:
                    return cand
        return None
    if abbr == "AK" and chamber == "senate":
        m = re.match(r"^District\s+([A-Z])$", office)
        return m.group(1) if m and m.group(1) in roster_keys else None
    # Named districts (VT, MA): normalise both sides, with word ordinals folded to digits.
    norm = {normalize(k): k for k in roster_keys}
    cands = [office, re.sub(r"\s*District$", "", office)]
    for i, w in enumerate(WORD_ORD):
        if w and office.lower().startswith(w + " "):
            cands.append(f"{i}{'st' if i % 10 == 1 and i != 11 else 'nd' if i % 10 == 2 and i != 12 else 'rd' if i % 10 == 3 and i != 13 else 'th'} " + office[len(w) + 1:])
    # Ballotpedia writes Massachusetts's ordinals as digits ("1st Essex") where the roster spells
    # them out ("First Essex"); the House keys are digit ordinals already.
    m = re.match(r"^(\d+)(?:st|nd|rd|th)\s+(.*?)(?:\s+District)?$", office)
    if m and int(m.group(1)) in DIGIT_ORD:
        cands.append(f"{DIGIT_ORD[int(m.group(1))]} {m.group(2)}")
    for c in cands:
        hit = norm.get(normalize(c))
        if hit:
            return hit
    # Last resort for a misspelt name ("Windham-Windsor-Bennigton"): the closest roster key when
    # it is unambiguous.
    import difflib
    close = difflib.get_close_matches(normalize(re.sub(r"\s*District$", "", office)), list(norm), n=2, cutoff=0.9)
    if len(close) == 1:
        return norm[close[0]]
    return None


def parse_candidates(cell, column_party):
    """A table cell -> list of candidate dicts. Several candidates are separated by newlines."""
    text = htmllib.unescape(re.sub(r"<br\s*/?>", "\n", cell))
    text = re.sub(r"<[^>]+>", "", text).replace("\xa0", " ")
    out = []
    for line in re.split(r"\n+|\t{2,}", text):
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue
        # A cell can carry a sub-list of people who are NOT on the ballot; nothing after it counts.
        if re.search(r"did not make the ballot|withdr|disqualif|removed from the ballot", line, re.IGNORECASE):
            break
        if re.search(r"general election was canceled", line, re.IGNORECASE):
            return [{"canceled": True}]
        # Primary-table furniture: "The Democratic primary was canceled." carries no name; "The
        # Republican primary was canceled and this candidate advanced: Name" carries it after the colon.
        if re.search(r"primary was canceled", line, re.IGNORECASE):
            if ":" in line:
                line = line.split(":", 1)[1].strip()
            else:
                continue
        line = line.rstrip("*").strip()
        write_in = bool(re.search(r"\(write-?in\)", line, re.IGNORECASE))
        line = re.sub(r"\(write-?in\)", "", line, flags=re.IGNORECASE)
        incumbent = "(i)" in line
        line = line.replace("(i)", "")
        label = None
        pm = re.search(r"\(([^()]+)\)\s*$", line.strip())
        if pm and column_party == "O":
            label = pm.group(1).strip()
            line = line[: pm.start()]
        name = line.strip(" ,")
        if not name:
            continue
        party = column_party
        if label:
            ll = label.lower()
            if "democrat" in ll:
                party = "D"
            elif "republican" in ll:
                party = "R"
        entry = {"name": name, "party": party}
        if label:
            entry["partyLabel"] = label
        if incumbent:
            entry["incumbent"] = True
        if write_in:
            entry["writeIn"] = True
        out.append(entry)
    return out


def parse_table(page, chamber_name, kind="general election"):
    """-> (rows, caption) for the candidate table of `kind` ("general election" / "primary"), or (None, None)."""
    for m in re.finditer(r'<table[^>]*candidateListTablePartisan[^>]*>(.*?)</table>', page, re.S):
        tbl = m.group(1)
        if not re.search(kind + r",?\s*2026", tbl, re.IGNORECASE):
            continue
        if kind == "primary" and re.search(r"primary runoff,?\s*2026", tbl, re.IGNORECASE):
            continue
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tbl, re.S)
        header = None
        out = []
        for r in rows:
            cells = re.findall(r"<t([dh])[^>]*>(.*?)</t[dh]>", r, re.S)
            texts = [strip(c[1]) for c in cells]
            if texts and texts[0] == "Office":
                header = texts
                continue
            if header is None or len(cells) < 2:
                continue
            out.append((texts[0], [c[1] for c in cells[1:]], header[1:]))
        if out:
            return out, chamber_name
    # Nebraska's nonpartisan Legislature: a plain table headed Office | Candidates, every name an
    # anchor, "(i)" after the incumbent's. Emitted with the party column named "Nonpartisan".
    for m in re.finditer(r'<table[^>]*class="wikitable[^"]*"[^>]*>(.*?)</table>', page, re.S):
        tbl = m.group(1)
        if not re.search(r"general election,?\s*2026", tbl, re.IGNORECASE):
            continue
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tbl, re.S)
        header = None
        out = []
        for r in rows:
            cells = re.findall(r"<t([dh])[^>]*>(.*?)</t[dh]>", r, re.S)
            texts = [strip(c[1]) for c in cells]
            if texts and texts[0] == "Office":
                header = texts
                continue
            if header is None or len(cells) < 2 or header[1:2] != ["Candidates"]:
                continue
            # One anchor per candidate; the "(i)" that follows an anchor belongs to it.
            parts = re.split(r"(?=<a )", cells[1][1])
            cell = "<br>".join(p for p in parts if "<a " in p)
            out.append((texts[0], [cell], ["Nonpartisan"]))
        if out:
            return out, chamber_name
    return None, None


def main():
    names = state_names()
    only = [a.upper() for a in sys.argv[1:]]
    roster = flags.load_ts_object(flags.ROSTER_TS, "stateLegDistricts")
    os.makedirs(OUT_DIR, exist_ok=True)
    summary = []
    for abbr in sorted(roster):
        if only and abbr not in only:
            continue
        state = names[abbr]
        result = {"meta": {"source": "Ballotpedia chamber election pages, 2026", "fetched": time.strftime("%Y-%m-%d")}}
        for chamber in ("house", "senate"):
            districts = roster[abbr].get(chamber)
            if not districts:
                continue
            roster_keys = {d["number"] for d in districts}
            up_keys = {d["number"] for d in districts if (d.get("nextElection") == YEAR or any((i.get("nextElection") or d.get("nextElection")) == YEAR for i in (d.get("incumbents") or [])))}
            if chamber == "senate":
                titles = [f"{state} State Senate elections, {YEAR}"]
            else:
                titles = [f"{state} {LOWER_NAMES[state]} elections, {YEAR}"] if state in LOWER_NAMES else []
                titles += [f"{state} House of Representatives elections, {YEAR}", f"{state} House elections, {YEAR}"]
            rows, title, primary_rows = None, None, None
            for t in titles:
                page = fetch(t)
                if not page:
                    continue
                rows, title = parse_table(page, t)
                if rows:
                    primary_rows, _ = parse_table(page, t, "primary")
                    break
            primary_by_office = {office: (cells, header) for office, cells, header in (primary_rows or [])}
            if not rows:
                summary.append((abbr, chamber, len(up_keys), "no table" if up_keys else "not up"))
                continue
            out = {}
            unmatched = []
            for office, cells, header in rows:
                key = district_key(abbr, chamber, office, roster_keys)
                if key is None:
                    unmatched.append(office)
                    continue
                _, post = split_post(abbr, chamber, re.sub(r"\(\d+ seats?\)", "", office).strip())
                seats_m = re.search(r"\((\d+) seats?\)", office)
                cands = []
                canceled = any(re.search(r"general election was canceled", strip(c), re.IGNORECASE) for c in cells)
                if canceled:
                    # Oklahoma cancels a general with a sole filer: the seat goes to that filer, who is
                    # the only name in the primary table's single party column. Several names in one
                    # party mean a primary decided it; the party is still decided, the name is not.
                    pc = primary_by_office.get(office)
                    pcands = []
                    if pc:
                        for cell, col in zip(pc[0], pc[1]):
                            cl = col.lower()
                            party = "D" if "democrat" in cl else "R" if "republican" in cl else "O"
                            pcands.extend([c for c in parse_candidates(cell, party) if not c.get("canceled")])
                    parties = {c["party"] for c in pcands}
                    if len(parties) == 1 and pcands:
                        cands = [{**c, "canceledGeneral": True} for c in pcands]
                    else:
                        cands = [{"name": "General election canceled", "party": "O", "canceledGeneral": True}]
                    rec = out.setdefault(key, {"candidates": []})
                    rec["candidates"].extend(cands)
                    continue
                for cell, col in zip(cells, header):
                    cl = col.lower()
                    party = "D" if "democrat" in cl else "R" if "republican" in cl else "O"
                    for c in parse_candidates(cell, party):
                        if post:
                            c["post"] = post
                        if col == "Nonpartisan":
                            c["partyLabel"] = "Nonpartisan"
                        cands.append(c)
                rec = out.setdefault(key, {"candidates": []})
                rec["candidates"].extend(cands)
                if seats_m:
                    rec["seats"] = int(seats_m.group(1))
                elif post:
                    rec["seats"] = max(rec.get("seats", 0), len({c.get("post") for c in rec["candidates"]}))
            result[chamber] = out
            uncontested = sum(1 for r in out.values() if len({c["party"] for c in r["candidates"] if not c.get("writeIn")} & {"D", "R"}) < 2)
            inc = sum(1 for r in out.values() for c in r["candidates"] if c.get("incumbent"))
            missing = sorted(up_keys - set(out))
            summary.append((abbr, chamber, len(up_keys), f"{len(out)} districts, {uncontested} without both majors, {inc} incumbents running"
                            + (f", {len(unmatched)} unmatched rows {unmatched[:3]}" if unmatched else "")
                            + (f", {len(missing)} up-seats missing {missing[:5]}" if missing else "")))
        with open(os.path.join(OUT_DIR, f"{abbr}.json"), "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=1, sort_keys=True)
            fh.write("\n")
    for s in summary:
        print(f"{s[0]} {s[1]:6s} up={s[2]:3d}  {s[3]}")


if __name__ == "__main__":
    main()
