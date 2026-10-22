/**
 * SUPERSEDED 2026-10-21 by scripts/fetch-state-leg-finance-or-mirror.py (the same ORESTAR data through the
 * Oregon Campaign Finance mirror, seven requests, no IP block). Kept for the day the mirror goes away.
 *
 * Oregon state legislative fundraising from ORESTAR (secure.sos.state.or.us/orestar) — DOWNLOAD step;
 * scripts/fetch-state-leg-finance-or.py turns the downloads into the portal-raw file.
 *
 *   npx tsx --conditions=react-server scripts/dump-state-leg-candidates.ts OR > /tmp/or.json
 *   NODE_PATH=node_modules node scripts/fetch-state-leg-finance-or.cjs /tmp/or.json [CYCLE ...]
 *   python3 scripts/fetch-state-leg-finance-or.py [CYCLE ...]
 *
 * ORESTAR sits behind an F5 JavaScript challenge: curl and Playwright's headless shell are refused,
 * full Chromium (channel "chromium", headless) passes.
 * 1. Committees: "Committees/Filers by Election" (GotoSearchByElection.do) for every general and
 *    primary election 2014–2026, candidate committees, offices SR and SS → committee id, candidate,
 *    committee name, district, party. A committee lists only under the elections its statement of
 *    organization names, and Oregon committees run on across cycles, hence the union over all years.
 * 2. Money: for each cycle, each committee whose candidate surname is on that cycle's general-election
 *    list (the dump), the Campaign Finance Transactions search (filer id, type Contribution, Jan 1 of
 *    Y-1 → Dec 31 of Y) and its "Export To Excel Format" download. One committee-cycle stays far under
 *    the 5,000-row export cap. Julie Fahey (17469), 11/04/2020–11/08/2022: 339 rows, $460,606.67.
 * Cached in the scratch portal-cache/or/ (committees.json, tx/{id}-{cycle}.xlsx).
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/00d2d31a-c616-4726-afce-96e4c31fe349/scratchpad/portal-cache/or";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const BASE = "https://secure.sos.state.or.us/orestar/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');

async function committees(ctx) {
  const file = path.join(CACHE, "committees.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const found = {};
  const p = await ctx.newPage();
  for (let year = 2014; year <= new Date().getFullYear(); year++) {
    await p.goto(BASE + "GotoSearchByElection.do", { waitUntil: "networkidle", timeout: 120000 });
    await p.waitForSelector("select[name=yearActive]", { timeout: 60000 });
    await p.selectOption("select[name=yearActive]", String(year));
    await sleep(2500);
    const elections = (await p.$$eval("select[name=election] option", (os) => os.map((o) => [o.value, o.textContent.trim()]))).filter(([v, t]) => v && /General|Primary/i.test(t));
    for (const [eid, label] of elections) {
      for (const office of ["SR", "SS"]) {
        await p.goto(BASE + "GotoSearchByElection.do", { waitUntil: "networkidle", timeout: 120000 });
        await p.selectOption("select[name=yearActive]", String(year));
        await sleep(2500);
        await p.selectOption("select[name=election]", eid);
        await p.selectOption("select[name=filerType]", "CANDALL");
        await sleep(1200);
        await p.selectOption("select[name=committeeOffice]", office);
        await Promise.all([p.waitForNavigation({ waitUntil: "networkidle", timeout: 180000 }), p.click("input[name=search]")]);
        const html = await p.content();
        let n = 0;
        for (const row of html.split('<tr valign="middle"').slice(1)) {
          const name = /name="committeeName" value="([^"]*)"/.exec(row);
          const id = /name="committeeId" value="(\d+)"/.exec(row);
          const office2 = /State (Representative|Senator), (\d+)\w\w District<br>([^<]*)</.exec(row);
          if (!name || !id || !office2) continue;
          const [cand, comm] = decode(name[1]).split(/<BR \/>/i);
          found[id[1]] = { id: id[1], candidate: (cand || "").trim(), committee: (comm || "").trim(), chamber: office2[1] === "Representative" ? "house" : "senate", district: office2[2], party: office2[3].trim(), seen: [...new Set([...(found[id[1]]?.seen ?? []), year])] };
          n++;
        }
        console.log(`OR committees: ${year} ${label} ${office}: ${n}`);
      }
    }
  }
  await p.close();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(Object.values(found)));
  return Object.values(found);
}

const surname = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z\s,-]/g, "").split(",")[0].trim().split(/[\s-]+/).pop();

async function exportTx(ctx, id, cycle) {
  const file = path.join(CACHE, "tx", `${id}-${cycle}.xlsx`);
  const current = cycle >= new Date().getFullYear();
  if (fs.existsSync(file) && !current) return;
  const p = await ctx.newPage();
  try {
    await p.goto(BASE + "gotoPublicTransactionSearch.do", { waitUntil: "networkidle", timeout: 120000 });
    await p.waitForSelector("input[name=cneSearchFilerCommitteeId]", { timeout: 60000 });
    await p.fill("input[name=cneSearchFilerCommitteeId]", String(id));
    await p.selectOption("select[name=cneSearchTranType]", { label: "Contribution" });
    await p.fill("#cneSearchTranStartDate", `01/01/${cycle - 1}`);
    await p.fill("#cneSearchTranEndDate", `12/31/${cycle}`);
    await Promise.all([p.waitForNavigation({ waitUntil: "networkidle", timeout: 180000 }), p.click("input[name=search] >> nth=0")]);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!(await p.$('a:has-text("Export To Excel Format")'))) {
      // Only a results page that says so is "no transactions"; anything else (a lapsed session, the
      // F5 challenge again) must not be cached as $0.
      const body = await p.innerText("body");
      if (/\b0 records found|No records found/i.test(body)) { fs.writeFileSync(file, ""); return; }
      if (/request has been blocked/i.test(body)) { await sleep(600000); throw new Error("blocked (403): waited 10 min"); }
      throw new Error("no export link and no 'no records' message");
    }
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 180000 }), p.click('a:has-text("Export To Excel Format") >> nth=0')]);
    await dl.saveAs(file);
  } finally {
    await p.close();
  }
}

(async () => {
  const pool = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const cycles = process.argv.slice(3).map(Number);
  const b = await chromium.launch({ headless: true, channel: "chromium" });
  let ctx = await b.newContext({ acceptDownloads: true, userAgent: UA });
  const comms = await committees(ctx);
  let used = 0;
  console.log(`OR: ${comms.length} legislative candidate committees`);
  for (const cycle of cycles.length ? cycles : [2016, 2018, 2020, 2022, 2024, 2026]) {
    const names = new Set(pool.filter((c) => c.year === cycle).map((c) => surname(c.name)));
    const todo = comms.filter((c) => names.has(surname(c.candidate)) && c.seen.some((y) => y <= cycle));
    console.log(`OR ${cycle}: ${todo.length} committees to export`);
    for (const [i, c] of todo.entries()) {
      for (let attempt = 0; attempt < 3; attempt++) {
        // A long-lived session stops returning results: a fresh context every 25 exports and on any failure.
        if (used++ >= 25) { await ctx.close(); ctx = await b.newContext({ acceptDownloads: true, userAgent: UA }); used = 0; }
        try { await exportTx(ctx, c.id, cycle); break; } catch (e) {
          console.log(`  retry ${c.id} ${cycle}: ${e.message.split("\n")[0]}`);
          await ctx.close(); ctx = await b.newContext({ acceptDownloads: true, userAgent: UA }); used = 0;
          await sleep(15000);
        }
      }
      if (i % 25 === 0) console.log(`OR ${cycle}: ${i}/${todo.length}`);
      await sleep(10000); // ORESTAR answers 403 "request blocked" after a few hundred quick searches
    }
  }
  await b.close();
})();
