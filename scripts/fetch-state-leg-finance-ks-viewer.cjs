/**
 * Kansas state legislative fundraising from the SOS Campaign Finance Viewer
 * (sos.ks.gov/elections/cfr_viewer) — DOWNLOAD step; scripts/fetch-state-leg-finance-ks-viewer.py
 * reads the cached reports into the portal-raw file.
 *
 *   npx tsx --conditions=react-server scripts/dump-state-leg-candidates.ts KS > /tmp/ks.json
 *   NODE_PATH=node_modules node scripts/fetch-state-leg-finance-ks-viewer.cjs /tmp/ks.json house:2018 senate:2020 ... paper
 *
 * The viewer sits behind an AWS WAF JS challenge (curl gets 202 + x-amzn-waf-action: challenge);
 * headless Chromium passes. Search: Candidate viewer → office (State Representative 7, State
 * Senator 6), filing type "Receipts and Expenditures Report", ORIGINAL FILE DATE from Jan 1 of the
 * election year to Mar 31 of the next (the Jan report of the election year covers the off year, so
 * this window spans the whole two-year cycle, Jan 1 Y-1 – Dec 31 Y). Grid: 20 rows a page, each
 * name a postback. Only rows whose district + surname belong to a general-election candidate of the
 * cycle are opened. An e-filed report comes back as HTML (reports/exp_report_main.aspx, summary
 * lines 1–7 with the period); a paper one (name on the row's second link, "Paper Filing" icon) as a
 * scanned PDF (srvimages/CampaignFinance/filings/…).
 * The form is submitted with target=_blank so the results page (and its view state) stays put.
 * PAPER filings never appear in an office search, only in a name search, so the job "paper" searches
 * every candidate surname (all years) and keeps the paper rows filed 2016 on whose office, district and
 * surname belong to a candidate → ks-viewer/paper/.
 * Cached in the scratch dir: ks-viewer/{chamber}-{cycle}/index.json + {n}.html|.pdf
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/7b2956ab-e26b-44c1-94ba-2b5ad2215584/scratchpad/ks-viewer";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const OFFICE = { house: "7", senate: "6" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Pause after each report opened (KS_PACE_MS; 800 ms tripped the WAF after a few hours, 2026-10-18).
const PACE_MS = Number(process.env.KS_PACE_MS ?? 4000);
// Watchdog: a navigation or popup can hang with no timeout firing; with nothing done for 10 minutes the process
// exits non-zero and a wrapper (rerun loop) starts it again, resuming from the cache.
let lastProgress = Date.now();
const progress = () => { lastProgress = Date.now(); };
let browser = null; // killed with the process: an exit that leaves Chromium behind leaks a browser per restart
setInterval(() => { if (Date.now() - lastProgress > 600000) { console.log("watchdog: no progress for 10 min, exiting"); try { browser?.process()?.kill("SIGKILL"); } catch {} process.exit(3); } }, 30000).unref();
const SUFFIX = new Set(["JR", "SR", "II", "III", "IV"]);
const tokens = (s) => s.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !SUFFIX.has(t));

/** q: { office?, lastName?, start?, end? } → record count, null when the search failed. */
async function search(p, q) {
  await p.goto("https://sos.ks.gov/elections/cfr_viewer/cfr_examiner_entry.aspx", { waitUntil: "networkidle", timeout: 120000 });
  // the WAF challenge reloads the page once it passes
  await sleep(3000);
  await p.waitForSelector("#ddlViewerOptions", { timeout: 60000 });
  await p.selectOption("#ddlViewerOptions", "Candidate");
  await Promise.all([p.waitForNavigation({ timeout: 120000 }), p.click("#btnSubmit")]);
  if (q.office) await p.selectOption("#drpdownOffice", q.office);
  if (q.lastName) await p.fill("#txtLastName", q.lastName);
  await p.selectOption("#drpdownFilingType", "Receipts and Expenditures Report");
  if (q.start) await p.fill("#txtStartDate", q.start);
  if (q.end) await p.fill("#txtEndDate", q.end);
  await Promise.all([p.waitForNavigation({ timeout: 180000 }), p.click("#btnSearch")]);
  await p.waitForFunction(() => /record\(s\) found|No records|no record/i.test(document.body.innerText), null, { timeout: 120000 }).catch(() => {});
  const text = await p.evaluate(() => document.body.innerText);
  const m = /(\d+) record\(s\) found/.exec(text);
  if (m) return Number(m[1]);
  if (/no record/i.test(text)) return 0;
  fs.writeFileSync(path.join(CACHE, `search-fail.html`), await p.content());
  return null;
}

/** Walk every page of the search q, calling visit(row, pg, i) on each grid row. */
async function walk(p, q, visit) {
  let total = null;
  for (let attempt = 0; attempt < 4 && total === null; attempt++) {
    total = await search(p, q).catch((e) => (console.log("  search failed: " + e.message.split("\n")[0]), null));
    if (total === null) await sleep(15000);
  }
  if (!total) return total;
  const pages = Math.ceil(total / 20);
  for (let pg = 1; pg <= pages; pg++) {
    // A GridView takes any page number, so a lost results page (WAF reload, server error) is
    // recovered by searching again and jumping straight to this page.
    for (let attempt = 0; ; attempt++) {
      try {
        if (attempt > 0 || !(await p.evaluate(() => typeof __doPostBack === "function" && !!document.querySelector("#grdviewCfrResults")))) await search(p, q);
        if (pg > 1 || attempt > 0) await Promise.all([p.waitForNavigation({ timeout: 180000 }), p.evaluate((n) => __doPostBack("grdviewCfrResults", "Page$" + n), pg)]);
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        console.log(`  page ${pg} lost (${e.message.split("\n")[0]}), searching again`);
        await sleep(20000);
      }
    }
    const rs = await rows(p);
    progress();
    await sleep(PACE_MS + 1000);
    for (let i = 0; i < rs.length; i++) await visit(rs[i], pg, i, pages);
  }
  return total;
}

async function rows(p) {
  return p.$$eval("#grdviewCfrResults tr", (trs) =>
    trs.map((tr) => {
      const q = (s) => tr.querySelector(`[id^="grdviewCfrResults_${s}_"]`);
      // E-filed rows carry the name on lnkbtnName; paper filings (a "Paper Filing" icon) on LinkButton1.
      const a = [q("lnkbtnName"), q("LinkButton1")].find((x) => x && x.textContent.trim());
      if (!a) return null;
      return {
        target: /__doPostBack\('([^']+)'/.exec(a.getAttribute("href"))[1],
        name: a.textContent.trim(),
        paper: !!q("paper"),
        filed: q("lblOriginalDate")?.textContent.trim() ?? "",
        amended: q("lblAmendmentDate")?.textContent.trim() ?? "",
        office: q("labelOfficeSought")?.textContent.trim() ?? "",
        district: (q("lblDistrictNumber")?.textContent ?? "").replace(/[^0-9]/g, ""),
      };
    }).filter(Boolean)
  );
}

async function open(ctx, p, target, base) {
  // Every PDF response is logged with the page it loaded in, and only the popup's own counts: a context-wide
  // "last PDF seen" let a slow response from the previous popup land under the next row (a scan filed under
  // the wrong candidate; found by reading the forms).
  const seen = [];
  const onResp = (r) => {
    if ((r.headers()["content-type"] || "").includes("pdf") || /\/srvimages\/.*\.pdf/i.test(r.url())) {
      let page = null;
      try { page = r.frame().page(); } catch {}
      seen.push({ page, url: r.url() });
    }
  };
  ctx.on("response", onResp);
  const popup = ctx.waitForEvent("page", { timeout: 60000 });
  popup.catch(() => {}); // if the postback below throws first, this wait must not become an unhandled rejection
  try {
    await p.evaluate((t) => { document.forms[0].target = "_blank"; __doPostBack(t, ""); document.forms[0].target = ""; }, target);
    const np = await popup;
    // A paper filing's postback opens the results page in the popup, which in turn opens the scan in a popup of
    // its own (Chromium's PDF viewer: the scan's response carries no page, and np never sees it). Only np's own
    // child counts, so a slow scan from the previous row cannot land here.
    let pdfPage = null;
    const child = np.waitForEvent("popup", { timeout: 45000 }).then((pp) => (pdfPage = pp)).catch(() => null);
    await np.waitForLoadState("load", { timeout: 90000 }).catch(() => {});
    const mine = () => seen.find((x) => x.page === np && /\/srvimages\//i.test(x.url)) || (/\/srvimages\/.*\.pdf/i.test(np.url()) ? { url: np.url() } : null) ||
      (pdfPage && (/\/srvimages\/.*\.pdf/i.test(pdfPage.url()) ? { url: pdfPage.url() } : seen.find((x) => x.page === pdfPage && /\/srvimages\//i.test(x.url)))) || null;
    for (let i = 0; i < 30 && !mine() && !/exp_report_main/.test(np.url()); i++) await sleep(500);
    if (!mine() && !/exp_report_main/.test(np.url())) await Promise.race([child, sleep(30000)]);
    if (!pdfPage) for (const pg of ctx.pages()) if (pg !== np && (await pg.opener().catch(() => null)) === np) pdfPage = pg;
    let out;
    if (/exp_report_main/.test(np.url())) {
      // the WAF sometimes answers the popup with its challenge page instead of the report; the challenge reloads
      // the popup once it passes, so wait for the report rather than reading the challenge
      let html = await np.content().catch(() => "");
      for (let i = 0; i < 60 && !/covering the period/i.test(html); i++) {
        await sleep(500);
        html = await np.content().catch(() => "");
      }
      if (!/covering the period/i.test(html)) { fs.writeFileSync(path.join(CACHE, "popup-fail.html"), html); out = { kind: "none", url: np.url() }; }
      else { fs.writeFileSync(base + ".html", html); out = { kind: "html", url: np.url() }; }
    } else {
      const m = mine();
      // the scans themselves (srvimages) are not behind the WAF: fetch the file directly
      let body = null;
      for (let a = 0; m && a < 3 && !body; a++) {
        body = await fetch(m.url, { headers: { "User-Agent": UA } }).then(async (r) => (r.ok ? Buffer.from(await r.arrayBuffer()) : null)).catch(() => null);
        if (!body) await sleep(5000);
      }
      const isPdf = body && body.subarray(0, 5).toString() === "%PDF-";
      if (isPdf) fs.writeFileSync(base + ".pdf", body);
      out = { kind: isPdf ? "pdf" : "none", url: m ? m.url : np.url() };
    }
    if (pdfPage) await pdfPage.close().catch(() => {});
    await np.close();
    return out;
  } finally {
    ctx.off("response", onResp);
  }
}

(async () => {
  const [candFile, ...jobs] = process.argv.slice(2);
  const cands = JSON.parse(fs.readFileSync(candFile, "utf8"));
  const b = (browser = await chromium.launch({ headless: true, channel: "chromium" }));
  const ctx = await b.newContext({ userAgent: UA });
  // The WAF answers 403 once it has had enough: stop at the first one (everything so far is cached) rather
  // than retrying into a longer block — the same IP's ordinary browser is blocked with it.
  ctx.on("response", (r) => {
    if (r.status() === 403 && /sos\.ks\.gov/.test(r.url())) {
      console.log(`blocked (403) at ${r.url()} — stopping; rerun later to resume from the cache`);
      try { browser?.process()?.kill("SIGKILL"); } catch {}
      process.exit(4);
    }
  });
  const fetchInto = async (p, dir, index, idxFile, key, r) => {
    let res;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { res = await open(ctx, p, r.target, path.join(dir, key)); break; }
      catch (e) { console.log(`  retry ${key} ${r.name}: ${e.message.split("\n")[0]}`); await sleep(15000); }
    }
    index[key] = { ...r, ...(res ?? { kind: "none" }) };
    progress();
    fs.writeFileSync(idxFile, JSON.stringify(index, null, 1));
    await sleep(PACE_MS);
  };
  for (const job of jobs) {
    const p = await ctx.newPage();
    if (job === "paper") {
      // Paper filings never come up in an office search, only in a name search: every surname of a
      // 2016–2026 general-election candidate, all years, keeping paper rows filed 2016 on whose office +
      // district + surname belong to a candidate.
      const dir = path.join(CACHE, "paper");
      fs.mkdirSync(dir, { recursive: true });
      const idxFile = path.join(dir, "index.json");
      const index = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, "utf8")) : {};
      const doneFile = path.join(dir, "done.json");
      const done = new Set(fs.existsSync(doneFile) ? JSON.parse(fs.readFileSync(doneFile, "utf8")) : []);
      const want = { house: {}, senate: {} };
      for (const c of cands) if (c.year >= 2016) {
        const t = tokens(c.name);
        (want[c.chamber][String(Number(c.district))] ??= new Set()).add(t[t.length - 1]);
      }
      const surnames = [...new Set(Object.values(want).flatMap((ds) => Object.values(ds).flatMap((s) => [...s])))].sort();
      console.log(`paper: ${surnames.length} surnames, ${done.size} done`);
      let opened = 0;
      for (const sn of surnames) {
        if (done.has(sn)) continue;
        const total = await walk(p, { lastName: sn }, async (r, pg, i) => {
          const chamber = /Representative/i.test(r.office) ? "house" : /Senator/i.test(r.office) ? "senate" : null;
          if (!r.paper || !chamber || Number(r.filed.slice(-4)) < 2016) return;
          if (!(want[chamber][r.district] && tokens(r.name).some((t) => want[chamber][r.district].has(t)))) return;
          const key = `${sn}-${pg}-${i}`;
          if (index[key] && index[key].name === r.name && index[key].kind !== "none") return;
          await fetchInto(p, dir, index, idxFile, key, { ...r, chamber });
          opened++;
        });
        if (total === null) { console.log(`  ${sn}: search failed, left for the next run`); continue; }
        done.add(sn);
        fs.writeFileSync(doneFile, JSON.stringify([...done]));
        if (done.size % 25 === 0) console.log(`  ${done.size}/${surnames.length} surnames, ${opened} paper reports opened`);
      }
      console.log(`paper: done, ${opened} opened`);
      await p.close();
      continue;
    }
    const [chamber, cy] = job.split(":");
    const cycle = Number(cy);
    const dir = path.join(CACHE, `${chamber}-${cycle}`);
    fs.mkdirSync(dir, { recursive: true });
    const idxFile = path.join(dir, "index.json");
    const index = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, "utf8")) : {};
    // district → surname tokens of that cycle's general-election candidates
    const want = {};
    for (const c of cands) if (c.year === cycle && c.chamber === chamber) {
      const t = tokens(c.name);
      (want[String(Number(c.district))] ??= new Set()).add(t[t.length - 1]);
    }
    let opened = 0, skipped = 0;
    // the form refuses a future end date
    const endD = new Date(Math.min(new Date(cycle + 1, 2, 31), Date.now()));
    const end = `${String(endD.getMonth() + 1).padStart(2, "0")}/${String(endD.getDate()).padStart(2, "0")}/${endD.getFullYear()}`;
    const total = await walk(p, { office: OFFICE[chamber], start: `01/01/${cycle}`, end }, async (r, pg, i, pages) => {
      const key = `${pg}-${i}`;
      if (i === 0 && pg % 10 === 0) console.log(`  page ${pg}/${pages}: opened ${opened}, skipped ${skipped}`);
      if (!(want[r.district] && tokens(r.name).some((t) => want[r.district].has(t)))) { skipped++; return; }
      if (index[key] && index[key].name === r.name && index[key].kind !== "none") return;
      await fetchInto(p, dir, index, idxFile, key, r);
      opened++;
    });
    console.log(`${chamber} ${cycle}: ${total} reports, opened ${opened}, skipped ${skipped}`);
    await p.close();
  }
  await b.close();
})();
