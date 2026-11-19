// What the live TPL moved from the model as locked before the 2026 election
// (data/forecast-final-2026/tpl-fit-locked.json): E by year, the neutral point, incumbency, every
// state's and district's lean against its locked value.
//
//   npx tsx --conditions=react-server scripts/tplCompareLocked2026.ts out.json
//   TPL_NO_2026=1 TPL_NEUTRAL_ANCHOR=window …   the formulas alone, with neither 2026 nor the neutral point
//
// Rerun after a results refresh (npm run tpl-inputs-2026) or once 2026 is certified.

import fs from "node:fs";
import { getTplFit, calculateStateModel, calculateDistrictModel, getMedianStateTpl, incumbentAdvantage } from "@/lib/tplCompute";
import { statesData } from "@/data/statesData";
import { districtPresidentialData } from "@/data/districtPresidentialData";
import { presPastResults } from "@/data/forecastData";
const locked = JSON.parse(fs.readFileSync("data/forecast-final-2026/tpl-fit-locked.json", "utf8"));
const fit = getTplFit();
const f = (x: number) => (x >= 0 ? "R+" : "D+") + Math.abs(x).toFixed(1);
console.log("E:", fit.years.map((y) => `${y} ${f(fit.E[y])}`).join("  "));
console.log("neutral:", JSON.stringify(fit.neutral));
console.log("incumbency:", JSON.stringify(incumbentAdvantage()), JSON.stringify(fit.incumbencyN), "rows", fit.rowsUsed);
const rows = statesData.map((s) => { const m = calculateStateModel(s.abbr, s.name); const p = (presPastResults[s.abbr] ?? []).find((r) => r.year === 2024); return { abbr: s.abbr, tpl: m.tpl, was: locked.stateTpl[s.abbr], votes: p?.totalVotes ?? 0, y26: m.yearAggregations.find((a) => a.year === 2026) }; });
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2; };
const d = rows.map((r) => r.tpl - r.was);
const tv = rows.reduce((a, r) => a + r.votes, 0);
console.log(`median state TPL ${f(getMedianStateTpl())} (locked ${f(locked.medianStateTpl)}) · vote-weighted ${f(rows.reduce((a, r) => a + r.tpl * r.votes, 0) / tv)} (locked ${f(rows.reduce((a, r) => a + r.was * r.votes, 0) / tv)}) · median move ${med(d).toFixed(2)}`);
console.log([...rows].sort((a, b) => a.tpl - b.tpl).map((r) => `${r.abbr} ${f(r.tpl)} (${(r.tpl - r.was >= 0 ? "+" : "") + (r.tpl - r.was).toFixed(1)})`).join("  "));
console.log("2026 year agg sample:", ["TX", "OH", "VT", "GA"].map((a) => { const r = rows.find((x) => x.abbr === a)!; return `${a} ${JSON.stringify(r.y26 && { present: r.y26.racesPresent, w: Object.fromEntries(Object.entries(r.y26.redistributedWeights).map(([k, v]) => [k, +(v as number).toFixed(2)])), nm: Object.fromEntries(Object.entries(r.y26.typeNMs).filter(([, v]) => v != null).map(([k, v]) => [k, +(v as number).toFixed(1)])), fw: +r.y26.finalWeight.toFixed(3) })}`; }).join("\n  "));
const dd = Object.keys(districtPresidentialData).map((id) => { const c = calculateDistrictModel(id); const code = districtPresidentialData[id].code; return { code, tpl: c.tpl, was: locked.districtTpl[code], n26: c.races.filter((r) => r.year === 2026).length }; });
const dm = dd.map((x) => x.tpl - x.was);
console.log(`districts: ${dd.length}, with a 2026 House row ${dd.filter((x) => x.n26 > 0).length}, median move ${med(dm).toFixed(2)}, mean |move − median| ${(dm.reduce((a, x) => a + Math.abs(x - med(dm)), 0) / dm.length).toFixed(2)}`);
console.log("largest district moves vs median:", [...dd].sort((a, b) => Math.abs(b.tpl - b.was - med(dm)) - Math.abs(a.tpl - a.was - med(dm))).slice(0, 14).map((x) => `${x.code} ${f(x.was)}→${f(x.tpl)}`).join("  "));
fs.writeFileSync(process.argv[2], JSON.stringify({ fit: { E: fit.E, neutral: fit.neutral, incumbency: fit.incumbency, incumbencyN: fit.incumbencyN, rowsUsed: fit.rowsUsed }, states: rows.map((r) => ({ abbr: r.abbr, tpl: r.tpl, was: r.was, votes: r.votes })), districts: dd }, null, 1));
