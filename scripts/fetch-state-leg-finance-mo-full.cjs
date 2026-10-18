/**
 * Missouri report summaries — DOWNLOAD step for scripts/fetch-state-leg-finance-mo-full.py (full totals;
 * the itemized search in scripts/fetch-state-leg-finance-mo.py sees only gifts over $100).
 *
 *   NODE_PATH=node_modules node scripts/fetch-state-leg-finance-mo-full.cjs [YEAR ...]     default 2015–2026
 *
 * www.mec.mo.gov/MEC/Campaign_Finance/CF_ContrCSV.aspx, report type "summary" ("Report Summary Data"),
 * one year at a time, all reports → a CSV with one row per report and its totals. The page needs a real
 * browser (event validation) with a desktop Chrome user agent, and Incapsula answers 403 after about three
 * exports in five minutes, so exports are spaced five minutes apart. Cached in scratch portal-cache/mo-full/.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/mo-full";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const P = "#ContentPlaceHolder_ContentPlaceHolder1_";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const thisYear = new Date().getFullYear();
  const years = process.argv.slice(2).map(Number);
  const todo = (years.length ? years : Array.from({ length: thisYear - 2014 }, (_, i) => 2015 + i))
    .filter((y) => !fs.existsSync(path.join(CACHE, `summary${y}.csv`)) || y >= thisYear);
  fs.mkdirSync(CACHE, { recursive: true });
  const b = await chromium.launch({ channel: "chromium", headless: true });
  for (const [i, year] of todo.entries()) {
    if (i > 0) await sleep(300000);
    for (let attempt = 0; attempt < 4; attempt++) {
      const ctx = await b.newContext({ acceptDownloads: true, userAgent: UA });
      const p = await ctx.newPage();
      try {
        await p.goto("https://www.mec.mo.gov/MEC/Campaign_Finance/CF_ContrCSV.aspx", { waitUntil: "domcontentloaded", timeout: 120000 });
        await Promise.all([p.waitForLoadState("domcontentloaded"), p.selectOption(P + "ddReportType", "summary")]);
        await p.waitForTimeout(3000);
        await p.selectOption(P + "ddReportYear", String(year));
        await p.waitForTimeout(4000);
        const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 600000 }), p.click(P + "btnExport")]);
        await dl.saveAs(path.join(CACHE, `summary${year}.csv`));
        console.log(`MO summary ${year}: saved`);
        await ctx.close();
        break;
      } catch (e) {
        console.log(`  retry ${year}: ${e.message.split("\n")[0]} — waiting 15 min (Incapsula)`);
        await ctx.close();
        await sleep(900000);
      }
    }
  }
  await b.close();
})();
