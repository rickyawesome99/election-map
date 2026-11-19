// House incumbency, estimated at district level (methodologyChangelog 2026-11-19, "kept at 3").
//
//   npx tsx --conditions=react-server scripts/houseIncumbencyEstimate.ts

import { calculateDistrictModel, presInterpWeights } from "@/lib/tplCompute";
import { districtPresidentialData } from "@/data/districtPresidentialData";
// House incumbency, estimated at district level: (margin + money strip, relocated to today's lines,
// environment removed) − the district's presidential margin interpolated to that year, regressed on
// the incumbent's sign with a separate intercept per year (and optionally a slope on lean per year).
interface R { year: number; y: number; s: number; x: number; w: number }
const rows: R[] = [];
for (const id of Object.keys(districtPresidentialData)) {
  const c = calculateDistrictModel(id);
  const pres = new Map(c.races.filter((r) => r.raceType === "P").map((r) => [r.year, r.NM!]));
  for (const r of c.races) {
    if (r.raceType !== "H" || r.rawMargin == null) continue;
    let p = 0, ws = 0; for (const [py, w] of presInterpWeights(r.year)) { const v = pres.get(py); if (v != null) { p += w * v; ws += w; } }
    if (!ws) continue; p /= ws;
    const y = r.rawMargin + (r.FF_pts ?? 0) + (r.BS_pts ?? 0) + (r.envPts ?? 0) - p;
    rows.push({ year: r.year, y, s: r.incumbent === "R" ? 1 : r.incumbent === "D" ? -1 : 0, x: p, w: r.boundaryWeight ?? 1 });
  }
}
function fit(rs: R[], withSlope: boolean, noMoney = false) {
  // demean y, s (and x) within year, weighted; then WLS
  const years = [...new Set(rs.map((r) => r.year))];
  const dm: { y: number; s: number; x: number; w: number }[] = [];
  for (const yr of years) {
    const g = rs.filter((r) => r.year === yr); const W = g.reduce((a, r) => a + r.w, 0);
    const my = g.reduce((a, r) => a + r.w * r.y, 0) / W, ms = g.reduce((a, r) => a + r.w * r.s, 0) / W, mx = g.reduce((a, r) => a + r.w * r.x, 0) / W;
    for (const r of g) dm.push({ y: r.y - my, s: r.s - ms, x: r.x - mx, w: r.w });
  }
  let sss = 0, ssx = 0, sxx = 0, ssy = 0, sxy = 0;
  for (const r of dm) { sss += r.w * r.s * r.s; ssx += r.w * r.s * r.x; sxx += r.w * r.x * r.x; ssy += r.w * r.s * r.y; sxy += r.w * r.x * r.y; }
  let b: number, bx = 0;
  if (withSlope) { const det = sss * sxx - ssx * ssx; b = (ssy * sxx - sxy * ssx) / det; bx = (sss * sxy - ssx * ssy) / det; } else b = ssy / sss;
  const res = dm.map((r) => r.y - b * r.s - bx * r.x); const n = dm.length;
  const s2 = res.reduce((a, e, i) => a + dm[i].w * e * e, 0) / (n - years.length - (withSlope ? 2 : 1));
  const se = Math.sqrt(s2 * (withSlope ? sxx / (sss * sxx - ssx * ssx) : 1 / sss));
  return { b, se, bx, n };
}
const p = (label: string, rs: R[]) => { const a = fit(rs, false), c = fit(rs, true); console.log(`${label.padEnd(22)} n=${String(a.n).padStart(4)}  incumbency ${a.b.toFixed(2)} ± ${a.se.toFixed(2)}   with slope on lean: ${c.b.toFixed(2)} ± ${c.se.toFixed(2)} (slope ${c.bx.toFixed(3)})`); };
p("all years 2016–2026", rows);
p("2016–2024", rows.filter((r) => r.year <= 2024));
for (const y of [2016, 2018, 2020, 2022, 2024, 2026]) p(String(y), rows.filter((r) => r.year === y));
p("unmoved rows only", rows.filter((r) => r.w > 0.99));
p("competitive |pres|<15", rows.filter((r) => Math.abs(r.x) < 15));
