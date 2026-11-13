"""Shared pieces of the 2026 official-results pipeline (scripts/results_2026/).

Every adapter turns one source format into `Row`s, one per candidate per reporting unit:

    office    house | senate | governor | state_house | state_senate
    state     USPS abbreviation
    seat      house "1".."53" ("1" for at-large), senate/governor "" (special = 1 tells a
              Senate special apart), state-leg the district as the state numbers it, letter
              suffix kept ("34A", "12B"), separately filed positions as "-P1"/"-P2" (WA)
    level     state | county | precinct
    unit      county FIPS for county rows; "<county FIPS>:<precinct id>" for precinct rows
"""
import csv, gzip, json, re, unicodedata
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENTRY = ROOT / "data-entry"
OUT = ENTRY / "results-2026"
RAW = OUT / "raw"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"}

OFFICES = ["senate", "governor", "house", "state_house", "state_senate"]

STATE_FIPS = {"AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10", "FL": "12", "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21", "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39", "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53", "WV": "54", "WI": "55", "WY": "56"}
STATES = list(STATE_FIPS)


@dataclass
class Row:
    office: str
    state: str
    seat: str
    special: int
    level: str
    unit: str            # "" for state rows
    unit_name: str
    candidate: str
    party: str           # as the source prints it
    votes: int
    county_fips: str = ""
    winner: str = ""     # "1" / "0" / "" (source doesn't say)
    incumbent: str = ""
    vote_for: int = 1
    contest: str = ""    # the source's contest name, for the audit trail
    extra: dict = field(default_factory=dict)


def race_key(office, state, seat, special):
    return (office, state, seat, int(special))


# ---------------------------------------------------------------- party

_PARTY = [
    (r"^(d|dem|democrat|democratic|dfl|democratic-farmer-labor|democratic-npl|dem-npl)\b", "D"),
    (r"democrat", "D"),
    (r"^(r|rep|gop|republican)\b", "R"),
    (r"republican", "R"),
    (r"^(l|lib|lbt|libertarian)\b", "L"),
    (r"^(g|grn|gre|green)\b", "G"),
    (r"^(i|ind|independent|np|nonpartisan|non-partisan|una|unaffiliated|no party|npa|nop|nonpartisan)\b", "I"),
]


def party_simple(raw, candidate=""):
    if is_write_in(candidate) or re.search(r"write", raw or "", re.I):
        return "W"
    p = (raw or "").strip().lower().strip("()")
    for pat, code in _PARTY:
        if re.search(pat, p):
            return code
    return "O" if p else "I"


def is_write_in(name):
    return bool(re.search(r"write[\s-]*in|^scattering$|^scatter$|^over ?votes?$|^under ?votes?$", name or "", re.I))


def is_overunder(name):
    return bool(re.search(r"^(over|under|blank)\s*votes?$|^overvotes|^undervotes|^blank", name or "", re.I))


# ---------------------------------------------------------------- names

_SMALL = {"de", "la", "van", "von", "der", "del", "di", "du", "le", "da"}


def tidy_name(name):
    """Source names in ALL CAPS read as title case; mixed-case names are left alone."""
    n = re.sub(r"\s+", " ", (name or "").replace(" ", " ")).strip()
    if n.upper() != n or not re.search(r"[A-Z]", n):
        return n
    out = []
    for w in n.split(" "):
        lw = w.lower()
        if lw in _SMALL and out:
            out.append(lw); continue
        t = "-".join(p[:1].upper() + p[1:] for p in lw.split("-"))
        t = re.sub(r"^Mc(\w)", lambda m: "Mc" + m.group(1).upper(), t)
        t = re.sub(r"^O'(\w)", lambda m: "O'" + m.group(1).upper(), t)
        t = re.sub(r"\b(Ii|Iii|Iv)\b", lambda m: m.group(1).upper(), t)
        out.append(t)
    return " ".join(out)


def name_key(name):
    """Surname-ish key for matching one source's candidate to another's."""
    n = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    n = re.sub(r"\(.*?\)|\".*?\"|'.*?'", " ", n)
    n = re.sub(r"\b(jr|sr|ii|iii|iv|dr|md)\b\.?", " ", n)
    parts = [p for p in re.split(r"[^a-z]+", n) if p]
    return parts[-1] if parts else ""


# ---------------------------------------------------------------- counties

_COUNTIES = None


def _norm_county(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ").replace("saint ", "st ").replace("st. ", "st ").replace("ste. ", "ste ")
    s = re.sub(r"\b(county|parish|borough|census area|municipality|city and borough)\b", " ", s)
    return re.sub(r"[^a-z]", "", s)


def county_fips(state, name):
    """County FIPS from a county name, or "" when the name is unknown or ambiguous (VA's
    "Fairfax" is both a county and a city: "Fairfax City" / "Fairfax County" resolve)."""
    global _COUNTIES
    if _COUNTIES is None:
        _COUNTIES = {}
        with (ROOT / "data" / "county_template.csv").open() as f:
            for r in csv.DictReader(f):
                _COUNTIES.setdefault((r["state"], _norm_county(r["county_name"])), []).append(r["county_id"])
    raw = name or ""
    hits = _COUNTIES.get((state, _norm_county(raw)), [])
    if len(hits) > 1:
        city = bool(re.search(r"\bcity\b", raw, re.I)) and not re.search(r"charles city|james city", raw, re.I)
        hits = [h for h in hits if (int(h[2:]) >= 500) == city]
    return hits[0] if len(hits) == 1 else ""


# ---------------------------------------------------------------- contests

_ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}
_NOT_ONE_OF_OURS = re.compile(r"lieut|attorney|secretary|treasurer|auditor|comptroller|controller|commissioner|judge|justice|court|school|question|amendment|proposition|measure|board|council|primary|committee|retain|retention|recall|referend|initiative|advisory|precinct", re.I)
SPECIAL_RE = re.compile(r"special|unexpired|vacancy|short term", re.I)


def seat_from(text):
    """District key from a contest's district text: "District No. 01" → "1", "34 Seat A" /
    "34A" → "34A", "Dist II" → "2", "District 29 Position 2" / "Pos. 2" → "29-P2"."""
    t = re.sub(r"\(.*?\)", " ", text or "")
    pos = re.search(r"\b(?:position|pos\.?)\s*(\d+)", t, re.I)
    t = re.sub(r"\b(?:position|pos\.?)\s*\d+", " ", t, flags=re.I)
    m = re.search(r"(?:district|dist\.?|no\.)\s*(?:no\.?\s*)?(\d+)\s*(?:seat\s*)?([A-Z])?\b", t, re.I) \
        or re.search(r"\b(\d+)(?:ST|ND|RD|TH|st|nd|rd|th)\b()", t) \
        or re.search(r"\b(\d+)\s*(?:seat\s*)?([A-Z])?\b", t)
    if m:
        seat = str(int(m.group(1))) + (m.group(2) or "").upper()
    else:
        r = re.search(r"\b(?:district|dist\.?)\s*([IVX]+)\b", t, re.I)
        if not r:
            return ""
        seat = str(_ROMAN.get(r.group(1), 0))
    return seat + (f"-P{int(pos.group(1))}" if pos else "")


def classify(name):
    """(office, seat, special) for a contest name printed by a state, or None for any contest
    that is not one of our five offices."""
    n = re.sub(r"\s+", " ", name or "").strip()
    special = 1 if SPECIAL_RE.search(n) else 0
    if re.search(r"^(for )?governor\b|governor (and|&) l", n, re.I):
        return ("governor", "", 0)
    if _NOT_ONE_OF_OURS.search(n):
        return None
    if re.search(r"(u\.?\s?s\.?|united states)\s*senat", n, re.I):
        return ("senate", "", special)
    if re.search(r"(u\.?\s?s\.?|united states)\s*(house|rep)|congress", n, re.I):
        return ("house", seat_from(n) or "1", special)
    if re.search(r"state senat|^senat|legislative district .* senator|nc state senate", n, re.I):
        return ("state_senate", seat_from(n), special)
    if re.search(r"state rep|house of rep|state house|assembly|delegate|^representative", n, re.I):
        return ("state_house", seat_from(n), special)
    return None


def nyt_seat(label):
    """Seat key for an NYT state-leg label: "District 1 - Position 2" → "1-P2", "Position 10A" →
    "10A", "District 11A" → "11A"; named districts (NH, VT, MA) keep the label, folded."""
    m = re.fullmatch(r"(?:District|Position)\s+(\d+)([A-Z]?)(?:\s*-\s*Position\s+(\d+))?", label.strip())
    if m:
        return str(int(m.group(1))) + m.group(2) + (f"-P{m.group(3)}" if m.group(3) else "")
    return re.sub(r"[^a-z0-9]", "", label.lower())


# ---------------------------------------------------------------- io

def write_csv(path, fields, rows, gz=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    opener = (lambda: gzip.open(path, "wt", newline="")) if gz else (lambda: path.open("w", newline=""))
    with opener() as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def read_json(path):
    path = Path(path)
    if path.suffix == ".gz":
        with gzip.open(path, "rt") as f:
            return json.load(f)
    with path.open() as f:
        return json.load(f)


def sources():
    with (OUT / "sources.csv").open() as f:
        return [r for r in csv.DictReader(f) if not r["state"].startswith("#")]


def num(v):
    if v in (None, ""):
        return 0
    if isinstance(v, (int, float)):
        return int(v)
    return int(float(str(v).replace(",", "").strip() or 0))
