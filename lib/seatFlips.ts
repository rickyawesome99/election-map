import "server-only";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import type { PastResult } from "@/data/forecastData";
import type { MapOffice } from "@/lib/mapSliceTypes";

// Whether a past race changed a seat's party: one rule for the /historical map's Control view
// (lib/mapSlices.ts) and its races table's Flip tag (lib/pastElections.ts pastRaceTableRows).

type ControlParty = "D" | "R";

/** Who held the seat going into an election whose previous result predates the data (Senate and
 * Governor start in 2012/2014, the House in 2016) and whose incumbent didn't run. Keyed
 * "office:seat:year", seat = state abbreviation or House GEOID, with ":S" for a Senate special. */
const PRIOR_HOLDER: Record<string, ControlParty> = {
  // Senate 2016 open seats, last elected 2010.
  "senate:CA:2016": "D", "senate:IN:2016": "R", "senate:LA:2016": "R", "senate:MD:2016": "D", "senate:NV:2016": "D",
  // Governor open seats, last elected 2012 (2016), 2013 (2017), or 2014 for NH and VT's two-year terms.
  "governor:DE:2016": "D", "governor:NH:2016": "D", "governor:VT:2016": "D", "governor:IN:2016": "R", "governor:MO:2016": "D", "governor:ND:2016": "R", "governor:WV:2016": "D",
  "governor:NJ:2017": "R", "governor:VA:2017": "D",
  // The 2016 House open seats that changed hands (FL-02, FL-18 to R; FL-10, NV-03, VA-04 to D).
  // Every other 2016 open seat stayed with its party.
  "house:1202:2016": "D", "house:1218:2016": "D", "house:1210:2016": "R", "house:3203:2016": "R", "house:5104:2016": "R",
};

/** The party a slot's candidate sits with. Independents win only from the Democratic slot (King,
 * Sanders, Walker) and count with it, as the seat totals do. */
const slotParty = (p: PastResult["demParty"], slot: ControlParty): ControlParty => (p === "D" || p === "R" ? p : slot);

function winnerParty(r: PastResult): ControlParty {
  return (r.margin ?? r.repPct - r.demPct) > 0 ? slotParty(r.repParty, "R") : slotParty(r.demParty, "D");
}

let pres2012: Map<string, ControlParty> | null = null;
/** 2012 state winners from the county file, the previous election for 2016's flips. */
function presWinners2012(): Map<string, ControlParty> {
  if (pres2012) return pres2012;
  const net = new Map<string, number>();
  for (const c of Object.values(countyPresidentialData)) {
    const y = c.years[2012];
    if (y) net.set(c.state, (net.get(c.state) ?? 0) + y.repVotes - y.demVotes);
  }
  pres2012 = new Map([...net].map(([abbr, n]) => [abbr, n > 0 ? "R" : "D"]));
  return pres2012;
}

/** The seat changed party in this election. Its incumbent lost to the other party, or, when the
 * incumbent didn't run, the seat's previous winner was the other party (PRIOR_HOLDER before the
 * data starts). A redrawn House district where two incumbents met, or none ran, goes by the
 * same-numbered district's previous winner, the usual "gain"/"hold" convention; a new district
 * with no previous result is never a flip. President has no seat: a state flips when it votes the
 * other way from the election before. `history` is the seat's results in any order. */
export function seatFlipped(office: MapOffice, seat: string, r: PastResult, history: PastResult[]): boolean {
  const won = winnerParty(r);
  if (office !== "president" && !(r.demIncumbent && r.repIncumbent)) {
    if (r.demIncumbent) return slotParty(r.demParty, "D") !== won;
    if (r.repIncumbent) return slotParty(r.repParty, "R") !== won;
  }
  const prior = office === "president" && r.year === 2016
    ? presWinners2012().get(seat)
    : PRIOR_HOLDER[`${office}:${seat}:${r.year}${(r.electionType ?? "").toLowerCase().includes("special") ? ":S" : ""}`];
  if (prior) return prior !== won;
  const prev = history.filter((x) => x.year < r.year).sort((a, b) => b.year - a.year)[0];
  return prev ? winnerParty(prev) !== won : false;
}
