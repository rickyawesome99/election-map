// The date the forecast is computed as of. Normally now; forecastAsOf (lib/forecast.ts) sets it to a
// past day to rerun today's model on the data that existed then — the forecast-over-time series.
// Every date-dependent input (the generic-ballot average, poll averages and their aging, pollster
// house effects, the national environment's horizon) reads its default date from here.

let override: Date | null = null;

export function forecastNow(): Date {
  return override ?? new Date();
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
