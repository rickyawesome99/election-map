/**
 * Alaska state legislative fundraising from APOC's campaign disclosure income search
 * (aws.state.ak.us/ApocReports/CampaignDisclosure/CDIncome.aspx), report years 2022, 2024, 2026 —
 * DOWNLOAD step (2016–2020 came from FollowTheMoney); scripts/fetch-state-leg-finance-ak.py sums it.
 *
 *   NODE_PATH=node_modules node scripts/fetch-state-leg-finance-ak.cjs [YEAR ...]
 *
 * ASP.NET WebForms + Telerik: the CSV export works only after a real postback in a browser session,
 * so this drives full Chromium (Playwright, channel "chromium"). Per report year and office (House,
 * Senate): filter field "Office" = that office, Search, Export, then fetch the "all rows as CSV" link
 * in-page. A statewide search with no office filter times out. Cached in scratch portal-cache/ak/.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/ak";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const URL = "https://aws.state.ak.us/ApocReports/CampaignDisclosure/CDIncome.aspx";
const P = "#M_C_sCDTransactions_csfFilter_";

async function exportYear(ctx, year, office) {
  const file = path.join(CACHE, `inc-${year}-${office}.csv`);
  if (fs.existsSync(file) && year < new Date().getFullYear()) return;
  const p = await ctx.newPage();
  p.setDefaultTimeout(900000);
  try {
    await p.goto(URL, { waitUntil: "networkidle" });
    await p.selectOption(P + "ddlReportYear", String(year));
    await Promise.all([p.waitForLoadState("networkidle"), p.selectOption(P + "ddlField", "Offices")]);
    await p.waitForTimeout(3000);
    await p.selectOption(P + "ddlValue", { label: office });
    await p.click(P + "btnSearch");
    await p.waitForFunction(() => document.body && !document.body.innerText.includes("Press 'Search' to Load"), null, { timeout: 900000 });
    await p.waitForTimeout(2000);
    const m = (await p.innerText("body")).match(/[0-9,]+ items? in [0-9,]+ pages?|No Results/);
    console.log(`AK ${year} ${office}: ${m ? m[0] : "?"}`);
    // Every election year has legislative income; "No Results" is the site timing out, not data.
    if (!m || m[0] === "No Results") throw new Error("search returned no results");
    await Promise.all([p.waitForNavigation({ timeout: 900000 }).catch(() => {}), p.click(P + "btnExport")]);
    await p.waitForSelector("[id$=ExportDialog_hlAllCSV]", { timeout: 300000 });
    const href = await p.getAttribute("[id$=ExportDialog_hlAllCSV]", "href");
    const csv = await p.evaluate(async (h) => (await fetch(h, { credentials: "include" })).text(), href);
    if (!/^"?Result|Date|Transaction/i.test(csv.slice(0, 200)) && csv.length < 500) throw new Error(`unexpected export: ${csv.slice(0, 120)}`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(file, csv);
    console.log(`AK ${year} ${office}: ${csv.length} bytes`);
  } finally {
    await p.close();
  }
}

(async () => {
  const years = process.argv.slice(2).map(Number);
  const b = await chromium.launch({ headless: true, channel: "chromium" });
  const ctx = await b.newContext({ acceptDownloads: true, userAgent: UA });
  for (const year of years.length ? years : [2022, 2024, 2026]) {
    for (const office of ["House", "Senate"]) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await exportYear(ctx, year, office); break; } catch (e) { console.log(`  retry ${year} ${office}: ${e.message.split("\n")[0]}`); }
      }
    }
  }
  await b.close();
})();
