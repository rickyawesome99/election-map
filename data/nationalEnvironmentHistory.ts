// ⚠️  AUTO-GENERATED — do not edit by hand.
// Edit data-entry/national_environment_history.csv, then run:
//   node data-entry/build-national-environment.js
//
// One row per election year. Margins are R-positive (negative = Democratic lead);
// approval is net (approve − disapprove) for the sitting president.

export type NationalEnvironmentYear = {
  year: number;
  gbMidSept: number | null;      // generic ballot average around September 15
  gbFinal: number | null;        // election-eve generic ballot average
  approvalMidSept: number | null;
  approvalFinal: number | null;
  presidentParty: "D" | "R";
  housePv: number | null;        // actual national House popular-vote margin
  notes: string;
};

export const nationalEnvironmentHistory: NationalEnvironmentYear[] = [
  {
    "year": 2016,
    "gbMidSept": -2.5,
    "gbFinal": -0.6,
    "approvalMidSept": 5,
    "approvalFinal": 7.8,
    "presidentParty": "D",
    "housePv": 1.1,
    "notes": "gb_final and approval_net_final from data/popVoteData.ts; mid-September values are APPROXIMATE from memory of the RCP averages around Sept 15 — verify against the RCP/538 archives before trusting the mapped-environment numbers"
  },
  {
    "year": 2018,
    "gbMidSept": -7.5,
    "gbFinal": -7.3,
    "approvalMidSept": -10.5,
    "approvalFinal": -9.7,
    "presidentParty": "R",
    "housePv": -8.6,
    "notes": "approximate mid-Sept values; see 2016 note"
  },
  {
    "year": 2020,
    "gbMidSept": -6.5,
    "gbFinal": -6.8,
    "approvalMidSept": -8,
    "approvalFinal": -6.6,
    "presidentParty": "R",
    "housePv": -3,
    "notes": "approximate mid-Sept values; see 2016 note"
  },
  {
    "year": 2022,
    "gbMidSept": -0.5,
    "gbFinal": 2.5,
    "approvalMidSept": -11,
    "approvalFinal": -12.5,
    "presidentParty": "D",
    "housePv": 2.7,
    "notes": "approximate mid-Sept values (RCP flipped to a small D lead in mid-September 2022); see 2016 note"
  },
  {
    "year": 2024,
    "gbMidSept": -1,
    "gbFinal": 0.3,
    "approvalMidSept": -15,
    "approvalFinal": -15.2,
    "presidentParty": "D",
    "housePv": 2.6,
    "notes": "approximate mid-Sept values; see 2016 note"
  }
];
