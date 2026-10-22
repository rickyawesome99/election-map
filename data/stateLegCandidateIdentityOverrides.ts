// Hand rulings on whether two state legislative candidate spellings are one person, for the pairs
// the automatic rules in lib/stateLegCandidateIdentity.ts cannot settle. The review list they come
// from is written by scripts/audit-state-leg-candidate-identity.ts.
//
// Each entry: [state, spelling, other spelling, why]. Spellings exactly as the data carries them.
// MERGE joins the two even with no seat link (and over a name rule, so be sure); SPLIT keeps two
// apart that the rules would join.

export type IdentityRuling = [abbr: string, a: string, b: string, note: string];

// Works across surnames too (a married or hyphenated name). Where the spelling itself is simply
// wrong, fix it at the source instead, as was done for Ohio's "Kristina Daleyroegner" (2016/2018
// results, now "Kristina Roegner", 2026-10-12).
export const STATE_LEG_IDENTITY_MERGE: IdentityRuling[] = [
  ["VA", "R. Lee Ware Jr.", "Lee Ware", "Delegate R. Lee Ware Jr. goes by Lee (HD-65/72); held apart by the first-name rule (user ruling 2026-10-21)"],
  ["VA", "Robert Lee Ware Jr.", "Lee Ware", "the same delegate's full name (HD-65 2019/2021); user ruling 2026-10-21"],
  // 2026-10-21 review of the 64 no-seat-link pairs, each researched individually (Ballotpedia /
  // state archives / local press; town of residence, occupation, age); the note names the evidence.
  ["AZ", "Don Hawker", "Donald Hawker", "Tempe retired programmer, Old Dominion math BS; LD18 2020 and LD8 2026 both cover Tempe"],
  ["CT", "Andrew R. Lockwood", "Andrew Lockwood", "Andy Lockwood ran HD-39 New London as a petitioning candidate in 2016, moved to Norwich and ran HD-46 as the Republican in 2018 (The Day)"],
  ["CT", "Dave Yaccarino", "David W. Yaccarino", "HD-87 North Haven Republican, one person on the roster and the 2018/2024 ballots (Dave vs David tripped the first-name rule)"],
  ["CT", "Dave Yaccarino Sr.", "David W. Yaccarino", "the same HD-87 Republican as filed for 2026; his son Dave Yaccarino Jr. (D, HD-99 2020) stays apart"],
  ["DE", "Daniel Zitofsky", "Dan Zitofsky", "Navy corpsman turned NYPD officer turned real-estate investor; Middletown HD-8 2018/2020, moved to Sussex for HD-4 2026 (same @danforstaterep account)"],
  ["FL", "Ashley Elizabeth Herrmann", "Ashley Herrmann", "Floridian Press: the 2026 HD-69 Democrat lost HD-49 to Kincart Jonsson in 2024"],
  ["FL", "Imtiaz Ahmad Mohammad", "Imtiaz Mohammad", "Imtiaz 'Andy' Mohammad, Broward salon owner; ran HD-119 as a Democrat in 2020, switched parties for SD-37 2024 and HD-103 2026"],
  ["FL", "Lisa Stortstrom", "Lisa Marie Stortstrom", "one iVoterGuide profile for HD-74 2020 (Sarasota) and HD-85 2024 (St. Lucie); same water-policy platform"],
  ["HI", "Jonathan P. Kennealy", "Jonathan Kennealy", "Hilo-born veteran, age 40 in the 2022 HD-6 Kona profile and 44 in the 2026 HD-2 Hilo profile"],
  ["ME", "Luke Dylan Jensen", "Luke Jensen", "Lewiston School Committee member; HD-61 2018 as an independent, HD-96 2026 as a Democrat (one BallotReady profile)"],
  ["ME", "Mark Walker", "Mark L. Walker", "Hallowell mayor, SD-14 2020 vs Bellows; moved to Naples for HD-84 2022-26 (legislature profile + Wikipedia)"],
  ["ND", "Ben Hanson", "Ben W. Hanson", "Benjamin Warren Hanson, District 16 rep 2012-16 (West Fargo), then one of two Ben Hansons on the 2020 District 46 ballot"],
  ["ND", "Lukas A. Maughan", "Lukas Maughan", "one Ballotpedia/BallotReady profile (Fargo North HS, MSUM paralegal) for D45 2018 and D43 2026"],
  ["NH", "Ben Baroody", "Benjamin Baroody", "Benjamin C. Baroody, Manchester realtor, House 1992-2012 and 2014-; Hills 43 / 39 / 16 are all his Manchester wards"],
  ["NH", "Benjamin C. Baroody", "Benjamin Baroody", "same Manchester representative, 2018-2024 ballots vs the 2026 filing"],
  ["NH", "Bill Obrien", "Bill O'Brien", "former Speaker William L. O'Brien: moved Mont Vernon to Nashua Ward 9 (Hills 36, 2020), now Manchester (Hills 40, 2026; Citizens Count address)"],
  ["NH", "Claude Bongambe", "Claude Lompufu Bongambe", "Concord Ward 9 Republican, lost to Kris Schultz in both Merrimack 18 (2020) and the Merrimack 29 floterial (2024)"],
  ["NH", "Heather Ledoux", "Heather A. Ledoux", "Litchfield Democrat; Hills 20 was the Litchfield seat and Hills 44 the Litchfield + Manchester 8/9 floterial (one NHPR record)"],
  ["NH", "Jack B. Flanagan", "Jack Flanagan", "Brookline former majority leader; Hills 26 2018 and Hills 45 (Brookline/Hollis/Mason) 2024-26"],
  ["NH", "John William Winter", "John W Winter", "Walpole; Cheshire 5 2022 and the Cheshire 15 floterial 2024 (Keene Sentinel prints the full name both years)"],
  ["NH", "Justin G Packard", "Justin Packard", "Seabrook budget committee; Rockingham 30 (Seabrook) 2024 and the Rockingham 40 floterial 2026"],
  ["NH", "Kathleen M. Martins", "Kathleen Martins", "Hooksett former representative; Merrimack 24 / 10 / 27 are all Hooksett seats"],
  ["NH", "Kendall A. Snow", "Kendall Snow", "Manchester social worker, Hills 42 2014-16 then Hills 19 2018-22 (Ballotpedia one page)"],
  ["NH", "Kirk D. McConville", "Kirk McConville", "Manchester Ward 6 (Hills 13, the old 43 floterial, the new 39 floterial); ex-Navy SEAL accountant"],
  ["NH", "Matthew John Santonastaso", "Matthew Santonastaso", "Jaffrey; Cheshire 14 2020, served 2022-24, Cheshire 13 2026"],
  ["NH", "Maxine Mosley", "Maxine B Mosley", "Manchester Ward 6 retired school counselor; Hills 16 base seat and the Hills 39 floterial"],
  ["NH", "Michael E. Thornton", "Michael Thornton", "Milford veteran and business owner; Hills 23 / 43 / 37 are all Milford seats (one Ballotpedia page)"],
  ["NH", "Mike Thornton", "Michael Thornton", "the same Milford Republican's 2020 ballot spelling"],
  ["NH", "Natalie J. Wells", "Natalie Wells", "Warner; Merrimack 25 2016-20 and Merrimack 8 2024-26 (Citizens Count notes her earlier service)"],
  ["NH", "Pamela Coughlin", "Pamela D Coughlin", "Amherst former Register of Deeds; lost to Megan Murray in Hills 22 (2020) and the Hills 37 floterial (2024), one NHPR record"],
  ["NH", "Raymond Plante", "Ray Plante", "Dunbarton airline pilot; Merrimack 23 (Bow/Dunbarton) 2020, Merrimack 27 2024-26"],
  ["NH", "Tom Lukacz", "Thomas Lukacz", "Portsmouth Ward 1; Rockingham 25 2018 and the Rockingham 30 floterial 2020 (one Ballotpedia page)"],
  ["NH", "William M. Marsh", "Bill Marsh", "Rep. William Marsh of Brookfield left the GOP in Sept 2021 and ran SD-3 as a Democrat in 2022 and 2024"],
  ["NJ", "Patricia A. Johnson", "Patricia \"Pat\" Johnson", "Pat Johnson lived in Lawrence for the 2021 LD-15 Assembly run, moved home to Hamilton for the 2023 LD-14 Senate run (NJ Globe)"],
  ["NY", "Ruben D. Cruz II", "Ruben Cruz II", "Richmond Hill, Queens; SD-16 2022, AD-24 2024, AD-38 2026 (Queens Ledger)"],
  ["NY", "Ruben D. Cruz II (CON)", "Ruben Cruz II", "the same 2024 candidate's Conservative line"],
  ["NY", "Ruben D. Cruz II (CSP)", "Ruben Cruz II", "the same 2024 candidate's Common Sense line"],
  ["OH", "Katie Oneill", "Katie O'Neill", "environmental attorney, Chagrin Falls native who moved to Nelsonville for HD-94 2020 and ran SD-18 2024 (one Ballotpedia page)"],
  ["OR", "Michael Newgard", "Michael Steven Newgard", "Clackamas County Guard pilot; HD-41 2020 and HD-40 2024 (Capital Chronicle cites the 2020 run)"],
  ["RI", "Barbara Quigley", "Barbara J. Quigley", "registered nurse, one Ballotpedia/BallotReady profile for SD-15 2022 and HD-22 2026; no second Barbara Quigley in RI sources"],
  ["SD", "Bryan J. Breitling", "Bryan Breitling", "former District 23 senator (Miller) who moved to rural Dell Rapids in 2022 and runs District 25 as an independent in 2026 (SDPB)"],
  ["UT", "V. Lowry Snow", "Lowry Snow", "the HD-74 St. George representative's 2016/2018 and 2020 ballot spellings"],
  ["VT", "Charles Wilson", "Charles W. Wilson", "Lyndon painting contractor; Caledonia Senate 2020, Caledonia-3 2022"],
  ["VT", "John A. Lyddy", "John Lyddy", "Whitingham; Windham Senate 2020, Windham-6 2022 (one VT archive record)"],
  ["VT", "Maryse B. Dunbar", "Maryse Dunbar", "Essex nurse; Chittenden 8-1 2020 and Chittenden-23 2022 (one VT archive record)"],
  ["VT", "Phil Baruth", "Philip Baruth", "the Chittenden Central senator; the 2026 retirement list had him under Bennington (fixed at the source)"],
  ["WA", "Mark A. James", "Mark James", "Marysville city councilman; Marysville moved from the 44th to the 38th in the 2022 redistricting"],
  ["WV", "Stephen Thomas Smith", "Stephen Smith", "Parkersburg Libertarian, District 12 in 2022 and 2026 (Wood County candidate lists)"],
];

export const STATE_LEG_IDENTITY_SPLIT: IdentityRuling[] = [
  // 2026-10-21 review: pairs researched and found to be different people.
  ["AR", "David L Barber", "David Barber", "HD-12 2024: Gravette Iraq veteran, 36; SD-17 2022: Conway accountant, 47"],
  ["CO", "William Walters", "Will Walters", "HD-36 2022: retired Denver police sergeant (R); HD-65 2024: Weld County IT consultant (D)"],
  ["CT", "Dave Yaccarino Jr.", "Dave Yaccarino", "father (R, HD-87 North Haven) and son (D, HD-99 East Haven 2020)"],
  ["CT", "Dave Yaccarino Jr.", "David W. Yaccarino", "same father/son pair"],
  ["IN", "John E. Bartlett", "John Bartlett", "HD-33 challenger from Blackford County vs Rep. John L. Bartlett of Indianapolis (HD-95)"],
  ["KY", "Dan Johnson", "Daniel Wayne Johnson", "HD-49 2016: Bullitt County's Dan Johnson, died Dec 2017; HD-19 2020: Warren County Navy veteran"],
  ["MA", "John T. Mahoney Jr.", "John Mahoney", "Plymouth challenger 2016/2018 vs Rep. John J. Mahoney of Worcester, in office since 2011"],
  ["MN", "Eric Olson", "Rick Olson", "Pine City software consultant vs Prior Lake former Michigan legislator"],
  ["MN", "Mary Murphy", "Mary J Murphy", "Hermantown's Rep. Mary Murphy (died 2024) vs Mary J. Murphy of Taylors Falls, HD-28B 2024"],
  ["MN", "Mary Murphy", "Mary C. Murphy", "the 2020 SD-29 Grassroots-Legalize Cannabis candidate from Maple Lake (renamed at the source from 'Mary Murphy')"],
  ["ND", "Ben Hanson", "Ben M. Hanson", "Ben M. Hanson was the first-time candidate in 2020's two-Ben-Hanson District 46 race; the ex-rep is Ben W."],
  ["ND", "Ben M. Hanson", "Ben W. Hanson", "two different Democrats on the same 2020 District 46 ballot (ND SOS, Inforum)"],
  ["NH", "Andrew R Sanborn", "Andy Sanborn", "Sanbornton planning-board chair (D) vs the Bedford casino owner and ex-senator (R)"],
  ["NH", "Robert Lovett, Jr", "Rob Lovett", "Claremont IT worker, 36, Democrat (2022) vs Mont Vernon farmer, Republican (2026); no source links them"],
  ["NY", "Thomas F. Sullivan (CON)", "Thomas Sullivan", "Rockland Conservative designee (AD-97) vs Thomas P. Sullivan of Breezy Point (AD-23), on the ballot the same day"],
  ["OR", "David J. Smith", "David Smith", "Eugene real-estate appraiser (HD-13 2020) vs Sen. David Brock Smith, who won HD-1 that same day"],
  ["UT", "V. Lowry Snow", "J. Lowry Snow", "ex-Rep. V. Lowry Snow, b. 1950, Santa Clara attorney vs J. Lowry Snow, Salt Lake City AWS engineer, Forward Party SD-9 2026"],
  ["UT", "Lowry Snow", "J. Lowry Snow", "same pair, the 2020 ballot spelling"],
  ["WV", "Stephen G. Smith", "Steven Smith", "Hardy/Pendleton Republican (old HD-55 2016) vs Steven L. Smith, Doddridge County CPA (HD-8 2026)"],
  ["WV", "Stephen G. Smith", "Stephen Smith", "Hardy/Pendleton Republican vs the Parkersburg Libertarian (HD-12)"],
  ["WV", "Stephen Thomas Smith", "Steven Smith", "Parkersburg Libertarian vs Doddridge Republican, both on the 2026 ballot"],
];

// The name a merged person's page shows, when the most-used spelling is not the right one:
// [state, spelling exactly as the data carries it, why]. Beats the sitting member's roster spelling.
export const STATE_LEG_DISPLAY_NAME: [abbr: string, spelling: string, note: string][] = [];
