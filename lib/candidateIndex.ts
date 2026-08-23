import {
  senateData,
  houseData,
  governorData,
  senateNoElection,
  senateHoldovers,
  governorNoElection,
  electionYear,
  presPastResults,
  type RaceForecast,
  type NoElectionEntry,
} from "@/data/forecastData";
import { popVoteData } from "@/data/popVoteData";
import { candidateSlug } from "./candidateSlug";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CandidateHistoryEntry = {
  year: number;
  raceType: "house" | "senate" | "governor" | "president";
  raceId: string;
  raceName: string;
  racePath: string;
  party: "D" | "R" | "I";
  oppParty: "D" | "R" | "I";
  side: "dem" | "rep";
  demPct: number;
  repPct: number;
  demVotes?: number;
  repVotes?: number;
  demEV?: number;
  repEV?: number;
  incumbent: boolean;
  isCurrent: boolean;
};

export type CandidatePage = {
  name: string;
  slug: string;
  party: "D" | "R" | "I";
  tab: "house" | "senate" | "governor" | "president";
  state: string;
  currentPosition?: string; // e.g. "Governor · Nebraska" or "U.S. Senator · Alaska"
  currentRace?: {
    id: string;
    raceType: "house" | "senate" | "governor" | "president";
    raceName: string;
    racePath: string;
    incumbent: boolean;
    probability: number;
    rating: string;
    margin: number;
    opponent?: { name: string; party: "D" | "R" | "I" };
  };
  history: CandidateHistoryEntry[];
};

// ── Internal raw-entry accumulator ────────────────────────────────────────────

type RawEntry = {
  name: string;
  party: "D" | "R" | "I";
  raceType: "house" | "senate" | "governor" | "president";
  raceId: string;
  raceName: string;
  racePath: string;
  state: string;
  year: number;
  side: "dem" | "rep";
  demPct: number;
  repPct: number;
  demVotes?: number;
  repVotes?: number;
  demEV?: number;
  repEV?: number;
  incumbent: boolean;
  isCurrent: boolean;
  currentPosition?: string;
  probability?: number;
  rating?: string;
  margin?: number;
  opponentName?: string;
  opponentParty?: "D" | "R" | "I";
};

const SKIP_NAMES = new Set([
  "",
  "tbd",
  "democrat",
  "republican",
  "independent",
  "democratic candidate",
  "republican candidate",
  "write-in",
  "write in",
  "unopposed",
]);

function isValidName(name: string | undefined): name is string {
  if (!name || name.trim().length < 3) return false;
  return !SKIP_NAMES.has(name.trim().toLowerCase());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function positionString(raceType: "house" | "senate" | "governor", state: string, raceName: string): string {
  if (raceType === "senate") return `U.S. Senator · ${state}`;
  if (raceType === "governor") return `Governor · ${state}`;
  return `U.S. Representative · ${raceName}`; // house: raceName is the district ID e.g. "NE-01"
}

// ── Collectors ────────────────────────────────────────────────────────────────

function collectFromRaces(races: RaceForecast[], racePathPrefix: string): RawEntry[] {
  const entries: RawEntry[] = [];

  for (const race of races) {
    const raceSlug = racePathPrefix === "/house" ? race.name.toLowerCase() : race.id.toLowerCase().replace(/-2$/, "2");
    const racePath = `${racePathPrefix}/${raceSlug}`;
    const demPctProjected = (100 + race.margin) / 2;
    const repPctProjected = (100 - race.margin) / 2;

    // 2026 active candidates
    if (race.candidates) {
      const { dem, rep } = race.candidates;
      if (isValidName(dem.name)) {
        entries.push({
          name: dem.name,
          party: dem.party,
          raceType: race.raceType,
          raceId: race.id,
          raceName: race.name,
          racePath,
          state: race.state,
          year: electionYear,
          side: "dem",
          demPct: demPctProjected,
          repPct: repPctProjected,
          incumbent: dem.incumbent,
          isCurrent: true,
          currentPosition: dem.incumbent ? positionString(race.raceType, race.state, race.name) : undefined,
          probability: race.probability,
          rating: race.rating,
          margin: race.margin,
          opponentName: isValidName(rep.name) ? rep.name : undefined,
          opponentParty: rep.party,
        });
      }
      if (isValidName(rep.name)) {
        entries.push({
          name: rep.name,
          party: rep.party,
          raceType: race.raceType,
          raceId: race.id,
          raceName: race.name,
          racePath,
          state: race.state,
          year: electionYear,
          side: "rep",
          demPct: demPctProjected,
          repPct: repPctProjected,
          incumbent: rep.incumbent,
          isCurrent: true,
          currentPosition: rep.incumbent ? positionString(race.raceType, race.state, race.name) : undefined,
          probability: race.probability,
          rating: race.rating,
          margin: race.margin,
          opponentName: isValidName(dem.name) ? dem.name : undefined,
          opponentParty: dem.party,
        });
      }
    }

    // Past results
    for (const res of race.pastResults ?? []) {
      if (isValidName(res.demCandidate)) {
        entries.push({
          name: res.demCandidate,
          party: res.demParty ?? "D",
          raceType: race.raceType,
          raceId: race.id,
          raceName: race.name,
          racePath,
          state: race.state,
          year: res.year,
          side: "dem",
          demPct: res.demPct,
          repPct: res.repPct,
          demVotes: res.demVotes,
          repVotes: res.repVotes,
          incumbent: res.demIncumbent ?? false,
          isCurrent: false,
          opponentParty: res.repParty ?? "R",
        });
      }
      if (isValidName(res.repCandidate)) {
        entries.push({
          name: res.repCandidate,
          party: res.repParty ?? "R",
          raceType: race.raceType,
          raceId: race.id,
          raceName: race.name,
          racePath,
          state: race.state,
          year: res.year,
          side: "rep",
          demPct: res.demPct,
          repPct: res.repPct,
          demVotes: res.demVotes,
          repVotes: res.repVotes,
          incumbent: res.repIncumbent ?? false,
          isCurrent: false,
          opponentParty: res.demParty ?? "D",
        });
      }
    }
  }

  return entries;
}

function collectFromNoElection(
  noElectionEntries: NoElectionEntry[],
  raceType: "senate" | "governor",
  racePathPrefix: string,
  pathSuffix: (abbr: string) => string = () => "",
): RawEntry[] {
  const entries: RawEntry[] = [];

  for (const entry of noElectionEntries) {
    const idSuffix = pathSuffix(entry.abbr);
    const racePath = `${racePathPrefix}/${entry.abbr.toLowerCase()}${idSuffix}`;

    // Incumbent as a standalone entry (covers cases where pastResults may not go far enough back)
    if (isValidName(entry.incumbent)) {
      // We'll pick up their history from pastResults below.
      // Only add a stub if they don't appear there at all — handled in deduplication.
      // For now, mark them so we at least register the name.
    }

    // Past results
    for (const res of entry.pastResults ?? []) {
      if (isValidName(res.demCandidate)) {
        entries.push({
          name: res.demCandidate,
          party: res.demParty ?? "D",
          raceType,
          raceId: entry.abbr + idSuffix,
          raceName: entry.state,
          racePath,
          state: entry.state,
          year: res.year,
          side: "dem",
          demPct: res.demPct,
          repPct: res.repPct,
          incumbent: res.demIncumbent ?? false,
          isCurrent: false,
          opponentParty: res.repParty ?? "R",
        });
      }
      if (isValidName(res.repCandidate)) {
        entries.push({
          name: res.repCandidate,
          party: res.repParty ?? "R",
          raceType,
          raceId: entry.abbr + idSuffix,
          raceName: entry.state,
          racePath,
          state: entry.state,
          year: res.year,
          side: "rep",
          demPct: res.demPct,
          repPct: res.repPct,
          incumbent: res.repIncumbent ?? false,
          isCurrent: false,
          opponentParty: res.demParty ?? "D",
        });
      }
    }
  }

  return entries;
}

// 2008 and 2012 predate the state-by-state presidential dataset (presPastResults, which
// starts at 2016); figures here are the certified national popular-vote and electoral-vote
// totals for those two elections.
const PRE_2016_PRESIDENTIAL: {
  year: number;
  demCandidate: string;
  repCandidate: string;
  demIncumbent?: boolean;
  repIncumbent?: boolean;
  demPct: number;
  repPct: number;
  demVotes: number;
  repVotes: number;
  demEV: number;
  repEV: number;
}[] = [
  { year: 2008, demCandidate: "Barack Obama", repCandidate: "John McCain", demPct: 52.9, repPct: 45.7, demVotes: 69498516, repVotes: 59948323, demEV: 365, repEV: 173 },
  { year: 2012, demCandidate: "Barack Obama", repCandidate: "Mitt Romney", demIncumbent: true, demPct: 51.1, repPct: 47.2, demVotes: 65915795, repVotes: 60933504, demEV: 332, repEV: 206 },
];

function collectPresidential(): RawEntry[] {
  const entries: RawEntry[] = [];
  const racePath = "/analysis/popular-vote";
  const raceName = "United States";

  type PresYear = (typeof PRE_2016_PRESIDENTIAL)[number];
  const byYear: PresYear[] = [...PRE_2016_PRESIDENTIAL];

  for (const year of [2016, 2020, 2024] as const) {
    const pv = popVoteData.find(r => r.type === "President" && r.year === year);
    const stateRow = presPastResults["CA"]?.find(r => r.year === year);
    if (!pv || !stateRow?.demCandidate || !stateRow?.repCandidate) continue;
    byYear.push({
      year,
      demCandidate: stateRow.demCandidate,
      repCandidate: stateRow.repCandidate,
      demIncumbent: stateRow.demIncumbent,
      repIncumbent: stateRow.repIncumbent,
      demPct: pv.demPct,
      repPct: pv.repPct,
      demVotes: pv.demVotes,
      repVotes: pv.repVotes,
      demEV: pv.seatsD,
      repEV: pv.seatsR,
    });
  }

  for (const yr of byYear) {
    entries.push({
      name: yr.demCandidate,
      party: "D",
      raceType: "president",
      raceId: `president-${yr.year}`,
      raceName,
      racePath,
      state: "",
      year: yr.year,
      side: "dem",
      demPct: yr.demPct,
      repPct: yr.repPct,
      demVotes: yr.demVotes,
      repVotes: yr.repVotes,
      demEV: yr.demEV,
      repEV: yr.repEV,
      incumbent: yr.demIncumbent ?? false,
      isCurrent: false,
      opponentParty: "R",
    });
    entries.push({
      name: yr.repCandidate,
      party: "R",
      raceType: "president",
      raceId: `president-${yr.year}`,
      raceName,
      racePath,
      state: "",
      year: yr.year,
      side: "rep",
      demPct: yr.demPct,
      repPct: yr.repPct,
      demVotes: yr.demVotes,
      repVotes: yr.repVotes,
      demEV: yr.demEV,
      repEV: yr.repEV,
      incumbent: yr.repIncumbent ?? false,
      isCurrent: false,
      opponentParty: "D",
    });
  }

  return entries;
}

// ── Index build ───────────────────────────────────────────────────────────────

function buildIndex(): Map<string, CandidatePage> {
  const allRaw: RawEntry[] = [
    ...collectFromRaces(senateData, "/senate"),
    ...collectFromRaces(houseData, "/house"),
    ...collectFromRaces(governorData, "/governor"),
    ...collectFromNoElection(senateNoElection, "senate", "/senate"),
    ...collectFromNoElection(senateHoldovers, "senate", "/senate", () => "2"),
    ...collectFromNoElection(governorNoElection, "governor", "/governor"),
    ...collectPresidential(),
  ];

  // Group by name (exact match — intentional; slightly different names get separate pages)
  const byName = new Map<string, RawEntry[]>();
  for (const entry of allRaw) {
    const existing = byName.get(entry.name);
    if (existing) {
      existing.push(entry);
    } else {
      byName.set(entry.name, [entry]);
    }
  }

  // Build a map of name → currentPosition for holdover/no-election incumbents.
  // These people currently hold office but aren't running in 2026.
  const noElectionPositions = new Map<string, string>();
  for (const e of senateNoElection) {
    if (isValidName(e.incumbent)) noElectionPositions.set(e.incumbent, `U.S. Senator · ${e.state}`);
  }
  for (const e of senateHoldovers) {
    if (isValidName(e.incumbent)) noElectionPositions.set(e.incumbent, `U.S. Senator · ${e.state}`);
  }
  for (const e of governorNoElection) {
    if (isValidName(e.incumbent)) noElectionPositions.set(e.incumbent, `Governor · ${e.state}`);
  }

  // Also register no-election incumbents who may not appear in pastResults
  // so their name at least resolves to a (sparse) page.
  const allNoElectionIncumbents: { name: string; party: "D" | "R" | "I"; raceType: "senate" | "governor"; raceId: string; raceName: string; racePath: string }[] = [
    ...senateNoElection.map(e => ({ name: e.incumbent, party: e.party, raceType: "senate" as const, raceId: e.abbr, raceName: e.state, racePath: `/senate/${e.abbr.toLowerCase()}` })),
    ...senateHoldovers.map(e => ({ name: e.incumbent, party: e.party, raceType: "senate" as const, raceId: e.abbr + "-2", raceName: e.state, racePath: `/senate/${e.abbr.toLowerCase()}2` })),
    ...governorNoElection.map(e => ({ name: e.incumbent, party: e.party, raceType: "governor" as const, raceId: e.abbr, raceName: e.state, racePath: `/governor/${e.abbr.toLowerCase()}` })),
  ];
  for (const inc of allNoElectionIncumbents) {
    if (!isValidName(inc.name)) continue;
    if (!byName.has(inc.name)) {
      // Stub entry so the name is registered — no history entries, page will show current position only
      byName.set(inc.name, []);
    }
  }

  const index = new Map<string, CandidatePage>();

  for (const [name, rawEntries] of byName) {
    const slug = candidateSlug(name);

    // Deduplicate: same name can appear in multiple data sources for the same race/year
    const seen = new Set<string>();
    const unique = rawEntries.filter(e => {
      const key = `${e.year}-${e.raceId}-${e.side}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort desc by year so most-recent is first
    unique.sort((a, b) => b.year - a.year || a.raceType.localeCompare(b.raceType));

    // Most-recent party and tab
    const mostRecent = unique[0];
    const party: "D" | "R" | "I" = mostRecent?.party ?? "D";
    const tab: "house" | "senate" | "governor" | "president" = mostRecent?.raceType ?? "house";

    // Current 2026 race
    const currentEntry = unique.find(e => e.isCurrent);
    const currentRace = currentEntry
      ? {
          id: currentEntry.raceId,
          raceType: currentEntry.raceType,
          raceName: currentEntry.raceName,
          racePath: currentEntry.racePath,
          incumbent: currentEntry.incumbent,
          probability: currentEntry.probability ?? 0.5,
          rating: currentEntry.rating ?? "TBD",
          margin: currentEntry.margin ?? 0,
          opponent: currentEntry.opponentName
            ? { name: currentEntry.opponentName, party: currentEntry.opponentParty ?? "I" }
            : undefined,
        }
      : undefined;

    // Build history (all entries, current + past)
    const history: CandidateHistoryEntry[] = unique.map(e => ({
      year: e.year,
      raceType: e.raceType,
      raceId: e.raceId,
      raceName: e.raceName,
      racePath: e.racePath,
      party: e.party,
      oppParty: e.opponentParty ?? (e.side === "dem" ? "R" : "D"),
      side: e.side,
      demPct: e.demPct,
      repPct: e.repPct,
      demVotes: e.demVotes,
      repVotes: e.repVotes,
      demEV: e.demEV,
      repEV: e.repEV,
      incumbent: e.incumbent,
      isCurrent: e.isCurrent,
    }));

    // currentPosition: prefer explicit incumbent flag from 2026 race, fall back to no-election lookup
    const currentPosition =
      unique.find(e => e.currentPosition)?.currentPosition ??
      noElectionPositions.get(name);

    const state = mostRecent?.state ?? "";

    // If slug collides (different name same slug), merge into same page — first writer wins for metadata
    if (!index.has(slug)) {
      index.set(slug, { name, slug, party, tab, state, currentPosition, currentRace, history });
    } else {
      // Merge history into existing entry
      const existing = index.get(slug)!;
      existing.history.push(...history);
      existing.history.sort((a, b) => b.year - a.year);
    }
  }

  return index;
}

const candidateIndex = buildIndex();

// ── Public API ────────────────────────────────────────────────────────────────

export function getAllCandidateSlugs(): string[] {
  return Array.from(candidateIndex.keys());
}

// Only slugs worth pre-building at deploy time: active 2026 candidates + current incumbents.
// Historical-only candidates are rendered on first request and cached by the CDN.
export function getPrebuiltCandidateSlugs(): string[] {
  return Array.from(candidateIndex.entries())
    .filter(([, page]) => page.currentRace != null || page.currentPosition != null)
    .map(([slug]) => slug);
}

export function getCandidatePage(slug: string): CandidatePage | null {
  return candidateIndex.get(slug) ?? null;
}
