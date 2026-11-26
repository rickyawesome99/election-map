import "server-only";
import type { StateLegEntry } from "@/data/forecastData";
import type { StatewideHistoryEntry } from "@/components/StatewideVoteHistoryPanel";
import { readPastPostElection, type PastPostElection } from "@/lib/pastPostElection";
import { PAST_POST_ELECTION_YEARS, type LegChamberResult, type PostElectionRow } from "@/lib/postElectionTypes";
import { readResultsSnapshot } from "@/lib/resultsSnapshot";
import { readStateLegSnapshot } from "@/lib/stateLegResultsSnapshot";
import { partyVotes } from "@/lib/resultsNeedle";
import type { Party } from "@/lib/resultsTypes";

// The state page's "By year" results: every race the state held in a year as one spread of cards,
// the year's blended popular vote on top. Even years and 2026 come from the files the /overview
// cards are built on (lib/pastPostElection.ts, the 2026 results snapshot and the state-leg
// snapshot), so a race reads the same on both pages. Odd years (VA, NJ, KY, LA, MS) are not in
// those files: their statewide races come from the state page's own history and their chambers
// from state_leg.csv's rows (StateLegEntry). A chamber shows only in a year it held elections.

export type YearCandidate = { name: string; party: Party; pct: number | null; incumbent: boolean };

export type YearRaceCard = {
  key: string;
  office: "president" | "senate" | "governor" | "house";
  label: string;
  href: string | null;
  /** R-positive margin over all votes; null with no votes counted (an unopposed race). */
  margin: number | null;
  winner: Party | null;
  flip: boolean;
  dem: YearCandidate | null;
  rep: YearCandidate | null;
  /** House: the change from the district's margin two years before (estimated where its lines moved). */
  swing: { value: number; estimated: boolean } | null;
};

export type ResultsYear = {
  year: number;
  /** The year's offices blended with the TPL's weights, environment included (WRS + env). */
  blended: number | null;
  /** Every House race's votes summed by party; null in a year with no House races counted. */
  housePv: { margin: number; demPct: number; repPct: number } | null;
  statewide: YearRaceCard[];
  house: YearRaceCard[];
  legislature: LegChamberResult[];
  /** Results still being counted (the 2026 snapshot). */
  counting: boolean;
};

// Each source is read once per build, not once per state page.
const pastCache = new Map<number, PastPostElection>();
const past = (year: number) => {
  let p = pastCache.get(year);
  if (!p) { p = readPastPostElection(year); pastCache.set(year, p); }
  return p;
};
let snap2026: { rows: PostElectionRow[]; leg: Record<string, LegChamberResult[]> } | null = null;
const snapshot2026 = () => (snap2026 ??= { rows: readResultsSnapshot().rows, leg: readStateLegSnapshot().byState });

const officeOrder = { president: 0, senate: 1, governor: 2, house: 3 } as const;

function href2026(row: PostElectionRow): string | null {
  const { office, id, label } = row.prior;
  if (office === "senate") return `/senate/${id.replace("-", "").toLowerCase()}`;
  if (office === "governor") return `/governor/${id.toLowerCase()}`;
  if (office === "house") return `/house/${label.toLowerCase()}`;
  return null;
}

function fromRow(row: PostElectionRow, href: string | null): YearRaceCard {
  const { prior, live, proj, housePrev } = row;
  const office = prior.office;
  const counted = !!live && live.total > 0;
  const pct = (v: number) => (counted ? (v / live!.total) * 100 : null);
  const cand = (c: PostElectionRow["prior"]["dem"], votes: number): YearCandidate | null => (c.name ? { name: c.name, party: c.party, pct: pct(votes), incumbent: c.incumbent } : null);
  const margin = counted ? proj.currentMargin : null;
  const winner = proj.winner ?? null;
  return {
    key: `${office}-${prior.id}-${prior.special ? "s" : "r"}`,
    office,
    label: office === "house" ? prior.label : office === "senate" ? (prior.special ? "Senate special" : "Senate") : office === "president" ? "President" : "Governor",
    href,
    margin,
    winner,
    flip: !!winner && !!prior.seatParty && winner !== prior.seatParty,
    dem: cand(prior.dem, live?.dem ?? 0),
    rep: cand(prior.rep, live?.rep ?? 0),
    swing: office === "house" && housePrev && margin != null ? { value: margin - housePrev.margin, estimated: housePrev.estimated } : null,
  };
}

function housePopularVote(rows: PostElectionRow[]): ResultsYear["housePv"] {
  let dem = 0, rep = 0, total = 0;
  for (const { prior, live } of rows) {
    if (prior.office !== "house" || !live || live.total <= 0) continue;
    const v = partyVotes(prior, live);
    dem += v.dem; rep += v.rep; total += live.total;
  }
  return total > 0 ? { margin: ((rep - dem) / total) * 100, demPct: (dem / total) * 100, repPct: (rep / total) * 100 } : null;
}

/** An odd year's statewide race, from the state page's history; a flip is against the same office's last result. */
function fromHistory(e: StatewideHistoryEntry, all: StatewideHistoryEntry[]): YearRaceCard {
  const margin = e.repPct - e.demPct;
  const winner: Party = margin > 0 ? "R" : "D";
  const before = all.filter((x) => x.group === e.group && x.label === e.label && x.year < e.year).sort((a, b) => b.year - a.year)[0];
  const prevMargin = before ? before.repPct - before.demPct : null;
  return {
    key: e.key,
    office: e.group === "house" ? "house" : e.group,
    label: e.group === "president" ? "President" : e.group === "governor" ? "Governor" : /special/i.test(e.label) ? "Senate special" : "Senate",
    href: e.href ?? null,
    margin,
    winner,
    flip: prevMargin != null && (prevMargin > 0 ? "R" : "D") !== winner,
    dem: e.demCandidate ? { name: e.demCandidate, party: "D", pct: e.demPct, incumbent: !!e.demIncumbent } : null,
    rep: e.repCandidate ? { name: e.repCandidate, party: "R", pct: e.repPct, incumbent: !!e.repIncumbent } : null,
    swing: null,
  };
}

/** An odd year's chamber, from state_leg.csv's rows: seats after the election, net change against the chamber's previous one. */
function chamberFromEntries(chamber: "house" | "senate", entries: StateLegEntry[], year: number): LegChamberResult | null {
  const list = [...entries].sort((a, b) => b.year - a.year);
  const cur = list.find((e) => e.year === year);
  if (!cur || cur.demSeats == null || cur.repSeats == null) return null;
  const before = list.find((e) => e.year < year && e.demSeats != null && e.repSeats != null);
  const seats = { dem: cur.demSeats, rep: cur.repSeats, oth: cur.othSeats ?? 0 };
  const prior = before ? { dem: before.demSeats!, rep: before.repSeats!, oth: before.othSeats ?? 0 } : seats;
  const net = { dem: seats.dem - prior.dem, rep: seats.rep - prior.rep, oth: seats.oth - prior.oth };
  const up = cur.seatsUp ?? 0;
  return {
    chamber,
    total: cur.totalSeats ?? seats.dem + seats.rep + seats.oth,
    up,
    calledSeats: up,
    noElection: false,
    seats,
    leading: { dem: 0, rep: 0, oth: 0 },
    flipped: { dem: Math.max(0, net.dem), rep: Math.max(0, net.rep), oth: Math.max(0, net.oth) },
    net,
    incumbentGovernor: "",
    priorControl: prior.dem > prior.rep ? "D" : prior.rep > prior.dem ? "R" : null,
    noPrior: !before,
  };
}

export function stateResultsByYear({ abbr, statewide, stateHouse, stateSenate, blended }: {
  abbr: string;
  statewide: StatewideHistoryEntry[];
  stateHouse: StateLegEntry[];
  stateSenate: StateLegEntry[];
  blended: Record<number, number>;
}): ResultsYear[] {
  const out: ResultsYear[] = [];
  const sortCards = (cards: YearRaceCard[]) => cards.sort((a, b) => officeOrder[a.office] - officeOrder[b.office] || a.label.localeCompare(b.label, "en", { numeric: true }));
  const fromRows = (year: number, rows: PostElectionRow[], legislature: LegChamberResult[], hrefOf: (r: PostElectionRow) => string | null, counting: boolean) => {
    const cards = sortCards(rows.map((r) => fromRow(r, hrefOf(r))));
    out.push({
      year,
      blended: blended[year] ?? null,
      housePv: housePopularVote(rows),
      statewide: cards.filter((c) => c.office !== "house"),
      house: cards.filter((c) => c.office === "house"),
      legislature: legislature.filter((c) => !c.noElection),
      counting,
    });
  };

  const s = snapshot2026();
  fromRows(2026, s.rows.filter((r) => r.prior.state === abbr), s.leg[abbr] ?? [], href2026, true);

  const evenYears = new Set(PAST_POST_ELECTION_YEARS);
  for (const year of PAST_POST_ELECTION_YEARS) {
    const p = past(year);
    fromRows(year, p.rows.filter((r) => r.prior.state === abbr), p.legislature[abbr] ?? [], (r) => r.past?.href ?? null, false);
  }

  const oddYears = [...new Set([...statewide.map((e) => e.year), ...stateHouse.map((e) => e.year), ...stateSenate.map((e) => e.year)])]
    .filter((y) => y >= 2016 && y < 2026 && !evenYears.has(y));
  for (const year of oddYears) {
    const cards = sortCards(statewide.filter((e) => e.year === year && e.group !== "house").map((e) => fromHistory(e, statewide)));
    const legislature = [chamberFromEntries("house", stateHouse, year), chamberFromEntries("senate", stateSenate, year)].filter((c): c is LegChamberResult => !!c);
    out.push({ year, blended: blended[year] ?? null, housePv: null, statewide: cards, house: [], legislature, counting: false });
  }

  return out
    .filter((y) => y.statewide.length + y.house.length + y.legislature.length > 0)
    .sort((a, b) => b.year - a.year);
}
