// The date the forecast is computed as of. Normally now; forecastAsOf (lib/forecast.ts) sets it to a
// past day to rerun today's model on the data that existed then — the forecast-over-time series.
// Every date-dependent input (the generic-ballot average, poll averages and their aging, pollster
// house effects, the national environment's horizon) reads its default date from here.

// FINAL FORECAST (user decision 2026-11-03). The forecast is locked at this instant: "now" stops here,
// so poll aging, the generic-ballot average and the history series no longer move with the wall
// clock, and every page marks its forecast Final (components/FinalForecastPill.tsx). The locked
// numbers are data/forecast-history/2026-11-03.json; `npm run check-lock` fails if the live model
// drifts from that file (a data or code change after the lock). Set to null only to unlock.
export const FORECAST_FINAL_AT: Date | null = new Date("2026-11-03T13:30:00Z");
export const FORECAST_FINAL_LABEL = "Locked Tuesday, November 3, 2026 at 8:30 AM ET";
export const forecastIsFinal = FORECAST_FINAL_AT != null;

let override: Date | null = null;

export function forecastNow(): Date {
  return override ?? FORECAST_FINAL_AT ?? new Date();
}

/** Runs `fn` with the forecast clock set to `asOf`. Synchronous, so nothing else runs in between. */
export function atForecastDate<T>(asOf: Date, fn: () => T): T {
  const previous = override;
  override = asOf;
  try {
    return fn();
  } finally {
    override = previous;
  }
}
