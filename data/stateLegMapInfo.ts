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
};
