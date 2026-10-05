// Display helpers for /analysis/markets, shared by the server page and its client table.
// Client-safe: nothing here may import lib/predictionMarkets.ts, which loads the race calendar.

import type { MarketSource } from "@/data/predictionMarkets";

export type Side = "D" | "R";
type Party = "D" | "R" | "I";

export type MarketCall = {
  source: MarketSource;
  pDem: number;
  favorite: Side | null;
  favProb: number;
  correct: boolean | null;
  url: string;
};

export type MarketRaceRow = {
  raceId: string;
  year: number;
  kind: "P" | "S" | "G" | "H";
  place: string;
  href: string | null;
  winner: Side;
  /** Republican minus Democratic, points. */
  margin: number;
  runoff: boolean;
  demName: string;
  repName: string;
  demParty: Party;
  repParty: Party;
  markets: MarketCall[];
};

export const SOURCE_LABEL: Record<MarketSource, string> = { polymarket: "Polymarket", kalshi: "Kalshi", predictit: "PredictIt" };
export const KIND_LABEL: Record<MarketRaceRow["kind"], string> = { P: "President", S: "Senate", G: "Governor", H: "House" };

export const partyColor = (party: Party) => `var(--party-${party === "D" ? "dem" : party === "R" ? "rep" : "ind"})`;
export const partyOf = (row: MarketRaceRow, side: Side): Party => (side === "D" ? row.demParty : row.repParty);
export const nameOf = (row: MarketRaceRow, side: Side) => (side === "D" ? row.demName : row.repName);
/** Everything after the first name, so compound surnames survive: "Torres Small", "de León", "Casey". */
export const surname = (name: string) => {
  const parts = name.replace(/,? (Jr|Sr|II|III)\.?$/, "").split(" ").filter((p, i) => i > 0 && !/^[A-Z]\.?$/.test(p) && !/^["“(]/.test(p));
  return parts.length ? parts.join(" ") : name;
};
export const fmtPct = (p: number) => `${Math.round(p * 100)}%`;

/** The winner's margin under the winner's own party letter: "R+0.2", "I+17.4"; "<0.1" when it rounds away. */
export function fmtWinMargin(row: MarketRaceRow): string {
  const pts = Math.abs(row.margin);
  return `${partyOf(row, row.winner)}+${pts < 0.05 ? "<0.1" : pts.toFixed(1)}`;
}

/** The price on the most confident favorite that lost this race; 0 when every venue called it. */
export function worstMiss(row: MarketRaceRow): number {
  return Math.max(0, ...row.markets.filter((m) => m.correct === false).map((m) => m.favProb));
}

/** One market, flattened for the confidence charts. */
export type MarketDot = {
  id: string;
  year: number;
  kind: MarketRaceRow["kind"];
  place: string;
  source: MarketSource;
  favProb: number;
  favParty: Party;
  favName: string;
  winName: string;
  winMargin: string;
  correct: boolean;
  href: string | null;
};

export const CALIBRATION_BANDS = [
  { min: 0.5, max: 0.6, label: "50–60%" },
  { min: 0.6, max: 0.7, label: "60–70%" },
  { min: 0.7, max: 0.8, label: "70–80%" },
  { min: 0.8, max: 0.9, label: "80–90%" },
  { min: 0.9, max: 0.95, label: "90–95%" },
  { min: 0.95, max: 1.0001, label: "95%+" },
] as const;

export type CalibrationRow = { label: string; n: number; right: number; expected: number };

/** How often the favorite won, by how heavily it was favored. `expected` is the band's mean price. */
export function calibration(rows: { favProb: number; correct: boolean | null }[]): CalibrationRow[] {
  return CALIBRATION_BANDS.map((band) => {
    const inBand = rows.filter((r) => r.correct != null && r.favProb >= band.min && r.favProb < band.max);
    return {
      label: band.label,
      n: inBand.length,
      right: inBand.filter((r) => r.correct).length,
      expected: inBand.length ? inBand.reduce((sum, r) => sum + r.favProb, 0) / inBand.length : 0,
    };
  });
}

/** 90% Wilson interval for `right` of `n`, as [low, high] shares. */
export function wilson(right: number, n: number): [number, number] {
  if (!n) return [0, 1];
  const z = 1.645, p = right / n, d = 1 + (z * z) / n;
  const mid = (p + (z * z) / (2 * n)) / d, half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}
