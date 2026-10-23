import type { DARK_THEME } from "./ForecastMap";

// Shared by the national polling card (PollingAverageCard) and its lazily loaded trend chart
// (PollTrendChart).

export type Theme = typeof DARK_THEME;

// Plot-area geometry shared by the Recharts chart and the dot layer behind it.
export const CHART_MARGIN = { top: 4, right: 8, left: 0, bottom: 0 };
export const Y_AXIS_WIDTH = 36;
export const X_AXIS_HEIGHT = 24;

export function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export function marginColor(diff: number, colorA: string, colorB: string, theme: Theme): string {
  if (diff < 0) return colorA;
  if (diff > 0) return colorB;
  return theme.textMuted;
}
