/**
 * Y-axis for a margin chart, fitted to the data, with the step the first round number giving about
 * five gridlines. By default the range always includes Even, which suits a county or district that
 * may sit on either side of it; `includeZero: false` fits the data's own range instead (a state at
 * R+42 then gets a readable axis rather than a flat line over forty empty points), and Even still
 * appears whenever the data comes within a step of it. Shared by the lean trend charts.
 */
export function niceAxisConfig(vals: number[], { includeZero = true }: { includeZero?: boolean } = {}): { domain: [number, number]; ticks: number[] } {
  if (vals.length === 0) return { domain: [-10, 10], ticks: [-10, -5, 0, 5, 10] };
  const boundedVals = vals.map((v) => Math.max(-100, Math.min(100, v)));
  let dataMin = includeZero ? Math.min(...boundedVals, 0) : Math.min(...boundedVals);
  let dataMax = includeZero ? Math.max(...boundedVals, 0) : Math.max(...boundedVals);
  if (!includeZero) {
    // Breathing room above and below the extremes, and Even when it is close enough to matter.
    const spread = (dataMax - dataMin) || 2;
    dataMin -= spread * 0.25;
    dataMax += spread * 0.25;
    if (dataMin > 0 && dataMin < spread) dataMin = 0;
    if (dataMax < 0 && dataMax > -spread) dataMax = 0;
  }
  const range = dataMax - dataMin || 1;
  const rawStep = range / 5;
  const step = [1, 2, 5, 10, 15, 20, 25, 50].find((c) => c >= rawStep) ?? 50;
  const domainMin = Math.max(-100, Math.floor(dataMin / step) * step);
  const domainMax = Math.min(100, Math.ceil(dataMax / step) * step);
  const ticks: number[] = [];
  for (let t = domainMin; t <= domainMax + 0.001; t += step) ticks.push(+(t.toFixed(1)));
  return { domain: [domainMin, domainMax], ticks };
}
