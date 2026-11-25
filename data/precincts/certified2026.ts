// States whose November 3, 2026 general election results are certified. Hand-kept: add a state when its
// certifying body signs off (date = the day of that vote or signature, from the source linked).
//
// Readers:
//   app/precincts/page.tsx        shows a state's 2026 precinct results only once it is listed here
//   app/audit/precincts/page.tsx  the "2026 certification" section
//
// The precinct rows themselves come from data-entry/results-2026/precincts/{ST}.csv.gz (npm run results-2026)
// or a state adapter in scripts/precincts/split_official.py; re-read them after certification so the
// figures on the map are the certified ones.

export type Certification = {
  date: string; // YYYY-MM-DD
  body: string; // who certified
  source: string; // where we read that it happened
  note?: string;
};

export const CERTIFIED_2026: Record<string, Certification> = {
  SD: { date: "2026-11-10", body: "State Canvassing Board", source: "https://www.congresscountdown.com/info/election-certification" },
  WY: { date: "2026-11-10", body: "State Canvassing Board", source: "https://www.congresscountdown.com/info/election-certification" },
  SC: { date: "2026-11-11", body: "State Board of Canvassers", source: "https://www.congresscountdown.com/info/election-certification" },
  ND: {
    date: "2026-11-18",
    body: "State Canvassing Board",
    source: "https://www.valleynewslive.com/2026/11/18/north-dakota-canvassing-board-certifies-2026-election-results-one-house-race-qualifies-recount/",
    note: "One state House race qualified for a recount.",
  },
  MN: {
    date: "2026-11-19",
    body: "State Canvassing Board",
    source: "https://www.sos.mn.gov/about-the-office/news-room/state-canvassing-board-certifies-results-of-the-2026-general-election/",
    note: "Recounts pending in CD-1 and Senate District 4; the SD-32A recount is certified by Anoka County on Nov 24.",
  },
  GA: {
    date: "2026-11-20",
    body: "Secretary of State",
    source: "https://www.forsythnews.com/news/politics/its-official-raffensperger-certifies-nov-3-election-results-in-georgia/",
    note: "Reported as certified on Friday; Nov 20 was the statutory deadline.",
  },
  AZ: { date: "2026-11-23", body: "Governor, Secretary of State and Attorney General (state canvass)", source: "https://azmirror.com/2026/11/23/arizona-certifies-its-2026-midterm-election-results" },
  MI: {
    date: "2026-11-23",
    body: "Board of State Canvassers",
    source: "https://michiganpublic.org/politics-government/2026-11-23/michigan-certifies-november-election-results-after-record-breaking-turnout",
  },
  UT: { date: "2026-11-23", body: "State Board of Canvassers", source: "https://www.yahoo.com/news/politics/articles/utah-2026-election-results-certified-004859105.html" },
  ID: {
    date: "2026-11-24",
    body: "State Board of Canvassers",
    source: "https://www.yahoo.com/news/politics/articles/board-canvassers-certifies-idaho-general-011259881.html",
    note: "Latah County was asked to review a result-reporting discrepancy. The SoS results file read on Nov 25 is byte-identical to the one built on Nov 23.",
  },
  NM: { date: "2026-11-24", body: "State Canvassing Board", source: "https://sourcenm.com/2026/11/25/new-mexico-certifies-nov-3-election-results/" },
};

/** As-of date for the list above. */
export const CERTIFIED_2026_AS_OF = "2026-11-25";
