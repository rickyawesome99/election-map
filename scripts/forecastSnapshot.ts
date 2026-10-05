// Live-forecast snapshot as JSON on stdout — what scripts/refresh-polls.mjs diffs before vs after a
// poll refresh to print what moved.
// Run:  npx tsx --conditions=react-server scripts/forecastSnapshot.ts > snapshot.json

import { senateForecasts, governorForecasts, houseForecasts, getChamberSimulations } from "@/lib/forecast";

const races: Record<string, { name: string; margin: number; rating: string; pollMargin: number | null; pollCount: number }> = {};
for (const [type, list] of [["senate", senateForecasts], ["governor", governorForecasts], ["house", houseForecasts]] as const) {
  for (const r of list) {
    races[`${type}:${r.id}`] = { name: `${type === "house" ? "" : `${r.state} `}${type === "house" ? r.name : type === "senate" ? "Senate" : "Governor"}`, margin: r.margin, rating: r.rating, pollMargin: r.pollMargin, pollCount: r.pollCount };
  }
}
const sims = getChamberSimulations();
const chambers = Object.fromEntries(Object.entries(sims).map(([k, s]) => [k, { meanDem: s.meanDem, pDemControl: s.pDemControl }]));
process.stdout.write(JSON.stringify({ chambers, races }));
