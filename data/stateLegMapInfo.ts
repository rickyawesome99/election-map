import type { Chamber } from "./stateLegDistricts";

// Enactment history for each state's CURRENT (2026-effective) legislative district map.
// Populated per state/chamber as maps are sourced and verified — see project memory
// project_state_legislature_pages.md for the sourcing methodology.
export type ChamberMapInfo = {
  enactedDate: string;   // ISO date the map was adopted/signed/ordered into effect, e.g. "2024-02-19"
  firstCycle: number;    // first general election year that used these exact district lines
  source: string;        // short citation, e.g. "Ohio Redistricting Commission" or "2021 Wis. Act 94"
  sourceUrl?: string;
  note?: string;         // e.g. mid-decade court-ordered redraw context
};

export const stateLegMapInfo: Record<string, Partial<Record<Chamber, ChamberMapInfo>>> = {
  OH: {
    house: {
      enactedDate: "2023-09-27",
      firstCycle: 2024,
      source: "Ohio Redistricting Commission",
      note: "Adopted 7-0 with bipartisan support (the commission's sixth map iteration after the original 2021 maps were struck down); as a bipartisan-passed map it runs the full decade through 2030.",
    },
    senate: {
      enactedDate: "2023-09-27",
      firstCycle: 2024,
      source: "Ohio Redistricting Commission",
      note: "Adopted the same day as the House map, 7-0 bipartisan; runs through 2030.",
    },
  },
  WI: {
    house: {
      enactedDate: "2024-02-19",
      firstCycle: 2024,
      source: "2023 Wisconsin Act 94",
      note: "Signed by Gov. Evers, replacing the prior maps the Wisconsin Supreme Court found unconstitutional.",
    },
    senate: {
      enactedDate: "2024-02-19",
      firstCycle: 2024,
      source: "2023 Wisconsin Act 94",
      note: "Same Act as the Assembly map. Senate terms are staggered: the 16 even-numbered districts were first contested under this map in 2024; the 17 odd-numbered districts are first contested in 2026.",
    },
  },
  GA: {
    house: {
      enactedDate: "2023-12-08",
      firstCycle: 2024,
      source: "Georgia General Assembly (HB 1EX)",
      note: "Court-ordered remedial map (Alpha Phi Alpha Fraternity, Inc. v. Raffensperger); signed by Gov. Kemp, approved by federal court 2023-12-28.",
    },
    senate: {
      enactedDate: "2023-12-08",
      firstCycle: 2024,
      source: "Georgia General Assembly (SB 1EX)",
      note: "Court-ordered remedial map from the same VRA §2 ruling as the House map; signed the same day, court-approved 2023-12-28.",
    },
  },
  MI: {
    house: {
      enactedDate: "2024-02-28",
      firstCycle: 2024,
      source: "Michigan Independent Citizens Redistricting Commission (\"Motown Sound FC E1\")",
      note: "Remedial map redrawing 7 Detroit-area districts found to be unconstitutional racial gerrymanders (Agee v. Benson); federal court approved 2024-03-27.",
    },
    senate: {
      enactedDate: "2024-06-26",
      firstCycle: 2026,
      source: "Michigan Independent Citizens Redistricting Commission (\"Crane A1\")",
      note: "Remedial map redrawing 6 Detroit-area districts found unconstitutional in the same Agee v. Benson ruling; federal court approved 2024-07-26. The Senate wasn't on the ballot in 2024, so 2026 is the first election held under this map.",
    },
  },
  NE: {
    senate: {
      enactedDate: "2021-09-30",
      firstCycle: 2022,
      source: "Nebraska Legislature (LB3)",
      note: "Nebraska's single unicameral chamber is classified as the upper chamber (SLDU) in Census/TIGER data. Signed by Gov. Ricketts; no redraw since.",
    },
  },
  CA: {
    house: {
      enactedDate: "2021-12-20",
      firstCycle: 2022,
      source: "California Citizens Redistricting Commission",
    },
    senate: {
      enactedDate: "2021-12-20",
      firstCycle: 2022,
      source: "California Citizens Redistricting Commission",
    },
  },
  TX: {
    house: {
      enactedDate: "2021-10-25",
      firstCycle: 2022,
      source: "Texas Legislature (Plan H2316)",
      note: "Re-adopted with no boundary changes via SB 375 in 2023. The 2025 mid-decade redistricting special session redrew only the congressional map; House/Senate lines are unchanged.",
    },
    senate: {
      enactedDate: "2021-10-25",
      firstCycle: 2022,
      source: "Texas Legislature (Plan S2168)",
      note: "The 2025 mid-decade redistricting special session redrew only the congressional map; Senate lines are unchanged.",
    },
  },
  NY: {
    house: {
      enactedDate: "2023-04-24",
      firstCycle: 2024,
      source: "New York Legislature (S.6454/A.6586)",
      note: "Redrawn after the Independent Redistricting Commission's resubmission process; not affected by Harkenrider v. Hochul, which struck down only the congressional and Senate maps.",
    },
    senate: {
      enactedDate: "2022-05-20",
      firstCycle: 2022,
      source: "Special Master Jonathan Cervas (court-ordered)",
      note: "Drawn under Harkenrider v. Hochul after the Legislature's original map was struck down as an unconstitutional gerrymander; unchanged since.",
    },
  },
  PA: {
    house: {
      enactedDate: "2022-02-04",
      firstCycle: 2022,
      source: "Pennsylvania Legislative Reapportionment Commission",
      note: "Affirmed 7-0 by the PA Supreme Court on 2022-03-16.",
    },
    senate: {
      enactedDate: "2022-02-04",
      firstCycle: 2022,
      source: "Pennsylvania Legislative Reapportionment Commission",
      note: "Affirmed 7-0 by the PA Supreme Court on 2022-03-16.",
    },
  },
  NC: {
    house: {
      enactedDate: "2023-10-25",
      firstCycle: 2024,
      source: "North Carolina General Assembly (HB 898 / SL 2023-149)",
      note: "Enacted after the NC Supreme Court reversed its own Harper v. Hall precedent. The 2025 mid-decade NC redistricting (SL 2025-95) redrew only the congressional map.",
    },
    senate: {
      enactedDate: "2023-10-25",
      firstCycle: 2024,
      source: "North Carolina General Assembly (SB 758 / SL 2023-146)",
      note: "The 2025 mid-decade NC redistricting (SL 2025-95) redrew only the congressional map; this map is unchanged.",
    },
  },
  LA: {
    house: {
      enactedDate: "2022-03-09",
      firstCycle: 2023,
      source: "Louisiana Legislature (HB14 / Act 4 of 2022)",
      note: "Louisiana state legislative elections are held in odd years (next: 2027) — these districts are not on the 2026 ballot at all, but remain the current, controlling map. A VRA §2 challenge (Nairne v. Landry) had these maps struck down in Feb. 2024; that ruling was vacated and remanded in May 2026 following Louisiana v. Callais, so the original 2022 map remains in effect.",
    },
    senate: {
      enactedDate: "2022-03-09",
      firstCycle: 2023,
      source: "Louisiana Legislature (SB1 / Act 1 of 2022)",
      note: "Louisiana state legislative elections are held in odd years (next: 2027) — not on the 2026 ballot. Same Nairne v. Landry litigation history as the House map; original 2022 map remains in effect.",
    },
  },
  IL: {
    house: {
      enactedDate: "2021-09-24",
      firstCycle: 2022,
      source: "Illinois General Assembly (Public Act 102-0663)",
      note: "Revised from an earlier June 2021 map (based on ACS estimates) struck down as malapportioned once actual Census data arrived. A 2025 partisan-gerrymander challenge was rejected by the Illinois Supreme Court on procedural grounds.",
    },
    senate: {
      enactedDate: "2021-09-24",
      firstCycle: 2022,
      source: "Illinois General Assembly (Public Act 102-0663)",
      note: "Each Senate district nests exactly 2 House districts. Senate terms are staggered (4-4-2 year pattern); 2026 completes the first full cycle of turnover under this map before 2031 redistricting.",
    },
  },
  AZ: {
    house: {
      enactedDate: "2022-01-21",
      firstCycle: 2022,
      source: "Arizona Independent Redistricting Commission",
      note: "Arizona's 30 legislative districts are shared between chambers — each elects 2 House members and 1 Senator from identical boundaries.",
    },
    senate: {
      enactedDate: "2022-01-21",
      firstCycle: 2022,
      source: "Arizona Independent Redistricting Commission",
      note: "Arizona's 30 legislative districts are shared between chambers — each elects 2 House members and 1 Senator from identical boundaries.",
    },
  },
  WA: {
    house: {
      enactedDate: "2021-11-16",
      firstCycle: 2022,
      source: "Washington State Redistricting Commission (adopted by the WA Supreme Court)",
      note: "13 districts in the Yakima Valley area (including the old LD-15) were redrawn under a 2024-03-15 federal court remedial order (Soto Palmer v. Hobbs, a VRA §2 case) after the original lines were found to dilute Latino voting strength; those districts were first used under the revised lines in 2024. House and Senate share identical district boundaries (2 House members + 1 Senator per district).",
    },
    senate: {
      enactedDate: "2021-11-16",
      firstCycle: 2022,
      source: "Washington State Redistricting Commission (adopted by the WA Supreme Court)",
      note: "13 districts in the Yakima Valley area were redrawn under a 2024-03-15 federal court remedial order (Soto Palmer v. Hobbs); first used under the revised lines in 2024. House and Senate share identical district boundaries.",
    },
  },
  VA: {
    house: {
      enactedDate: "2021-12-28",
      firstCycle: 2023,
      source: "Supreme Court of Virginia (special masters Trende & Grofman)",
      note: "Virginia House of Delegates elections are held in odd years — not on the 2026 ballot (next: 2027). The Nov. 2021 House election used the prior court-remedial map; 2023 was the first election held under these lines.",
    },
    senate: {
      enactedDate: "2021-12-28",
      firstCycle: 2023,
      source: "Supreme Court of Virginia (special masters Trende & Grofman)",
      note: "Virginia Senate elections are held in odd years on 4-year terms — not on the 2026 ballot (next: 2027, same as the House due to the 2021 mapping cycle). First used in 2023.",
    },
  },
  FL: {
    house: {
      enactedDate: "2022-03-03",
      firstCycle: 2022,
      source: "Florida Legislature (CS/SJR 100)",
    },
    senate: {
      enactedDate: "2022-03-03",
      firstCycle: 2022,
      source: "Florida Legislature (CS/SJR 100, Plan S027S8058)",
      note: "A VRA §2 challenge to Senate District 16 (Nord/Hodges v. Albritton) was rejected by a federal court on 2025-08-18; the map is unchanged.",
    },
  },
  NJ: {
    house: {
      enactedDate: "2022-02-18",
      firstCycle: 2023,
      source: "New Jersey Apportionment Commission",
      note: "New Jersey's 40 legislative districts are shared between chambers — each elects 2 Assembly members + 1 Senator from identical boundaries. NJ state legislative elections are odd-year; not on the 2026 ballot (next: 2027).",
    },
    senate: {
      enactedDate: "2022-02-18",
      firstCycle: 2023,
      source: "New Jersey Apportionment Commission",
      note: "New Jersey's 40 legislative districts are shared between chambers — each elects 2 Assembly members + 1 Senator from identical boundaries. NJ state legislative elections are odd-year; not on the 2026 ballot (next: 2027).",
    },
  },
  MN: {
    house: {
      enactedDate: "2022-02-15",
      firstCycle: 2022,
      source: "Minnesota Special Redistricting Panel",
      note: "Minor technical boundary corrections were made in 2022 (SF 4476) and 2023 (Laws 2023 ch. 62) to a handful of districts; current data reflects these corrections.",
    },
    senate: {
      enactedDate: "2022-02-15",
      firstCycle: 2022,
      source: "Minnesota Special Redistricting Panel",
      note: "Minor technical boundary corrections were made in 2022 (SF 4476) and 2023 (Laws 2023 ch. 62) to a handful of districts; current data reflects these corrections.",
    },
  },
  MO: {
    house: {
      enactedDate: "2022-01-19",
      firstCycle: 2022,
      source: "Missouri House Independent Bipartisan Citizens Commission",
    },
    senate: {
      enactedDate: "2022-03-15",
      firstCycle: 2022,
      source: "Missouri appellate judicial panel (backup redistricting process)",
      note: "The Senate's own bipartisan citizen commission deadlocked, triggering Missouri's constitutional backup process — a panel of appellate judges drew the map instead. Missouri's 2025 mid-decade congressional redistricting did not touch state legislative maps.",
    },
  },
  IN: {
    house: {
      enactedDate: "2021-10-04",
      firstCycle: 2022,
      source: "Indiana General Assembly (Public Law 221-2021)",
    },
    senate: {
      enactedDate: "2021-10-04",
      firstCycle: 2022,
      source: "Indiana General Assembly (Public Law 221-2021)",
      note: "Senate terms are staggered — only 25 of 50 seats were elected under this map in 2022, with the remaining 25 following in 2024.",
    },
  },
  TN: {
    house: {
      enactedDate: "2022-02-06",
      firstCycle: 2022,
      source: "Tennessee General Assembly (HB 1035)",
    },
    senate: {
      enactedDate: "2022-02-06",
      firstCycle: 2022,
      source: "Tennessee General Assembly (SB 780)",
      note: "A challenge to Davidson County's Senate district numbering (not boundaries) was rejected by the Tennessee Supreme Court on 2025-12-10 (Wygant v. Lee); the boundaries were never redrawn.",
    },
  },
  MD: {
    house: {
      enactedDate: "2022-02-01",
      firstCycle: 2022,
      source: "Maryland General Assembly (Legislative Redistricting Advisory Commission plan)",
      note: "Maryland's 47 legislative districts mostly elect 3 Delegates each from the same boundary (some split into sub-districts), so there are 71 unique House boundary shapes for 141 seats. A separate legislative-map challenge (In re 2022 Legislative Districting) was rejected by Maryland's high court in April 2022 — no boundaries changed.",
    },
    senate: {
      enactedDate: "2022-02-01",
      firstCycle: 2022,
      source: "Maryland General Assembly (Legislative Redistricting Advisory Commission plan)",
      note: "Senate districts are single-member, 47 total. A separate legislative-map challenge (In re 2022 Legislative Districting) was rejected by Maryland's high court in April 2022 — no boundaries changed.",
    },
  },
  MA: {
    house: {
      enactedDate: "2021-11-04",
      firstCycle: 2022,
      source: "Massachusetts General Court (Chapter 83, Acts of 2021)",
    },
    senate: {
      enactedDate: "2021-11-04",
      firstCycle: 2022,
      source: "Massachusetts General Court (Chapter 82, Acts of 2021)",
    },
  },
  CO: {
    house: {
      enactedDate: "2021-11-15",
      firstCycle: 2022,
      source: "Colorado Independent Legislative Redistricting Commission",
    },
    senate: {
      enactedDate: "2021-11-15",
      firstCycle: 2022,
      source: "Colorado Independent Legislative Redistricting Commission",
    },
  },
  OK: {
    house: {
      enactedDate: "2021-11-22",
      firstCycle: 2022,
      source: "Oklahoma Legislature (HB 1001)",
    },
    senate: {
      enactedDate: "2021-11-22",
      firstCycle: 2022,
      source: "Oklahoma Legislature (SB 1X)",
    },
  },
  AL: {
    house: {
      enactedDate: "2021-11-04",
      firstCycle: 2022,
      source: "Alabama Legislature (HB 2)",
      note: "A VRA §2 challenge to the House map was dropped in December 2023 (plaintiffs narrowed their case to the Senate map only) — boundaries unchanged since enactment.",
    },
    senate: {
      enactedDate: "2021-11-04",
      firstCycle: 2022,
      source: "Alabama Legislature (SB 1)",
      note: "Unsettled: a federal court ruled in August 2025 that the 2021 map packs Black voters into Montgomery's SD26 (VRA §2) and ordered a remedial map for SD25/26 only; the state appealed, and after the Supreme Court's 2026 Louisiana v. Callais ruling shifted the VRA effects standard, the 11th Circuit stayed that remedial order in May 2026, restoring the original 2021 lines statewide (which is what's shown here) — a special primary for SD25/26 was still run on adjusted boundaries in August 2026 pending further appeal.",
    },
  },
  AK: {
    house: {
      enactedDate: "2023-05-15",
      firstCycle: 2022,
      source: "Alaska Redistricting Board (Final Proclamation, readopting the court-ordered 2022 interim plan)",
      note: "Follows a 2021 board plan → Alaska Supreme Court remand (House 36/Senate K) → court-ordered 2022 interim map (used for the 2022 election) → board's May 2023 final adoption of the same interim lines with no further boundary change.",
    },
    senate: {
      enactedDate: "2023-05-15",
      firstCycle: 2022,
      source: "Alaska Redistricting Board (Final Proclamation)",
      note: "Alaska's 20 Senate districts are each a fixed pairing of two adjacent House districts, not independently drawn — same enactment history as the House map.",
    },
  },
  AR: {
    house: {
      enactedDate: "2021-11-29",
      firstCycle: 2022,
      source: "Arkansas Board of Apportionment (Governor, Secretary of State, Attorney General)",
      note: "A VRA §2 racial-gerrymander challenge (NAACP v. Arkansas Board of Apportionment) was dismissed on standing grounds through the 8th Circuit in 2023 without reaching the merits — map unchanged.",
    },
    senate: {
      enactedDate: "2021-11-29",
      firstCycle: 2022,
      source: "Arkansas Board of Apportionment",
      note: "A minor boundary-line correction between Senate Districts 29 and 35 (Washington County) was made after original adoption; the corrected version is reflected here.",
    },
  },
  CT: {
    house: {
      enactedDate: "2021-11-18",
      firstCycle: 2022,
      source: "Connecticut Reapportionment Commission (unanimous 8-0)",
    },
    senate: {
      enactedDate: "2021-11-23",
      firstCycle: 2022,
      source: "Connecticut Reapportionment Commission (unanimous 8-0)",
      note: "The commission passed both chambers' maps cleanly; only Connecticut's congressional map needed the court-appointed special master.",
    },
  },
  DE: {
    house: {
      enactedDate: "2022-04-01",
      firstCycle: 2022,
      source: "Delaware General Assembly (SB 199, finalized by HB 335)",
      note: "HB 335 made administrative line adjustments requested by the Dept. of Elections, not a substantive redraw. Unchallenged in court.",
    },
    senate: {
      enactedDate: "2022-04-01",
      firstCycle: 2022,
      source: "Delaware General Assembly (SB 199, finalized by HB 335)",
      note: "Same enactment path as the House map. Unchallenged in court.",
    },
  },
  HI: {
    house: {
      enactedDate: "2022-01-28",
      firstCycle: 2022,
      source: "Hawaii Reapportionment Commission",
      note: "A challenge to the plan (Hicks v. 2021 Reapportionment Commission) drew a temporary injunction but was dismissed in March 2022 — the original plan stood unchanged.",
    },
    senate: {
      enactedDate: "2022-01-28",
      firstCycle: 2022,
      source: "Hawaii Reapportionment Commission",
      note: "Same commission plan and litigation history as the House map. Senate terms are staggered; redistricting reset all 25 seats in 2022 before normal staggering resumed.",
    },
  },
  ID: {
    house: {
      enactedDate: "2021-11-12",
      firstCycle: 2022,
      source: "Idaho Citizen Commission for Reapportionment (Plan L03)",
      note: "Idaho uses one unified map: all 35 legislative districts elect 1 Senator and 2 Representatives from identical boundaries. Four legal challenges to the map were rejected by the Idaho Supreme Court in January 2022.",
    },
    senate: {
      enactedDate: "2021-11-12",
      firstCycle: 2022,
      source: "Idaho Citizen Commission for Reapportionment (Plan L03)",
      note: "Shares identical boundaries with the House map — see House note.",
    },
  },
  IA: {
    house: {
      enactedDate: "2021-11-04",
      firstCycle: 2022,
      source: "Iowa Legislative Services Agency (Plan 2)",
      note: "Iowa's nonpartisan-agency process rejected the LSA's first plan before approving Plan 2 on an up-or-down vote with no amendments.",
    },
    senate: {
      enactedDate: "2021-11-04",
      firstCycle: 2022,
      source: "Iowa Legislative Services Agency (Plan 2)",
      note: "Each Senate district = 2 House districts, same pairing convention as Illinois. Redistricting-driven incumbent pairings forced extra even-numbered-district races in 2022 alongside the normal odd-year stagger.",
    },
  },
  KS: {
    house: {
      enactedDate: "2022-04-15",
      firstCycle: 2022,
      source: "Kansas Legislature (Substitute for SB 563)",
      note: "Upheld by the Kansas Supreme Court's mandatory review in June 2022.",
    },
    senate: {
      enactedDate: "2022-04-15",
      firstCycle: 2024,
      source: "Kansas Legislature (Substitute for SB 563)",
      note: "Same bill as the House map, same court review. All 40 Senate seats are elected together every 4 years on a cycle offset from the governor's, so the new map's first Senate use was 2024, not 2022.",
    },
  },
  KY: {
    house: {
      enactedDate: "2022-01-20",
      firstCycle: 2022,
      source: "Kentucky Legislature (HB 2, veto override)",
      note: "A partisan-gerrymander challenge (Graham v. Adams) was rejected by the Kentucky Supreme Court in December 2023 — map unchanged.",
    },
    senate: {
      enactedDate: "2022-01-21",
      firstCycle: 2022,
      source: "Kentucky Legislature (SB 2)",
      note: "Became law without the governor's signature. Same litigation history as the House map.",
    },
  },
  ME: {
    house: {
      enactedDate: "2021-09-29",
      firstCycle: 2022,
      source: "Maine Apportionment Commission (enacted as LD 1738)",
      note: "The Commission's proposal was adopted by the Legislature and Governor without deadlock, so the Supreme Judicial Court backup process wasn't triggered.",
    },
    senate: {
      enactedDate: "2021-09-29",
      firstCycle: 2022,
      source: "Maine Apportionment Commission (enacted as LD 1741)",
    },
  },
  MS: {
    house: {
      enactedDate: "2025-03-07",
      firstCycle: 2025,
      source: "Mississippi Legislature (JR 1), court-ordered VRA §2 remedy",
      note: "Redraws 1 House district (Chickasaw/Monroe counties); the original 2022 map (in effect 2023) was found to violate the VRA in NAACP v. State Board of Election Commissioners (July 2024). Mississippi elects its legislature only in odd years — not on the 2026 ballot, next 2027. As of August 2026 the case remains unsettled: the Supreme Court vacated and remanded for reconsideration under Louisiana v. Callais in May 2026, but the 2025 remedial map (shown here) remains enacted and in force pending further proceedings.",
    },
    senate: {
      enactedDate: "2025-05-07",
      firstCycle: 2025,
      source: "Mississippi Legislature (JR 202), court-ordered VRA §2 remedy",
      note: "Redraws 2 Senate districts (DeSoto County and Hattiesburg/Forrest County areas) from the same NAACP v. State Board of Election Commissioners ruling; the DeSoto sub-plan required a second court-ordered revision (May 7, 2025) after an initial version was rejected. Special elections under this map were held November 2025, flipping 1 Senate seat and ending the GOP supermajority. Not on the 2026 ballot (odd-year cycle, next 2027). Same Callais-remand caveat as the House map.",
    },
  },
  MT: {
    house: {
      enactedDate: "2023-02-22",
      firstCycle: 2024,
      source: "Montana Districting and Apportionment Commission",
      note: "Valid through the 2032 cycle. A technical errata correction moved 2 census blocks near Laurel between HD38/HD54 the day after adoption.",
    },
    senate: {
      enactedDate: "2023-02-22",
      firstCycle: 2024,
      source: "Montana Districting and Apportionment Commission",
      note: "Each of the 50 Senate districts is constitutionally required to be 2 nested House districts.",
    },
  },
  NV: {
    house: {
      enactedDate: "2021-11-16",
      firstCycle: 2022,
      source: "Nevada Legislature (SB1, 33rd Special Session)",
      note: "Partisan-gerrymander suits (Koenig v. Nevada and a companion case) had a preliminary injunction denied and were ultimately rejected — map unchanged.",
    },
    senate: {
      enactedDate: "2021-11-16",
      firstCycle: 2022,
      source: "Nevada Legislature (SB1, 33rd Special Session)",
      note: "Same bill and litigation history as the Assembly map.",
    },
  },
  NH: {
    house: {
      enactedDate: "2022-03-23",
      firstCycle: 2022,
      source: "New Hampshire Legislature (HB 50)",
      note: "New Hampshire's 400 House seats are elected from 164 base districts plus 40 additional 'floterial' districts that overlay multiple base districts to add extra at-large seats — only the 164 base-district boundaries are shown here; the floterial layer geometrically overlaps the base layer and isn't represented in this single-boundary-per-chamber map format. A partisan-gerrymander challenge (Brown v. Scanlan) was rejected by the NH Supreme Court in November 2023 as non-justiciable — map unchanged.",
    },
    senate: {
      enactedDate: "2022-05-06",
      firstCycle: 2022,
      source: "New Hampshire Legislature (SB 240)",
    },
  },
  NM: {
    house: {
      enactedDate: "2021-12-29",
      firstCycle: 2022,
      source: "New Mexico Legislature (HB 8)",
    },
    senate: {
      enactedDate: "2022-01-06",
      firstCycle: 2024,
      source: "New Mexico Legislature (SB 2)",
      note: "All 42 Senate seats are elected together every 4 years (2020, 2024, 2028) and weren't on the 2022 ballot, so the new map's first use was 2024, not 2022.",
    },
  },
  ND: {
    house: {
      enactedDate: "2024-01-08",
      firstCycle: 2024,
      source: "U.S. District Court (D.N.D.) remedial order, Turtle Mountain Band of Chippewa & Spirit Lake Nation v. Howe",
      note: "North Dakota's 47 legislative districts each elect 1 Senator + 2 Representatives from a shared boundary, except District 4 (Fort Berthold/MHA Nation), permanently split into subdistricts 4A/4B since 2021 — SCOTUS summarily affirmed 4A/4B's validity in January 2025 (Walen v. Burgum). The original map also split District 9 into 9A/9B (Turtle Mountain), which a federal court found violated the VRA in November 2023; this January 2024 remedial map (shown here) restored a unified District 9. The 8th Circuit reversed that ruling in May 2025, but the Supreme Court stayed the reversal in July 2025, keeping this remedial map in effect for 2026 pending further appeal.",
    },
    senate: {
      enactedDate: "2021-11-11",
      firstCycle: 2022,
      source: "North Dakota Legislature (67th Assembly special session, HB 1504)",
      note: "Senate boundaries were not affected by the Turtle Mountain remedial order (District 9's House-only 9A/9B split is what was struck down; the Senate district lines were never split).",
    },
  },
  OR: {
    house: {
      enactedDate: "2021-09-27",
      firstCycle: 2022,
      source: "Oregon Legislature (SB 882)",
      note: "Upheld by the Oregon Supreme Court in November 2021 against a partisan-gerrymander challenge.",
    },
    senate: {
      enactedDate: "2021-09-27",
      firstCycle: 2022,
      source: "Oregon Legislature (SB 882)",
      note: "Each of the 30 Senate districts pairs 2 adjacent House districts. Same litigation history as the House map.",
    },
  },
  RI: {
    house: {
      enactedDate: "2022-02-16",
      firstCycle: 2022,
      source: "Rhode Island General Assembly (H 7323)",
    },
    senate: {
      enactedDate: "2022-02-16",
      firstCycle: 2022,
      source: "Rhode Island General Assembly (S 2162, companion to H 7323)",
    },
  },
  SC: {
    house: {
      enactedDate: "2022-06-17",
      firstCycle: 2024,
      source: "South Carolina General Assembly (Act 117, amended by Act 226)",
      note: "Act 226 was a June 2022 remedial map settling a Black-vote-dilution challenge in about 5 counties (unrelated to the congressional VRA case, Alexander v. SC NAACP, which SCOTUS decided in 2024 and which never touched the legislative maps). First used under these lines in 2024.",
    },
    senate: {
      enactedDate: "2021-12-10",
      firstCycle: 2024,
      source: "South Carolina General Assembly (Act 117)",
      note: "All 46 Senate seats are elected together only in gubernatorial years, so the new map wasn't on the 2022 ballot — 2024 was its first cycle.",
    },
  },
  SD: {
    house: {
      enactedDate: "2021-11-10",
      firstCycle: 2022,
      source: "South Dakota Legislature (\"Sparrow map\")",
      note: "South Dakota's 35 legislative districts each elect 1 Senator + 2 Representatives from a shared boundary, except Districts 26 and 28, each split into A/B sub-districts for House seats only — a structure dating to a 2005 federal VRA ruling that has persisted through subsequent redistricting cycles, including this one.",
    },
    senate: {
      enactedDate: "2021-11-10",
      firstCycle: 2022,
      source: "South Dakota Legislature (\"Sparrow map\")",
      note: "Shares the same base boundaries as the House map (see House note) — Senate is not split into sub-districts.",
    },
  },
  UT: {
    house: {
      enactedDate: "2021-11-16",
      firstCycle: 2022,
      source: "Utah Legislature (HB 2005, 2021 Second Special Session)",
      note: "The Legislature adopted its own map over three alternatives proposed by the Utah Independent Redistricting Commission. Valid 2022–2032. Unrelated to the 2024–2025 congressional map litigation (League of Women Voters of Utah v. Utah State Legislature), which was congressional-only and didn't reopen House/Senate lines.",
    },
    senate: {
      enactedDate: "2021-11-16",
      firstCycle: 2022,
      source: "Utah Legislature (SB 2006, 2021 Second Special Session)",
      note: "Same commission-override history as the House map. Valid 2022–2032; staggered 4-year terms.",
    },
  },
  VT: {
    house: {
      enactedDate: "2022-04-06",
      firstCycle: 2022,
      source: "Vermont Legislature (H.722, 2022 Acts & Resolves No. 89)",
      note: "150 seats are elected from 109 unique district boundaries — 68 single-member and 41 two-member districts.",
    },
    senate: {
      enactedDate: "2022-04-06",
      firstCycle: 2022,
      source: "Vermont Legislature (H.722, same act as the House map)",
      note: "30 seats are elected from 16 unique district boundaries (mostly county-based); districts are capped at 3 senators each under this cycle's map, with Chittenden County split into 3 sub-districts.",
    },
  },
  WV: {
    house: {
      enactedDate: "2021-10-22",
      firstCycle: 2022,
      source: "West Virginia Legislature (HB 301)",
      note: "Converted the House of Delegates from 67 multi-member districts to 100 single-member districts, per a 2018 law mandating the switch.",
    },
    senate: {
      enactedDate: "2021-10-22",
      firstCycle: 2022,
      source: "West Virginia Legislature (SB 3034)",
      note: "Structure unchanged from prior decades: 17 two-member districts (34 senators total) with staggered 4-year terms, one seat per district up each even-year cycle.",
    },
  },
  WY: {
    house: {
      enactedDate: "2022-03-25",
      firstCycle: 2022,
      source: "Wyoming Legislature (HB 100, 2022 Budget Session)",
      note: "Expanded the House from 60 to 62 seats. As of mid-2026, Secretary of State Chuck Gray has pushed for a redraw of House District 33 (Fremont County/Wind River Reservation) following the Supreme Court's 2026 Callais ruling, but lawmakers had not acted as of May 2026 — map unchanged.",
    },
    senate: {
      enactedDate: "2022-03-25",
      firstCycle: 2022,
      source: "Wyoming Legislature (HB 100, same bill as the House map)",
      note: "Expanded the Senate from 30 to 31 seats. Staggered 4-year terms.",
    },
  },
};
