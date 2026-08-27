"""
Derives 2024 presidential results per CURRENT state legislative district for states where
scripts/crosswalk-state-leg-pres2024.py's method can't apply at all - no simultaneous Nov 2024
state-legislative race exists to borrow a district label from, either because the state elects
its legislature in ODD years (LA, NJ, VA - Tier 1b) or because the CURRENT map postdates the 2024
election entirely (MS, MI Senate - Tier 2). Unlike those states, there's no shortcut through
another chamber's same-year data either (checked: LA/NJ/VA's House and Senate are BOTH odd-year;
MS's 2025 remedial map has no matching election at all yet).

Method: a real spatial join, precinct-by-precinct, using 2020 Census VTDs (Census's official
precinct-equivalent geometry, from the once-per-decade redistricting release - there is no VTD
product for any other year) as the geometry source, joined to MEDSL's 2024 precinct-level
US PRESIDENT vote counts by precinct number, then overlaid onto the CURRENT (2026-effective)
district boundaries. This is a genuine improvement in precision over the House-district-overlay
estimate used to fill staggered-Senate gaps elsewhere in this project (real precincts are far
smaller than House districts, so the "uniform density within the unit" assumption this method
still relies on for any SPLIT precinct is far safer here).

Join key discovery (Virginia, confirmed): MEDSL's VA precinct names are "NNN - NAME" (e.g.
"102 - CERES"); the VTD shapefile's VTDST20 field for the same real-world precinct is "000102"
in the same county - i.e. the leading number IS the VTD code, just differently padded. This
naming convention needs re-verification per state (not assumed to generalize) - LA/NJ/MS may
each use a different scheme, matching the pattern of gotchas already hit for the direct
crosswalk. A small fraction of precincts (VA: ~5%) don't have a clean numeric-prefix name (e.g.
"COUNTY PROVISIONALS" aggregates) and are simply left unmatched - same graceful-degradation
convention as an unmatched precinct anywhere else in this project.

Louisiana (added later) uses the Legislature's own 2024 precinct shapefile instead of the Census VTDs and
scales election-day-only precinct votes up to certified parish totals (COUNTY_TOTAL_SCALING). Maryland (added later) is the plain key method plus per-state KEY_FALLBACKS/VTD_AUGMENT hooks for its
"-000" whole-election-district and post-2020 split-precinct codes. Alabama (added later) is the same method but with a per-county NAME matcher instead of a per-precinct
key - see the AL section and COUNTY_MATCHERS below.

Usage: python3 scripts/spatial-join-state-leg-pres2024.py <ABBR> <medsl-precinct-csv> <vtd-shapefile-dir>
Writes data-entry/state-leg-pres2024/{ABBR}.json (both chambers, from scratch - this fully
replaces the direct-crosswalk output for a Tier 1b/Tier 2 state, since none exists for these).
"""
import collections
import difflib
import importlib.util
import json
import os
import re
import sys
from collections import defaultdict

import geopandas as gpd
from shapely.geometry import shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data-entry", "state-leg-pres2024")
HOUSE_SRC = f"{ROOT}/data-entry/state-leg-districts-2026-source/state-house-districts-2026.json"
SENATE_SRC = f"{ROOT}/data-entry/state-leg-districts-2026-source/state-senate-districts-2026.json"

# Reuse the crosswalk script's mode-collapsing/party-bucketing/non-candidate-row logic instead of
# duplicating it - both scripts face the identical MEDSL US PRESIDENT row quirks.
_xw_spec = importlib.util.spec_from_file_location("xw", os.path.join(os.path.dirname(__file__), "crosswalk-state-leg-pres2024.py"))
xw = importlib.util.module_from_spec(_xw_spec)
_xw_spec.loader.exec_module(xw)

sys.path.insert(0, os.path.dirname(__file__))
_fg_spec = importlib.util.spec_from_file_location("fg", os.path.join(os.path.dirname(__file__), "fill-state-leg-pres2024-gaps.py"))
fg = importlib.util.module_from_spec(_fg_spec)
_fg_spec.loader.exec_module(fg)


# Per-state: how to turn a MEDSL precinct name AND a VTD row into the SAME join key. Confirmed
# by direct inspection that each state's convention is genuinely different (same pattern as
# every other per-state quirk in this project) - VTDST20's own encoding scheme isn't always
# usable directly, so some states match on a key parsed from each side's NAME field instead:
#   VA: precinct "102 - CERES" -> leading number 102, matched against VTDST20 "000102" as int.
#   LA: see the Louisiana section / COUNTY_MATCHERS below (first-attempt key func removed).
#   NJ: see the New Jersey section / COUNTY_MATCHERS below (first-attempt key func removed).
def _va_precinct_key(precinct, county_fips=None):
    m = re.match(r"^(\d+)\s*-?\s*", precinct.strip())
    return int(m.group(1)) if m else None


# Mississippi: precincts are NAMED (real place names, e.g. "Bellemont"), not numbered - MEDSL
# reports these under at least THREE different prefix conventions ("Dist. 1, Bellemont
# Precinct", "127 - Bailey", or a bare name), while the VTD's NAME20 for the same real precinct
# is just "Bellemont" - normalize both sides to strip whichever prefix/generic facility word is
# present, then match on the resulting bare name WITHIN THE SAME COUNTY (names aren't unique
# statewide, but are locally). A THIRD wrinkle found in some counties (e.g. Lauderdale, 28075):
# some precincts are numbered rather than named, and MEDSL spells the number out ("One", "Five")
# while the VTD side gives the bare digit ("1", "5") - converted via _MS_WORD_TO_NUM.
# Second batch of strip words (church/baptist/umc/library/...) added for the MARIS 2023 county precinct
# files, which name precincts ("Boulevard Baptist", "Walls Library", "Twin Lakes") where MEDSL names
# the polling place ("Boulevard Baptist Church", "Walls", "Twin Lakes Baptist Church").
_MS_STRIP_WORDS = r"(precinct|fire\s*precinct|fire\s*station|firestation|multi\s*purpose|bldg\.?|building|school|community\s*center|center|hgts\.?|heights|church|baptist|umc|methodist|united|presbyterian|missionary|m\.?b\.?|library|gym|gymnasium|voting|vfd)"
_MS_WORD_TO_NUM = {
    "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7",
    "eight": "8", "nine": "9", "ten": "10", "eleven": "11", "twelve": "12", "thirteen": "13",
    "fourteen": "14", "fifteen": "15", "sixteen": "16", "seventeen": "17", "eighteen": "18",
    "nineteen": "19", "twenty": "20", "zero": "0",
}


def _ms_normalize_name(s):
    s = (s or "").strip().lower()
    s = re.sub(r"^dist\.?\s*\d+,\s*", "", s)          # "Dist. 1, " prefix
    s = re.sub(r"^\d+(st|nd|rd|th)\s+district\s+", "", s)  # "2nd District " prefix
    s = re.sub(r"^\(\s*\d+\s*\)\s*", "", s)           # "(01) " parenthesized-number prefix
    s = re.sub(r"^\d+\s*[-\s]\s*", "", s)             # "127 - " or "1 " leading-number prefix
    s = re.sub(rf"\b{_MS_STRIP_WORDS}\b", "", s)
    s = re.sub(r"[^a-z0-9\s]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return _MS_WORD_TO_NUM.get(s, s)


def _ms_precinct_key(precinct, county_fips=None):
    key = _ms_normalize_name(precinct)
    return key or None


def _ms_vtd_key(name20):
    key = _ms_normalize_name(name20)
    return key or None


# Michigan: MEDSL precincts read "{MUNICIPALITY} {TOWNSHIP|CITY|CHARTER TOWNSHIP|TWP} {precinct
# num} Ward {ward num}{optional split-letter}" (e.g. "HOLLAND CITY 11 Ward 5",
# "LIVONIA CITY 14 Ward 0A"). The VTD shapefile's NAME20 is NOT the muni name at all - it's an
# opaque compound numeric code: COUNTYFP(3) + the county subdivision's COUSUBFP with its
# (always-present) trailing zero dropped (4) + ward(3, zero-padded) + precinct(3-4, zero-padded,
# with a trailing split-letter for the ~1% of precincts split across polling locations, e.g.
# Livonia's "1634900000014A" = county 163 + Livonia's COUSUBFP 49000->"4900" + ward "000" +
# precinct "014" + split "A"). Confirmed by cross-referencing tl_2020_26_cousub.shp's
# (COUNTYFP, NAME, LSAD, COUSUBFP) against known precinct names - LSAD "25" is an MI city MCD,
# "44"/"49" is a township/charter township (charter status doesn't change the code, just the
# LSAD digit and MEDSL's optional "CHARTER" word). A city and a township of the SAME name can
# coexist as separate MCDs in the same county (e.g. Allegan county has both "Allegan city" and
# "Allegan township") so the join key must carry county+name+type together, not just name.
# Detroit (Wayne county, COUSUBFP 22000) never matched against the CENSUS file (its 2020 VTD codes
# don't decode this way). Fixed by swapping the geometry source for the Michigan Department of
# State's "2024 Voting Precincts" layer (gis-michigan.opendata.arcgis.com; REST:
# gisagocss.state.mi.us/arcgis/rest/services/OpenData/boundaries/MapServer/9, fields COUNTYFIPS/
# MCDFIPS/WARD/PRECINCT) - its fields are exactly the components of this 13-digit code, so the layer
# is exported to a shapefile with a synthesized NAME20 = COUNTYFIPS + MCDFIPS[:4] + WARD(3) +
# PRECINCT(3) and everything below runs unchanged. Detroit's precincts sit in wards 01-07 there
# while MEDSL reports "Ward 0" (plus an absentee counting-board suffix, "963 Ward 0CB"), handled by
# KEY_FALLBACKS/VTD_AUGMENT for MI (suffix strip, then ward wildcard where the precinct number is
# unique in the municipality).
_MI_MUNI_TYPE_RE = re.compile(
    r"^(.+?)\s+(CHARTER\s+TOWNSHIP|CHARTER\s+TWP|TOWNSHIP|TWP|CITY)\s+(\d+)\s+WARD\s+(\d+)([A-Za-z]*)$",
    re.IGNORECASE,
)

MI_MUNI_CODE = {}  # (county_fips, muni_name upper, "CITY"|"TOWNSHIP") -> 4-digit COUSUBFP code


def load_mi_muni_codes(cousub_shp):
    gdf = gpd.read_file(cousub_shp)
    for _, row in gdf.iterrows():
        if row["LSAD"] == "25":
            mtype = "CITY"
        elif row["LSAD"] in ("44", "49"):
            mtype = "TOWNSHIP"
        else:
            continue
        county_fips = "26" + row["COUNTYFP"]
        MI_MUNI_CODE[(county_fips, row["NAME"].strip().upper(), mtype)] = row["COUSUBFP"][:4]
    print(f"MI: loaded {len(MI_MUNI_CODE)} county-subdivision codes")


def _mi_precinct_key(precinct, county_fips=None):
    m = _MI_MUNI_TYPE_RE.match(precinct.strip())
    if not m:
        return None
    name, mtype_raw, precinct_num, ward_num, suffix = m.groups()
    mtype = "CITY" if mtype_raw.strip().upper() == "CITY" else "TOWNSHIP"
    code4 = MI_MUNI_CODE.get((county_fips, name.strip().upper(), mtype))
    if code4 is None:
        return None
    return f"{code4}-{int(ward_num)}-{int(precinct_num)}{suffix.upper()}"


def _mi_vtd_key(name20):
    s = name20.strip()
    if len(s) == 13 and s.isdigit():
        code4, ward, precinct, suffix = s[3:7], int(s[7:10]), int(s[10:13]), ""
    elif len(s) == 14 and s[:-1].isdigit() and s[-1].isalpha():
        code4, ward, precinct, suffix = s[3:7], int(s[7:10]), int(s[10:13]), s[13].upper()
    else:
        return None
    return f"{code4}-{ward}-{precinct}{suffix}"



# Alabama: MEDSL has NO state-legislative rows at all (confirmed: every unique office string checked),
# so this is the VTD spatial join like VA/MS/MI - but AL's join key is the hardest so far. Neither side
# carries a usable code in most counties: both MEDSL's precinct and the VTD's NAME20 are POLLING-PLACE
# NAMES ("JONES COMM CTR" vs "Jones Community Ctr", "BARNWELL VFD" vs "Barnwell VFD"), abbreviated
# differently by each side, with a few counties embedding a numeric code instead (see
# _al_numeric_codes). Matching is therefore name-based, per county, in ordered passes (numeric ->
# exact token set -> one name's tokens contained in the other's -> weighted fuzzy overlap -> coarse
# whole-town VTD), with facility/denomination words ("BAPT CH", "COMM CTR", "VFD") weighted near zero
# so two different "... Bapt Church" precincts can't match on the facility word alone - the first
# naive attempt at this produced exactly that kind of confident wrong match ("1ST BAPTIST CH SATSUMA"
# -> "1st Bapt Ch St Elmo") and was scrapped. Slash-joined VTD names ("Eulaton/Bynum/West Park
# Heights/Betta View") are ONE polygon that several MEDSL polling places roll up into, so each
# slash-part is a separately matchable label and a VTD can absorb several precincts that way.
# Confirmed unmatchable: DeKalb County (its 2020 VTDs are just 4 county-commission districts, not
# precincts - 0/44 matched, a real geometry gap) and Bullock (precincts consolidated after 2020).
# MEDSL abbreviates polling-place names ("JONES COMM CTR") where the VTD spells them out ("Jones
# Community Ctr") - fold both to one canonical spelling per word before comparing.
_AL_CANON = {
 "COMMUNITY":"COMM","CENTER":"CTR","CENTRE":"CTR","CHURCH":"CH","CHRUCH":"CH","BAPTIST":"BAPT","BAPTIS":"BAPT","BC":"BAPT CH",
 "METHODIST":"METH","MEHTODIST":"METH","UNITED":"UN","PRESBYTERIAN":"PRESBY","PRES":"PRESBY","PRESB":"PRESBY","BUILDING":"BLDG","BLD":"BLDG","BDG":"BLDG",
 "DEPARTMENT":"DEPT","DEPART":"DEPT","DEP":"DEPT","VOLUNTEER":"VOL","VOLUNTEERS":"VOL","STATION":"STA","SCHOOL":"SCH","SCHL":"SCH","ELEMENTARY":"ELEM","MIDDLE":"MID","HIGH":"HS",
 "RECREATION":"REC","RECREATIONAL":"REC","SENIOR":"SR","NATIONAL":"NATL","NAT'L":"NATL","MOUNT":"MT","MOUNTAIN":"MTN","SAINT":"ST","STS":"ST","SAINTS":"ST","FELLOWSHIP":"FELL",
 "HOUSE":"HSE","HOUS":"HSE","VOTING":"VTG","VOTE":"VTG","VT":"VTG","VH":"VTG HSE","V":"VTG","H":"HSE","SPRINGS":"SPGS","SPRGS":"SPGS","SPRNGS":"SPGS","SPRING":"SPG","FIRST":"1ST","CHRISTIAN":"CHR",
 "ASSEMBLY":"ASSY","ASSEMBLEY":"ASSY","ASSEM":"ASSY","COUNTY":"CO","COURTHOUSE":"CTHSE","CROSSROADS":"XRDS","CROSSRDS":"XRDS","CROSS":"XRDS","ROADS":"","RDS":"",
 "ROAD":"RD","MULTIPURPOSE":"MP","MULTI":"MP","PURPOSE":"","PURP":"","ACTIVITY":"ACT","ACTIVITIES":"ACT","ACTIVITES":"ACT","FS":"FIRE STA",
 "FD":"FIRE DEPT","FIREHOUSE":"FIRE HSE","LIBRARY":"LIB","OF":"","THE":"","AND":"","&":"","AT":"","IN":"","MUNICIPAL":"MUN",
 "GYMNASIUM":"GYM","COMPLEX":"CPLX","CMPLX":"CPLX","COMP":"CPLX","NORTH":"N","SOUTH":"S","EAST":"E","WEST":"W","SO":"S","NO":"N","EDUCATION":"ED","AUDITORIUM":"AUD","AUDIT":"AUD","AUDITORUM":"AUD",
 "GROCERY":"GROC","TABERNACLE":"TAB","PRECINCT":"","PREC":"","DISTRICT":"DIST","MEMORIAL":"MEM","HEIGHTS":"HTS","HGTS":"HTS","AVENUE":"AVE",
 "STREET":"ST","EPISCOPAL":"EPIS","LUTHERAN":"LUTH","LUTHER":"LUTH","CATHOLIC":"CATH","PENTECOSTAL":"PENT","INDEPENDENT":"IND","MISSIONARY":"MISS","MISSIONAR":"MISS","MAS":"MASONIC",
 "HEADQUARTERS":"HQ","OFFICE":"OFC","SUBSTATION":"SUBSTA","PARK":"PK","PRK":"PK","CLUBHOUSE":"CLUB HSE","AUTHORITY":"AUTH","SQUAD":"SQ",
 "BOARD":"BD","AGRICULTURE":"AG","AGRICULTURAL":"AG","EXTENSION":"EXT","UNIVERSITY":"UNIV","COLLEGE":"COLL","VOCATIONAL":"VOC","TECHNICAL":"TECH",
 "PUBLIC":"PUB","GODS":"GOD","CHRISTS":"CHRIST","AMERICAN":"AMER","PAVILION":"PAV","CONVENTION":"CONV","SHERIFFS":"SHERIFF","WATER":"WTR",
 "ELECTRIC":"ELEC","COOPERATIVE":"COOP","CO-OP":"COOP","UMC":"UN METH CH","UM":"UN METH","AMEZ":"AME","CONGREGATIONAL":"CONGREG","CONG":"CONGREG","EVANGELICAL":"EVANG",
 "FT":"FORT","JCT":"JUNCTION","JUNCT":"JUNCTION","MEETING":"MTG","ROOM":"RM","NUTRITION":"NUTR","CITIZENS":"","CITIZEN":"","ANGLICAN":"ANGL",
 "MRKT":"MARKET","FARMERS":"FARMER","HIST":"HISTORICAL","SOC":"SOCIETY","REGIONAL":"REG","MINISTRIES":"MIN","MINISTRY":"MIN","INC":"",
 "PLAZA":"PLZ","CHPL":"CHAPEL","GRD":"GUARD","NG":"NATL GUARD","CRK":"CREEK","TRAILOR":"TRAILER","LDG":"LODGE","CC":"COMM CTR","T":"TOWN","TVILLE":"THOMASVILLE",
}
# Facility / denomination / generic words: these never identify a place on their own (a county
# can have five "... Bapt Church" precincts), so they carry almost no weight in the similarity.
_AL_FACILITY = set("""CH BAPT METH PRESBY EPIS CATH LUTH PENT MISS CHR ASSY GOD CHRIST UN AME CONGREG EVANG ANGL HOL IND
FELL WORSHIP 1ST CTR COMM CIVIC REC SR ACT BLDG HALL TOWN CITY CO CTHSE FIRE DEPT STA VFD VOL HSE VTG SCH ELEM MID HS JR GYM
LIB ARMORY NATL GUARD OFC PK CLUB LODGE MASONIC LEGION POST AMER CHAPEL MEM MUN CPLX AUD PAV ANNEX STORE GROC DEPOT HQ AUTH
HOUSING FAM LIFE ED BD AG EXT UNIV COLL VOC TECH PUB RESCUE SQ WTR ELEC COOP SYS PLZ MIN TAB TEMPLE SHRINE LIONS KIWANIS
CIVITAN CONV POLICE SHERIFF JAIL MTG RM NUTR DIST ST AVE RD OLD NEW VFW SUBSTA MP XRDS LIFE CTR TRAILER MARKET SOCIETY
HISTORICAL REG FOUNDATION YOUTH FAMILY EVENT CULTURAL LEARNING ACADEMY CAMPUS BLVD HWY LN DR""".split())
_AL_DIRS = {"N", "S", "E", "W"}


def _al_toks(s):
    s = s.upper()
    s = re.sub(r"\(.*?\)", "", s)
    s = s.replace("'", "")
    s = re.sub(r'[#.,!"@+]', " ", s).replace("-", " ").replace("/", " ")
    out = []
    for t in re.split(r"\s+", s):
        if not t:
            continue
        t = _AL_CANON.get(t, t)
        out.extend(t.split())
    return out


def _al_parts(name):
    """A VTD named 'Eulaton/Bynum/West Park Heights/Betta View' is one polygon that several MEDSL
    polling places roll up into - expose each slash-part as its own matchable label."""
    return [x.strip() for x in re.split(r"\s*/\s*", name) if x.strip()]


def _al_tok_eq(a, b):
    if a == b:
        return True
    if len(a) < 5 or len(b) < 5:
        return False
    return difflib.SequenceMatcher(None, a, b).ratio() >= (0.8 if min(len(a), len(b)) >= 7 else 0.85)


def _al_join_bigrams(toks):
    """'BAKERHILL TOWN HALL' vs 'Baker Hill Town Hall': one side runs two words together. Emit the
    token list with each adjacent pair ALSO available joined, so either spelling matches the other.
    Only place-name words are joined - gluing facility words ("UN"+"METH", "BAPT"+"CH") would
    manufacture a fake distinctive token shared by every Methodist/Baptist precinct in the county."""
    out = list(toks)
    for i in range(len(toks) - 1):
        a, b = toks[i], toks[i + 1]
        if a in _AL_FACILITY or b in _AL_FACILITY or a.isdigit() or b.isdigit() or a in _AL_DIRS or b in _AL_DIRS:
            continue
        j = a + b
        if len(j) >= 6 and j not in out:
            out.append(j)
    return out


# Per-county numeric conventions where the MEDSL name embeds the VTD code directly (verified by
# inspection - every other county is name-matched):
#   Jefferson  "PREC 1010 - HUFFMAN BAPTIST CH" (or "PREC 2245/3060 - ...") -> VTDST20 001010 (+003060)
#   Montgomery "101 WILSON COMM & ATHLETIC CTR" -> 000101
#   Lawrence   "CADDO FIRE DEPT 33-1" / "DONALD BAPT CH 7-1 8-1" (beat-box pairs) -> 003301 (+000801)
#   Clarke     "SALITPA FIRE 811", "WHATLEY BAPT 1213" -> trailing digits are beat+2-digit box -> 000008, 000012
#   Dallas     "GOOD HOPE 00701001" -> 000701 (beat 007, box 01)
def _al_numeric_codes(county3, p):
    if county3 == "073":
        m = re.match(r"^PREC\s+([\d/]+)", p)
        return [int(x) for x in m.group(1).split("/")] if m else None
    if county3 == "101":
        m = re.match(r"^(\d+)\b", p)
        return [int(m.group(1))] if m else None
    if county3 == "079":
        pairs = re.findall(r"\b(\d{1,2})-(\d)\b", p)
        return [int(a) * 100 + int(b) for a, b in pairs] or None
    if county3 == "025":
        m = re.search(r"\b(\d{3,4})$", p)
        return [int(m.group(1)) // 100] if m else None
    if county3 == "047":
        m = re.search(r"\b(\d{8})$", p)
        return [int(m.group(1)[0:3]) * 100 + int(m.group(1)[3:5])] if m else None
    return None


def _al_match_county(county3, medsl_names, vtd_rows, statewide_df):
    """medsl_names: list of MEDSL precinct strings; vtd_rows: list of (VTDST20, NAME20).
    Returns {medsl_name: set(VTDST20)} (a set because Jefferson merges two VTDs into one precinct)."""
    dfm, dfv = collections.Counter(), collections.Counter()
    mtoks = {p: _al_toks(p) for p in medsl_names}
    # joined-word variants only participate in the pairwise comparisons, not in the frequency counts
    mjoin = {p: _al_join_bigrams(mtoks[p]) for p in medsl_names}
    for p in medsl_names:
        for t in set(mtoks[p]):
            dfm[t] += 1
    for _, n in vtd_rows:
        for t in set(_al_toks(n)):
            dfv[t] += 1

    def w(t):
        if t in _AL_FACILITY:
            return 0.12
        if t.isdigit() or t in _AL_DIRS:
            return 0.5
        d = max(dfm[t], dfv[t])
        base = 1.0 if d <= 2 else 0.6 if d <= 5 else 0.3
        return min(base, 0.6) if statewide_df[t] >= 20 else base  # common place words (FRIENDSHIP, MT, NEW HOPE)

    def score(a, b):
        s1 = _score_dir(a, b)
        s2 = _score_dir(_al_join_bigrams(a), b)
        return s1 if s1[0] >= s2[0] else s2

    def _score_dir(a, b):
        if not a or not b:
            return 0.0, 0.0
        da, db = {t for t in a if t in _AL_DIRS}, {t for t in b if t in _AL_DIRS}
        if da and db and da != db:
            return 0.0, 0.0
        na, nb = {t for t in a if t.isdigit()}, {t for t in b if t.isdigit()}
        if na and nb and na != nb:
            return 0.0, 0.0
        used, shared, dshared = set(), 0.0, 0.0
        bj = _al_join_bigrams(b)
        for t in a:
            for j, u in enumerate(bj):
                if j not in used and _al_tok_eq(t, u):
                    used.add(j)
                    ww = max(w(t), w(u)) if j < len(b) else w(t)
                    shared += ww
                    if ww >= 0.3:
                        dshared += ww
                    break
        tot = sum(w(t) for t in a) + sum(w(t) for t in b) - shared
        return (shared / tot if tot else 0.0), dshared

    def subset(a, b):
        return all(any(_al_tok_eq(t, u) for u in _al_join_bigrams(b)) for t in a)

    matched = {}
    # 1. numeric pass
    by_int = {}
    for code, _ in vtd_rows:
        if code.isdigit():
            by_int.setdefault(int(code), code)
    for p in medsl_names:
        ks = _al_numeric_codes(county3, p)
        if ks:
            codes = {by_int[k] for k in ks if k in by_int}
            if codes:
                matched[p] = codes
    numeric_county = len(matched) >= 0.5 * len(medsl_names)

    labels = []  # (code, part_index or -1 for the whole name, tokens)
    for code, name in vtd_rows:
        labels.append((code, -1, _al_toks(name)))
        ps = _al_parts(name)
        if len(ps) > 1:
            for i, pp in enumerate(ps):
                labels.append((code, i, _al_toks(pp)))
    used_whole, used_part = set(), set()

    def label_free(code, pi):
        if code in used_whole:
            return False
        return not any(k == code for k, _ in used_part) if pi == -1 else (code, pi) not in used_part

    def take(p, code, pi):
        matched[p] = {code}
        if pi == -1:
            used_whole.add(code)
        else:
            used_part.add((code, pi))

    # 2. exact pass (same token multiset), 3. subset pass (one name's tokens all inside the other's),
    # 4. fuzzy pass (weighted token overlap) - each greedy best-score-first, 1:1 per label.
    for pass_name in ("exact", "subset", "fuzzy"):
        cands = []
        for p in medsl_names:
            if p in matched:
                continue
            mt = mtoks[p]
            for code, pi, lt in labels:
                if not lt:
                    continue
                sc, ds = score(mt, lt)
                if pass_name == "exact":
                    ok = len(mt) == len(lt) and subset(mt, lt) and subset(lt, mt)
                elif pass_name == "subset":
                    small, big = (mt, lt) if len(mt) <= len(lt) else (lt, mt)
                    ok = len(small) < len(big) and subset(small, big) and sc > 0
                    if ok and ds < 0.6:
                        # nothing distinctive in the smaller name ("FIRST MISSIONARY BAPT") - accept
                        # only if this containment is unambiguous in both directions within the county
                        others_l = sum(1 for c2, pi2, lt2 in labels if lt2 and subset(small, lt2))
                        others_m = sum(1 for q in medsl_names if q not in matched and subset(small, mtoks[q]))
                        ok = others_l == 1 and others_m == 1
                else:
                    ok = (ds >= 1.0 and sc >= 0.45) or (ds >= 0.6 and sc >= 0.65)
                if ok and numeric_county and sc < 0.8:
                    ok = False
                if ok:
                    cands.append((sc, ds, p, code, pi))
        cands.sort(key=lambda x: (-x[0], -x[1]))
        for sc, ds, p, code, pi in cands:
            if p not in matched and label_free(code, pi):
                take(p, code, pi)

    # 5. coarse-VTD pass: a VTD named just "Anniston" / "Jacksonville" / "Cullman (1-1,...)" is a whole
    # town that several MEDSL polling places sit inside - let every unmatched precinct whose name
    # contains that bare place name reuse it (no 1:1 limit). Only for VTD names with NO facility word.
    if not numeric_county:
        for p in medsl_names:
            if p in matched:
                continue
            best = None
            for code, pi, lt in labels:
                if not lt or any(w(t) < 0.3 for t in lt):
                    continue
                if subset(lt, mtoks[p]):
                    sc, _ = score(mtoks[p], lt)
                    if best is None or sc > best[0]:
                        best = (sc, code)
            if best:
                matched[p] = {best[1]}
    return matched



# Maryland: MEDSL has no state-leg rows (confirmed, same as AL) but the join key is the easiest of any
# state - both sides use the county's "election district-precinct" code, just padded differently
# (MEDSL "001-001", VTDST20 "01-001"), so match on the (district, precinct) integer pair. 96% of the
# vote matches directly; the rest is code drift since the 2020 VTD delineation, handled by two
# fallbacks tried in order when the exact pair is missing (see _md_key_fallbacks):
#   1. "DD-000" = the WHOLE election district reported as one precinct (Garrett, Washington, Allegany
#      rural districts) -> the union of every VTD in district DD; and the reverse (Allegany 16-001/
#      16-002 vs a single VTD 16-000) falls out of the same rule since (16,0) IS a VTD key there.
#   2. A precinct created after 2020 by splitting an existing one (Carroll 07-009, PG 11-008, ...)
#      has no VTD at all -> also the parent election district's union polygon. Coarser (its votes
#      are area-weighted across the whole election district) but an election district is still a
#      small sub-county unit, far finer than the House-overlay estimate used elsewhere for Senate gaps.
# The 9 "ZZZZZZ" VTDs are Census water placeholders and are skipped.
def _md_precinct_key(precinct, county_fips=None):
    m = re.match(r"^(\d+)-(\d+)$", precinct.strip())
    return (int(m.group(1)), int(m.group(2))) if m else None


def _md_vtd_key(row):
    return _md_precinct_key(row["VTDST20"])


def _md_key_fallbacks(key):
    d, _ = key
    return [(d, 0), ("district", d)]


def _md_augment_vtds(out, stfp):
    """Add ("district", DD) -> union of all VTD polygons in election district DD, per county."""
    from shapely.ops import unary_union
    groups = defaultdict(list)
    for (county_fips, key), geom in out.items():
        if isinstance(key, tuple) and key[0] != "district":
            groups[(county_fips, key[0])].append(geom)
    for (county_fips, d), geoms in groups.items():
        out[(county_fips, ("district", d))] = geoms[0] if len(geoms) == 1 else unary_union(geoms)



# New Jersey (second attempt - the first, a per-precinct key, matched ~11% and was reverted): MEDSL has no
# state-leg rows (odd-year legislature), so VTD spatial join. Both sides describe the same
# (municipality, ward, district) triple - the VTD side uniformly as NAME20 "{Municipality} {type}
# [ward W] voting district D" (VTDST20 is an opaque muni-code+ward+district number, unusable directly),
# the MEDSL side in a DIFFERENT notation per county: "Atlantic City W3 D4", "Belleville 4-3",
# "Newark C-35", "Jersey City Ward F District 5", "Hillsborough D 3", "Phillipsburg District 4-1",
# "Wantage Twp, District 1", "Florence Township Election District: Ward 2 - District 3", "Toms River
# District 25" (still "Dover township" in the 2020 Census), "Trenton West 1" (ward as a direction word
# glued onto the name), "Mt. Olive" vs "Mount Olive". _nj_parse_medsl normalizes all of these to one
# tuple; _nj_match_county then joins exactly, and falls back in order to: district-only when the
# MEDSL side omits a ward, ward union when the district is new since 2020 (Jersey City E-26, East
# Orange 3-7, Marlboro 29-34), and municipality union for municipality-level rows. Gloucester County
# reports ONLY municipality totals (24 rows, no precincts) so it is entirely muni-union - coarser
# area-weighting there (its legislative districts 3/4/5 cut across municipalities). Pooled
# provisional / vote-by-mail / early rows ("Ewing Twp Provisional", Hunterdon's "... Vote By Mail" =
# 23% of that county) hold real votes, so they also join to their municipality (or ward) union
# rather than being dropped; rows with no municipality at all (county-wide / congressional-district
# pools, Gloucester's literal "COUNTY TOTAL" which would double-count) are dropped. NJ's 40 districts
# are shared by both chambers, so the same overlay serves House and Senate.
_NJ_TYPE_WORDS = r"(township|twp|borough|boro|city|town|village|cty)"
# Non-geographic pseudo-precincts that still hold REAL votes (provisional / vote-by-mail / early /
# emergency ballots pooled per municipality) - kept, and joined to the whole municipality.
_NJ_POOLED = re.compile(r"\b(provisional|prov|vote by mail|vbm|mail|mail-in|emergency|early|ev|absentee)\b", re.I)
# Rows with no municipality at all (county-wide or congressional-district pools, and Gloucester's
# literal COUNTY TOTAL row which would double-count every municipality) - dropped.
_NJ_DROP = re.compile(r"^(federal|overseas|county total|presidential|removed resident|fed \d+|cd \d+|\S+ congressional.*|\d+(st|nd|rd|th) cd.*|\d+th congressional.*)\b|\b(state/fed|federal (president|cd \d+|overseas))\b", re.I)
_NJ_ALIASES = {"tomsriver": "dover", "cityoforange": "orange", "avon": "avonbythesea", "lowerallowayscr": "lowerallowayscreek", "peapackgladstone": "peapackandgladstone"}
_NJ_WARD_LETTERS = {"north": "N", "south": "S", "east": "E", "west": "W", "central": "C"}


def _nj_muni_norm(s):
    s = s.strip().lower()
    s = re.sub(r"^(town|township|city|borough|village)\s+of\s+", "", s)
    s = re.sub(r"\bmt\.?\b", "mount", s)
    s = re.sub(rf"\b{_NJ_TYPE_WORDS}\b", "", s)
    s = re.sub(r"[^a-z0-9]", "", s)
    return _NJ_ALIASES.get(s, s)


def _nj_ward(w):
    if w is None:
        return None
    w = w.strip().lower()
    if w in _NJ_WARD_LETTERS:
        return _NJ_WARD_LETTERS[w]
    if w.isdigit():
        return str(int(w))
    return w.upper()


_NJ_MEDSL_PATS = [
    (r"^(.*?)\s+Election District:\s*Ward\s+([0-9A-Za-z]+)\s*-\s*District\s+(\d+)([A-Za-z])?$", "wd"),
    (r"^(.*?)\s+W(?:ard)?\s*(\d+|[A-Za-z])\s+D(?:istrict)?\s*(\d+)([A-Za-z])?$", "wd"),
    (r"^(.*?)\s+(?:Election\s+)?District\s+(\d+)-(\d+)$", "wd"),
    (r"^(.*?)\s+(?:Election\s+)?District\s+(\d+)([A-Za-z])?$", "d"),
    (r"^(.*?)\s+D\s*(\d+)([A-Za-z])?$", "d"),
    (r"^(.*?)\s+([0-9]{1,2}|[A-Za-z])-(\d+)([A-Za-z])?$", "wd"),
    (r"^(.*?)\s+W(?:ard)?\s*(\d+|[A-Za-z])$", "w"),
    (r"^(.*?)\s+(\d+)([A-Za-z])?$", "d"),
]


def _nj_parse_medsl(p):
    """-> (muni_norm, ward|None, district|None, pooled: bool) or None to drop the row."""
    s = re.sub(r"\s+", " ", p.strip().replace(",", " "))
    if _NJ_DROP.search(s):
        return None
    pooled = False
    if _NJ_POOLED.search(s):
        pooled = True
        s = re.split(r"\s*\(", s)[0]  # "Medford Township (Provisional)" -> "Medford Township"
        s = _NJ_POOLED.split(s)[0].strip()  # "Ewing Twp Provisional" -> "Ewing Twp"
        s = re.sub(r"\s+CD\s*\d+.*$", "", s, flags=re.I)
        s = re.sub(r"\s+\(.*$", "", s)
        s = re.sub(r"\s+W\d+(\s*,\s*W?\d+)*\s*$", "", s, flags=re.I).strip()
        m = re.match(r"^(.*?)\s+Ward\s+(\d+|[A-Za-z])$", s, re.I)
        if m:
            return (_nj_muni_norm(m.group(1)), _nj_ward(m.group(2)), None, True)
        return (_nj_muni_norm(s), None, None, True) if s else None
    s = re.sub(r"^(Town|Township|City|Borough|Village)\s+of\s+", "", s, flags=re.I)
    for pat, kind in _NJ_MEDSL_PATS:
        m = re.match(pat, s, re.I)
        if not m:
            continue
        g = m.groups()
        if kind == "wd":
            return (_nj_muni_norm(g[0]), _nj_ward(g[1]), int(g[2]), False)
        if kind == "d":
            return (_nj_muni_norm(g[0]), None, int(g[1]), False)
        return (_nj_muni_norm(g[0]), _nj_ward(g[1]), None, False)
    return (_nj_muni_norm(s), None, None, False)


_NJ_VTD_RE = re.compile(r"^(.*?)(?:\s+ward\s+(\S+))?\s+(?:voting\s+)?district\s+(\d+)$", re.I)


def _nj_parse_vtd(name20):
    m = _NJ_VTD_RE.match(name20.strip())
    if not m:
        return None
    return (_nj_muni_norm(m.group(1)), _nj_ward(m.group(2)), int(m.group(3)))


def _nj_match_county(county3, medsl_names, vtd_rows, statewide_df=None):
    exact = {}
    by_muni = collections.defaultdict(list)
    for code, name in vtd_rows:
        k = _nj_parse_vtd(name)
        if k is None:
            continue
        exact[k] = code
        by_muni[k[0]].append((k[1], k[2], code))

    def find_muni(muni, ward):
        """Also resolves 'trentonwest' -> ('trenton', 'W') when the ward rides on the name."""
        if muni in by_muni:
            return muni, ward
        for word, letter in _NJ_WARD_LETTERS.items():
            if muni.endswith(word) and muni[: -len(word)] in by_muni:
                return muni[: -len(word)], letter
        return None, ward

    # Bergen (confirmed numerically: "Moonachie" 1,172 = "Moonachie 1..4" 1,142 + "Moonachie
    # Provisional" 30) reports a bare municipality row that is the AGGREGATE of that municipality's
    # district rows plus its pooled row - keeping it would double every Bergen vote. A bare row is
    # therefore dropped whenever the same municipality also has district-level rows; and where a
    # municipality has ONLY a bare row (Hackensack) its pooled row is already inside it, so the
    # pooled row is dropped instead. Municipalities with only district + pooled rows (every other
    # county's pattern) are untouched.
    parsed = {p: _nj_parse_medsl(p) for p in medsl_names}
    shape = collections.defaultdict(lambda: {"bare": [], "dist": [], "pooled": []})
    for p, k in parsed.items():
        if k is None:
            continue
        muni, ward, dist, pooled = k
        muni, _ = find_muni(muni, ward)
        shape[muni]["pooled" if pooled else ("dist" if (dist is not None or ward is not None) else "bare")].append(p)
    aggregate_dups = set()
    for g in shape.values():
        if g["bare"] and g["dist"]:
            aggregate_dups.update(g["bare"])
        elif g["bare"] and g["pooled"]:
            aggregate_dups.update(g["pooled"])

    out, how = {}, collections.Counter()
    for p in medsl_names:
        k = parsed[p]
        if k is None:
            how["drop"] += 1
            continue
        if p in aggregate_dups:
            how["drop-aggregate-dup"] += 1
            continue
        muni, ward, dist, pooled = k
        muni, ward = find_muni(muni, ward)
        vt = by_muni.get(muni)
        if not vt:
            how["no-muni"] += 1
            continue
        if pooled:
            wc = [c for w, _, c in vt if w == ward] if ward is not None else []
            out[p] = set(wc) if wc else {c for _, _, c in vt}; how["pooled-union"] += 1; continue
        if dist is not None:
            if (muni, ward, dist) in exact:
                out[p] = {exact[(muni, ward, dist)]}; how["exact"] += 1; continue
            if ward is None:
                cands = [c for w, d, c in vt if d == dist]
                if len(cands) == 1:
                    out[p] = {cands[0]}; how["dist-only"] += 1; continue
                if len(cands) > 1:
                    out[p] = set(cands); how["dist-multiward"] += 1; continue
            else:
                cands = [c for w, d, c in vt if w is None and d == dist]
                if len(cands) == 1:
                    out[p] = {cands[0]}; how["dist-ignoring-ward"] += 1; continue
                wcands = [c for w, d, c in vt if w == ward]
                if wcands:
                    out[p] = set(wcands); how["newdist-ward-union"] += 1; continue
            out[p] = {c for _, _, c in vt}; how["newdist-muni-union"] += 1; continue
        if ward is not None:
            cands = [c for w, d, c in vt if w == ward]
            if cands:
                out[p] = set(cands); how["ward-union"] += 1; continue
            how["ward-miss"] += 1
            continue
        out[p] = {c for _, _, c in vt}; how["muni-union"] += 1
    print(f"NJ county {county3}: " + ", ".join(f"{k}={v}" for k, v in sorted(how.items())))
    return out



# Louisiana (second attempt - the first matched ~9% against the Census 2020 VTD file and was
# reverted). Two things had to change:
#   GEOMETRY: not the Census file but the Louisiana Legislature's own "2024 Precinct Shapefiles
#   (12-31-2024)" (https://redist.legis.la.gov/default_ShapeFiles2020 -> "2025 1RS/Shapefiles/2024
#   Precinct Shapefiles (12-31-2024).zip") - the 2020 VTDs maintained forward with every precinct
#   change through the Nov 2024 election, same schema (COUNTYFP20/VTDST20/NAME20). Caddo, St. Martin,
#   Terrebonne and Iberia renumbered/split precincts after 2020 and were unmatchable against the
#   Census file (Caddo 0/128); against the legislature's file the statewide election-day match is 99.7%.
#   Pass that unzipped directory as <vtd-shapefile-dir>.
#   KEY: MEDSL precinct is "WW PPP[suffix][ sub-split]" (ward, precinct); NAME20 is "W-P[suffix]" in
#   warded parishes or bare "P[suffix]" in ward-less ones ("00 15" -> "15"). Parish quirks handled in
#   _la_medsl_key/_la_vtd_key: ward "00" with a dashed precinct ("00 1-1", Concordia/Sabine/
#   Morehouse/Caddo) is really ward-precinct; Jefferson's city precincts are "K014"/"K007A" in MEDSL
#   but "14-K"/"7-KA" in the shapefile (number and city letter swapped); Rapides/Bossier "C04 AK",
#   "06A -2" carry a sub-split token that the shapefile doesn't (dropped -> same polygon); "01A"/"01B"
#   letter-splits with only an unlettered "1" polygon share it; Evangeline's "01 1010" precinct numbers
#   are unique statewide-in-parish so the ward can be ignored, but that fallback is refused where a
#   precinct number repeats across wards (Caddo "01-12" vs "04-12").
#
# VOTES: Louisiana reports EARLY and MAIL ballots at the PARISH level only, so MEDSL's precinct rows
# are ELECTION-DAY votes only - statewide they sum to ~51% of the certified total, and the
# election-day share varies by parish AND by party within a parish (Catahoula: Dem 0.70, Rep 0.56).
# Shipping election-day-only margins would bias every district. COUNTY_TOTAL_SCALING therefore
# scales each parish's precinct votes, per party, up to the parish's certified total from
# data/county_presidential_results_2008_2024.csv (the Counties tab's own source) - i.e. each parish's
# early/mail vote is apportioned across its precincts in proportion to each precinct's election-day
# vote for that party. That assumes a party's early voters are spread like its election-day voters
# within a parish (not across parishes) - the standard approximation for this reporting style, far
# better than the raw bias, still an approximation.
def _la_norm_prec(s):
    """'002 A' -> '2A', '06A -2' -> ('6A', '-2' dropped), 'C04 AK' -> 'C4' (+ sub-split dropped), '1010' -> '1010'."""
    s = s.strip().upper()
    toks = s.split()
    main = toks[0] if toks else ""
    extra = toks[1:]
    # a single trailing letter token is a precinct-letter suffix ("002 A" -> "2A"); anything else is a sub-split
    if extra and re.fullmatch(r"[A-Z]", extra[0]):
        main += extra[0]; extra = extra[1:]
    m = re.fullmatch(r"([A-Z]*)0*(\d+)([A-Z]*)", main)
    if m:
        main = f"{m.group(1)}{int(m.group(2))}{m.group(3)}"
    return main, tuple(extra)

def _la_medsl_key(p):
    """MEDSL 'WW PPP...' -> (ward|None, precinct_norm, extras)"""
    m = re.match(r"^(\d+)\s+(.+)$", p.strip())
    if not m:
        return None
    ward = int(m.group(1))
    rest = m.group(2).strip()
    if ward == 0:
        m2 = re.match(r"^(\d+)-(.+)$", rest)   # "00 1-1" / "00 03-1": ward-dash-precinct with ward field unused
        if m2:
            ward, rest = int(m2.group(1)), m2.group(2)
    prec, extra = _la_norm_prec(rest)
    return (ward if ward else None, prec, extra)

def _la_vtd_key(name20):
    s = re.sub(r"^PRECINCT\s+", "", name20.strip().upper())
    m = re.match(r"^(\d+)-(.+)$", s)
    if m and not re.fullmatch(r"[A-Z]\d+.*", s):
        ward = int(m.group(1)); rest = m.group(2)
    else:
        ward = None; rest = s
    # Jefferson: VTD "14-K" / "7-KA" is MEDSL "K014" / "K007A" (city-letter precincts, number first) -
    # swap when the part after the dash is letters only.
    if ward is not None and re.fullmatch(r"[A-Z]{1,2}", rest):
        # "7-KA" = Kenner 7, split A -> "K7A"; but "1-GI" = Grand Isle 1 -> "GI1". Both readings are
        # registered (see _la_match_county) - only one can ever exist on the MEDSL side.
        return (None, f"{rest[0]}{ward}{rest[1:]}", ("ALT", f"{rest}{ward}"))
    prec, extra = _la_norm_prec(rest.replace("-", " "))
    return (ward, prec, extra)

def _la_match_county(county3, medsl_names, vtd_rows, statewide_df=None):
    exact = {}; by_wp = collections.defaultdict(list); by_num = collections.defaultdict(list)
    for code, name in vtd_rows:
        k = _la_vtd_key(name)
        if k[2][:1] == ("ALT",):
            exact.setdefault((None, k[2][1], ()), code)
            k = (k[0], k[1], ())
        exact.setdefault(k, code)
        by_wp[(k[0], k[1])].append(code)
        base = re.sub(r"[A-Z]+$", "", k[1])
        by_num[(k[0], base)].append(code)
    # ignore-ward fallback is only safe where precinct numbers are unique across the parish's wards
    # (Evangeline "01 1010"/"05 5010" - yes; Caddo "01-12"/"04-12" - no, VTD "12" is a different place)
    keys = [_la_medsl_key(p) for p in medsl_names]
    precs = collections.Counter(k[1] for k in keys if k)
    out, how = {}, collections.Counter()
    for p in medsl_names:
        k = _la_medsl_key(p)
        if k is None:
            how["unparsed"] += 1; continue
        ward, prec, extra = k
        if k in exact:
            out[p] = {exact[k]}; how["exact"] += 1; continue
        if (ward, prec) in by_wp:
            out[p] = set(by_wp[(ward, prec)]); how["drop-subsplit"] += 1; continue
        base = re.sub(r"[A-Z]+$", "", prec)
        if (ward, base) in by_num:
            out[p] = set(by_num[(ward, base)]); how["drop-letter"] += 1; continue
        # ward-less VTD side vs warded MEDSL (or vice versa)
        if ward is not None and precs[prec] == 1 and (None, prec) in by_wp:
            out[p] = set(by_wp[(None, prec)]); how["ignore-ward"] += 1; continue
        how["miss"] += 1
    print(f"LA parish {county3}: " + ", ".join(f"{k}={v}" for k, v in sorted(how.items())))
    return out


# Each entry: (precinct_key_func, vtd_key_func). precinct_key_func takes (precinct_string,
# county_fips) - only MI's needs county_fips, the rest ignore it. vtd_key_func takes the raw VTD
# row and returns a key of whatever type/shape precinct_key_func also produces for that state -
# VTDST20 as an int/string for VA/LA, a parsed (muni, ward, district) tuple from NAME20 for NJ.
PRECINCT_KEY_FUNCS = {
    "VA": (_va_precinct_key, lambda row: int(row["VTDST20"])),
    "MS": (_ms_precinct_key, lambda row: _ms_vtd_key(row["NAME20"])),
    "MI": (_mi_precinct_key, lambda row: _mi_vtd_key(row["NAME20"])),
    "MD": (_md_precinct_key, _md_vtd_key),
}

# Optional per-state extras for PRECINCT_KEY_FUNCS states: alternative keys to try when the exact
# key has no VTD, and a post-load hook that adds synthetic (e.g. union) VTD entries for them to hit.
def _mi_key_fallbacks(key):
    """"2200-0-963CB" (MEDSL Detroit, absentee counting-board suffix, ward reported as 0) ->
    try the same precinct without the suffix, then with the ward wildcarded ("2200-*-963")."""
    m = re.match(r"^(\d{4})-(\d+)-(\d+)([A-Z]*)$", key)
    if not m:
        return []
    code4, ward, prec, suffix = m.groups()
    alts = []
    if suffix:
        alts.append(f"{code4}-{ward}-{prec}")
    alts.append(f"{code4}-*-{prec}")
    return alts


def _mi_augment_vtds(out, stfp):
    """Register ward-wildcard keys where a (municipality, precinct) pair is unique across wards -
    Michigan's 2024 precinct layer files Detroit under wards 01-07 while MEDSL reports "Ward 0"."""
    groups = defaultdict(list)
    for (county_fips, key), geom in out.items():
        m = re.match(r"^(\d{4})-(\d+)-(\d+)$", key)
        if m:
            groups[(county_fips, f"{m.group(1)}-*-{m.group(3)}")].append(geom)
    for k, geoms in groups.items():
        if len(geoms) == 1:
            out[k] = geoms[0]


# Precincts that fail to join but whose MUNICIPALITY has matched precincts get their votes spread
# over those precincts in proportion to each one's own votes for that party (same assumption as
# LA's parish-level scaling, one level down). Needed for Detroit: MEDSL reports its absentee ballots
# under ~60 "counting board" pseudo-precincts ("DETROIT CITY 963 Ward 0CB") that hold most of the
# city's vote (131k of 221k Harris votes) and have no polygon anywhere. The lambda maps a precinct
# key to its pool-group id (MI: the 4-digit municipality code).
# VA: every locality reports one "<LOCALITY> PROVISIONALS" row (no precinct number, ~2.5% of the vote
# statewide) - pooled at the locality level, so the group is the locality itself (key None included).
POOLED_REDISTRIBUTION = {
    "MI": lambda key: key.split("-")[0] if key else None,
    "VA": lambda key: "locality",
}

KEY_FALLBACKS = {"MD": _md_key_fallbacks, "MI": _mi_key_fallbacks}
VTD_AUGMENT = {"MD": _md_augment_vtds, "MI": _mi_augment_vtds}

# States whose join can't be expressed as one key per precinct (AL: fuzzy name matching that needs
# every precinct AND every VTD of a county at once). matcher(county3, medsl_names, [(VTDST20, NAME20)],
# statewide_token_df) -> {medsl_name: set(VTDST20)}; a multi-code set means the precinct's geometry
# is the UNION of those VTDs (Jefferson's "PREC 2245/3060 - ..." merges two).
COUNTY_MATCHERS = {
    "AL": _al_match_county,
    "NJ": _nj_match_county,
    "LA": _la_match_county,
}

# States whose precinct file is election-day-only (see the Louisiana section): county FIPS -> the
# certified county totals CSV to scale each county's precinct votes up to, per party.
COUNTY_TOTAL_SCALING = {"LA": f"{ROOT}/data/county_presidential_results_2008_2024.csv"}


def scale_to_county_totals(abbr, pres_votes):
    """Multiply every precinct's dem/rep/oth by (certified county party total / MEDSL county party
    sum) for its county, in place. Prints the per-county factors so a bad row is visible."""
    import csv
    cert = {}
    with open(COUNTY_TOTAL_SCALING[abbr]) as f:
        for r in csv.DictReader(f):
            if r["county_id"].startswith(fg.ABBR_TO_FIPS[abbr]):
                cert[r["county_id"]] = {"dem": int(r["dem_2024"]), "rep": int(r["gop_2024"]), "oth": int(r["oth_2024"])}
    sums = defaultdict(lambda: defaultdict(int))
    for (county_fips, _), buckets in pres_votes.items():
        for b, v in buckets.items():
            sums[county_fips][b] += v
    factors = {}
    for county_fips, s in sums.items():
        if county_fips not in cert:
            print(f"{abbr}: no certified totals for county {county_fips} - left unscaled")
            continue
        factors[county_fips] = {b: (cert[county_fips][b] / s[b] if s.get(b) else 1.0) for b in ("dem", "rep", "oth")}
    for (county_fips, _), buckets in pres_votes.items():
        fct = factors.get(county_fips)
        if fct:
            for b in list(buckets):
                buckets[b] = buckets[b] * fct.get(b, 1.0)
    lo = min(f["dem"] for f in factors.values()); hi = max(f["dem"] for f in factors.values())
    print(f"{abbr}: scaled {len(factors)} counties to certified totals (dem factor range {lo:.2f}-{hi:.2f})")



def load_vtd_precincts(vtd_dir, stfp, abbr):
    """vtd_key (see PRECINCT_KEY_FUNCS above) -> geometry, keyed by (county_fips, vtd_key)."""
    shp = [f for f in os.listdir(vtd_dir) if f.endswith(".shp")][0]
    gdf = gpd.read_file(os.path.join(vtd_dir, shp))
    _, vtd_key_func = PRECINCT_KEY_FUNCS[abbr]
    out = {}
    for _, row in gdf.iterrows():
        county_fips = stfp + row["COUNTYFP20"]
        vtd_key = vtd_key_func(row)
        if vtd_key is not None:
            out[(county_fips, vtd_key)] = row["geometry"]
    if abbr in VTD_AUGMENT:
        VTD_AUGMENT[abbr](out, stfp)
    return out


def load_vtd_rows(vtd_dir, stfp):
    """county_fips -> [(VTDST20, NAME20, geometry)], for COUNTY_MATCHERS states."""
    shp = [f for f in os.listdir(vtd_dir) if f.endswith(".shp")][0]
    gdf = gpd.read_file(os.path.join(vtd_dir, shp))
    out = defaultdict(list)
    for _, row in gdf.iterrows():
        out[stfp + row["COUNTYFP20"]].append((row["VTDST20"], row["NAME20"], row["geometry"]))
    return out


def match_by_county(abbr, orig_precinct, vtd_rows_by_county):
    """(county_fips, precinct_upper) -> geometry via COUNTY_MATCHERS[abbr] (see that dict)."""
    from shapely.ops import unary_union
    matcher = COUNTY_MATCHERS[abbr]
    by_county = defaultdict(list)
    for (county_fips, _), p in orig_precinct.items():
        by_county[county_fips].append(p)
    statewide_df = defaultdict(int)
    for ps in by_county.values():
        for p in ps:
            for t in set(_al_toks(p)):
                statewide_df[t] += 1
    for rows in vtd_rows_by_county.values():
        for _, name, _ in rows:
            for t in set(_al_toks(name)):
                statewide_df[t] += 1
    out = {}
    for county_fips, ps in by_county.items():
        rows = vtd_rows_by_county.get(county_fips, [])
        matched = matcher(county_fips[2:], ps, [(code, name) for code, name, _ in rows], statewide_df)
        geom_by_code = {code: geom for code, _, geom in rows}
        for p, codes in matched.items():
            geoms = [geom_by_code[c] for c in codes]
            out[(county_fips, p.strip().upper())] = geoms[0] if len(geoms) == 1 else unary_union(geoms)
    return out


def load_precinct_president_votes(medsl_path):
    """(county_fips, precinct) -> {dem, rep, oth} votes, using the crosswalk script's own
    mode-collapse/party-bucket/non-candidate-row logic for consistency."""
    delimiter = "\t" if medsl_path.endswith(".tab") else ","
    import csv
    raw = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    with open(medsl_path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f, delimiter=delimiter):
            if row["office"] != "US PRESIDENT":
                continue
            if xw._is_non_candidate_row(row["candidate"]):
                continue
            try:
                votes = int(float(row["votes"]))
            except (ValueError, TypeError):
                continue
            key = (row["county_fips"], row["precinct"].strip().upper())
            mode = row["mode"] or "TOTAL"
            bucket = xw.party_bucket(row["party_simplified"], row["party_detailed"], row["candidate"])
            raw[key][bucket][mode] += votes
    return {key: {b: xw._collapse_modes(m) for b, m in buckets.items()} for key, buckets in raw.items()}


def build_precinct_geodataframe(abbr, medsl_path, vtd_dir, stfp):
    county_matched = abbr in COUNTY_MATCHERS
    if not county_matched:
        vtd_geom = load_vtd_precincts(vtd_dir, stfp, abbr)
        key_func, _ = PRECINCT_KEY_FUNCS[abbr]
    pres_votes = load_precinct_president_votes(medsl_path)
    if abbr in COUNTY_TOTAL_SCALING:
        scale_to_county_totals(abbr, pres_votes)

    # Re-derive the ORIGINAL (non-uppercased) precinct string per key, since we need it to parse
    # the leading VTD number - pres_votes above was keyed on the uppercased join key used
    # elsewhere in this project, but that's fine since VTD numbers are digits either way.
    import csv
    delimiter = "\t" if medsl_path.endswith(".tab") else ","
    orig_precinct = {}
    with open(medsl_path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f, delimiter=delimiter):
            if row["office"] == "US PRESIDENT":
                key = (row["county_fips"], row["precinct"].strip().upper())
                orig_precinct[key] = row["precinct"]

    if county_matched:
        geom_by_key = match_by_county(abbr, orig_precinct, load_vtd_rows(vtd_dir, stfp))

    rows = []
    matched, unmatched, fallback_hits = 0, 0, 0
    pool_of = {}      # key -> pool-group id (POOLED_REDISTRIBUTION states only)
    row_index = {}    # key -> index into rows, for matched precincts
    for key, buckets in pres_votes.items():
        county_fips, _ = key
        vtd_key = None
        if county_matched:
            geom = geom_by_key.get(key)
        else:
            vtd_key = key_func(orig_precinct[key], county_fips)
            geom = vtd_geom.get((county_fips, vtd_key)) if vtd_key is not None else None
            if geom is None and vtd_key is not None and abbr in KEY_FALLBACKS:
                for alt in KEY_FALLBACKS[abbr](vtd_key):
                    geom = vtd_geom.get((county_fips, alt))
                    if geom is not None:
                        fallback_hits += 1
                        break
        if abbr in POOLED_REDISTRIBUTION:
            grp = POOLED_REDISTRIBUTION[abbr](vtd_key)
            if grp is not None:
                pool_of[key] = (county_fips, grp)
        if geom is None:
            unmatched += 1
            continue
        matched += 1
        row_index[key] = len(rows)
        rows.append({
            "dem": buckets.get("dem", 0), "rep": buckets.get("rep", 0), "oth": buckets.get("oth", 0),
            "geometry": geom,
        })
    if abbr in POOLED_REDISTRIBUTION:
        pooled = defaultdict(lambda: defaultdict(float))
        members = defaultdict(list)
        for key, grp in pool_of.items():
            if key in row_index:
                members[grp].append(row_index[key])
            else:
                for b, v in pres_votes[key].items():
                    pooled[grp][b] += v
        spread, orphaned = defaultdict(float), defaultdict(float)
        for grp, buckets in pooled.items():
            idx = members.get(grp)
            for b, v in buckets.items():
                if not idx:
                    orphaned[b] += v
                    continue
                base = sum(rows[i][b] for i in idx)
                for i in idx:
                    rows[i][b] += v * (rows[i][b] / base) if base else v / len(idx)
                spread[b] += v
        print(f"{abbr}: redistributed pooled/unmatched rows onto their municipality's matched precincts: "
              f"dem={spread['dem']:,.0f} rep={spread['rep']:,.0f}; still orphaned (no matched precinct in "
              f"municipality): dem={orphaned['dem']:,.0f} rep={orphaned['rep']:,.0f}")
    print(f"{abbr}: {matched} precincts matched to VTD geometry, {unmatched} unmatched"
          + (f" ({fallback_hits} via KEY_FALLBACKS)" if fallback_hits else ""))
    return gpd.GeoDataFrame(rows, crs="EPSG:4326"), unmatched


def overlay_onto_districts(abbr, chamber, precincts_gdf, boundary_src, stfp, unmatched_precincts=1):
    fc = json.load(open(boundary_src))
    feats = [f for f in fc["features"] if f["properties"].get("STATEFP") == stfp and f.get("geometry")]
    if not feats:
        return {}
    geoms = [shape(f["geometry"]).buffer(0) for f in feats]
    props = [f["properties"] for f in feats]
    districts = gpd.GeoDataFrame(props, geometry=geoms, crs="EPSG:4326")
    districts["CODE"] = [fg.extract_district_code(abbr, chamber, p) for p in props]
    districts = districts.dropna(subset=["CODE"])

    precincts = precincts_gdf.to_crs(epsg=5070)
    districts = districts.to_crs(epsg=5070)
    precincts["p_area"] = precincts.geometry.area

    overlay = gpd.overlay(precincts.reset_index(), districts, how="intersection", keep_geom_type=False)
    overlay["frac"] = overlay.geometry.area / overlay["p_area"]
    overlay = overlay[overlay["frac"] > 0.005]

    dist_votes = defaultdict(lambda: {"dem": 0.0, "rep": 0.0, "tot": 0.0})
    for _, row in overlay.iterrows():
        frac = row["frac"]
        dist_votes[row["CODE"]]["dem"] += row["dem"] * frac
        dist_votes[row["CODE"]]["rep"] += row["rep"] * frac
        dist_votes[row["CODE"]]["tot"] += (row["dem"] + row["rep"] + row["oth"]) * frac

    # A district whose matched precincts add up to far fewer votes than a typical district in
    # this chamber almost certainly means most of its real precincts failed the join (a "stale
    # VTD" or naming-mismatch county overlapping this specific district) - the votes it DOES
    # have aren't a representative sample of the district, just whichever few precincts happened
    # to match. Confirmed on Mississippi: 11/121 House districts came in under 3,000 total votes
    # against a ~6,900 median - dropping those (rather than showing a skewed color from a
    # handful of precincts) is safer, matching this project's "no data" over "misleading data"
    # rule used when LA/NJ's overall match rate was too low to ship at all.
    # The floor only guards against FAILED joins, so it is skipped when every precinct matched
    # (MD): with nothing missing, a small district is just a small district - and MD's House mixes
    # 3-member districts with 1-member sub-districts (1A/1B/1C) that are legitimately a third the
    # size, which the chamber-median rule would otherwise wrongly drop (it dropped 8 on first run).
    import statistics
    totals = [v["tot"] for v in dist_votes.values() if v["tot"] > 0]
    coverage_floor = statistics.median(totals) * 0.4 if totals and unmatched_precincts else 0

    out = {}
    dropped_low_coverage = 0
    for d, v in dist_votes.items():
        if v["tot"] <= 0:
            continue
        if v["tot"] < coverage_floor:
            dropped_low_coverage += 1
            continue
        dem_pct = round(v["dem"] / v["tot"] * 100, 1)
        rep_pct = round(v["rep"] / v["tot"] * 100, 1)
        out[d] = {
            "demPct": dem_pct, "repPct": rep_pct,
            "margin": round(rep_pct - dem_pct, 1),
            "demVotes": round(v["dem"]), "repVotes": round(v["rep"]), "totalVotes": round(v["tot"]),
        }
    if dropped_low_coverage:
        print(f"{abbr} {chamber}: dropped {dropped_low_coverage} low-coverage district(s) "
              f"(< 40% of median matched votes)")
    return out


if __name__ == "__main__":
    abbr = sys.argv[1].upper()
    medsl_path = sys.argv[2]
    vtd_dir = sys.argv[3]
    stfp = fg.ABBR_TO_FIPS[abbr]

    # MI's House was already sourced via the direct crosswalk (its map is unchanged since 2024) -
    # only its Senate map postdates the 2024 election (Tier 2), so this run must compute Senate
    # ONLY and merge into the existing MI.json rather than overwriting the good House data.
    chambers = (("house", HOUSE_SRC), ("senate", SENATE_SRC))
    if abbr == "MI":
        load_mi_muni_codes(sys.argv[4])
        chambers = (("senate", SENATE_SRC),)

    precincts_gdf, unmatched_precincts = build_precinct_geodataframe(abbr, medsl_path, vtd_dir, stfp)
    tot = precincts_gdf[["dem", "rep", "oth"]].sum()
    print(f"{abbr} statewide president totals from matched VTDs: dem={tot['dem']:,.0f} "
          f"rep={tot['rep']:,.0f} oth={tot['oth']:,.0f} total={tot.sum():,.0f}")

    out_path = os.path.join(OUT_DIR, f"{abbr}.json")
    result = json.load(open(out_path)) if os.path.exists(out_path) else {}
    for chamber, src in chambers:
        out = overlay_onto_districts(abbr, chamber, precincts_gdf, src, stfp, unmatched_precincts)
        if out:
            result[chamber] = out
            print(f"{abbr} {chamber}: {len(out)} districts")

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2, sort_keys=True)
    print(f"wrote {out_path}")
