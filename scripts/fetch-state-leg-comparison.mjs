#!/usr/bin/env node
/**
 * The two published state legislative forecasts the /analysis/state-leg-models page compares
 * ours with, read into data-entry/state-leg-comparison/:
 *
 *   statenavigate.json  State Navigate's 2026 forecast. Its API refuses direct requests, so the
 *                       public national page (projects.statenavigate.com/25-26/national/) is
 *                       loaded in a headless browser and the per-chamber files it fetches are
 *                       kept — the same data any visitor's browser receives, no spoofed headers.
 *                       One row per SEAT (NH "Belknap 2 s1", ID "1A", WA "1s1", MD "26s1");
 *                       caucus_margin is R-positive, win_pct is the Republican's probability.
 *   electindex.json     ElectIndex's 2026 forecast: the CSVs its site reads from the public
 *                       GitHub repo ElectIndex/26_us_forecast_data (output/leg_races.csv,
 *                       output/leg_chambers.csv). One row per seat in the A/B states, one per
 *                       district elsewhere; margin is D-positive, dem_prob the Democrat's odds.
 *
 * Usage: node scripts/fetch-state-leg-comparison.mjs [--skip-sn] [--skip-ei]
 * Then:  npx tsx --conditions=react-server scripts/buildStateLegComparison.ts
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT = path.join(process.cwd(), "data-entry", "state-leg-comparison");
fs.mkdirSync(OUT, { recursive: true });
const today = new Date().toISOString().slice(0, 10);

function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  const parse = (l) => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const head = parse(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(parse(l).map((v, i) => [head[i], v])));
}
const num = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

async function stateNavigate() {
  const captured = new Map();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  page.on("response", async (r) => {
    const u = r.url();
    if (!u.startsWith("https://api.statenavigate.com/api/")) return;
    try { captured.set(u.replace("https://api.statenavigate.com/api/", ""), await r.text()); } catch { /* a response body that was already consumed */ }
  });
  await page.goto("https://projects.statenavigate.com/25-26/national/", { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(8000);
  const text = await page.evaluate(() => document.body.innerText);
  await browser.close();
  const hero = text.match(/([\d,]+)\s*\n?\s*state legislative seats forecasted\s*\n?\s*([\d,]+)\s*\n?\s*D pickups\s*\n?\s*([\d,]+)\s*\n?\s*R pickups/);
  const chambers = [];
  for (const [key, body] of captured) {
    const m = key.match(/^([a-z]{2})\/forecasts\/2526\/outputs\/(lower|upper)\/merged\.csv$/);
    if (!m) continue;
    const abbr = m[1].toUpperCase(), chamber = m[2] === "lower" ? "house" : "senate";
    const outcomes = captured.get(`${m[1]}/forecasts/2526/outputs/${m[2]}/outcomes.csv`);
    let pDemControl = null, runDate = null;
    if (outcomes) {
      const o = parseCsv(outcomes);
      const maj = o.find((r) => /DEM Majority/i.test(r.outcome)), sup = o.find((r) => /DEM Super/i.test(r.outcome));
      if (maj) pDemControl = (num(maj.count) ?? 0) + (sup ? num(sup.count) ?? 0 : 0);
      runDate = o.map((r) => r.date).filter(Boolean).sort().at(-1) ?? null;   // the latest run among the outcome rows
    }
    const rows = parseCsv(body).map((t) => {
      const lead = t.leading_caucus || t.leading_party || null;
      const cm = num(t.caucus_margin);
      return {
        district: (t.district || t.name).trim(), name: t.name.trim(),
        margin: cm != null ? +(cm * 100).toFixed(2) : (lead === "D" ? -1 : 1) * Math.abs(num(t.proj_margin) ?? 0) * 100,
        pR: num(t.win_pct), rating: t.rating, current: t.current_caucus || t.inc_party || null, leading: lead,
        incumbent: t.incumbent_name || null,
        noElection: /no election/i.test(`${t.rating} ${t.rating_simple}`), uncontested: /uncontested/i.test(t.rating),
      };
    });
    chambers.push({ abbr, chamber, pDemControl, runDate, rows });
  }
  chambers.sort((a, b) => a.abbr.localeCompare(b.abbr) || a.chamber.localeCompare(b.chamber));
  const out = {
    source: "State Navigate", url: "https://projects.statenavigate.com/25-26/national/", fetched: today,
    hero: hero ? { seats: Number(hero[1].replace(/,/g, "")), demPickups: Number(hero[2].replace(/,/g, "")), repPickups: Number(hero[3].replace(/,/g, "")) } : null,
    chambers,
  };
  fs.writeFileSync(path.join(OUT, "statenavigate.json"), JSON.stringify(out));
  console.log(`State Navigate: ${chambers.length} chambers, ${chambers.reduce((s, c) => s + c.rows.length, 0)} seat rows`, out.hero);
}

async function electIndex() {
  const base = "https://raw.githubusercontent.com/ElectIndex/26_us_forecast_data/main/output/";
  const get = async (f) => { const r = await fetch(base + f); if (!r.ok) throw new Error(`${r.status} ${f}`); return r.text(); };
  const races = parseCsv(await get("leg_races.csv"));
  const chambers = parseCsv(await get("leg_chambers.csv"));
  const chamberOf = (c) => (/senate|legislature/i.test(c) ? "senate" : "house");
  const rows = races.map((r) => ({
    raceCode: r.race_code, abbr: r.state, chamber: chamberOf(r.chamber), district: r.district, seat: r.seat || null, numSeats: num(r.num_seats) ?? 1,
    margin: num(r.margin) == null ? null : +(-Number(r.margin)).toFixed(2),   // R-positive, like ours
    pD: num(r.dem_prob), rating: r.rating, uncontested: r.uncontested || null, incumbentParty: r.incumbent_party || null,
    incumbent: r.incumbent || null, openSeat: r.open_seat === "True", dem: r.dem_name || null, rep: r.rep_name || null,
    lean: num(r.lean), env: num(r.env), stateSwing: num(r.state_swing),
  }));
  const out = {
    source: "ElectIndex", url: "https://electindex.com/forecasts/#legislatures", dataUrl: "https://github.com/ElectIndex/26_us_forecast_data", fetched: today,
    runDate: races[0]?.date ?? null,
    chambers: chambers.map((c) => ({
      abbr: c.state, chamber: chamberOf(c.chamber), total: num(c.total), seatsUp: num(c.seats_up), curDem: num(c.cur_dem), curRep: num(c.cur_gop), curOther: num(c.cur_other),
      curControl: c.cur_control, projDemMean: num(c.proj_dem_mean), pDemControl: num(c.dem_control_prob), projControl: c.proj_control, flip: c.flip === "True",
    })),
    rows,
  };
  fs.writeFileSync(path.join(OUT, "electindex.json"), JSON.stringify(out));
  console.log(`ElectIndex: ${out.chambers.length} chambers, ${rows.length} seat rows, run ${out.runDate}`);
}

if (!process.argv.includes("--skip-sn")) await stateNavigate();
if (!process.argv.includes("--skip-ei")) await electIndex();
