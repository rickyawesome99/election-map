// Shared types and small helpers for the Legislative District Atlas (the per-chamber pages at
// /states/[id]/legislature/[chamber]). No data imports: the client reads one per-chamber JSON
// slice from public/state-leg-atlas/{chamber}/{ST}.json, built by scripts/buildStateLegAtlasSlices.ts.

import type { Chamber, Incumbent } from "@/data/stateLegDistricts";
import type { Demographics } from "@/data/demographics";
import type { StateLegDistrictResult } from "@/data/stateLegResults";
import type { StateLegRedistrictingEntry } from "@/data/stateLegRedistricting";
import type { StateLegCandidate2026, StateLegDistrictCandidates2026 } from "@/data/stateLegCandidates2026";
import type { StateLegOutgoing2026 } from "@/data/stateLegOutgoing2026";

export type AtlasPresVote = { demPct: number; repPct: number; margin: number; totalVotes: number | null; estimated?: boolean };

export type AtlasPresByEra = {
  era: string;
  /** Elections held on these lines, or empty for the current map. */
  years: number[];
  pres: Partial<Record<"2016" | "2020" | "2024", AtlasPresVote>>;
  pop2020?: number;
};

export type AtlasResult = StateLegDistrictResult & {
  year: number;
  /** "current" or the superseded boundary vintage the election was held on. */
  era: string;
};

export type AtlasDistrict = {
  key: string;
  label: string;
  geoid?: string;
  seats?: number;
  incumbents: Incumbent[];
  lastElection: number | null;
  nextElection: number | null;
  demographics?: Demographics;
  /** Presidential results on today's lines (2024 precinct-exact, 2016/2020 from the era overlay). */
  presCurrent: Partial<Record<"2016" | "2020" | "2024", AtlasPresVote>>;
  /** The same district KEY on each map era it existed on, oldest first, current last. */
  presByEra: AtlasPresByEra[];
  /** This district key's legislative results, newest first, each tagged with the lines it ran on. */
  results: AtlasResult[];
  /** Redistricting history, oldest transition first. */
  redistricting: StateLegRedistrictingEntry[];
  /** 2026 general-election field, where the chamber is on the ballot (Ballotpedia). */
  candidates2026?: StateLegDistrictCandidates2026;
  /** The 2026 projection (lib/stateLegForecast.ts), where the chamber is on the ballot. */
  projection?: AtlasProjection;
  /** Members not seeking re-election in 2026 and why (Wikipedia's retirement lists). */
  outgoing2026?: StateLegOutgoing2026[];
  /** Fundraising per cycle, newest first, where a source covers the state (lib/stateLegMoney.ts). */
  money?: AtlasMoney[];
  /** An overlay district (a New Hampshire floterial): no polygon of its own, sits on `components`. */
  overlay?: boolean;
  components?: string[];
};

/** One row of a district's 2026 lean ledger (lib/stateLegForecast.ts ProjectionRow, as shipped). */
export type AtlasProjectionRow = { year: number; kind: "P" | "L"; label: string; era: string; raw: number; relocated: boolean; coverage: number; presDelta: number; incSign: number; incPts: number; envPts: number; moneyPts?: number; NM: number; huber: number; weight: number };

export type AtlasProjection = {
  lean: number | null;
  beta: number;
  envPts: number;
  incSign: number;
  incPts: number;
  /** The 2026 money term (lib/stateLegMoneyModel.ts): gap%, the expected gap%, the to-date scale and points; null where either side's money is not on file. */
  money?: { gapPct: number; structuralGapPct: number; scale: number; pts: number } | null;
  margin: number | null;
  sigma: number;
  pD: number | null;
  rating: string | null;
  contest: "contested" | "uncontested-D" | "uncontested-R" | "independent" | "split" | "none" | "other" | "not-up";
  seats: number;
  /** Seats a party cannot lose because the other fields too few nominees (a multi-member district or a post with one party). */
  guaranteed?: { dem: number; rep: number };
  /** Seats actually drawn on the margin: `seats` less the guaranteed ones. */
  contestedSeats?: number;
  rows: AtlasProjectionRow[];
  /** P(an independent wins): the modeled independent, or 1 where no major party is on the ballot. */
  pI?: number | null;
  /** The independent-vs-party contest (lib/stateLegForecast.ts IndependentContest, as shipped). */
  indep?: AtlasIndependent | null;
  /** Projected votes cast in the race as the ballot stands (lib/stateLegPopularVote.ts raw split); absent where the state prints no count. */
  votes?: { total: number; dem: number; rep: number; oth: number };
};

export type AtlasIndependent = {
  name: string;
  partyLabel: string;
  slot: "D" | "R";
  opponent: string | null;
  basis: "incumbent" | "record" | "endorsed";
  endorsedBy: "D" | "R" | null;
  note: string | null;
  record: { year: number; opponentParty: "D" | "R"; share: number; advantage: number; expected: number; residual: number }[];
  personal: number;
  advantage: number;
  seats: number;
  sameElectorate: boolean;
};

/** Seats by projected winner: D, R, independents (I where modeled or the only field, O a sitting
 *  member of a minor party), and seats on the ballot with no projection. */
export type SeatWinners = { D: number; R: number; I: number; O: number; none: number };

/** The minimum a district needs for {@link projectedSeatWinners}: its projection (the server's
 *  DistrictProjection or the atlas slice's AtlasProjection) plus its seat count and sitting members. */
export type SeatWinnerDistrict = {
  seats?: number;
  incumbents: { party: string }[];
  projection?: {
    contest: AtlasProjection["contest"];
    seats: number;
    margin: number | null;
    pI?: number | null;
    guaranteed?: { dem: number; rep: number };
    indep?: { slot: "D" | "R"; seats: number } | null;
  } | null;
};

/**
 * The chamber after the election as the sum of each seat's projected winner — the count the
 * chamber map and the projection headline both show. A contested seat goes to the side of its
 * margin (0 counts as D), an uncontested one to the only major party on the ballot, seats the
 * field decides to their party, a modeled independent's seat to whoever is favored, and seats
 * not on the ballot (the whole district, or a staggered share of one) to their sitting members.
 */
export function projectedSeatWinners(districts: SeatWinnerDistrict[]): SeatWinners {
  const out: SeatWinners = { D: 0, R: 0, I: 0, O: 0, none: 0 };
  const add = (k: string, n: number) => { const key = (k in out ? k : "O") as keyof SeatWinners; out[key] += n; };
  for (const d of districts) {
    const pr = d.projection;
    const total = d.seats ?? Math.max(d.incumbents.length, 1);
    const up = !pr || pr.contest === "not-up" ? 0 : Math.min(pr.seats, total);
    if (pr && up > 0) {
      const winner = pr.contest === "uncontested-D" ? "D" : pr.contest === "uncontested-R" ? "R" : pr.contest === "contested" && pr.margin != null ? (pr.margin <= 0 ? "D" : "R")
        : pr.contest === "other" && pr.pI === 1 ? "I" : null;
      const g = pr.guaranteed ?? { dem: 0, rep: 0 };
      if (pr.contest === "split" || (pr.contest === "contested" && (g.dem || g.rep))) {
        // Seats the field decides go to their party; the rest follow the margin.
        out.D += Math.min(up, g.dem); out.R += Math.min(up - Math.min(up, g.dem), g.rep);
        const rest = Math.max(0, up - g.dem - g.rep);
        if (rest) { if (winner) out[winner] += rest; else out.none += rest; }
      } else if (pr.contest === "independent" && pr.indep && pr.pI != null) {
        // The independent's one seat; a multi-member district's others go to the party's nominees.
        const party = pr.indep.slot === "D" ? "R" : "D";
        out[pr.pI >= 0.5 ? "I" : party] += Math.min(up, pr.indep.seats);
        out[party] += Math.max(0, up - pr.indep.seats);
      } else if (winner) out[winner] += up;
      else out.none += up;
    }
    // Seats not on the ballot (the whole district, or a staggered share of a multi-member one).
    for (const inc of d.incumbents.slice(0, total - up)) add(inc.party, 1);
  }
  return out;
}

/** "O" where the modeled independent is favored, for map fills and seat tallies. */
export function independentWinner(pr: Pick<AtlasProjection, "contest" | "pI">): "O" | null {
  return pr.contest === "independent" && pr.pI != null && pr.pI >= 0.5 ? "O" : null;
}

export type AtlasChamberProjection = {
  year: number;
  totalSeats: number | null;
  seatsUp: number;
  holdover: { dem: number; rep: number; oth: number };
  decided: { dem: number; rep: number; oth?: number };
  expectedDem: number;
  expectedRep: number;
  expectedOth?: number;
  lo80: number;
  hi80: number;
  majority: number | null;
  supermajority: number | null;
  pDemControl: number | null;
  pRepControl: number | null;
  pDemSuper: number | null;
  pRepSuper: number | null;
  unprojected: number;
  eHat: number;
  sigmaE: number;
};

export type AtlasMoneyCandidate = { name: string; party: "D" | "R" | "O"; contributions: number | null; matched: boolean };
export type AtlasMoney = {
  year: number;
  source: string;
  dataThrough: string | null;
  candidates: AtlasMoneyCandidate[];
  /** Finance records that matched no candidate on the atlas's list. */
  unmatched: AtlasMoneyCandidate[];
  demTotal: number | null;
  repTotal: number | null;
  /** (R − D) / (R + D) × 100 of the two parties' contributions. */
  gapPct: number | null;
};

export type AtlasEra = { key: string; label: string; years: number[]; source?: string; enactedDate?: string; note?: string; verified: boolean };

export type AtlasChamber = {
  abbr: string;
  chamber: Chamber;
  built: string;
  /** When the 2026 candidate lists were fetched, if the chamber is on the ballot. */
  candidates2026Fetched?: string;
  /** Chamber-level simulation, where the chamber is on the ballot. */
  projection?: AtlasChamberProjection;
  eras: AtlasEra[];
  electionYears: number[];
  districts: AtlasDistrict[];
};

export const CHAMBER_SLUGS: Chamber[] = ["house", "senate"];

export function atlasSliceUrl(abbr: string, chamber: Chamber): string {
  return `/state-leg-atlas/${chamber}/${abbr}.json`;
}

/** URL hash for one district: #hd-31, #sd-5, #hd-BE1 (New Hampshire), #hd-Addison-1 (Vermont). */
export function districtHash(chamber: Chamber, key: string): string {
  return `#${chamber === "house" ? "hd" : "sd"}-${encodeURIComponent(key)}`;
}

export function keyFromHash(hash: string, chamber: Chamber): string | null {
  const prefix = chamber === "house" ? "#hd-" : "#sd-";
  if (!hash.startsWith(prefix)) return null;
  const key = decodeURIComponent(hash.slice(prefix.length));
  return key || null;
}

/** "12" before "12A" before "13"; named districts alphabetical after the numbered ones. */
export function compareDistrictKeys(a: string, b: string): number {
  const ma = a.match(/^(\d+)([A-Za-z]*)$/);
  const mb = b.match(/^(\d+)([A-Za-z]*)$/);
  if (ma && mb) {
    const na = parseInt(ma[1], 10), nb = parseInt(mb[1], 10);
    if (na !== nb) return na - nb;
    return ma[2].localeCompare(mb[2]);
  }
  if (ma) return -1;
  if (mb) return 1;
  // New Hampshire: county code then number.
  const ha = a.match(/^([A-Z]{2})(\d+)$/), hb = b.match(/^([A-Z]{2})(\d+)$/);
  if (ha && hb) return ha[1] === hb[1] ? parseInt(ha[2], 10) - parseInt(hb[2], 10) : ha[1].localeCompare(hb[1]);
  return a.localeCompare(b, undefined, { numeric: true });
}

/** Short district name for boxes and headings: "HD 31", "SD 5", "BE1", "Addison-1". */
export function shortDistrictName(chamber: Chamber, key: string): string {
  return /^\d+[A-Za-z]?$/.test(key) ? `${chamber === "house" ? "HD" : "SD"} ${key}` : key;
}

/** "$66.5k", "$1.2M", "$890". */
export function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k` : a.toFixed(0);
  return `${v < 0 ? "−" : ""}$${s}`;
}

/** Two-party R-positive margin of a legislative result, or null where no count exists. */
export function resultMargin(r: StateLegDistrictResult): number | null {
  if (r.noCount || r.totalVotes == null || r.totalVotes === 0 || r.demVotes == null || r.repVotes == null) return null;
  return ((r.repVotes - r.demVotes) / r.totalVotes) * 100;
}

/** "Calvin R. Schrage" and "Calvin Schrage" match: first initial + surname, nicknames and suffixes dropped. */
export function personKey(name: string): string {
  const parts = name.toLowerCase().replace(/["“”(][^"“”)]*["“”)]/g, " ").replace(/[^a-z\s-]/g, " ").split(/\s+/)
    .filter((x) => x && !["jr", "sr", "ii", "iii", "iv"].includes(x));
  return parts.length ? `${parts[0][0]} ${parts[parts.length - 1]}` : name.toLowerCase();
}

export type FieldPerson = StateLegCandidate2026 & {
  /** Every ballot line the person holds (Oregon and Vermont cross-nominate; New York fuses). */
  lines: ("D" | "R" | "O")[];
};

/**
 * The field as people rather than ballot lines: a candidate nominated by both major parties is one
 * nominee, in the party they sit for (the roster) or, for a newcomer, the party holding the seat;
 * with neither known they count for no major party.
 */
export function fieldPersons(c: StateLegDistrictCandidates2026, sitting: { name: string; party: string }[] = []): FieldPerson[] {
  const byKey = new Map<string, FieldPerson>();
  for (const x of c.candidates) {
    const k = `${personKey(x.name)}|${x.post ?? ""}|${x.writeIn ? "w" : ""}`;
    const cur = byKey.get(k);
    if (!cur) { byKey.set(k, { ...x, lines: [x.party] }); continue; }
    cur.lines.push(x.party);
    cur.incumbent = cur.incumbent || x.incumbent;
    // Keep the major-party line as the person's party and the longest label for the others.
    if (cur.party === "O" && x.party !== "O") { cur.party = x.party; cur.partyLabel = x.partyLabel ?? cur.partyLabel; }
    else if (x.party === "O" && x.partyLabel && (!cur.partyLabel || x.partyLabel.length > cur.partyLabel.length)) cur.partyLabel = x.partyLabel;
  }
  const heldBy = [...new Set(sitting.map((s) => s.party))];
  for (const p of byKey.values()) {
    if (!(p.lines.includes("D") && p.lines.includes("R"))) continue;
    const mine = sitting.find((s) => personKey(s.name) === personKey(p.name))?.party;
    p.party = mine === "D" || mine === "R" ? mine : heldBy.length === 1 && (heldBy[0] === "D" || heldBy[0] === "R") ? heldBy[0] : "O";
    if (p.party === "O") p.partyLabel = "Democratic and Republican lines";
  }
  return [...byKey.values()];
}

/**
 * A 2026 nominee's projected share, as the atlas and the state page show it. Where the race is one
 * nominee per party on the ballot, each takes their party's slice of the projected votes (the chamber
 * popular vote's raw split) and the share is of all votes cast; where only a two-party margin applies
 * (a post, several nominees of one party), the two-party share alone. Null for write-ins and any
 * field the projection doesn't split.
 */
export function projectedNomineeShare(
  x: StateLegCandidate2026,
  cands: StateLegCandidate2026[],
  multiPost: boolean,
  margin: number | null,
  votes: { total: number; dem: number; rep: number; oth: number } | undefined,
): { share: number; votes: number | null } | null {
  if (x.writeIn) return null;
  const real = cands.filter((y) => !y.writeIn);
  const count = (p: string) => real.filter((y) => y.party === p).length;
  if (votes && votes.total > 0 && !multiPost && count("D") <= 1 && count("R") <= 1 && count("O") <= 1) {
    const v = x.party === "D" ? votes.dem : x.party === "R" ? votes.rep : votes.oth;
    if (v > 0) return { share: (v / votes.total) * 100, votes: v };
  }
  if (margin == null || real.length !== 2 || count("D") !== 1 || count("R") !== 1) return null;
  return x.party === "D" ? { share: 50 - margin / 2, votes: null } : x.party === "R" ? { share: 50 + margin / 2, votes: null } : null;
}

/** How a 2026 field reads for the selector and the header: who is in it and whether both majors are. */
export function contest2026(c: StateLegDistrictCandidates2026 | undefined, sitting: { name: string; party: string }[] = []): { label: string; status: "contested" | "uncontested-D" | "uncontested-R" | "none" | "other"; open: boolean } | null {
  if (!c) return null;
  const real = fieldPersons(c, sitting).filter((x) => !x.writeIn);
  const parties = new Set(real.map((x) => x.party));
  const open = !c.candidates.some((x) => x.incumbent);
  if (real.some((x) => x.canceledGeneral)) {
    const parties = new Set(real.map((x) => x.party));
    const p = parties.size === 1 ? [...parties][0] : null;
    const who = real.length === 1 ? real[0].name : `${real.length} ${p ?? ""} filers`.trim();
    if (p === "D") return { label: `${who} (D), general canceled`, status: "uncontested-D", open };
    if (p === "R") return { label: `${who} (R), general canceled`, status: "uncontested-R", open };
    return { label: "General election canceled", status: "none", open };
  }
  const names = (p: "D" | "R" | "O") => real.filter((x) => x.party === p).map((x) => x.name.split(" ").slice(-1)[0] + (x.incumbent ? " (inc.)" : "") + (x.lines.includes("D") && x.lines.includes("R") ? " (both lines)" : ""));
  if (parties.has("D") && parties.has("R")) return { label: `${names("D").join(", ")} (D) vs ${names("R").join(", ")} (R)`, status: "contested", open };
  if (parties.has("D")) return { label: `${names("D").join(", ")} (D), no Republican`, status: "uncontested-D", open };
  if (parties.has("R")) return { label: `${names("R").join(", ")} (R), no Democrat`, status: "uncontested-R", open };
  if (real.length) return { label: real.map((x) => `${x.name} (${x.partyLabel ?? "Other"})`).join(", "), status: "other", open };
  // Nobody on the printed ballot and only non-major write-ins (Tennessee's 93rd): an independent wins.
  const writeIns = c.candidates.filter((x) => x.writeIn);
  if (writeIns.length && writeIns.every((x) => x.party === "O")) return { label: `${writeIns.length} independent write-in${writeIns.length > 1 ? "s" : ""}, no major-party nominee`, status: "other", open };
  return { label: "No candidates listed", status: "none", open };
}
