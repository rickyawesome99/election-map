// Color scales for the turnout map and tables. Sequential = one hue, light → dark, for magnitudes
// (turnout rate, votes, share of the top race); diverging = two hues around a neutral midpoint for
// signed change. Neither uses the party blue/red, so a turnout map never reads as a partisan one.
// Each mode has its own steps rather than a flipped light ramp.

export type Ramp = string[];

export const SEQUENTIAL: Record<"light" | "dark", Ramp> = {
  light: ["#e6eff4", "#c2d9e4", "#97bfd0", "#69a0b8", "#43809c", "#2a617c", "#183f55"],
  dark: ["#1a3340", "#224d61", "#2d6a83", "#3c88a5", "#5aa6c3", "#88c3da", "#bcdeec"],
};

export const DIVERGING: Record<"light" | "dark", Ramp> = {
  light: ["#a9500f", "#cf8447", "#ecc19a", "#d7dbdf", "#97bfd0", "#4d8ba8", "#215a77"],
  dark: ["#eaa871", "#c67e3f", "#845428", "#3a4048", "#2d6a83", "#5aa6c3", "#a3d2e5"],
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Position t ∈ [0, 1] along a ramp, interpolated between its stops. */
export function rampColor(ramp: Ramp, t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(ramp[i]), b = hexToRgb(ramp[i + 1]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export type Scale = { kind: "sequential" | "diverging"; min: number; max: number; log?: boolean; ramp: Ramp };

export function scaleColor(scale: Scale, v: number): string {
  if (scale.kind === "diverging") {
    const half = Math.max(Math.abs(scale.min), Math.abs(scale.max));
    return rampColor(scale.ramp, (v / half + 1) / 2);
  }
  if (scale.log) {
    const lo = Math.log(Math.max(1, scale.min)), hi = Math.log(Math.max(2, scale.max));
    return rampColor(scale.ramp, (Math.log(Math.max(1, v)) - lo) / (hi - lo));
  }
  return rampColor(scale.ramp, (v - scale.min) / (scale.max - scale.min));
}
