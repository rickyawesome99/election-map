import type { Chamber } from "./stateLegDistricts";

// Hand-curated facts about 2026 independent state legislative candidates that the forecast's
// automatic rules (lib/stateLegForecast.ts step 7: sitting, or a strong last head-to-head) cannot
// see: a major party backing an independent in a race it left open, or a candidate the rules would
// pick who should not be modeled. Keyed state -> chamber -> district key (data/stateLegDistricts.ts).

export type StateLegIndependentNote = {
  name: string;
  /** The absent major party has endorsed or is backing this independent. */
  endorsedBy?: "D" | "R";
  /** Never model this candidate as the seat's real contest. */
  exclude?: boolean;
  /**
   * The endorsing party's own nominee is also on the ballot, but the independent is its candidate:
   * under Alaska's ranked-choice count that nominee's votes transfer, so the independent takes the
   * party's place and the nominee is not modeled.
   */
  supersedesNominee?: boolean;
  /** An appointed incumbent: modeled as sitting, but worth no incumbency (the federal forecast's rule). */
  appointed?: boolean;
  note: string;
  source?: string;
};

// Researched 2026-10-13. Alaska Democrats' backing = listed on the party's 2026 candidate pages
// (alaskademocrats.org/meet-the-candidates/state-house/ and /state-senate/), which list
// nonpartisan "(N)" and undeclared "(U)" candidates beside the party's own; the pages do not use
// the word "endorse".
const AK_DEMS = "https://alaskademocrats.org/meet-the-candidates/state-house/";
export const stateLegIndependents: Record<string, Partial<Record<Chamber, Record<string, StateLegIndependentNote[]>>>> = {
  AK: {
    house: {
      "1": [{ name: "Grant EchoHawk", endorsedBy: "D", note: "Listed by the Alaska Democratic Party; no Democrat on the ballot.", source: AK_DEMS }],
      "2": [{ name: "Rebecca Himschoot", endorsedBy: "D", note: "Listed by the Alaska Democratic Party; bipartisan coalition member. Primary: 69.2% to Skaflestad (R) 27.6%.", source: AK_DEMS }],
      "6": [{ name: "Brent Johnson", note: "2024 rematch with Rep. Sarah Vance (R); led the August primary 56.9–43.1. Blue Voter Guide reports Alaska Democratic support, but he is not on the party's own page, so it is not counted.", source: "https://www.alaskasnewssource.com/2026/09/05/election-2026-with-bipartisan-house-majority-balance-several-races-will-determine-control-legislature/" }],
      "8": [{ name: "Nissa Savage", endorsedBy: "D", note: "Listed by the Alaska Democratic Party; no Democrat on the ballot.", source: AK_DEMS }],
      "9": [{ name: "Ky Holland", endorsedBy: "D", note: "Listed by the Alaska Democratic Party; bipartisan coalition member. Primary: 59.9% to Boyle (R) 40.1%.", source: AK_DEMS }],
      "12": [{ name: "Calvin Schrage", endorsedBy: "D", note: "Listed by the Alaska Democratic Party; bipartisan coalition member. Primary: 70.4% to McDonald (R) 29.6%.", source: AK_DEMS }],
      "14": [{ name: "Alyse Galvin", endorsedBy: "D", note: "Listed by the Alaska Democratic Party; no major-party candidate on the ballot.", source: AK_DEMS }],
      "36": [{ name: "Crystal Jones", endorsedBy: "D", note: "Listed by the Alaska Democratic Party; no Democrat on the ballot.", source: AK_DEMS }],
    },
    senate: {
      S: [{ name: "Bryce Edgmon", endorsedBy: "D", supersedesNominee: true, note: "House Speaker, running for the open seat; listed by the Alaska Democratic Party over its own nominee, Wassilie Guy. Primary: Edgmon 37.9%, Deacon (R) 23.9%, Guy (D) 18.9%, Robb 11.5%; Guy's and Robb's votes transfer in the ranked-choice count.", source: "https://alaskademocrats.org/meet-the-candidates/state-senate/" }],
    },
  },
  ME: {
    senate: {
      "9": [{ name: "Stephen Carey", endorsedBy: "R", note: "The Senate Republican campaign arm spent about $40k for him; no Republican on the ballot against Rep. Amy Roeder (D).", source: "https://www.bangordailynews.com/2026/10/07/politics/elections/maine-major-parties-supporting-independents-joam40zk0w/" }],
    },
  },
  UT: {
    senate: {
      "11": [{ name: "Emily Buss", appointed: true, note: "Appointed by Gov. Cox after winning the Forward Party's preference poll to replace Daniel Thatcher. Democrat MacKenzie Miller withdrew in August and endorsed her; no party endorsement.", source: "https://www.ksl.com/article/51619336/democrat-exits-utah-state-senate-race-backs-forward-party-candidate" }],
    },
  },
};
