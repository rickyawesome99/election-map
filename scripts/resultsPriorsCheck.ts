// Sanity check of the Results page's priors and needle: builds the three priors slices as the
// static route would, reports races with no civicAPI id or no county projection, then runs the
// needle on the live civicAPI payload of a few races (test data until Nov 3).
//   npx tsx --conditions=react-server scripts/resultsPriorsCheck.ts [--live]
import { resultsPriors } from "../lib/resultsPriors";
import { projectRace } from "../lib/resultsNeedle";
import { normalizeRace } from "../lib/resultsFeed";
import { RESULTS_OFFICES } from "../lib/resultsTypes";

const live = process.argv.includes("--live");

async function main() {
  for (const office of RESULTS_OFFICES) {
    const s = resultsPriors(office);
    const noId = s.races.filter((r) => !r.civicId), noCounties = s.races.filter((r) => !r.counties.length);
    const bytes = JSON.stringify(s).length;
    console.log(`${office}: ${s.races.length} races, ${Math.round(bytes / 1024)} KB, no civic id: ${noId.length} ${noId.map((r) => r.id).join(" ")}, no counties: ${noCounties.length} ${noCounties.map((r) => r.id).join(" ")}`);
    const r = s.races.find((x) => x.id === (office === "house" ? "4823" : office === "senate" ? "TX-2" : "TX"))!;
    console.log("  sample", r.id, r.civicId, r.label, r.href, r.dem.name, r.rep.name, "fc", r.forecast.margin.toFixed(1), "σ", r.forecast.sigma.toFixed(1), "votes", r.votes, "counties", r.counties.length, "close", r.pollsClose);
    if (!live) continue;
    const want = (process.env.RACES ?? "TX-2,ME-2,TX,OH,4823,2301").split(",");
    for (const race of s.races.filter((x) => want.includes(x.id))) {
      const res = await fetch(`https://civicapi.org/api/v2/race/${race.civicId}`, { headers: { "User-Agent": "curl/8.4.0" } });
      const l = normalizeRace(race, await res.json());
      const p = projectRace(race, l);
      const inCounties = l.counties?.filter((c) => c.total > 0).length ?? 0;
      if (process.env.FIPS) console.log("  prior fips", race.counties.slice(0, 4).map((c) => `${c.fips} ${c.name}`).join(" | "), "| feed", (l.counties ?? []).slice(0, 4).map((c) => `${c.fips} ${c.name}`).join(" | "));
      console.log(`  LIVE ${race.id} test=${l.testData} pr=${l.percentReporting} called=${l.called} ${l.winner ?? ""} counted=${l.total} cur=${p.currentMargin?.toFixed(1)} → tier=${p.tier} proj=${p.margin.toFixed(1)}±${p.sigma.toFixed(1)} pD=${p.probD.toFixed(2)} total=${p.projectedTotal} share=${(p.countedShare * 100).toFixed(0)}% swing=${p.swing.toFixed(1)} τ=${p.turnoutFactor.toFixed(2)} counties=${l.counties?.length}/${inCounties} matched=${p.counties.filter((c) => c.counted > 0).length}`);
    }
  }
}
main();
