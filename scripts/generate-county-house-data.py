#!/usr/bin/env python3
"""
Generates data/countyHouseData.ts by merging every data-entry/county_house_results_{year}.csv
found on disk (each fetched from OpenElections/Wikipedia per-state House sources - see
scripts/fetch-openelections-house-{year}.py). Unlike President/Senate/Governor, a House
county's dem/gop numbers are the SUM of every congressional district that touches that
county (a county can span multiple districts), not a single statewide race. Margins are
R-positive (positive = R advantage), matching lib/colorScale.ts's convention.
Run from project root: python3 scripts/generate-county-house-data.py
"""
import csv, glob, os, re

SRC_GLOB = os.path.join(os.path.dirname(__file__), "../data-entry/county_house_results_*.csv")
DST = os.path.join(os.path.dirname(__file__), "../data/countyHouseData.ts")

SRC_FILES = sorted(glob.glob(SRC_GLOB))
YEARS = sorted(int(re.search(r"_(\d{4})\.csv$", f).group(1)) for f in SRC_FILES)

# Top-two/jungle-primary states (CA, WA) can send two candidates from the SAME party
# to a House general election - the dem/gop bucketing is still correct (both
# candidates' votes land in their shared true party's column, per
# fetch-openelections-house-2024.py's/scrape-county-house-2024.py's true_party_bucket()
# convention), but a flat "D vs. R" reading of the county's numbers would be
# misleading for these counties, since there was no real cross-party contest for (at
# least part of) the county that cycle. Flagged with a short note surfaced on the
# county detail page rather than silently left to look like an ordinary landslide.
# 2024 districts found via house_past_results.csv's "(D)"/"(R)" true-party markers
# (see scrape-county-house-2024.py's docstring): CA-12 and CA-34 are both believed to
# fall entirely within already-excluded big-city counties (San Francisco, Los Angeles -
# see PARTIAL_COVERAGE_EXCLUSIONS in scrape-county-house-2024.py) so aren't listed here.
#
# Exclusivity (whether a county is WHOLLY inside the same-party district, vs. only
# partly) was originally guessed from each Wikipedia district's own "By county" table
# in isolation, before this pipeline tracked which district(s) actually fed each
# county's total. Once `districts_{year}` was added and checked against these counties
# directly, 3 of the original "wholly within WA-04" counties turned out to be wrong -
# Adams (also WA-05), Douglas (also WA-08), and Franklin (also WA-05) all blend WA-04
# with a normal district too. **Any time this dict is next revisited, cross-check
# against that county's actual `districts_{year}` list rather than re-trusting this
# comment** - it's easy for a single-district assumption to be wrong for a border county.
SAME_PARTY_NOTES = {
    2024: {
        # WA-04 (Newhouse vs. Sessler, both Republican) - confirmed wholly within WA-04
        # (districts_2024 == "4" only) as of this writing.
        **{fips: "WA-04's 2024 general election was between two Republicans (Dan Newhouse vs. Jerrod Sessler); the party split shown here doesn't reflect a Democrat-vs-Republican contest."
           for fips in ["53005", "53025", "53039", "53047", "53077"]},
        # These 3 also touch a normal WA district (Adams/Franklin: WA-05; Douglas: WA-08).
        **{fips: "Part of this county (WA-04) had a 2024 general election between two Republicans (Dan Newhouse vs. Jerrod Sessler); the party split shown here blends that with the county's other district(s)."
           for fips in ["53001", "53017", "53021"]},
        # WA-09 (Smith vs. Chaudhry, both Democrat) - King County also touches other,
        # normal WA districts (WA-01, WA-07, WA-08), so this note applies to only part
        # of the county.
        "53033": "Part of this county (WA-09) had a 2024 general election between two Democrats (Adam Smith vs. Melissa Chaudhry); the party split shown here blends that with the county's other district(s).",
        # CA-20 (Fong vs. Boudreaux, both Republican) - confirmed all 4 also touch other
        # CA districts (Fresno: 5/13/21; Kern: 22/23; Kings: 22; Tulare: 21/22), so this
        # note is deliberately worded as partial ("includes CA-20") for all of them.
        **{fips: "Part of this county's 2024 House total includes CA-20, a general election between two Republicans (Vince Fong vs. Mike Boudreaux); the party split shown here blends that with the county's other district(s)."
           for fips in ["06019", "06029", "06031", "06107"]},
    },
    # 2022: 6 CA jungle-primary districts landed two Democrats in the general (found via
    # house_past_results.csv's 2022 rows' "(D)" trailing markers on rep_candidate - no
    # WA/LA same-party districts that year, re-checked fresh per the project's standing
    # "don't assume last year's list carries over" rule). Every affected county touches
    # several other normal CA districts too (checked against each county's own
    # districts_2022 list, same cross-check lesson as the 2024 WA-04 correction above),
    # so all 4 counties get the partial ("Part of this county") wording, none "wholly within".
    2022: {
        # CA-15 (Kevin Mullin vs. David Canepa) touches San Francisco and San Mateo.
        "06075": "Part of this county's 2022 House total includes CA-15, a general election between two Democrats (Kevin Mullin vs. David Canepa); the party split shown here blends that with the county's other district(s).",
        "06081": "Part of this county's 2022 House total includes CA-15 (Kevin Mullin vs. David Canepa) and CA-16 (Anna Eshoo vs. Rishi Kumar), both general elections between two Democrats; the party split shown here blends those with the county's other district.",
        # CA-16 (Anna Eshoo vs. Rishi Kumar) also touches Santa Clara.
        "06085": "Part of this county's 2022 House total includes CA-16, a general election between two Democrats (Anna Eshoo vs. Rishi Kumar); the party split shown here blends that with the county's other district(s).",
        # Los Angeles touches all 4 remaining same-party districts: CA-29 (Tony Cárdenas
        # vs. Angélica Dueñas), CA-30 (Adam Schiff vs. Maebe A. Girl), CA-34 (Jimmy Gomez
        # vs. David Kim), CA-37 (Sydney Kamlager-Dove vs. Jan Perry) - all Democrat-vs-Democrat.
        "06037": "Part of this county's 2022 House total includes CA-29 (Tony Cárdenas vs. Angélica Dueñas), CA-30 (Adam Schiff vs. Maebe A. Girl), CA-34 (Jimmy Gomez vs. David Kim), and CA-37 (Sydney Kamlager-Dove vs. Jan Perry) - all general elections between two Democrats; the party split shown here blends those with the county's other districts.",
    },
    # 2020: 7 CA jungle-primary districts plus WA-10, all Democrat-vs-Democrat (found via
    # house_past_results.csv's 2020 rows' "(D)" trailing markers - re-checked fresh, not
    # assumed from 2022's list), plus LA-05 (the reverse shape - two Republicans, Lance
    # Harris vs. Luke Letlow, with dem_candidate itself carrying the "(R)" marker). LA-05
    # went to a December runoff MEDSL's source file never covered (its only rows are the
    # November jungle primary, a different contest) - closed via
    # scripts/patch-county-house-2020-la.py (2026-08-13), user-supplied official
    # parish-level runoff results, validated within 1 vote of house_past_results.csv.
    2020: {
        # LA-05 (Lance Harris vs. Luke Letlow, both Republican) - 20 parishes confirmed
        # single-district (districts_2020 == "5" only); East Feliciana/St. Helena (also
        # LA-06), St. Landry (also LA-03/LA-04), and Tangipahoa (also LA-01) get the
        # partial wording per patch-county-house-2020-la.py.
        **{fips: "This parish's entire 2020 House total is LA-05, a runoff election between two Republicans (Lance Harris vs. Luke Letlow) - the party split shown here doesn't reflect a Democrat-vs-Republican contest."
           for fips in ["22009", "22021", "22025", "22029", "22035", "22041", "22043",
                        "22049", "22059", "22061", "22065", "22067", "22073", "22079",
                        "22083", "22107", "22117", "22123", "22125", "22127"]},
        **{fips: "Part of this parish's 2020 House total includes LA-05, a runoff election between two Republicans (Lance Harris vs. Luke Letlow); the party split shown here blends that with the parish's other district(s)."
           for fips in ["22037", "22091", "22097", "22105"]},
        "06075": "Part of this county's 2020 House total includes CA-12, a general election between two Democrats (Nancy Pelosi vs. Shahid Buttar); the party split shown here blends that with the county's other district(s).",
        "06081": "Part of this county's 2020 House total includes CA-18, a general election between two Democrats (Anna Eshoo vs. Rishi Kumar); the party split shown here blends that with the county's other district(s).",
        "06085": "Part of this county's 2020 House total includes CA-18, a general election between two Democrats (Anna Eshoo vs. Rishi Kumar); the party split shown here blends that with the county's other district(s).",
        "06087": "Part of this county's 2020 House total includes CA-18, a general election between two Democrats (Anna Eshoo vs. Rishi Kumar); the party split shown here blends that with the county's other district(s).",
        # Los Angeles touches 4 of the remaining same-party CA districts: CA-29 (Tony
        # Cárdenas vs. Angélica Dueñas), CA-34 (Jimmy Gomez vs. David Kim), CA-38 (Linda
        # Sánchez vs. Michael Tolar), CA-44 (Nanette Diaz Barragán vs. Analilia Joya) -
        # all Democrat-vs-Democrat (confirmed via this county's own districts_2020 list,
        # not assumed - it also touches CA-38, unlike the 2022 equivalent note above).
        "06037": "Part of this county's 2020 House total includes CA-29 (Tony Cárdenas vs. Angélica Dueñas), CA-34 (Jimmy Gomez vs. David Kim), CA-38 (Linda Sánchez vs. Michael Tolar), and CA-44 (Nanette Diaz Barragán vs. Analilia Joya) - all general elections between two Democrats; the party split shown here blends those with the county's other districts.",
        "06059": "Part of this county's 2020 House total includes CA-38, a general election between two Democrats (Linda Sánchez vs. Michael Tolar); the party split shown here blends that with the county's other district(s).",
        "06073": "Part of this county's 2020 House total includes CA-53, a general election between two Democrats (Sara Jacobs vs. Georgette Gómez); the party split shown here blends that with the county's other district(s).",
        "53053": "Part of this county's 2020 House total includes WA-10, a general election between two Democrats (Marilyn Strickland vs. Beth Doglio); the party split shown here blends that with the county's other district(s).",
        "53045": "Part of this county's 2020 House total includes WA-10, a general election between two Democrats (Marilyn Strickland vs. Beth Doglio); the party split shown here blends that with the county's other district(s).",
        "53067": "Part of this county's 2020 House total includes WA-10, a general election between two Democrats (Marilyn Strickland vs. Beth Doglio); the party split shown here blends that with the county's other district(s).",
    },
    # 2018: 4 CA jungle-primary districts plus WA-09 (found via house_past_results.csv's
    # 2018 rows' "(D)"/"(R)" trailing markers, re-checked fresh). CA-08 is the reverse
    # shape seen this year (Tim Donnelly vs. Paul Cook, BOTH Republicans - dem_candidate
    # itself carries the "(R)" marker) rather than 2018's usual two-Democrats pattern -
    # every other same-party district found this year (CA-06/27/44, WA-09) is the more
    # common Dem-vs-Dem shape. Mono and Inyo are confirmed WHOLLY within CA-08
    # (districts_2018 == "8" only); every other affected county blends with at least one
    # normal district (checked against each county's own districts_2018 list).
    2018: {
        "06113": "Part of this county's 2018 House total includes CA-06, a general election between two Democrats (Doris Matsui vs. Jrmar Jefferson); the party split shown here blends that with the county's other district(s).",
        "06067": "Part of this county's 2018 House total includes CA-06, a general election between two Democrats (Doris Matsui vs. Jrmar Jefferson); the party split shown here blends that with the county's other district(s).",
        "06051": "This county's entire 2018 House total is CA-08, a general election between two Republicans (Tim Donnelly vs. Paul Cook) - the party split shown here doesn't reflect a Democrat-vs-Republican contest.",
        "06027": "This county's entire 2018 House total is CA-08, a general election between two Republicans (Tim Donnelly vs. Paul Cook) - the party split shown here doesn't reflect a Democrat-vs-Republican contest.",
        # San Bernardino touches both CA-08 (Donnelly/Cook, Republicans) and CA-27 (Chu/Witt, Democrats).
        "06071": "Part of this county's 2018 House total includes CA-08 (Tim Donnelly vs. Paul Cook, two Republicans) and CA-27 (Judy Chu vs. Bryan Witt, two Democrats); the party split shown here blends those with the county's other district(s).",
        # Los Angeles touches both CA-27 and CA-44 (Barragán/Brown, Democrats).
        "06037": "Part of this county's 2018 House total includes CA-27 (Judy Chu vs. Bryan Witt) and CA-44 (Nanette Diaz Barragán vs. Aja Brown) - both general elections between two Democrats; the party split shown here blends those with the county's other districts.",
        "53033": "Part of this county's 2018 House total includes WA-09, a general election between two Democrats (Adam Smith vs. Sarah Smith); the party split shown here blends that with the county's other district(s).",
        "53053": "Part of this county's 2018 House total includes WA-09, a general election between two Democrats (Adam Smith vs. Sarah Smith); the party split shown here blends that with the county's other district(s).",
    },
    # 2016: 6 CA jungle-primary districts plus WA-07, all Democrat-vs-Democrat (found via
    # house_past_results.csv's 2016 rows' "(D)" trailing markers), plus LA-03 (the
    # reverse shape - two Republicans, Scott Angelle vs. Clay Higgins). LA-03 (and
    # LA-04, a normal D-vs-R contest) both went to a December runoff that MEDSL's
    # source file never covered (its only rows are the November jungle primary, a
    # different contest - same root cause as 2020's LA-05 exclusion, see
    # fill-county-house-2016-medsl.py's docstring) - closed via
    # scripts/patch-county-house-2016-la.py (2026-08-13), user-supplied official
    # parish-level runoff results, validated exact against house_past_results.csv.
    # WA-04 (Clint Didier vs. Dan Newhouse, also two Republicans) is a separate
    # same-party district this year - a normal top-two general, not a jungle-primary/
    # runoff mismatch, so it was never excluded and gets the usual notes below. Every
    # affected county was checked against its own districts_2016 list for wholly-within
    # vs. partial wording.
    2016: {
        # LA-03 (Scott Angelle vs. Clay Higgins, both Republican) - St. Landry is the
        # only parish that also touches another district (LA-04 and LA-05), so it's the
        # only one worded as partial; the other 9 are confirmed single-district
        # (districts_2016 == "3" only) per patch-county-house-2016-la.py.
        **{fips: "This parish's entire 2016 House total is LA-03, a runoff election between two Republicans (Scott Angelle vs. Clay Higgins) - the party split shown here doesn't reflect a Democrat-vs-Republican contest."
           for fips in ["22001", "22019", "22023", "22045", "22053", "22055", "22099", "22101", "22113"]},
        "22097": "Part of this parish's 2016 House total includes LA-03, a runoff election between two Republicans (Scott Angelle vs. Clay Higgins); the party split shown here blends that with the parish's other district(s).",
        "06001": "Part of this county's 2016 House total includes CA-17, a general election between two Democrats (Ro Khanna vs. Mike Honda); the party split shown here blends that with the county's other district(s).",
        "06085": "Part of this county's 2016 House total includes CA-17, a general election between two Democrats (Ro Khanna vs. Mike Honda); the party split shown here blends that with the county's other district(s).",
        # Los Angeles touches all 5 remaining same-party CA districts: CA-29 (Tony
        # Cárdenas vs. Richard Alarcón), CA-32 (Grace Napolitano vs. Roger Hernández),
        # CA-34 (Xavier Becerra vs. Adrienne Nicole Edwards), CA-37 (Karen Bass vs. Chris
        # Blake Wiggins), CA-44 (Nanette Diaz Barragán vs. Isadore Hall III) - all
        # Democrat-vs-Democrat.
        "06037": "Part of this county's 2016 House total includes CA-29 (Tony Cárdenas vs. Richard Alarcón), CA-32 (Grace Napolitano vs. Roger Hernández), CA-34 (Xavier Becerra vs. Adrienne Nicole Edwards), CA-37 (Karen Bass vs. Chris Blake Wiggins), and CA-44 (Nanette Diaz Barragán vs. Isadore Hall III) - all general elections between two Democrats; the party split shown here blends those with the county's other districts.",
        # WA-04 (Clint Didier vs. Dan Newhouse, two Republicans) - Adams/Benton/Franklin/
        # Grant/Okanogan/Yakima confirmed wholly within WA-04 (districts_2016 == "4" only).
        **{fips: "This county's entire 2016 House total is WA-04, a general election between two Republicans (Clint Didier vs. Dan Newhouse) - the party split shown here doesn't reflect a Democrat-vs-Republican contest."
           for fips in ["53001", "53005", "53021", "53025", "53047", "53077"]},
        # Douglas and Walla Walla also touch a normal WA district (Douglas: WA-08; Walla Walla: WA-05).
        "53017": "Part of this county's 2016 House total includes WA-04, a general election between two Republicans (Clint Didier vs. Dan Newhouse); the party split shown here blends that with the county's other district(s).",
        "53071": "Part of this county's 2016 House total includes WA-04, a general election between two Republicans (Clint Didier vs. Dan Newhouse); the party split shown here blends that with the county's other district(s).",
        # King and Snohomish touch WA-07 (Pramila Jayapal vs. Brady Walkinshaw, two Democrats).
        "53033": "Part of this county's 2016 House total includes WA-07, a general election between two Democrats (Pramila Jayapal vs. Brady Walkinshaw); the party split shown here blends that with the county's other district(s).",
        "53061": "Part of this county's 2016 House total includes WA-07, a general election between two Democrats (Pramila Jayapal vs. Brady Walkinshaw); the party split shown here blends that with the county's other district(s).",
    },
}

def two_pct(a, b):
    total = a + b
    return round(a / total * 100, 2) if total else 0.0

# Districts whose house_past_results.csv row is a literal 0/0 (dem_votes AND rep_votes
# both zero) - a race no source has ever had real vote data for (uncontested after an
# opponent withdrew, or a candidate ran with no major-party opposition at all), not an
# ordinary "nobody voted" county. Keyed by (state_abbr, district_number, year) ->
# (demPct, repPct) straight from that reference row. Used below: a county whose ENTIRE
# 2024/etc. House total is 0 (no source has county-level data either) but whose only
# district(s) are all one of these literal-0/0 races gets that district's known
# demPct/repPct with votesKnown=False, instead of reading as a fabricated 0-0 tie.
ZERO_VOTE_DISTRICTS = {}
with open(os.path.join(os.path.dirname(__file__), "../data-entry/house_past_results.csv"), newline="") as f:
    for r in csv.DictReader(f):
        if r["dem_votes"] in ("0", "") and r["rep_votes"] in ("0", ""):
            dnum = int(r["district_name"].split("-")[1])
            ZERO_VOTE_DISTRICTS[(r["state_abbr"], dnum, int(r["year"]))] = (
                float(r["dem_pct"]), float(r["rep_pct"])
            )

counties = {}
for path in SRC_FILES:
    year = int(re.search(r"_(\d{4})\.csv$", path).group(1))
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            fips = r["county_id"]
            entry = counties.setdefault(fips, {"state": r["state"], "countyName": r["county_name"], "years": {}})
            dem, gop, oth, total = int(r[f"dem_{year}"]), int(r[f"gop_{year}"]), int(r[f"oth_{year}"]), int(r[f"total_{year}"])
            districts_raw = r.get(f"districts_{year}", "").strip()
            districts = [int(d) for d in districts_raw.split(";") if d.strip()]

            votes_known = True
            if total == 0 and districts:
                zero_pcts = {ZERO_VOTE_DISTRICTS.get((r["state"], d, year)) for d in districts}
                if len(zero_pcts) == 1 and None not in zero_pcts:
                    dem_pct, rep_pct = next(iter(zero_pcts))
                    votes_known = False

            if votes_known:
                dem_pct, rep_pct = two_pct(dem, gop), two_pct(gop, dem)

            entry["years"][year] = {
                "dem": dem, "gop": gop, "oth": oth, "total": total,
                "demPct": round(dem_pct, 2), "repPct": round(rep_pct, 2),
                "margin": round(rep_pct - dem_pct, 2),
                "votesKnown": votes_known,
                "samePartyNote": SAME_PARTY_NOTES.get(year, {}).get(fips),
                "districts": districts,
            }

out = [
    "// Auto-generated by scripts/generate-county-house-data.py",
    "// Source: data-entry/county_house_results_{year}.csv, fetched from OpenElections",
    "// (scripts/fetch-openelections-house-{year}.py). Each county's dem/gop numbers are",
    "// the SUM of every congressional district race that touches that county (districts",
    "// are matched to their own dem/rep candidates via data-entry/house_past_results.csv,",
    "// then bucketed votes are summed per county across every district present there) -",
    "// unlike President/Senate/Governor, House isn't a single statewide race. Margins are",
    "// R-positive (positive = R advantage). Key = 5-digit county FIPS. Only states with",
    "// county-level source data compiled so far are present; others simply have no entry.",
    f"// Years covered: {', '.join(str(y) for y in YEARS)}.",
    "// Known gaps: SD 2024's Republican column runs ~3.4% under house_past_results.csv -",
    "// confirmed baked into the OpenElections source file itself (all 66 counties present,",
    "// no bucketing/matching issue), not a scraper bug. MS 2024 is ~0.24% under on gop,",
    "// within the usual absentee/rounding tolerance seen throughout this project.",
    "// 2024: AK's 29 boroughs ARE included this year - reconstructed from the state's",
    "// official Cast Vote Record via a full ranked-choice tabulation (AK's House race",
    "// needed RCV; final round Begich vs. Peltola runs ~1.2-1.4% high on both candidates",
    "// vs. the certified statewide numbers, though the winner and margin are close) plus a",
    "// verified precinct→borough crosswalk. See data-entry/README-ak-cvr-reconstructions.md",
    "// for full methodology, including how the roughly half the vote AK only resolves to a",
    "// state house district (not a precinct) was apportioned across boroughs, and the real",
    "// ballot-parsing bugs found/fixed along the way. districts_2024 is [1] for every AK",
    "// county (single at-large district), same convention as SD/WY/other at-large states.",
    "// 2022: AK's 29 boroughs ARE included this year too, same CVR methodology as 2024 -",
    "// full IRV tabulation (final round Peltola vs. Palin matches certified within ~0.01%,",
    "// the closest CVR-derived validation this project has achieved). districts_2022 is",
    "// [1] for every AK county. See data-entry/README-ak-cvr-reconstructions.md.",
    "// IN excluded entirely - only 38 of its 92",
    "// counties appear in MEDSL's 2022 file at all, and even those are severely",
    "// undercounted in 8 of its 9 districts; no OpenElections or Wikipedia 2022 IN data",
    "// exists either. IL's Cook and DuPage counties excluded - IL-03/04/06/07 are",
    "// entirely absent from MEDSL's file and no other source covers them. MI's Midland",
    "// and FL's St. Johns/Duval excluded for similar severe single-county source gaps.",
    "// LA is included despite undercounting by ~10-15% (MEDSL's LA precinct data is",
    "// incomplete for 2022, a smaller version of the same early-voting gap documented for",
    "// 2024). ME runs ~2-4% under on dem/gop and ~50% under on total - Maine's federal",
    "// races use ranked-choice voting and MEDSL's precinct file only has first-round",
    "// counts, plus some non-candidate ballot-accounting rows couldn't be cleanly excluded.",
    "// 2020: AK has no county-level House data (same structural gap as every other",
    "// year/office). IN was excluded from MEDSL (only 53/92 counties present) and",
    "// fetched instead from Indiana's own SOS ENR portal - exact match, all 92 counties.",
    "// LA-05 (and the 20 parishes wholly within it) excluded entirely: Ralph Abraham",
    "// didn't seek reelection, no candidate cleared 50% in the November jungle primary,",
    "// so the seat went to a December runoff between two Republicans (Luke Letlow vs.",
    "// Lance Harris) - MEDSL's only rows for LA-05 are the November primary itself (a",
    "// different contest, 9 candidates, ~310k votes vs. the runoff's 79k), same root",
    "// cause as this project's 2016 LA Senate runoff gap. FL's Hendry County has no",
    "// House data in MEDSL or OpenElections' 2020 FL file either (~13k total votes,",
    "// negligible relative to FL's ~10.5M) - same severe single-county gap class as",
    "// 2022's FL St. Johns/Duval.",
    "// 2018: AK has no county-level House data (same structural gap as every other",
    "// year/office). IN excluded from MEDSL (only 53/92 counties present) and fetched",
    "// instead from Indiana's own SOS ENR portal - exact match, all 92 counties. NY",
    "// excluded from MEDSL entirely (only 47/62 counties present - MEDSL's own README",
    "// documents large data-quality trims for NY 2018) and instead filled from",
    "// OpenElections' raw NY precinct file directly (60/62 counties; still short Orange",
    "// and Wyoming, genuinely absent from OpenElections' own file too). ME-02 (the 2018",
    "// Golden-vs-Poliquin ranked-choice race, the first RCV U.S. House election) is",
    "// entirely absent from both MEDSL and OpenElections' Maine files - only the 6",
    "// ME-01 counties (Cumberland/Kennebec/Knox/Lincoln/Sagadahoc/York) have any 2018",
    "// House data; ME's RCV round-by-round tabulation isn't published in either source's",
    "// standard format. NJ's Middlesex County has no absentee/early/provisional-mode rows",
    "// at all in MEDSL's 2018 file (ELECTION DAY only) - undercounts NJ-06 and NJ-12,",
    "// the only two districts Middlesex touches, by ~10%; MEDSL's own NJ data is sourced",
    "// from OpenElections, so this is a source-level gap, not recoverable by re-sourcing.",
    "// 2016: AK has no county-level House data (same structural gap as every other",
    "// year/office). IN fetched from its own SOS ENR portal (exact match, all 92",
    "// counties) rather than MEDSL, per this year's now-standard IN workflow. LA-03 and",
    "// LA-04 (and the 23 parishes wholly or mostly within them) excluded entirely - both",
    "// went to December runoffs after no jungle-primary candidate cleared 50%; MEDSL's",
    "// only rows are the November primary, a different contest (confirmed: primary",
    "// totals for both districts' top two finishers are HIGHER than their runoff totals",
    "// per house_past_results.csv, the opposite direction from a missing-votes bug) -",
    "// same root cause as 2020's LA-05 exclusion. TX-08 (Kevin Brady, unopposed) and",
    "// OK-01 (Jim Bridenstine, unopposed after his opponent withdrew - no general",
    "// election was held at all) are both entirely absent from this file; Tulsa/Wagoner/",
    "// Washington (OK) and Montgomery/Walker/Trinity/Madison/Houston/San Jacinto/Grimes",
    "// (TX) are wholly within these districts and so appear \"missing\" from the county",
    "// sweep, but OK's and TX's STATE-LEVEL totals both still match house_past_results.csv",
    "// exactly, confirming no real data was lost for OK-01 (0/0, same unopposed-race",
    "// class as 2020's FL-05/2024's OK-03) - TX-08's ~236k Republican votes ARE a real,",
    "// unrecovered gap, just isolated to that one district. SC's Democratic column runs",
    "// ~3-9% under in SC-01/02/07 specifically - this file separates out \"Straight",
    "// ticket\" party-line votes as their own office/candidate rows with a BLANK district",
    "// field (SC's coverage notes say to add them back to each candidate's total, but",
    "// with no district tag they can't be attributed to a specific U.S. House race",
    "// without a separate precinct-to-district crosswalk this file doesn't provide).",
    "// UT-01's Democratic column runs ~11% under with no identified cause (candidate",
    "// name matches cleanly, county coverage is complete) - accepted as an unexplained",
    "// source-data shortfall, in the same tolerance-adjacent class as other minor",
    "// per-district gaps this project has documented rather than chased indefinitely.",
    "",
    "export type CountyYearResult = {",
    "  demVotes: number; repVotes: number; othVotes: number; totalVotes: number;",
    "  demPct: number; repPct: number; // two-party",
    "  margin: number; // R-positive (repPct - demPct)",
    "  // Set when this county's total includes a top-two/jungle-primary district where",
    "  // both general-election candidates share the same party (CA, WA) - the dem/gop",
    "  // bucketing is still correct (true party, not ballot column), but the D-vs-R",
    "  // framing is misleading for the affected district(s) without this context.",
    "  samePartyNote?: string;",
    "  // False only for a county whose entire House total that year is a literal 0/0",
    "  // unopposed race (house_past_results.csv itself has no vote counts, not just this",
    "  // pipeline) - demPct/repPct still reflect the real 100/0 outcome, but demVotes/",
    "  // repVotes/totalVotes are meaningless zeros, not real counts. Absent (the default",
    "  // for every other county) means votes ARE known - county data otherwise always",
    "  // carries real vote counts, unlike some district/state-level PastResult rows.",
    "  votesKnown?: boolean;",
    "  // Congressional district number(s) that contributed to this county's totals that",
    "  // year (a county can span multiple districts, and which ones can change between",
    "  // years due to redistricting). Combine with the county's own `state` for a label",
    "  // like \"WA-04\". Empty when a row's district couldn't be resolved (rare - see",
    "  // fetch-openelections-house-2024.py's statewide-fallback-match path).",
    "  districts: number[];",
    "};",
    "export type CountyHouseResult = {",
    "  state: string;",
    "  countyName: string;",
    "  years: Partial<Record<number, CountyYearResult>>;",
    "};",
    "",
    "export const countyHouseData: Record<string, CountyHouseResult> = {",
]

for fips, c in sorted(counties.items()):
    year_entries = ", ".join(
        f'{y}: {{ demVotes: {v["dem"]}, repVotes: {v["gop"]}, othVotes: {v["oth"]}, totalVotes: {v["total"]}, '
        f'demPct: {v["demPct"]}, repPct: {v["repPct"]}, margin: {v["margin"]}'
        + (', votesKnown: false' if not v["votesKnown"] else "")
        + (f', samePartyNote: "{v["samePartyNote"]}"' if v.get("samePartyNote") else "")
        + f', districts: [{", ".join(str(d) for d in v["districts"])}]'
        + " }"
        for y, v in sorted(c["years"].items())
    )
    name = c["countyName"].replace('"', '\\"')
    out.append(
        f'  "{fips}": {{ state: "{c["state"]}", countyName: "{name}", years: {{ {year_entries} }} }},'
    )

out += ["};", ""]

with open(DST, "w") as f:
    f.write("\n".join(out))

print(f"Written {len(counties)} counties across years {YEARS} -> {DST}")
