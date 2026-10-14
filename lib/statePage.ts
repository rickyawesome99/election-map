import "server-only";

import type { State as StateInfo } from "@/data/statesData";
import {
  senateData, senateNoElection, senateHoldovers, governorData, governorNoElection, houseData, housePastResults,
  senateCurrent, presPastResults, houseDelegationHistory, stateLegData, houseDistrictInfo, electionYear,
  type PresResult, type PastResult, type HouseDelegationEntry, type StateLegEntry,
} from "@/data/forecastData";
import { UNICAMERAL_STATES, type Chamber, type StateLegDistrict } from "@/data/stateLegDistricts";
import { stateLegMapInfo, type ChamberMapInfo } from "@/data/stateLegMapInfo";
import { stateLegCalendar } from "@/data/stateLegCalendar";
import { stateLegHistoricalMaps } from "@/data/stateLegHistoricalMaps";
import { countyPresidentialData } from "@/data/countyPresidentialData";
import { countySenateData } from "@/data/countySenateData";
import { countyGovernorData } from "@/data/countyGovernorData";
import { governorCandidatesByYear } from "@/data/governorCandidatesByYear";
import { senateCandidatesByYear } from "@/data/senateCandidatesByYear";
import { forecastRace, type ForecastedRace } from "@/lib/forecast";
import { calculateStateModel, type YearAggregation } from "@/lib/tplCompute";
import { redistrictingByState, type RedistrictEvent } from "@/lib/redistrictingCalendar";
import { countyTplForState } from "@/lib/countyTpl";
import { pastElectionHref } from "@/lib/pastElections";
import { latestChamberSeats } from "@/lib/stateLegSeats";
import { chamberSummary } from "@/lib/stateLegChamberSummary";
import { stateEntry } from "@/lib/turnout";
import { projectionStateSlice } from "@/lib/turnoutModel";
import { projectRaceResults, projectedCountyMapEntries } from "@/lib/countyProjection";
import { ABBR_TO_FIPS } from "@/lib/fips";
import { getRaceColor, getRatingColors } from "@/lib/colorScale";
import type { CountyMapEntry } from "@/components/PastElectionCountyMap";
import type { StatewideHistoryEntry } from "@/components/StatewideVoteHistoryPanel";
import type { UpcomingChamber } from "@/lib/stateLegUpcoming";

export const GENERAL_ELECTION = "November 3, 2026";

// ── Hero ─────────────────────────────────────────────────────────────────────

/** One body in the hero's seat-bar band. A governor is a one-seat body: the bar is all one party. */
export type HeroBody = {
  key: string;
  label: string;
  /** Seats in the body, or null where the split is a count rather than a share of a known size. */
  total: number | null;
  dem: number;
  rep: number;
  oth: number;
  /** Shown instead of the D/R counts: "Dem", "Rep", "Ind" for the governor. */
  word?: string;
  /** Second line under the word, e.g. the governor's name. */
  holder?: string;
  /** Draw the majority notch at the midpoint. Off where the body has no majority to speak of. */
  notch: boolean;
};

// ── On the ballot ────────────────────────────────────────────────────────────

export type BallotCandidate = { name: string; party: "D" | "R" | "I"; incumbent: boolean };
export type BallotRace = {
  kind: "race";
  label: string;
  href: string;
  dem: BallotCandidate | null;
  rep: BallotCandidate | null;
  margin: number;
  rating: string;
};
export type BallotHoldover = {
  kind: "holdover";
  label: string;
  href: string;
  name: string;
  party: "D" | "R" | "I";
  nextElection: number | string;
};
export type HouseRow = {
  id: string;
  name: string;
  label: string;
  href: string;
  margin: number;
  rating: string;
  /** The departing seat holder where neither nominee is an incumbent, else null. */
  openHolder: string | null;
};

/** The 2026 projection's shading for a chamber's districts, computed here so the map never needs the model. */
export type CustomShading = {
  fill: Record<string, string>;
  tip: Record<string, { label: string; value: string; color?: string }[]>;
  legend: { label: string; bg: string }[];
  note?: string;
};

export type ChamberMapData = {
  chamber: Chamber;
  isUnicameral: boolean;
  roster: StateLegDistrict[];
  mapInfo: ChamberMapInfo | null;
  /** Past election years with district results to draw, newest first. */
  electionYears: number[];
  /** Election year → superseded boundary vintage; absent years ran on the current map. */
  historicalMaps: Record<string, number>;
  eras: { firstYear: number; lastYear: number | null; electionYears: number[]; source?: string }[];
  custom: CustomShading;
  /** Per-district 2026 projection, for the selected-district card. */
  projByKey: Record<string, { margin: number | null; rating: string | null; pD: number | null; contest: string }>;
};

export type ChamberBlock = {
  chamber: Chamber;
  label: string;
  exploreHref: string;
  totalSeats: number | null;
  /** "All 203 seats up", "25 of 50 seats up · even-numbered districts", or null when nothing is on the ballot. */
  upText: string | null;
  upcoming: UpcomingChamber | null;
  expectedDem: number | null;
  expectedRep: number | null;
  projTotal: number | null;
  pDem: number | null;
  unprojected: number;
  contested: number | null;
  districts: number | null;
  open: number | null;
  within5: number;
  within10: number;
  map: ChamberMapData;
};

export type TurnoutStat = { label: string; votes: number; rate: number | null; sub: string };

// ── Results since 2016 ───────────────────────────────────────────────────────

export type MajorityInfo = { totalSeats?: number; supermajoritySeats?: number };
export type VintageItem = { label: string; value: string; sub?: string };
export type ChartResult = { year: number; race: string; demPct: number; repPct: number; label?: string };

// ── Counties ─────────────────────────────────────────────────────────────────

export type CountyLayer = {
  key: string;
  label: string;
  entries: CountyMapEntry[];
  demName: string;
  repName: string;
  demParty: "D" | "R" | "I";
  repParty: "D" | "R" | "I";
  caption?: string;
};
export type CountyRow = {
  fips: string;
  name: string;
  tpl: number | null;
  pres2024: number | null;
  votes2024: number | null;
  est2026: number | null;
  share: number | null;
};

export type RedistrictingYear = {
  year: number;
  /** What was redrawn that year (congressional and legislative), from the redistricting calendar. */
  events: RedistrictEvent[];
  /** Each House district whose lines changed, with the editorial description and PVI before/after. */
  districts: { id: string; name: string; href: string; description: string; pviOld: number | null; pviNew: number | null }[];
};

export type StatePageData = {
  state: StateInfo;
  stateFips: string;
  tpl: number | null;
  ballotSentence: string;
  bodies: HeroBody[];
  turnout: TurnoutStat[];
  governor: BallotRace | BallotHoldover | null;
  senate: (BallotRace | BallotHoldover)[];
  house: { rows: HouseRow[]; demProj: number; repProj: number; open: number };
  chambers: ChamberBlock[];
  houseRaces: ForecastedRace[];
  housePastResults: Record<string, PastResult[]>;
  results: {
    statewide: (StatewideHistoryEntry & { countyLayer: string | null })[];
    federal: HouseDelegationEntry[];
    stateHouse: StateLegEntry[];
    stateSenate: StateLegEntry[];
    isUnicameral: boolean;
    majority: Partial<Record<Chamber, MajorityInfo>>;
    seatsUpByYear: Partial<Record<Chamber, Record<number, number>>>;
    newMapYears: Partial<Record<"federal" | Chamber, number[]>>;
    upcoming: Partial<Record<Chamber, UpcomingChamber | null>>;
    chart: ChartResult[];
    vintage: VintageItem[];
  };
  counties: { tpl: Record<string, number | null>; layers: CountyLayer[]; rows: CountyRow[]; areaLabel: string };
  /** The TPL's per-year inputs (weighted lean by cycle), for the trend chart. */
  tplTrend: YearAggregation[];
  /** Every year a House map changed here, newest first. */
  redistricting: RedistrictingYear[];
};

function isSpecialElection(electionType?: string) {
  return (electionType ?? "").toLowerCase().includes("special");
}

function fmtM(m: number) {
  return Math.abs(m) < 0.05 ? "Even" : `${m > 0 ? "R" : "D"}+${Math.abs(m).toFixed(1)}`;
}

const PARTY_FILL: Record<string, string> = { D: "var(--party-dem)", R: "var(--party-rep)", I: "var(--party-ind)" };

/** The chamber explorer's projection shading, rebuilt from the same projection. */
function chamberShading(summary: ReturnType<typeof chamberSummary>, chamberLabel: string): CustomShading {
  const fill: CustomShading["fill"] = {};
  const tip: CustomShading["tip"] = {};
  for (const pr of summary.projection?.districts ?? []) {
    if (pr.contest === "not-up") { tip[pr.key] = [{ label: "Not on the ballot", value: "" }]; continue; }
    if (pr.contest === "contested" && pr.margin != null && pr.pD != null) {
      fill[pr.key] = getRaceColor(pr.margin);
      tip[pr.key] = [
        { label: "Projected margin", value: fmtM(pr.margin), color: pr.margin <= 0 ? "var(--party-dem)" : "var(--party-rep)" },
        { label: "Rating", value: pr.rating ?? "" },
        { label: "P(Democratic)", value: `${Math.round(pr.pD * 100)}%` },
      ];
    } else if (pr.contest === "uncontested-D" || pr.contest === "uncontested-R") {
      const dem = pr.contest === "uncontested-D";
      fill[pr.key] = dem ? PARTY_FILL.D : PARTY_FILL.R;
      tip[pr.key] = [{ label: dem ? "No Republican on the ballot" : "No Democrat on the ballot", value: dem ? "Democratic hold/gain" : "Republican hold/gain", color: dem ? "var(--party-dem)" : "var(--party-rep)" }];
    } else if (pr.contest === "independent" && pr.pI != null && pr.margin != null) {
      fill[pr.key] = pr.pI >= 0.5 ? PARTY_FILL.I : getRaceColor(pr.margin);
      tip[pr.key] = [{ label: "Independent contest", value: `P(independent) ${Math.round(pr.pI * 100)}%` }];
    } else if (pr.contest === "other" && pr.pI === 1) {
      fill[pr.key] = PARTY_FILL.I;
      tip[pr.key] = [{ label: "No major party on the ballot", value: "Independent", color: "var(--party-ind)" }];
    } else {
      tip[pr.key] = [{ label: "No projection", value: pr.contest === "other" ? "nonpartisan or no major-party field" : "no candidates listed" }];
    }
  }
  const legend = ["Safe D", "Likely D", "Lean D", "Tilt D", "Tilt R", "Lean R", "Likely R", "Safe R"].map((label) => ({ label, bg: getRatingColors(label).bg }));
  return { fill, tip, legend, note: `${electionYear} ${chamberLabel} projection: lean on today's lines + national environment + incumbency; solid party colour = only one major party on the ballot.` };
}

function chamberBlock(state: StateInfo, chamber: Chamber, unicameral: boolean): ChamberBlock | null {
  const s = chamberSummary(state.abbr, state.name, chamber);
  if (s.roster.length === 0) return null;
  const label = unicameral ? "Legislature" : chamber === "house" ? "State House" : "State Senate";
  const p = s.projection;
  const up = (p?.districts ?? []).filter((d) => d.contest !== "not-up");
  const within = (pts: number) => up.filter((d) => d.contest === "contested" && d.margin != null && Math.abs(d.margin) < pts).length;
  const u = s.upcoming;
  const upText = !u || u.seatsUp === 0
    ? null
    : u.wholeChamber
      ? `All ${u.totalSeats ?? u.seatsUp} seats up`
      : `${u.seatsUp}${u.totalSeats ? ` of ${u.totalSeats}` : ""} seats up${u.parity ? ` · ${u.parity}-numbered districts` : u.districtsUp !== u.seatsUp || u.totalDistricts !== u.totalSeats ? ` · ${u.districtsUp} of ${u.totalDistricts} districts` : ""}`;
  const projTotal = p?.totalSeats ?? s.totalSeats ?? s.seats?.total ?? null;
  const calendar = s.calendar ?? null;
  const electionYears = [...(calendar?.electionYears ?? [])].sort((a, b) => b - a);
  const projByKey: ChamberMapData["projByKey"] = {};
  for (const d of p?.districts ?? []) projByKey[d.key] = { margin: d.margin, rating: d.rating, pD: d.pD, contest: d.contest };
  return {
    chamber,
    label,
    exploreHref: `/states/${state.id}/legislature/${chamber}`,
    totalSeats: s.totalSeats,
    upText,
    upcoming: u,
    expectedDem: p ? p.expectedDem : null,
    expectedRep: p ? p.expectedRep : null,
    projTotal,
    pDem: p?.pDemControl ?? null,
    unprojected: p?.unprojected ?? 0,
    contested: s.fieldStats?.contested ?? null,
    districts: s.fieldStats?.districts ?? null,
    open: s.fieldStats?.open ?? null,
    within5: within(5),
    within10: within(10),
    map: {
      chamber,
      isUnicameral: unicameral,
      roster: s.roster,
      mapInfo: s.mapInfo,
      electionYears,
      historicalMaps: stateLegHistoricalMaps[state.abbr]?.[chamber] ?? {},
      eras: (calendar?.eras ?? []).map((e) => ({ firstYear: e.firstYear, lastYear: e.lastYear, electionYears: e.electionYears, source: e.source })),
      custom: chamberShading(s, label),
      projByKey,
    },
  };
}

function raceParty(race: ForecastedRace): "D" | "R" | "I" {
  if (race.seatParty) return race.seatParty;
  if (race.candidates?.dem.incumbent) return "D";
  if (race.candidates?.rep.incumbent) return "R";
  return race.margin <= 0 ? "D" : "R";
}

function toBallotRace(race: ForecastedRace, label: string, href: string): BallotRace {
  return {
    kind: "race",
    label,
    href,
    dem: race.candidates ? { name: race.candidates.dem.name, party: race.candidates.dem.party, incumbent: race.candidates.dem.incumbent } : null,
    rep: race.candidates ? { name: race.candidates.rep.name, party: race.candidates.rep.party, incumbent: race.candidates.rep.incumbent } : null,
    margin: race.margin,
    rating: race.rating,
  };
}

/** Turnout as the page states it: ballots in the top race and the share of citizen adults that is. */
function turnoutStats(abbr: string): TurnoutStat[] {
  const out: TurnoutStat[] = [];
  const officeWord = (o: string) => (o === "president" ? "president" : o === "senate" ? "Senate" : o === "governor" ? "governor" : "House");
  try {
    const slice = projectionStateSlice(abbr);
    const statewide = slice.races.filter((r) => r.office !== "house").sort((a, b) => b.votes - a.votes)[0];
    if (statewide) {
      out.push({ label: `${electionYear} expected`, votes: statewide.votes, rate: statewide.rate ?? null, sub: `top race: ${officeWord(statewide.office)}` });
    } else {
      const house = slice.races.filter((r) => r.office === "house");
      if (house.length) {
        const votes = house.reduce((a, r) => a + r.votes, 0);
        const cvap = house[0].cvap;
        out.push({ label: `${electionYear} expected`, votes, rate: cvap ? (votes / cvap) * 100 : null, sub: "House races only" });
      }
    }
  } catch { /* no estimate for this state */ }
  for (const year of [2022, 2024]) {
    try {
      const e = stateEntry(abbr, year);
      if (!e?.top) continue;
      const race = e.races[e.top.office as keyof typeof e.races];
      out.push({ label: `${year} ${officeWord(e.top.office)}`, votes: e.top.votes, rate: race?.rate ?? null, sub: year === 2024 ? "last presidential" : "last midterm" });
    } catch { /* year not on file */ }
  }
  return out;
}

export function buildStatePage(state: StateInfo): StatePageData {
  const abbr = state.abbr;
  const stateFips = ABBR_TO_FIPS[abbr] ?? "";
  const unicameral = UNICAMERAL_STATES.has(abbr);

  // ── Federal and statewide races ──
  const senateSeat1Race = senateData.find((r) => r.id === abbr);
  const senateSeat1NoEl = !senateSeat1Race ? senateNoElection.find((e) => e.abbr === abbr) : null;
  const senateSeat2Race = senateData.find((r) => r.id === `${abbr}-2`);
  const senateSeat2Holdover = !senateSeat2Race ? senateHoldovers.find((e) => e.abbr === abbr) : null;
  const governorRace = governorData.find((r) => r.id === abbr);
  const governorNoEl = !governorRace ? governorNoElection.find((e) => e.abbr === abbr) : null;

  const houseRaces = houseData.filter((r) => r.state === state.name).map(forecastRace);
  const projectedGovernor = governorRace ? forecastRace(governorRace) : null;
  const projectedSenate1 = senateSeat1Race ? forecastRace(senateSeat1Race) : null;
  const projectedSenate2 = senateSeat2Race ? forecastRace(senateSeat2Race) : null;

  const governor: StatePageData["governor"] = projectedGovernor
    ? toBallotRace(projectedGovernor, "Governor", `/governor/${projectedGovernor.id.toLowerCase()}`)
    : governorNoEl
      ? { kind: "holdover", label: "Governor", href: `/governor/${governorNoEl.abbr.toLowerCase()}`, name: governorNoEl.incumbent, party: governorNoEl.party as "D" | "R" | "I", nextElection: governorNoEl.nextElection }
      : null;
  const senate: StatePageData["senate"] = [];
  if (projectedSenate1) senate.push(toBallotRace(projectedSenate1, "Senate (Seat 1)", `/senate/${projectedSenate1.id.toLowerCase()}`));
  else if (senateSeat1NoEl) senate.push({ kind: "holdover", label: "Senate (Seat 1)", href: `/senate/${senateSeat1NoEl.abbr.toLowerCase()}`, name: senateSeat1NoEl.incumbent, party: senateSeat1NoEl.party as "D" | "R" | "I", nextElection: senateSeat1NoEl.nextElection });
  if (projectedSenate2) senate.push(toBallotRace(projectedSenate2, "Senate (Seat 2)", `/senate/${projectedSenate2.id.toLowerCase().replace(/-2$/, "2")}`));
  else if (senateSeat2Holdover) senate.push({ kind: "holdover", label: "Senate (Seat 2)", href: `/senate/${senateSeat2Holdover.abbr.toLowerCase()}2`, name: senateSeat2Holdover.incumbent, party: senateSeat2Holdover.party as "D" | "R" | "I", nextElection: senateSeat2Holdover.nextElection });

  const houseRows: HouseRow[] = houseRaces.map((race) => {
    const distNum = race.name.split("-")[1];
    const open = !!race.candidates && !race.candidates.dem.incumbent && !race.candidates.rep.incumbent;
    return {
      id: race.id,
      name: race.name,
      label: distNum === "AL" ? "At-Large" : `District ${distNum}`,
      href: `/house/${race.name.toLowerCase()}`,
      margin: race.margin,
      rating: race.rating,
      openHolder: open ? (race.seatHolder ?? "open seat") : null,
    };
  });

  // ── Composition history ──
  const delegation = houseDelegationHistory[state.name] ?? [];
  const legEntries = stateLegData[state.name] ?? [];
  const hasData = (e: StateLegEntry) => e.demSeats != null || e.repSeats != null || e.demPct != null || e.repPct != null;
  const stateHouseEntries = legEntries.filter((e) => e.type === "House" && hasData(e));
  const stateSenateEntries = legEntries.filter((e) => e.type === "Senate" && hasData(e));

  // ── Hero ──
  const del2024 = delegation.find((e) => e.year === 2024);
  const houseDem = del2024 ? del2024.demSeats : houseRaces.filter((r) => raceParty(r) === "D").length;
  const houseRep = del2024 ? del2024.repSeats : houseRaces.filter((r) => raceParty(r) === "R").length;
  const [sen1, sen2] = senateCurrent[abbr] ?? ["R", "R"];
  const senParties = [sen1, sen2];
  const govParty: "D" | "R" | "I" | null = projectedGovernor ? raceParty(projectedGovernor) : (governorNoEl?.party as "D" | "R" | "I" | undefined) ?? null;
  const govName = projectedGovernor?.seatHolder ?? governorNoEl?.incumbent ?? null;
  const stateHouseSeats = latestChamberSeats(stateHouseEntries, "House");
  const stateSenateSeats = unicameral ? null : latestChamberSeats(stateSenateEntries, "Senate");
  const houseInfo = stateLegMapInfo[abbr]?.house;
  const senateInfo = stateLegMapInfo[abbr]?.senate;

  const bodies: HeroBody[] = [
    { key: "us-house", label: "U.S. House", total: houseDem + houseRep || null, dem: houseDem, rep: houseRep, oth: 0, notch: houseDem + houseRep > 1 },
    { key: "us-senate", label: "U.S. Senate", total: 2, dem: senParties.filter((p) => p === "D").length, rep: senParties.filter((p) => p === "R").length, oth: senParties.filter((p) => p === "I").length, notch: false },
    { key: "governor", label: "Governor", total: 1, dem: govParty === "D" ? 1 : 0, rep: govParty === "R" ? 1 : 0, oth: govParty === "I" ? 1 : 0, word: govParty ?? "—", holder: govName ?? undefined, notch: false },
  ];
  if (stateHouseSeats) {
    bodies.push({ key: "state-house", label: unicameral ? "Legislature" : "State House", total: houseInfo?.totalSeats ?? stateHouseSeats.total, dem: stateHouseSeats.dem, rep: stateHouseSeats.rep, oth: stateHouseSeats.oth, notch: true });
  }
  if (stateSenateSeats) {
    bodies.push({ key: "state-senate", label: "State Senate", total: senateInfo?.totalSeats ?? stateSenateSeats.total, dem: stateSenateSeats.dem, rep: stateSenateSeats.rep, oth: stateSenateSeats.oth, notch: true });
  }

  // ── Chambers ──
  const chambers = (unicameral ? (["senate"] as Chamber[]) : (["house", "senate"] as Chamber[]))
    .map((c) => chamberBlock(state, c, unicameral))
    .filter((b): b is ChamberBlock => b != null);

  // ── Ballot sentence: the federal and statewide races, as the page has always counted them ──
  const totalRaces = houseRaces.length + senate.filter((s) => s.kind === "race").length + (governor?.kind === "race" ? 1 : 0);
  const ballotSentence = `${totalRaces} race${totalRaces === 1 ? "" : "s"} on ballot in ${electionYear}`;

  // ── Statewide results ──
  const presKeys = abbr === "ME" ? ["ME", "ME-01", "ME-02"] : abbr === "NE" ? ["NE", "NE-01", "NE-02", "NE-03"] : [abbr];
  const presRows: (PresResult & { _ki: number })[] = presKeys
    .flatMap((k, ki) => (presPastResults[k] ?? []).map((r) => ({ ...r, _ki: ki })))
    .sort((a, b) => (b.year !== a.year ? b.year - a.year : a._ki - b._ki));
  const presRaceLabel = (a: string) => {
    if (a === abbr) return "Presidential";
    const m = a.match(/-(\d+)$/);
    return m ? `Pres. (CD-${m[1]})` : "Presidential";
  };
  const senatePast = [
    ...(senateSeat1Race?.pastResults ?? senateSeat1NoEl?.pastResults ?? []).map((r) => ({ ...r, seat: 1 as const })),
    ...(senateSeat2Race?.pastResults ?? senateSeat2Holdover?.pastResults ?? []).map((r) => ({ ...r, seat: 2 as const })),
  ].filter((r) => r.year >= 2016).sort((a, b) => b.year - a.year || a.seat - b.seat);
  const govPast = (governorRace?.pastResults ?? governorNoEl?.pastResults ?? []).filter((r) => r.year >= 2016);
  const govPageId = governorRace ? governorRace.id.toLowerCase() : governorNoEl?.abbr.toLowerCase();

  // ── Counties ──
  const countyTpl = countyTplForState(abbr);
  const countyFips = Object.keys(countyPresidentialData).filter((f) => countyPresidentialData[f].state === abbr);
  const layers: CountyLayer[] = [];
  const presYears = ([2024, 2020, 2016] as const).filter((y) => countyFips.some((f) => countyPresidentialData[f].years[y]));
  for (const y of presYears) {
    const row = presRows.find((r) => r.year === y && r.stateAbbr === abbr);
    layers.push({
      key: `president-${y}`, label: `${y} Pres.`,
      entries: countyFips.flatMap((f) => { const r = countyPresidentialData[f].years[y]; return r ? [{ fips: f, name: countyPresidentialData[f].countyName, result: { demVotes: r.demVotes, repVotes: r.repVotes, totalVotes: r.totalVotes, demPct: r.demPct, repPct: r.repPct, margin: r.margin } }] : []; }),
      demName: row?.demCandidate ?? "Democrat", repName: row?.repCandidate ?? "Republican", demParty: "D", repParty: "R",
    });
  }
  const latestYear = (data: Record<string, { state: string; years: Partial<Record<number, unknown>> }>) => {
    const years = new Set<number>();
    for (const f of Object.keys(data)) if (data[f].state === abbr) for (const y of Object.keys(data[f].years)) if (Number(y) >= 2016) years.add(Number(y));
    return years.size ? Math.max(...years) : null;
  };
  const senY = latestYear(countySenateData);
  if (senY) {
    const names = senateCandidatesByYear[abbr]?.[senY];
    const row = senatePast.find((r) => r.year === senY && !isSpecialElection(r.electionType));
    layers.push({
      key: `senate-${senY}`, label: `${senY} Senate`,
      entries: Object.keys(countySenateData).flatMap((f) => { const c = countySenateData[f]; const r = c.state === abbr ? c.years[senY] : undefined; return r ? [{ fips: f, name: c.countyName, result: { demVotes: r.demVotes, repVotes: r.repVotes, totalVotes: r.totalVotes, demPct: r.demPct, repPct: r.repPct, margin: r.margin } }] : []; }),
      demName: names?.dem ?? row?.demCandidate ?? "Democrat", repName: names?.rep ?? row?.repCandidate ?? "Republican",
      demParty: row?.demParty ?? "D", repParty: row?.repParty ?? "R",
    });
  }
  const govY = latestYear(countyGovernorData);
  if (govY) {
    const names = governorCandidatesByYear[abbr]?.[govY];
    const row = govPast.find((r) => r.year === govY);
    layers.push({
      key: `governor-${govY}`, label: `${govY} Gov.`,
      entries: Object.keys(countyGovernorData).flatMap((f) => { const c = countyGovernorData[f]; const r = c.state === abbr ? c.years[govY] : undefined; return r ? [{ fips: f, name: c.countyName, result: { demVotes: r.demVotes, repVotes: r.repVotes, totalVotes: r.totalVotes, demPct: r.demPct, repPct: r.repPct, margin: r.margin } }] : []; }),
      demName: names?.dem ?? row?.demCandidate ?? "Democrat", repName: names?.rep ?? row?.repCandidate ?? "Republican",
      demParty: row?.demParty ?? "D", repParty: row?.repParty ?? "R",
    });
  }
  // The 2026 projection for the state's top statewide race, where there is one.
  const projOffice = governorRace ? "governor" : senateSeat1Race ? "senate" : null;
  if (projOffice) {
    const pr = projectRaceResults(projOffice, abbr);
    if (pr) layers.unshift({
      key: "projected-2026", label: `${electionYear} projected`, entries: projectedCountyMapEntries(pr),
      demName: pr.demName, repName: pr.repName, demParty: pr.demParty, repParty: pr.repParty,
      caption: `Projected county results for the ${electionYear} ${projOffice === "governor" ? "governor" : "Senate"} race`,
    });
  }

  // Largest counties: by 2024 presidential ballots, with the 2026 estimate for the top race.
  let est: Map<string, number> = new Map();
  let estTotal = 0;
  try {
    const slice = projectionStateSlice(abbr);
    const top = slice.races.filter((r) => r.office !== "house").sort((a, b) => b.votes - a.votes)[0];
    if (top) {
      for (const c of top.counties) est.set(c.fips, (est.get(c.fips) ?? 0) + c.votes);
    } else {
      for (const r of slice.races) for (const c of r.counties) est.set(c.fips, (est.get(c.fips) ?? 0) + c.votes);
    }
    estTotal = [...est.values()].reduce((a, b) => a + b, 0);
  } catch { est = new Map(); }
  const rows: CountyRow[] = countyFips.map((f) => {
    const c = countyPresidentialData[f];
    const r24 = c.years[2024];
    const e = est.get(f) ?? null;
    return { fips: f, name: c.countyName, tpl: countyTpl[f] ?? null, pres2024: r24?.margin ?? null, votes2024: r24?.totalVotes ?? null, est2026: e, share: e != null && estTotal > 0 ? (e / estTotal) * 100 : null };
  }).sort((a, b) => (b.votes2024 ?? 0) - (a.votes2024 ?? 0));

  const layerKeyFor = (group: "president" | "senate" | "governor", year: number) => layers.some((l) => l.key === `${group}-${year}`) ? `${group}-${year}` : null;

  const statewide: StatePageData["results"]["statewide"] = [
    ...presRows.map((res, i) => ({
      key: `pres-${res.year}-${res.stateAbbr}-${i}`,
      group: "president" as const,
      year: res.year,
      label: presRaceLabel(res.stateAbbr),
      href: res.stateAbbr === abbr ? pastElectionHref("president", abbr.toLowerCase(), res.year) : undefined,
      demPct: res.demPct, repPct: res.repPct, demVotes: res.demVotes, repVotes: res.repVotes,
      demCandidate: res.demCandidate, repCandidate: res.repCandidate,
      countyLayer: res.stateAbbr === abbr ? layerKeyFor("president", res.year) : null,
    })),
    ...senatePast.map((res, idx) => ({
      key: `senate-${res.year}-${res.seat}-${res.electionType ?? "regular"}-${idx}`,
      group: "senate" as const,
      year: res.year,
      label: isSpecialElection(res.electionType) ? "Senate Special" : "Senate",
      href: pastElectionHref("senate", (res.seat === 2 ? `${abbr}2` : abbr).toLowerCase(), res.year) ?? `/senate/${(res.seat === 2 ? `${abbr}2` : abbr).toLowerCase()}`,
      demPct: res.demPct, repPct: res.repPct, demVotes: res.demVotes, repVotes: res.repVotes,
      demCandidate: res.demCandidate, repCandidate: res.repCandidate,
      countyLayer: isSpecialElection(res.electionType) ? null : layerKeyFor("senate", res.year),
    })),
    ...(govPageId ? govPast.map((res) => ({
      key: `gov-${res.year}`,
      group: "governor" as const,
      year: res.year,
      label: "Governor",
      href: pastElectionHref("governor", govPageId, res.year) ?? `/governor/${govPageId}`,
      demPct: res.demPct, repPct: res.repPct, demVotes: res.demVotes, repVotes: res.repVotes,
      demCandidate: res.demCandidate, repCandidate: res.repCandidate,
      countyLayer: layerKeyFor("governor", res.year),
    })) : []),
  ];

  const chart: ChartResult[] = [
    ...delegation.filter((r) => r.year >= 2016).map((r) => ({ year: r.year, race: "House", demPct: r.demPct, repPct: r.repPct })),
    ...presRows.map((r) => ({ year: r.year, race: "President", demPct: r.demPct, repPct: r.repPct, label: r.stateAbbr === abbr ? String(r.year) : `${r.year} ${presRaceLabel(r.stateAbbr).replace("Pres. ", "")}` })),
    ...senatePast.map((r) => ({ year: r.year, race: isSpecialElection(r.electionType) ? "Senate Special" : "Senate", demPct: r.demPct, repPct: r.repPct, label: `${r.year}${r.seat === 2 ? " S2" : ""}` })),
    ...govPast.map((r) => ({ year: r.year, race: "Governor", demPct: r.demPct, repPct: r.repPct })),
    ...stateHouseEntries.filter((e) => e.demPct != null && e.repPct != null).map((e) => ({ year: e.year, race: "State House", demPct: e.demPct!, repPct: e.repPct! })),
    ...stateSenateEntries.filter((e) => e.demPct != null && e.repPct != null).map((e) => ({ year: e.year, race: "State Senate", demPct: e.demPct!, repPct: e.repPct! })),
  ];

  // ── Map vintage ──
  const cdRedraws = [...new Set(
    Object.entries(houseDistrictInfo)
      .filter(([geoid]) => stateFips && geoid.startsWith(stateFips))
      .flatMap(([, entries]) => entries.map((e) => e.year))
      .filter((y) => y >= 2016),
  )].sort((a, b) => b - a);
  const vintage: VintageItem[] = [];
  if (houseRaces.length > 0) {
    vintage.push({
      label: "Congressional map",
      value: cdRedraws.length ? `redrawn ${cdRedraws[0]}` : "unchanged since 2016",
      sub: cdRedraws.length > 1 ? `earlier redraw${cdRedraws.length > 2 ? "s" : ""} ${cdRedraws.slice(1).join(", ")}` : cdRedraws.length === 1 ? "first used that November" : undefined,
    });
  }
  for (const c of chambers) {
    const info = c.map.mapInfo;
    const era = c.map.eras.at(-1);
    vintage.push({
      label: `${c.label} map`,
      value: info?.enactedDate ? `enacted ${info.enactedDate}` : info?.firstCycle ? `first used ${info.firstCycle}` : era ? `since ${era.firstYear}` : "—",
      sub: info?.source ?? era?.source,
    });
  }
  vintage.push({ label: "Next redistricting", value: "after the 2030 census", sub: "unless a court orders otherwise" });

  const newMapYears: StatePageData["results"]["newMapYears"] = { federal: cdRedraws };
  const majority: StatePageData["results"]["majority"] = {};
  const seatsUpByYear: StatePageData["results"]["seatsUpByYear"] = {};
  const upcoming: StatePageData["results"]["upcoming"] = {};
  for (const c of chambers) {
    const info = c.map.mapInfo;
    majority[c.chamber] = { totalSeats: info?.totalSeats ?? c.totalSeats ?? undefined, supermajoritySeats: info?.supermajoritySeats };
    const cal = stateLegCalendar[abbr]?.[c.chamber];
    if (cal) seatsUpByYear[c.chamber] = Object.fromEntries(Object.entries(cal.seatsUp).map(([y, n]) => [Number(y), n]));
    newMapYears[c.chamber] = c.map.eras.filter((e) => e.firstYear >= 2016).map((e) => e.electionYears[0]).filter((y): y is number => y != null);
    upcoming[c.chamber] = c.upcoming;
  }

  const model = calculateStateModel(abbr, state.name);
  const tpl = model.tpl;

  // ── Redistricting history: every House redraw, by year, with each district's own account ──
  const nameOf = new Map(houseData.filter((r) => r.state === state.name).map((r) => [r.id, r.name]));
  const byYear = new Map<number, RedistrictingYear["districts"]>();
  for (const [geoid, entries] of Object.entries(houseDistrictInfo)) {
    if (!stateFips || !geoid.startsWith(stateFips)) continue;
    const num = geoid.slice(2);
    const name = nameOf.get(geoid) ?? `${abbr}-${num}`;
    for (const e of entries) {
      if (e.year < 2016) continue;
      const list = byYear.get(e.year) ?? [];
      list.push({ id: geoid, name, href: nameOf.has(geoid) ? `/house/${name.toLowerCase()}` : "", description: e.description, pviOld: e.pviOld ?? null, pviNew: e.pviNew ?? null });
      byYear.set(e.year, list);
    }
  }
  const calendarYears = Object.keys(redistrictingByState[abbr] ?? {}).map(Number).filter((y) => y >= 2016);
  const redistricting: RedistrictingYear[] = [...new Set([...byYear.keys(), ...calendarYears])]
    .sort((a, b) => b - a)
    .map((year) => ({
      year,
      events: redistrictingByState[abbr]?.[year] ?? [],
      districts: (byYear.get(year) ?? []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    }));
  const housePast = Object.fromEntries(Object.entries(housePastResults).filter(([geoid]) => stateFips && geoid.startsWith(stateFips)));

  return {
    state,
    stateFips,
    tpl: Number.isFinite(tpl) ? tpl : null,
    ballotSentence,
    bodies,
    turnout: turnoutStats(abbr),
    governor,
    senate,
    house: {
      rows: houseRows,
      demProj: houseRaces.filter((r) => r.margin <= 0).length,
      repProj: houseRaces.filter((r) => r.margin > 0).length,
      open: houseRows.filter((r) => r.openHolder).length,
    },
    chambers,
    houseRaces,
    housePastResults: housePast,
    results: {
      statewide,
      federal: delegation,
      stateHouse: stateHouseEntries,
      stateSenate: stateSenateEntries,
      isUnicameral: unicameral,
      majority,
      seatsUpByYear,
      newMapYears,
      upcoming,
      chart,
      vintage,
    },
    counties: { tpl: countyTpl, layers, rows, areaLabel: abbr === "LA" ? "Parish" : abbr === "AK" ? "Borough" : "County" },
    tplTrend: model.yearAggregations,
    redistricting,
  };
}

