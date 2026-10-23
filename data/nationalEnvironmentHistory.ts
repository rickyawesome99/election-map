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
    "notes": "gb_final (RCP final) and approval_net_final from data/popVoteData.ts; the 538 archive has no 2016 generic-ballot polls, so this row stays on RCP's basis (RCP ran 1-2 pts more Republican than the live recipe in 2022/2024, 0.2-0.6 in 2018/2020); mid-September value approximate from memory of the RCP average"
  },
  {
    "year": 2018,
    "gbMidSept": -7.85,
    "gbFinal": -6.7,
    "approvalMidSept": -10.5,
    "approvalFinal": -9.7,
    "presidentParty": "R",
    "housePv": -8.6,
    "notes": "gb_mid_sept and gb_final = the live generic-ballot recipe (lib/genericBallotAverage.ts: one poll per pollster, 14-day half-life, sqrt-sample) over the 538 archive (data-entry/generic_ballot_polls_history.csv) as of Sept 15 (39 pollsters) and election eve 2018-11-05 (44 pollsters), replacing RCP's finals and the from-memory mid-September values on 2026-10-23 so the miss is measured on the quantity the model shades; approval values unchanged (approximate mid-Sept, final from popVoteData)"
  },
  {
    "year": 2020,
    "gbMidSept": -6.38,
    "gbFinal": -6.88,
    "approvalMidSept": -8,
    "approvalFinal": -6.6,
    "presidentParty": "R",
    "housePv": -3,
    "notes": "gb_mid_sept and gb_final = the live generic-ballot recipe (lib/genericBallotAverage.ts: one poll per pollster, 14-day half-life, sqrt-sample) over the 538 archive (data-entry/generic_ballot_polls_history.csv) as of Sept 15 (37 pollsters) and election eve 2020-11-02 (42 pollsters), replacing RCP's finals and the from-memory mid-September values on 2026-10-23 so the miss is measured on the quantity the model shades; approval values unchanged (approximate mid-Sept, final from popVoteData)"
  },
  {
    "year": 2022,
    "gbMidSept": -1.84,
    "gbFinal": 0.3,
    "approvalMidSept": -11,
    "approvalFinal": -12.5,
    "presidentParty": "D",
    "housePv": 2.7,
    "notes": "gb_mid_sept and gb_final = the live generic-ballot recipe (lib/genericBallotAverage.ts: one poll per pollster, 14-day half-life, sqrt-sample) over the 538 archive (data-entry/generic_ballot_polls_history.csv) as of Sept 15 (65 pollsters) and election eve 2022-11-07 (75 pollsters), replacing RCP's finals and the from-memory mid-September values on 2026-10-23 so the miss is measured on the quantity the model shades; approval values unchanged (approximate mid-Sept, final from popVoteData)"
  },
  {
    "year": 2024,
    "gbMidSept": -1.76,
    "gbFinal": -0.39,
    "approvalMidSept": -15,
    "approvalFinal": -15.2,
    "presidentParty": "D",
    "housePv": 2.6,
    "notes": "gb_mid_sept and gb_final = the live generic-ballot recipe (lib/genericBallotAverage.ts: one poll per pollster, 14-day half-life, sqrt-sample) over the 538 archive (data-entry/generic_ballot_polls_history.csv) as of Sept 15 (53 pollsters) and election eve 2024-11-04 (58 pollsters), replacing RCP's finals and the from-memory mid-September values on 2026-10-23 so the miss is measured on the quantity the model shades; approval values unchanged (approximate mid-Sept, final from popVoteData)"
  }
];
