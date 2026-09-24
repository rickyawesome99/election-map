// Every external source behind the data on this site — the content of /methodology/sources.
//
// RULE: when a dataset is added, re-sourced or patched from somewhere new, add or amend the entry
// here in the same change. `where` names the file or script the source lands in, so a number on
// the site can be traced back to who published it. A dataset whose origin was never written down
// belongs in UNRECORDED_PROVENANCE, not in a guessed entry.

export type SourceKind = "official" | "academic" | "project" | "wiki" | "news" | "service";

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  official: "Official government",
  academic: "Academic archive",
  project: "Data project",
  wiki: "Wikimedia",
  news: "News / commercial",
  service: "Live service",
};

export interface SourceUse {
  data: string;   // the data point(s) taken from this source
  where: string;  // file or script it lands in
}

export interface Source {
  name: string;
  publisher?: string;
  url?: string;
  kind: SourceKind;
  uses: SourceUse[];
  note?: string; // coverage limits, access method, caveats worth knowing before re-pulling
}

export interface SourceGroup {
  id: string;
  kicker: string;
  title: string;
  lede: string;
  sources: Source[];
}

export const SOURCE_GROUPS: SourceGroup[] = [
  {
    id: "results",
    kicker: "President · Senate · Governor · House",
    title: "Statewide and district results",
    lede: "The past-results spreadsheets behind every race page, the TPL models and WAR. They were entered by hand and then audited row by row against certified results; the audit trail is data-entry/AUDIT_LOG.md.",
    sources: [
      {
        name: "Wikipedia election articles", publisher: "Wikimedia Foundation", url: "https://en.wikipedia.org/wiki/2024_United_States_Senate_elections", kind: "wiki",
        uses: [
          { data: "Certified results used to audit every President, Senate, Governor and House row 2012–2025 (about 340 rows corrected; 250 state-year House pages diffed by script)", where: "data-entry/{president,senate,governor,house}_past_results.csv · house_del_history.csv · AUDIT_LOG.md" },
          { data: "Per-race article URL kept beside each Senate row", where: "senate_past_results.csv → wikipedia_url" },
          { data: "2026 nominees for all 506 races, read from each race article's raw wikitext after the primaries", where: "data-entry/{senate,governor,house}_seats.csv" },
        ],
        note: "Conventions fixed by the audit: Louisiana and Georgia rows hold the decisive (runoff) round, Alaska and Maine the final ranked-choice round, New York and Connecticut fusion candidates their all-lines total, and total_votes is the percentage denominator (sum of candidate votes), not ballots cast.",
      },
      {
        name: "Alaska Division of Elections", url: "https://www.elections.alaska.gov/election-results/", kind: "official",
        uses: [{ data: "Ranked-choice final-round results (2022 onward), rebuilt from the Cast Vote Record", where: "data-entry/README-ak-cvr-reconstructions.md" }],
      },
    ],
  },
  {
    id: "county",
    kicker: "President 2008–2024 · Senate 2016–2024 · Governor 2016–2025 · House 2016–2024",
    title: "County-level results",
    lede: "Built source by source in a fixed order — a ready-made county file, then Wikipedia's by-county tables, then precinct returns summed to counties, then the state's own canvass — with every state's county sum cross-checked against the statewide row.",
    sources: [
      {
        name: "Wikipedia “By county” tables", publisher: "Wikimedia Foundation", url: "https://en.wikipedia.org/wiki/2022_Texas_gubernatorial_election", kind: "wiki",
        uses: [
          { data: "Senate by county, 2016–2024 including specials", where: "scripts/scrape-county-senate-*.py → county_senate_results_*.csv" },
          { data: "Governor by county, 2016–2025", where: "scripts/scrape-county-governor-*.py → county_governor_results_*.csv" },
          { data: "House by county, 2024, for states OpenElections does not cover; single-county patches (AR 2022)", where: "scripts/scrape-county-house-2024.py" },
        ],
      },
      {
        name: "OpenElections", url: "https://github.com/openelections", kind: "project",
        uses: [
          { data: "Governor by county, 2016 and 2018", where: "scripts/fetch-openelections-governor-*.py" },
          { data: "House by county, 2022 (SD, TN, WV, WY) and 2024; New York House 2018", where: "scripts/fetch-openelections-house-*.py · fill-county-house-2018-ny-openelections.py" },
          { data: "Tennessee 2022 precinct returns", where: "data-entry/medsl/tn22_openelections_precinct.csv" },
        ],
        note: "Coverage has to be re-surveyed every cycle; a state's 2024 folder says nothing about its 2022 one.",
      },
      {
        name: "MIT Election Data and Science Lab — precinct-level returns", publisher: "Harvard Dataverse", url: "https://dataverse.harvard.edu/dataverse/medsl_election_returns", kind: "academic",
        uses: [
          { data: "House by county, 2016–2024, summed from precinct rows (2022 file: doi:10.7910/DVN/EOKNGW)", where: "scripts/fill-county-house-*-medsl.py · data-entry/medsl/house_*_precinct.*" },
          { data: "Senate by county, 2016–2022 including specials; New York 2024 fusion totals", where: "scripts/fill-county-senate-*-medsl.py · fill-ny-senate-2024-fusion.py" },
          { data: "County presidential returns 2000–2016", where: "data-entry/medsl/president_2000-2016_county.csv" },
        ],
        note: "Known holes: Alaska's county_fips is a state-house district, not a borough; Louisiana's file excludes early voting; Indiana 2022 has 38 of 92 counties.",
      },
      {
        name: "Indiana Secretary of State — election night reporting archive", url: "https://enr.indianavoters.in.gov/", kind: "official",
        uses: [{ data: "Indiana House by county, 2016–2024 (certified)", where: "scripts/fetch-in-sos-house-*.py" }],
        note: "A client-rendered app; past generals live at /archive/{year}General/ and the data is in its JSON files.",
      },
      {
        name: "Alaska Division of Elections — precinct results and Cast Vote Records", url: "https://www.elections.alaska.gov/election-results/", kind: "official",
        uses: [{ data: "Every Alaska borough and census-area figure, 2016–2024: precincts assigned to boroughs, and ranked-choice rounds re-tabulated from the CVR for 2022 onward", where: "data-entry/README-ak-cvr-reconstructions.md" }],
        note: "Alaska reports by precinct and state house district only; no source publishes a by-borough table.",
      },
      {
        name: "Maine Secretary of State — 2018 Cast Vote Records", url: "https://www.maine.gov/sos/elections-voting/election-results-data", kind: "official",
        uses: [{ data: "ME-02 2018 final ranked-choice round by county", where: "scripts/fill-county-house-2018-me-cd2-rcv.py" }],
      },
      {
        name: "Louisiana Secretary of State — official parish results", url: "https://voterportal.sos.la.gov/graphical", kind: "official",
        uses: [
          { data: "2024 House by parish (replaces MEDSL, which omits early voting)", where: "data-entry/la_2024_official_results.xlsx · scripts/patch-county-house-2024-la-official.py" },
          { data: "Runoff results by parish: Senate 2016, House 2016 and 2020, Governor 2019 and 2023 (supplied by hand)", where: "scripts/patch-county-*-la.py" },
        ],
        note: "The portal is a JavaScript app with no fetchable data; these figures were exported or transcribed by hand.",
      },
      {
        name: "Illinois State Board of Elections", url: "https://www.elections.il.gov/", kind: "official",
        uses: [{ data: "Cook and DuPage County, 2022 House (IL-03/04/06/07), supplied by hand", where: "scripts/patch-county-house-2022-il-cook-dupage.py" }],
      },
      {
        name: "CNN 2016 election results", url: "https://www.cnn.com/election/2016/results/states/south-carolina/senate", kind: "news",
        uses: [{ data: "South Carolina 2016 Senate by county (transcribed)", where: "scripts/patch-county-senate-2016-sc.py" }],
      },
      {
        name: "Hand-supplied official county tables", kind: "official",
        uses: [{ data: "One-off gaps no public file covered: TX-08 2016, Missouri and North Carolina Governor 2020, Florida and Idaho counties in 2022, OH-14 Trumbull County 2024 (an election-night figure)", where: "scripts/patch-county-*.py — each script's docstring records what was supplied" }],
      },
    ],
  },
  {
    id: "by-district",
    kicker: "Statewide races cut by congressional district",
    title: "Presidential and statewide results by congressional district",
    lede: "What District TPL, the boundary shift and the House pages' “recent statewide results” read. Every figure is a share of the full total vote.",
    sources: [
      {
        name: "electindex", url: "https://electindex.com/", kind: "project",
        uses: [{ data: "2016, 2020 and 2024 presidential votes re-aggregated onto the 2026 congressional lines", where: "data-entry/electindex_historical.csv · house_pres_2026_dist.csv → data/districtPresidentialData.ts" }],
        note: "The file's own margin columns are two-party and are ignored; margins are recomputed from the vote columns.",
      },
      {
        name: "The Downballot (formerly Daily Kos Elections)", url: "https://www.the-downballot.com/p/data", kind: "project",
        uses: [
          { data: "2020 president on the 2022 lines, all 435 districts; 2008–2016 president on Pennsylvania's 2018 lines", where: "data-entry/downballot/*.csv → pres_by_boundary_vintage.csv" },
          { data: "First stop for Senate and Governor results by congressional district", where: "data-entry/house_statewide_results.csv" },
        ],
      },
      {
        name: "MIT Election Data and Science Lab — precinct returns", publisher: "Harvard Dataverse", url: "https://dataverse.harvard.edu/dataverse/medsl_election_returns", kind: "academic",
        uses: [
          { data: "2024 president on the 2022 maps of AL, GA, LA, NC and NY (precincts joined to their 2022 House district)", where: "scripts/build-pres-on-old-lines-from-precincts.py → pres_on_old_lines_precinct.csv" },
          { data: "Senate and Governor by district where no published cut exists: Senate 2022, Oklahoma special 2022, MI and PA Senate 2024, MI / NH / TN Governor 2022", where: "scripts/fill-house-statewide-*.py" },
        ],
      },
      {
        name: "North Carolina State Board of Elections — precinct results", url: "https://www.ncsbe.gov/results-data/election-results", kind: "official",
        uses: [{ data: "2020 president on North Carolina's 2018 map; 2024 president on its 2022 map", where: "pres_on_old_lines_precinct.csv" }],
      },
      {
        name: "California Secretary of State — Statement of Vote", url: "https://www.sos.ca.gov/elections/prior-elections/statewide-election-results", kind: "official",
        uses: [{ data: "U.S. Senate by congressional district (“Counties by Congressional District” supplement)", where: "house_statewide_results.csv" }],
      },
      {
        name: "Connecticut Secretary of the State — Statement of Vote", url: "https://portal.ct.gov/sots", kind: "official",
        uses: [{ data: "2022 Senate and Governor by district, from town-level returns", where: "house_statewide_results.csv" }],
      },
      {
        name: "U.S. Census Bureau — congressional district relationship files", url: "https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.html", kind: "official",
        uses: [{ data: "Which counties sit in which district on each map (tab20_cd118…); the check that caught four states drawn on the wrong map", where: "county-to-district audits" }],
      },
    ],
  },
  {
    id: "state-leg",
    kicker: "99 chambers",
    title: "State legislatures",
    lede: "Chamber results 2016–2025 statewide and by district, the 2024 presidential vote inside every legislative district, who holds each seat, and when it is next up.",
    sources: [
      {
        name: "Klarner, State Legislative Election Returns 1967–2022", publisher: "Harvard Dataverse", url: "https://doi.org/10.7910/DVN/FJOGJB", kind: "academic",
        uses: [{ data: "Votes and seats by chamber and by district, 2016–2022 (357 chamber-year rows)", where: "data-entry/state_leg_klarner.csv · scripts/build-state-leg-*-from-klarner.py" }],
        note: "Ends at 2022. Omits Louisiana and Nebraska. Defective for the New Hampshire House 2022 (doubled districts).",
      },
      {
        name: "MIT Election Data and Science Lab — State Precinct-Level Returns 2024", publisher: "Harvard Dataverse", url: "https://doi.org/10.7910/DVN/DODOBJ", kind: "academic",
        uses: [
          { data: "2024 legislative votes by chamber and district (73 chamber rows; doi:10.7910/DVN/DODOBJ)", where: "scripts/build-state-leg-*-from-medsl.py" },
          { data: "2024 president by legislative district, from “Precinct-Level Returns 2024 by Individual State” (doi:10.7910/DVN/NYTPDU): presidential precinct rows apportioned through the same precinct's legislative race", where: "scripts/crosswalk-state-leg-pres2024.py → data/stateLegPres2024.ts" },
        ],
      },
      {
        name: "Dave's Redistricting App — VTD election data", url: "https://github.com/dra2020/vtd_data", kind: "project",
        uses: [{ data: "2024 president by legislative district where the precinct crosswalk cannot reach: off-cycle halves of staggered senates, partly-tagged states, dense urban precincts (area-weighted overlay of 2020 VTDs carrying E_24_PRES)", where: "scripts/dra-overlay-state-leg-pres2024.py" }],
        note: "No 2024 presidential layer for AK, AR, CT, ID, ME, MI, ND, NJ, OK, OR, PA, SD as of August 2026.",
      },
      {
        name: "State election offices — official canvasses", kind: "official",
        uses: [
          { data: "Louisiana SoS 2019 and 2023 · Mississippi SoS 2023 recapitulation sheet · New Jersey Division of Elections 2023 · New Mexico SoS 2024 state canvass · New York State Board of Elections 2024 canvass · New Hampshire SoS 2022 county canvasses · Vermont SoS 2018 town returns", where: "scripts/build-{state}-{year}-leg-votes.py → data-entry/{state}_{year}_legislature.csv" },
        ],
        note: "Used where Klarner stops, MEDSL has no odd-year volume, or both are wrong for the chamber.",
      },
      {
        name: "Wikipedia legislative election district tables", publisher: "Wikimedia Foundation", url: "https://en.wikipedia.org/wiki/2024_Nebraska_Legislature_election", kind: "wiki",
        uses: [{ data: "Last resort for chamber-years no file covers, and all of Nebraska (officially nonpartisan — party is the endorsement). 13 rows remain flagged “Wikipedia (unverified)”", where: "scripts/build-state-leg-*-from-wikipedia.py · build-nebraska-leg-votes.py" }],
      },
      {
        name: "King County Elections — final precinct results", url: "https://data.kingcounty.gov/", kind: "official",
        uses: [{ data: "King County, Washington 2024 president by legislative district (dataset uuda-pmuy)", where: "scripts/fill-wa-king-county-pres2024.py" }],
      },
      {
        name: "U.S. Census Bureau — 2020 voting districts (VTDs)", url: "https://www2.census.gov/geo/tiger/TIGER2020PL/", kind: "official",
        uses: [{ data: "Precinct geometry for the spatial join in odd-year states and post-2024 maps (LA, NJ, VA, MS, MI Senate)", where: "scripts/spatial-join-state-leg-pres2024.py" }],
      },
      {
        name: "Louisiana Legislature — 2024 precinct shapefiles", url: "https://redist.legis.la.gov/default_ShapeFiles2020", kind: "official",
        uses: [{ data: "Louisiana precinct geometry for the same join", where: "scripts/spatial-join-state-leg-pres2024.py" }],
      },
      {
        name: "Virginia Department of Elections — precinct GIS", url: "https://www.elections.virginia.gov/casting-a-ballot/redistricting/gis/", kind: "official",
        uses: [{ data: "Current precinct boundaries by locality, for Virginia's president-by-district join", where: "scripts/spatial-join-state-leg-pres2024.py" }],
      },
      {
        name: "Open States", publisher: "Plural Policy", url: "https://openstates.org/", kind: "project",
        uses: [{ data: "Sitting legislator, party and district for all 99 chambers (People API)", where: "data-entry/state-leg-incumbents/ → data/stateLegDistricts.ts" }],
        note: "Needs OPENSTATES_API_KEY. Party overrides (Nebraska) and members the dump omits are kept in data-entry/state-leg-party-overrides/ and state-leg-incumbent-additions/.",
      },
      {
        name: "Ballotpedia · National Conference of State Legislatures", kind: "project",
        uses: [{ data: "Term lengths, staggering and off-cycle calendars behind each seat's next election", where: "data-entry/state-leg-election-years.mjs" }],
      },
      {
        name: "New Hampshire General Court", url: "https://gc.nh.gov/", kind: "official",
        uses: [{ data: "House district structure: 203 districts, 400 seats, base and floterial (RSA 662:5)", where: "scripts/build-nh-house-district-structure.mjs" }],
      },
    ],
  },
  {
    id: "boundaries",
    kicker: "Maps",
    title: "District and county boundaries",
    lede: "Every map is simplified with mapshaper and served as per-state TopoJSON. A historical result is always drawn on the lines it was run on.",
    sources: [
      {
        name: "U.S. Census Bureau — cartographic boundary files", url: "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html", kind: "official",
        uses: [{ data: "Congressional districts for each map era: 115th (2016), 116th (2018 and 2020), 118th (2022), 119th (2024)", where: "public/congressional-districts-{2016,2018,pre2022,2022,2024}.json" }],
        note: "Census releases lag mid-decade redraws; the 119th files still carry old lines for most states that redrew for 2026.",
      },
      {
        name: "U.S. Census Bureau — TIGER/Line and TIGERweb", url: "https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html", kind: "official",
        uses: [
          { data: "Current state legislative districts (SLDL / SLDU), both chambers", where: "scripts/build-state-leg-districts.mjs → public/state-leg-districts/" },
          { data: "121 superseded legislative maps, one TIGER vintage per map era", where: "scripts/build-state-leg-districts-historical.mjs → public/state-leg-districts-historical/" },
          { data: "119th Congress districts by API", where: "scripts/update-districts.mjs" },
        ],
      },
      {
        name: "State redistricting bodies and GIS portals", kind: "official",
        uses: [
          { data: "Maps TIGER has stale or wrong: Michigan Senate (“Crane A1”, state ArcGIS open data), New Hampshire House (NH GRANIT), Mississippi 2025 remedial map, North Carolina 2019 remedial maps (HB 1020 / SB 692 shapefiles from ncleg.gov)", where: "data-entry/state-leg-districts-2026-source/ · tiger-state-leg-historical/" },
          { data: "Enacting authority, date and first cycle of each chamber's current map", where: "data/stateLegMapInfo.ts (listed at the end of this page)" },
        ],
      },
      {
        name: "us-atlas", publisher: "Mike Bostock, from Census data", url: "https://github.com/topojson/us-atlas", kind: "project",
        uses: [{ data: "State and county outlines", where: "public/us-counties.json · states-10m.json via jsDelivr" }],
      },
    ],
  },
  {
    id: "finance",
    kicker: "Receipts, not spending",
    title: "Campaign finance",
    lede: "Both sides of a race always come from one source, because the modelled quantity is the gap. $0 means a confirmed non-filer; blank means unknown.",
    sources: [
      {
        name: "Federal Election Commission — bulk data", url: "https://www.fec.gov/data/browse-data/?tab=bulk-data", kind: "official",
        uses: [{ data: "House and Senate candidate-committee total receipts per cycle, 2016–2026 (webl / weball “all candidates” files; 2026 is the 2026-09-15 vintage)", where: "data-entry/fundraising_2016_2026.csv → data/fundraisingData.ts" }],
        note: "Matched by name, then by FEC ID. Candidates file under legal names (Hinson as ARENHOLZ, Santos as DEVOLDER-SANTOS), and the bulk files drop some large committees (Kunce, Ivey) that have to be pulled by committee.",
      },
      {
        name: "OpenFEC API", publisher: "Federal Election Commission", url: "https://api.open.fec.gov/developers/", kind: "official",
        uses: [
          { data: "Candidates the bulk files miss, by district-cycle totals and by committee", where: "fundraising_2016_2026.csv" },
          { data: "Mid-September receipts for 2022 and 2024 from report summaries (1,744 nominees)", where: "scripts/fetch-fec-september-snapshot.py → fundraising_sept_snapshot.csv" },
        ],
        note: "Needs FEC_API_KEY; rate-limited.",
      },
      {
        name: "FollowTheMoney", publisher: "National Institute on Money in Politics", url: "https://www.followthemoney.org/", kind: "project",
        uses: [{ data: "Governor total contributions through the 2024 cycle (77 races)", where: "scripts/fetch-governor-fundraising-ftm.py" }],
        note: "Needs FTM_API_KEY. A candidate with zero records is a coverage gap, never $0.",
      },
      {
        name: "TransparencyUSA", url: "https://www.transparencyusa.org/", kind: "project",
        uses: [{ data: "Governor total contributions in its covered states, including 2026 cycle-to-date (58 races)", where: "fundraising_2016_2026.csv" }],
        note: "Idaho's figures repeat across cycles and are not used.",
      },
      {
        name: "Massachusetts Office of Campaign and Political Finance", url: "https://www.ocpf.us/", kind: "official",
        uses: [{ data: "Massachusetts Governor 2018 and 2026 (statewide year-to-date reports, two-year window)", where: "fundraising_2016_2026.csv" }],
      },
      {
        name: "New Jersey Election Law Enforcement Commission", url: "https://www.elec.nj.gov/", kind: "official",
        uses: [{ data: "New Jersey Governor 2025 (post-general release, Dec 22 2025, Table 1)", where: "fundraising_2016_2026.csv" }],
      },
      {
        name: "Mississippi Today, from Secretary of State filings", url: "https://mississippitoday.org/", kind: "news",
        uses: [{ data: "Mississippi Governor 2023", where: "fundraising_2016_2026.csv" }],
        note: "The only row on a spending basis; treated as raised by decision.",
      },
    ],
  },
  {
    id: "polling",
    kicker: "Race polls · generic ballot · pollster ratings",
    title: "Polling",
    lede: "Polls are used as published; partisan sponsorship is flagged, not filtered.",
    sources: [
      {
        name: "Wikipedia election-article polling tables", publisher: "Wikimedia Foundation", url: "https://en.wikipedia.org/wiki/2026_United_States_Senate_elections", kind: "wiki",
        uses: [{ data: "2026 general-election polls for Senate, Governor and House races (a table counts only when its header names both nominees), in the field on or after 1 January 2026", where: "data-entry/race_polls.csv → data/racePolls.ts" }],
        note: "Needs periodic re-scraping. The CSV keeps every poll ever scraped; the build emits only those fielded in 2026. Alaska Senate rows are entered by hand from pollster releases (ranked-choice final round only) and must not be overwritten.",
      },
      {
        name: "FiveThirtyEight polls archive", publisher: "via the Internet Archive", url: "https://web.archive.org/web/2025/https://projects.fivethirtyeight.com/polls/", kind: "project",
        uses: [
          { data: "Historical Senate, House and Governor polls 2018–2024 (6,698 polls) that the poll weight was fitted on", where: "scripts/build-race-polls-history.py → race_polls_history.csv" },
          { data: "Historical generic-ballot polls (4,832) behind the poll-aging test", where: "scripts/build-generic-ballot-history.py" },
          { data: "raw_polls.csv, the graded poll file through 2022, for pollster ratings", where: "scripts/build-pollster-graded-polls.py" },
        ],
        note: "The live site now redirects; the Wayback copies are what download.",
      },
      {
        name: "Pollster releases", kind: "news",
        uses: [{ data: "Alaska Senate ranked-choice final rounds", where: "race_polls.csv (S,AK,Senate)" }],
      },
    ],
  },
  {
    id: "people",
    kicker: "Names, offices, photographs",
    title: "Candidates and officeholders",
    lede: "",
    sources: [
      {
        name: "Wikipedia officeholder infoboxes", publisher: "Wikimedia Foundation, via the MediaWiki API", url: "https://www.mediawiki.org/wiki/API:Main_page", kind: "wiki",
        uses: [{ data: "Every elected office held by 3,501 candidates, tiered from none to Senator / Governor (1,528 have an article)", where: "data-entry/candidate_office_history.csv → data/candidateOffices.ts" }],
        note: "Built for the candidate-quality prior, which is switched off; kept for display.",
      },
      {
        name: "unitedstates/congress-legislators and unitedstates/images", url: "https://github.com/unitedstates", kind: "project",
        uses: [{ data: "Official portraits of sitting and former members of Congress, keyed by Bioguide ID (public domain)", where: "scripts/fetch_house_photos.py · fetch_senate_photos.py → public/candidates/" }],
      },
      {
        name: "Wikidata and Wikimedia Commons", publisher: "Wikimedia Foundation", url: "https://www.wikidata.org/", kind: "wiki",
        uses: [{ data: "Governors' portraits, with each file's licence checked before download", where: "scripts/fetch_governor_photos.py" }],
      },
    ],
  },
  {
    id: "demographics",
    kicker: "American Community Survey",
    title: "Demographics",
    lede: "",
    sources: [
      {
        name: "U.S. Census Bureau — ACS 2020–24 five-year Data Profiles (API)", url: "https://www.census.gov/data/developers/data-sets/acs-5year.html", kind: "official",
        uses: [
          { data: "Population, education, race and ethnicity, median household income for the nation, states, congressional districts and legislative districts", where: "scripts/fetch-acs-demographics.py → data-entry/demographics.csv" },
          { data: "The same measures at tract level, re-aggregated onto the 2026 lines for the 143 redrawn districts", where: "scripts/build-cd-demographics-2026-lines.py" },
          { data: "Connecticut towns (2019–23), rolled up to its eight legacy counties", where: "scripts/fetch-ct-town-acs.py" },
        ],
        note: "Needs CENSUS_API_KEY. Districts are published on 119th-Congress lines only.",
      },
      {
        name: "County Health Rankings & Roadmaps 2025", publisher: "University of Wisconsin Population Health Institute", url: "https://www.countyhealthrankings.org/", kind: "academic",
        uses: [{ data: "County race and ethnicity shares and median household income (ACS-sourced)", where: "data-entry/county_health_rankings_2025.csv → data/countyDemographics.ts" }],
      },
      {
        name: "USDA Economic Research Service — county education", url: "https://www.ers.usda.gov/data-products/county-level-data-sets/", kind: "official",
        uses: [{ data: "County bachelor's-degree share, ACS 2019–23", where: "data-entry/usda_ers_education_2019_23.csv" }],
      },
      {
        name: "Redistricting Data Hub · IPUMS NHGIS", url: "https://redistrictingdatahub.org/", kind: "project",
        uses: [{ data: "Ohio House District 31: 2024 precinct boundaries, the block-to-precinct crosswalk, 2020 census blocks, CVAP and block-group ACS", where: "scripts/build_oh31_demographics.py → public/oh31-demographics.geojson" }],
      },
    ],
  },
  {
    id: "services",
    kicker: "Called while the site runs",
    title: "Live services",
    lede: "",
    sources: [
      {
        name: "U.S. Census Geocoder", url: "https://geocoding.geo.census.gov/", kind: "service",
        uses: [{ data: "Coordinates to congressional and state legislative districts in the District Finder", where: "app/api/districts/route.ts" }],
      },
      {
        name: "OpenStreetMap Nominatim", url: "https://nominatim.openstreetmap.org/", kind: "service",
        uses: [{ data: "Address search and reverse geocoding", where: "components/DistrictFinder.tsx" }],
      },
      {
        name: "CARTO basemaps on OpenStreetMap data", url: "https://carto.com/basemaps", kind: "service",
        uses: [{ data: "Street tiles under the District Finder and precinct maps", where: "components/DistrictFinderMap.tsx · OH31MapLeaflet*.tsx" }],
      },
    ],
  },
];

/** Looked into and not usable — so nobody spends the afternoon again. */
export const DEAD_ENDS: { name: string; why: string }[] = [
  { name: "Ballotpedia", why: "Blocks automated fetches, and its governor race pages carry no campaign-finance section. Used only for hand lookups of legislative calendars." },
  { name: "Dave Leip's Atlas of U.S. Elections", why: "County tables sit behind a paid membership." },
  { name: "Louisiana SoS results portal", why: "A JavaScript app with no fetchable data and an API that could not be reverse-engineered; figures have to be exported by hand." },
  { name: "Illinois State Board of Elections · Chicago Board of Elections · Cook County Clerk", why: "Bot-challenged, 403 or restructured; Illinois county figures were supplied by hand." },
  { name: "Mississippi SoS portal · Mississippi Today (direct)", why: "403 and bot-blocked; the article is reachable through the Wayback Machine." },
  { name: "New Jersey ELEC portal", why: "Blocked; its PDF press releases are fetchable." },
  { name: "Wikipedia, for campaign finance", why: "Race pages carry at most a primary-season fundraising table." },
  { name: "VEST precinct shapefiles", why: "Lag one to two cycles; nothing for 2024 yet. Dave's Redistricting's VTD data stands in." },
  { name: "Redistricting Data Hub 2024 precinct shapefiles · Dave's Redistricting map downloads", why: "Behind account registration; state GIS portals are tried first." },
  { name: "Census TIGER / cartographic files, for 2026 congressional maps", why: "Return 2024 lines for most states that redrew mid-decade." },
  { name: "Klarner's own site · MEDSL odd-year volumes", why: "The site advertises the older 1967–2016 release; MEDSL publishes no odd-year state-legislative returns." },
  { name: "TransparencyUSA for Idaho · FollowTheMoney after 2024", why: "Idaho values repeat across cycles; FollowTheMoney's data stops at the 2024 election year." },
  { name: "Senate and Governor vote counts by congressional district for NH, UT, MO, MI, PA, NJ, and the 2022 Georgia runoff", why: "No public source publishes them; confirmed unsourceable." },
];

/** Datasets in the repo whose original source was never written down. */
export const UNRECORDED_PROVENANCE: { file: string; what: string; known: string }[] = [
  { file: "data/county_presidential_results_2008_2024.csv", what: "County presidential votes 2008–2024", known: "Origin not recorded. Audited against the certified statewide totals; its “other” column is narrower than total − D − R in fusion states." },
  { file: "data-entry/{president,senate,governor,house}_past_results.csv · *_seats.csv · house_del_history.csv", what: "The base results and seats spreadsheets", known: "Entered by hand; the original working source is not recorded. Every row has since been audited against Wikipedia's certified results." },
  { file: "data-entry/pvi.csv", what: "Partisan Voting Index by state and district, 2016–2026", known: "Entered by hand; publisher and edition not recorded in the repo." },
  { file: "data-entry/generic_ballot_polls.csv · trump_approval_polls.csv", what: "2026 generic-ballot and presidential-approval polls", known: "Dropped in as an aggregator export; which aggregator is not recorded in the repo." },
  { file: "data-entry/pop_vote.csv", what: "National popular vote, seats, final generic-ballot average and presidential approval by cycle", known: "The final-average column is named rcp_final (RealClearPolitics); the approval figures' source is not recorded." },
  { file: "data-entry/national_environment_history.csv", what: "Mid-September generic-ballot averages 2016–2024", known: "Approximate values entered from memory and flagged in the file; to be verified against the RealClearPolitics and FiveThirtyEight archives." },
  { file: "data-entry/hd31_*.csv", what: "Ohio House District 31 precinct results 2016–2024", known: "Source not recorded (county boards of elections publish these)." },
  { file: "public/congressional-districts-2026.json", what: "2026 congressional lines for the ten redrawn states", known: "Geometry verified against the model's presidential-by-district data and the known maps on 2026-09-17, but the download source of each state's file is not recorded." },
  { file: "data-entry/house_redistrict.csv", what: "Redistricting history and per-district descriptions", known: "Written from Wikipedia's redistricting articles and the repo's own old-vs-new geometry; earlier rows' sources are not recorded." },
];
