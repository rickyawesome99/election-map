/**
 * Prints one state's general-election legislative candidates for every cycle on file (results,
 * plus the Ballotpedia 2026 field) as JSON, for the finance fetchers that search a state portal
 * by candidate name (scripts/fetch-state-leg-finance-{ri,...}.py).
 *
 *   npx tsx --conditions=react-server scripts/dump-state-leg-candidates.ts RI > out.json
 *
 * Output: [ { year, chamber, district, name, party } ]
 */
import { stateLegResults } from "@/data/stateLegResults";
import { stateLegCandidates2026 } from "@/data/stateLegCandidates2026";
import { electionYear } from "@/data/forecastData";

const abbr = (process.argv[2] ?? "").toUpperCase();
const out: { year: number; chamber: string; district: string; name: string; party: string }[] = [];
for (const [year, chambers] of Object.entries(stateLegResults[abbr] ?? {})) {
  for (const [chamber, block] of Object.entries(chambers)) {
    for (const [district, d] of Object.entries(block?.districts ?? {})) {
      for (const c of d.candidates ?? []) if (c.votes == null || c.votes > 0) out.push({ year: Number(year), chamber, district, name: c.name, party: c.party });
    }
  }
}
for (const [chamber, districts] of Object.entries(stateLegCandidates2026[abbr] ?? {})) {
  for (const [district, d] of Object.entries(districts ?? {})) {
    for (const c of d.candidates) if (!c.writeIn) out.push({ year: electionYear, chamber, district, name: c.name, party: c.party });
  }
}
process.stdout.write(JSON.stringify(out));
