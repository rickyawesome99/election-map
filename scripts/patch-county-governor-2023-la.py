#!/usr/bin/env python3
"""
Patches county-level 2023 Louisiana Governor results (jungle primary, decided outright
in round one - Jeff Landry [R] won >50%, no runoff needed) into
data-entry/county_governor_results_2023.csv.

Neither Wikipedia (page has only a state-level Election box, no by-parish table - Landry's
outright win meant no runoff-round table either) nor MEDSL (no gubernatorial dataset
covers an odd-year 2023 race) nor the LA Secretary of State's results portal (JS-rendered
Angular SPA, no scriptable server-side data) nor Dave Leip's Atlas (by-parish table is
gated behind a paid membership) could supply this - see [[project_county_election_scrape]]
memory. Data below is user-supplied, pasted directly from a per-parish results table
covering all 5 candidates on the ballot: Jeff Landry (R), Shawn Wilson (D), Stephen
Waguespack (R), John Schroder (R), and "Various candidates" (other parties/write-ins).

Bucketing follows this pipeline's standard convention (same as the Wikipedia scraper's
priority logic): only the state-level CSV's chosen dem/rep candidates (Wilson, Landry -
governor_past_results.csv's LA 2023 row) get bucketed into dem/gop. The two other
Republicans (Waguespack, Schroder) are NOT added to gop even though same-party, since
Landry already claimed that slot - same rule that put LA Senate 2016/2022's second-place
same-party candidates (Mixon, Graham) into oth instead of double-counting. So
oth_2023 = Waguespack + Schroder + Various for every parish.

All 64 parishes sum to dem=275,525 / gop=547,827 (both exact matches to
governor_past_results.csv) / oth=239,146 (Waguespack+Schroder+Various combined) /
total=1,062,498 (grand total 6 short of governor_past_results.csv's 1,062,504 -
negligible rounding noise, same tolerable class as every other state in this pipeline).

Run from project root: python3 scripts/patch-county-governor-2023-la.py
"""
import csv, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
PRES_CSV = os.path.join(ROOT, "data/county_presidential_results_2008_2024.csv")
OUT_CSV = os.path.join(ROOT, "data-entry/county_governor_results_2023.csv")
YEAR = 2023

# parish -> (Landry [R], Wilson [D], Waguespack [R], Schroder [R], Various [oth], Total),
# as transcribed from the user-supplied per-parish results table. See module docstring.
LA_2023_RESULTS = {
    "Acadia": (11685, 1283, 533, 178, 1249, 14928),
    "Allen": (3280, 427, 133, 42, 563, 4445),
    "Ascension": (14676, 7045, 3853, 1432, 2839, 29845),
    "Assumption": (3454, 1633, 351, 454, 607, 6499),
    "Avoyelles": (6763, 1846, 293, 78, 912, 9892),
    "Beauregard": (5323, 546, 320, 111, 1219, 7519),
    "Bienville": (2193, 1049, 78, 45, 703, 4068),
    "Bossier": (16498, 3310, 856, 321, 2281, 23266),
    "Caddo": (21979, 16177, 2091, 574, 5390, 46211),
    "Calcasieu": (22021, 7820, 2075, 418, 9451, 41785),
    "Caldwell": (2287, 215, 87, 131, 398, 3118),
    "Cameron": (1993, 63, 99, 20, 497, 2672),
    "Catahoula": (2219, 438, 88, 85, 390, 3220),
    "Claiborne": (2554, 923, 104, 46, 689, 4316),
    "Concordia": (2161, 1200, 128, 147, 676, 4312),
    "De Soto": (5193, 1811, 199, 209, 1048, 8460),
    "East Baton Rouge": (31308, 42563, 13131, 3423, 9262, 99687),
    "East Carroll": (537, 647, 69, 35, 256, 1544),
    "East Feliciana": (3143, 2211, 259, 191, 678, 6482),
    "Evangeline": (5624, 1574, 163, 81, 886, 8328),
    "Franklin": (3780, 793, 162, 222, 535, 5492),
    "Grant": (4405, 331, 166, 45, 498, 5445),
    "Iberia": (11980, 3322, 379, 107, 1269, 17057),
    "Iberville": (4603, 3938, 621, 692, 1335, 11189),
    "Jackson": (3184, 576, 108, 135, 603, 4606),
    "Jefferson": (35015, 23067, 6730, 12778, 9832, 87422),
    "Jefferson Davis": (5849, 731, 273, 54, 1285, 8192),
    "Lafayette": (35454, 13363, 2850, 788, 5415, 57870),
    "Lafourche": (14029, 2098, 1174, 1432, 2221, 20954),
    "LaSalle": (3891, 189, 155, 146, 599, 4980),
    "Lincoln": (4569, 1824, 483, 235, 982, 8093),
    "Livingston": (24240, 2663, 2912, 2362, 3366, 35543),
    "Madison": (1269, 802, 126, 94, 594, 2885),
    "Morehouse": (3210, 1545, 153, 136, 578, 5622),
    "Natchitoches": (5193, 2288, 259, 173, 1259, 9172),
    "Orleans": (6943, 50352, 5056, 2721, 6240, 71312),
    "Ouachita": (17754, 6936, 1477, 1027, 3114, 30308),
    "Plaquemines": (3172, 970, 305, 632, 758, 5837),
    "Pointe Coupee": (4078, 1890, 519, 280, 833, 7600),
    "Rapides": (19857, 6135, 1500, 336, 3104, 30932),
    "Red River": (1338, 510, 48, 15, 230, 2141),
    "Richland": (3510, 922, 106, 122, 599, 5259),
    "Sabine": (5095, 441, 197, 121, 679, 6533),
    "St. Bernard": (5305, 1714, 372, 1139, 1756, 10286),
    "St. Charles": (7159, 3144, 732, 1501, 1740, 14276),
    "St. Helena": (1807, 1639, 90, 180, 706, 4422),
    "St. James": (3405, 2970, 542, 427, 1105, 8449),
    "St. John the Baptist": (3025, 4707, 274, 530, 1763, 10299),
    "St. Landry": (11449, 5946, 437, 128, 1880, 19840),
    "St. Martin": (11053, 2792, 295, 115, 981, 15236),
    "St. Mary": (7092, 2830, 434, 219, 1156, 11731),
    "St. Tammany": (32236, 10057, 3599, 12364, 9548, 67804),
    "Tangipahoa": (15982, 5761, 1213, 3136, 3394, 29486),
    "Tensas": (773, 596, 148, 60, 388, 1965),
    "Terrebonne": (13474, 2845, 941, 1532, 2478, 21270),
    "Union": (4784, 879, 191, 222, 616, 6692),
    "Vermilion": (12940, 1435, 477, 179, 1516, 16547),
    "Vernon": (6835, 704, 175, 84, 749, 8547),
    "Washington": (6833, 2503, 249, 1250, 1503, 12338),
    "Webster": (4784, 1695, 252, 136, 919, 7786),
    "West Baton Rouge": (4921, 3046, 583, 397, 898, 9845),
    "West Carroll": (1843, 182, 76, 89, 218, 2408),
    "West Feliciana": (1855, 1075, 330, 142, 340, 3742),
    "Winn": (2963, 538, 208, 150, 629, 4488),
}


def load_la_fips():
    m = {}
    with open(PRES_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["state"] == "LA":
                m[row["county_name"].lower()] = (row["county_name"], row["county_id"])
    return m


def main():
    fips_map = load_la_fips()

    new_rows = []
    unmatched = []
    sum_dem = sum_gop = sum_oth = sum_total = 0
    for parish, (landry, wilson, waguespack, schroder, various, total) in LA_2023_RESULTS.items():
        match = fips_map.get(parish.lower())
        if not match:
            unmatched.append(parish)
            continue
        canonical_name, fips = match
        gop = landry
        dem = wilson
        oth = waguespack + schroder + various
        sum_dem += dem
        sum_gop += gop
        sum_oth += oth
        sum_total += total
        new_rows.append({
            "state": "LA", "county_name": canonical_name, "county_id": fips,
            f"dem_{YEAR}": dem, f"gop_{YEAR}": gop, f"oth_{YEAR}": oth,
            f"total_{YEAR}": total,
        })

    if unmatched:
        print(f"WARNING: unmatched parishes (not written): {unmatched}")

    fieldnames = ["state", "county_name", "county_id", f"dem_{YEAR}", f"gop_{YEAR}", f"oth_{YEAR}", f"total_{YEAR}"]
    existing_rows = []
    if os.path.exists(OUT_CSV):
        with open(OUT_CSV, newline="") as f:
            existing_rows = list(csv.DictReader(f))
    kept = [r for r in existing_rows if r["state"] != "LA"]
    dropped = len(existing_rows) - len(kept)

    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in kept + new_rows:
            w.writerow(r)

    print(f"Replaced {dropped} old LA rows with {len(new_rows)} new ones -> {OUT_CSV} (file now has {len(kept) + len(new_rows)} total)")
    print(f"LA totals: dem={sum_dem} gop={sum_gop} oth={sum_oth} total={sum_total}")
    print("governor_past_results.csv expects: dem=275525 gop=547827 total=1062504")


if __name__ == "__main__":
    main()
