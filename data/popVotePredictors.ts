// Inputs for the popular-vote predictor analysis (/analysis/popular-vote): three national
// markers as they stood at each election, and the result they were trying to anticipate.
//
// Sign conventions (see lib/popVotePredictors.ts): housePv / presPv are R − D margins.
// approval and direction are raw percentages (net = approve − disapprove, right − wrong) and
// judge the sitting president, whose party is presidentParty. partyId is Gallup's quarterly
// average of party identification with leaners for the third quarter (July–September) of the
// election year, the last full quarter before the vote.
//
// Sources: approval = RealClearPolitics election-day average (the same figures as
// data/popVoteData.ts). direction = RealClearPolitics "Direction of Country" election-day
// average. partyId = Gallup, "Party Affiliation" trend, quarterly average with leaners.
// housePv / presPv = data/popVoteData.ts. The 2026 row's approval is filled at build time from
// the site's own approval average (lib/trumpApprovalAverage.ts); its direction and party ID are
// the latest readings on file, dated below.

export type PredictorKey = "approval" | "direction" | "partyId";
export type OutcomeKey = "house" | "president";

export type PopVotePredictorYear = {
  year: number;
  president: "Obama" | "Trump" | "Biden";
  presidentParty: "D" | "R";
  complete: boolean;                                   // false for the cycle still ahead
  approval: { approve: number; disapprove: number; asOf: string } | null;
  direction: { right: number; wrong: number; asOf: string } | null;
  partyId: { rep: number; dem: number; quarter: string } | null;
  housePv: number | null;                              // R − D, national House popular vote
  presPv: number | null;                               // R − D, presidential popular vote (presidential years)
  gbFinal: number | null;                              // election-eve generic-ballot average, R − D
};

export const popVotePredictorYears: PopVotePredictorYear[] = [
  {
    year: 2016, president: "Obama", presidentParty: "D", complete: true,
    approval: { approve: 52.4, disapprove: 44.6, asOf: "2016-11-08" },
    direction: { right: 31.2, wrong: 61.9, asOf: "2016-11-08" },
    partyId: { rep: 43.0, dem: 46.3, quarter: "Q3 2016" },
    housePv: 1.0, presPv: -2.1, gbFinal: -0.6,
  },
  {
    year: 2018, president: "Trump", presidentParty: "R", complete: true,
    approval: { approve: 43.5, disapprove: 53.2, asOf: "2018-11-06" },
    direction: { right: 40.0, wrong: 54.1, asOf: "2018-11-06" },
    partyId: { rep: 42.7, dem: 45.3, quarter: "Q3 2018" },
    housePv: -8.6, presPv: null, gbFinal: -7.3,
  },
  {
    year: 2020, president: "Trump", presidentParty: "R", complete: true,
    approval: { approve: 45.9, disapprove: 52.5, asOf: "2020-11-03" },
    direction: { right: 31.8, wrong: 61.2, asOf: "2020-11-03" },
    partyId: { rep: 43.0, dem: 48.0, quarter: "Q3 2020" },
    housePv: -3.0, presPv: -4.5, gbFinal: -6.8,
  },
  {
    year: 2022, president: "Biden", presidentParty: "D", complete: true,
    approval: { approve: 42.1, disapprove: 54.6, asOf: "2022-11-08" },
    direction: { right: 23.9, wrong: 68.3, asOf: "2022-11-08" },
    partyId: { rep: 44.0, dem: 45.0, quarter: "Q3 2022" },
    housePv: 2.7, presPv: null, gbFinal: 2.5,
  },
  {
    year: 2024, president: "Biden", presidentParty: "D", complete: true,
    approval: { approve: 41.0, disapprove: 56.2, asOf: "2024-11-05" },
    direction: { right: 27.0, wrong: 62.9, asOf: "2024-11-05" },
    partyId: { rep: 47.0, dem: 46.0, quarter: "Q3 2024" },
    housePv: 2.6, presPv: 1.5, gbFinal: 0.3,
  },
  {
    // approval is replaced at build time by the site's own average (app/analysis/popular-vote/page.tsx)
    year: 2026, president: "Trump", presidentParty: "R", complete: false,
    approval: null,
    direction: { right: 34.0, wrong: 59.6, asOf: "2026-09-29" },
    partyId: { rep: 39, dem: 50, quarter: "Q3 2026" },
    housePv: null, presPv: null, gbFinal: null,
  },
];

/** The election being forecast; everything else on file is complete. */
export const popVoteTargetYear = 2026;
