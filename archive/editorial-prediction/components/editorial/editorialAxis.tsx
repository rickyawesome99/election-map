import { marginColor } from "@/lib/colorScale";

// Shared by the editorial page (server) and its interactive readouts (client): the margin axis and
// the three marks. No "use client" here, so the server page can call pctOf directly.

export type MarkKind = "model" | "rcp" | "pick";

// One margin axis, D+16 on the left to R+16 on the right, EVEN in the middle.
export const AXIS = 16;
export const pctOf = (v: number) => 50 + (Math.max(-AXIS, Math.min(AXIS, v)) / AXIS) * 50;
export const AXIS_TICKS = [-15, -10, -5, 0, 5, 10, 15];
export const tickLabel = (t: number) => (t === 0 ? "EVEN" : `${t < 0 ? "D" : "R"}+${Math.abs(t)}`);

// Model (dot), RCP (diamond), the board's call (square). Shape carries identity, so no mark
// depends on color alone; the board's call is the only mark filled in its party's color.
export function Mark({ kind, v, size = 12 }: { kind: MarkKind; v: number; size?: number }) {
  if (kind === "model") return <span aria-hidden className="inline-block rounded-full" style={{ width: size, height: size, background: "var(--app-text-muted)", border: "2px solid var(--app-bg)", boxShadow: "0 0 0 1px var(--app-text-muted)" }} />;
  if (kind === "rcp") return <span aria-hidden className="inline-block rotate-45" style={{ width: size * 0.82, height: size * 0.82, background: "var(--app-bg)", border: "2px solid var(--app-text-primary)" }} />;
  return <span aria-hidden className="inline-block" style={{ width: size + 2, height: size + 2, background: marginColor(v), border: "2px solid var(--app-text-primary)" }} />;
}
