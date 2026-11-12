// Full-page screenshots of every 2026 race page as served by the dev server, so the pages' layout
// before results replaced the projections stays on record (the numbers themselves are in
// data/forecast-final-2026/). Writes data-entry/page-archive-2026/<office>/<slug>.jpg (gitignored).
//
// Run:  node scripts/archive-race-page-shots.mjs [--only senate/ga,house/oh-09] [--width 1280]
// Needs the dev server on :3000 (BASE_URL to override). Skips files that already exist.
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const base = process.env.BASE_URL ?? "http://localhost:3000";
const width = Number(arg("--width") ?? 1280);
const out = join(process.cwd(), "data-entry", "page-archive-2026");
const races = Object.keys(JSON.parse(readFileSync(join(process.cwd(), "data", "forecast-final-2026", "races.json"), "utf8")));
const only = arg("--only");
const list = only ? only.split(",") : races;
const pages = [...(only ? [] : ["/senate", "/governor", "/house"].map((p) => ({ route: p, file: `hubs/${p.slice(1)}.jpg` }))), ...list.map((k) => ({ route: `/${k}`, file: `${k}.jpg` }))];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
const failed = [];
let done = 0;
for (const { route, file } of pages) {
  const path = join(out, file);
  if (existsSync(path)) { done++; continue; }
  mkdirSync(join(path, ".."), { recursive: true });
  try {
    await page.goto(base + route, { waitUntil: "networkidle", timeout: 180_000 });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    // Lazy sections (maps, vote history) render once scrolled into view.
    for (let y = 0, h = await page.evaluate(() => document.body.scrollHeight); y < h; y += 700, h = await page.evaluate(() => document.body.scrollHeight)) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(150);
    }
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path, fullPage: true, type: "jpeg", quality: 70 });
  } catch (e) {
    failed.push(`${route}: ${e.message.split("\n")[0]}`);
  }
  if (++done % 25 === 0) console.log(`${done}/${pages.length}`);
}
await browser.close();
writeFileSync(join(out, "README.txt"), `Full-page screenshots of the 2026 race pages at ${width}px, taken from ${base} before the Projected Result sections switched to actual results.\nThe projections behind them: data/forecast-final-2026/.\nRebuild: node scripts/archive-race-page-shots.mjs (skips files that exist).\n`);
console.log(`done ${done}/${pages.length}${failed.length ? `, ${failed.length} failed:\n  ${failed.join("\n  ")}` : ""}`);
