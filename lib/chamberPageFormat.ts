import type { ChamberSeat } from "@/lib/chamberPageTypes";

/** A seat's counted margin, named for the party ahead ("D+2.3"); "Unopposed" with no opponent on the ballot. */
export function fmtSeatMargin(seat: ChamberSeat): string {
  const r = seat.result;
  if (!r) return "—";
  if (r.unopposed) return "Unopposed";
  if (r.margin == null || !r.party) return "—";
  return `${r.party}+${Math.abs(r.margin).toFixed(1)}`;
}
