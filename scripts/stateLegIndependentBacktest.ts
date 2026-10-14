// Holdout of the state legislative forecast's independent rule (lib/stateLegForecast.ts step 7).
//
//   npx tsx --conditions=react-server scripts/stateLegIndependentBacktest.ts          (print the grid)
//   npx tsx --conditions=react-server scripts/stateLegIndependentBacktest.ts --emit   (write data/stateLegIndependentValidation.ts)
//
// Cases: every past general on today's lines where an independent faced exactly one major party
// and the forecast would have modeled them (sitting, or IND_RECORD_SHARE in their last head-to-head
// in the seat). Each is predicted from data before that year: the district lean from earlier years,
// the year's fitted environment, incumbency, and the independent's earlier record shrunk toward a
// prior. The grid over the prior and K picks IND_PRIOR_PTS and IND_SHRINK_K; IND_SIGMA is the
// robust residual spread net of SIGMA and STATE_SHOCK.
import fs from "node:fs";
import path from "node:path";
import { projectDistrict, independentRecord, independentAdvantage, personKey, STATE_LEG_FORECAST_CONSTANTS as C } from "@/lib/stateLegForecast";
import { stateLegResults } from "@/data/stateLegResults";
import { stateLegDistricts, type Chamber } from "@/data/stateLegDistricts";
import { getTplFit } from "@/lib/tplCompute";

const fit = getTplFit();
type Case = { id: string; year: number; actual: number; args: Parameters<typeof independentAdvantage>[0] };
const cases: Case[] = [];

for (const [abbr, chambers] of Object.entries(stateLegDistricts)) {
  for (const [chamber, roster] of Object.entries(chambers) as [Chamber, (typeof chambers)[Chamber]][]) {
    for (const d of roster ?? []) {
      for (const year of [2018, 2020, 2022, 2024]) {
        const r = stateLegResults[abbr]?.[String(year)]?.[chamber]?.districts[d.number];
        if (!r?.candidates || !r.totalVotes || r.noCount) continue;
        for (const o of r.candidates.filter((c) => c.party === "O" && c.votes)) {
          const who = personKey(o.name);
          const race = independentRecord(abbr, chamber, d.number, who, year + 1).find((h) => h.year === year);
          if (!race) continue;   // not a head-to-head with one major party, or a fusion/write-in line
          const before = independentRecord(abbr, chamber, d.number, who, year);
          if (!race.incI && (before.at(-1)?.share ?? 0) < C.IND_RECORD_SHARE) continue;
          const pr = projectDistrict(abbr, chamber, d, { maxYear: year - 1, targetYear: year, targetIncSign: 0 });
          if (pr.lean == null) continue;
          cases.push({
            id: `${abbr} ${chamber} ${d.number} ${year} ${o.name}`, year, actual: race.advantage,
            args: { abbr, chamber, key: d.number, who, slot: race.opponentParty === "R" ? "D" : "R", lean: pr.lean, beta: pr.beta, E: fit.E[year] ?? 0, incI: race.incI, incOpp: race.incOpp, sameElectorate: false, beforeYear: year },
          });
        }
      }
    }
  }
}

function score(prior: number, k: number) {
  const errors = cases.map((c) => {
    const { advantage } = independentAdvantage({ ...c.args, prior, k });
    return { e: c.actual - advantage, hit: Math.sign(advantage) === Math.sign(c.actual) };
  });
  const es = errors.map((x) => x.e);
  const sorted = [...es].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const mad = [...es.map((e) => Math.abs(e - med))].sort((a, b) => a - b)[Math.floor(es.length / 2)];
  return {
    prior, k, n: es.length,
    rmse: Math.sqrt(es.reduce((s, e) => s + e * e, 0) / es.length),
    bias: es.reduce((s, e) => s + e, 0) / es.length,
    robustSd: 1.4826 * mad,
    winners: errors.filter((x) => x.hit).length,
  };
}

const grid = [0, 7, 14, 21].flatMap((prior) => [0.5, 1, 2].map((k) => score(prior, k)));
const generic = cases.map((c) => c.actual - (independentAdvantage({ ...c.args, prior: 0, k: 1e9 }).advantage));
const medianGap = [...generic].sort((a, b) => a - b)[Math.floor(generic.length / 2)];
const live = score(C.IND_PRIOR_PTS, C.IND_SHRINK_K);
console.log(`${cases.length} cases (${cases.filter((c) => independentRecord(c.args.abbr, c.args.chamber, c.args.key, c.args.who, c.year).length).length} with an earlier record)`);
console.log(`median gap over a generic absent-party nominee: ${medianGap.toFixed(1)}`);
for (const g of grid) console.log(`prior ${g.prior} K ${g.k}: rmse ${g.rmse.toFixed(1)} bias ${g.bias.toFixed(1)} robust sd ${g.robustSd.toFixed(1)} winners ${g.winners}/${g.n}`);
console.log(`live (prior ${C.IND_PRIOR_PTS}, K ${C.IND_SHRINK_K}): robust sd ${live.robustSd.toFixed(1)} → extra σ ${Math.sqrt(Math.max(0, live.robustSd ** 2 - C.SIGMA ** 2 - C.STATE_SHOCK ** 2)).toFixed(1)}`);

if (process.argv.includes("--emit")) {
  const file = path.join(process.cwd(), "data", "stateLegIndependentValidation.ts");
  const round = (g: ReturnType<typeof score>) => ({ prior: g.prior, k: g.k, n: g.n, rmse: +g.rmse.toFixed(1), bias: +g.bias.toFixed(1), robustSd: +g.robustSd.toFixed(1), winners: g.winners });
  const out = {
    generatedAt: new Date().toISOString().slice(0, 10),
    cases: cases.length,
    medianGap: +medianGap.toFixed(1),
    grid: grid.map(round),
    live: round(live),
  };
  fs.writeFileSync(file, `// GENERATED by \`npx tsx --conditions=react-server scripts/stateLegIndependentBacktest.ts --emit\` — do not edit by hand.\n// Holdout of the independent rule: past head-to-heads of a modeled independent against one major party, predicted from earlier data.\nexport const STATE_LEG_INDEPENDENT_VALIDATION = ${JSON.stringify(out, null, 2)} as const;\n`);
  console.log(`wrote ${file}`);
}
