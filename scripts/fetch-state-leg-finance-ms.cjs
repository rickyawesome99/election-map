/**
 * Mississippi state legislative fundraising from the Secretary of State's campaign finance portal
 * (cfportal.sos.ms.gov) — DOWNLOAD step; scripts/fetch-state-leg-finance-ms.py reads the reports.
 *
 *   npx tsx --conditions=react-server scripts/dump-state-leg-candidates.ts MS > /tmp/ms.json
 *   MS_POOL=/tmp/ms.json NODE_PATH=node_modules node scripts/fetch-state-leg-finance-ms.cjs [2019 2023]
 *
 * Cloudflare Turnstile sits in front (curl gets 403); full Chromium (channel "chromium") passes it, after
 * which the portal's JSON services answer in-page fetch():
 * 1. DistrictSearch {DistrictType "Legislative", DistrictName House|Senate, ElectionYear, DistrictNumber}
 *    → the candidates (EntityId) who registered for that seat that year.
 * 2. ViewXSLTFileByName.aspx?providerName=CF_CandidateDetails&EntityId= → party, office, and the entity's
 *    filings (date, title, FilingId). Each candidacy is its own entity, so a member's 2020–22 annual
 *    reports sit under the 2023 entity or the 2019 one; both entities of a person are read.
 * 3. ExecuteWorkflow.aspx?WorkflowId=g729911d7-…&FilingId= → the report PDF: scanned paper forms, mostly
 *    handwritten. Only the reports that close a calendar year of the four-year cycle are fetched: for each
 *    year y in Y-3..Y, the filings made Jan 1 – Mar 31 of y+1 (annual report, Jan 10 periodic report), or
 *    when there is none the last filing made in y; amendments included.
 * Cached in the scratch dir: ms/{year}-entities.json, ms/cand/{EntityId}.html, ms/pdf/{FilingId}.pdf
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CACHE = "/private/tmp/claude-501/-Users-rickyjia-election-map/7b2956ab-e26b-44c1-94ba-2b5ad2215584/scratchpad/ms";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const SEATS = { House: 122, Senate: 52 };
const WORKFLOW = "g729911d7-f399-46d6-a1ca-f15c1294f82d";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function portal(ctx) {
  const p = await ctx.newPage();
  await p.goto("https://cfportal.sos.ms.gov/online/portal/cf/page/cf-search/Portal.aspx", { waitUntil: "domcontentloaded", timeout: 90000 });
  for (let i = 0; i < 20 && /moment/i.test(await p.title()); i++) await sleep(2500);
  return p;
}

const post = (p, svc, body) => p.evaluate(async ([svc, body]) => {
  const r = await fetch("/Online/Services/MS/CampaignFinanceServices.asmx/" + svc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(svc + " " + r.status);
  return JSON.parse((await r.json()).d);
}, [svc, body]);

const getText = (p, url) => p.evaluate(async (u) => { const r = await fetch(u); if (!r.ok) throw new Error("GET " + r.status); return r.text(); }, url);

const getBinary = (p, url) => p.evaluate(async (u) => {
  const r = await fetch(u);
  if (!r.ok) throw new Error("GET " + r.status);
  const a = new Uint8Array(await r.arrayBuffer());
  let s = "";
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(s);
}, url);

async function retry(fn, label) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i >= 4) throw e;
      console.log(`  retry ${label}: ${e.message.split("\n")[0]}`);
      await sleep(10000 * (i + 1));
    }
  }
}

function filings(html) {
  const out = [];
  for (const row of html.split(/<tr[\s>]/i).slice(1)) {
    const id = /data-val="([0-9A-Fa-f-]{36})"/.exec(row);
    if (!id) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim());
    out.push({ id: id[1], date: cells[0], title: cells[1] });
  }
  return out;
}

const valid = (f) => require("child_process").spawnSync("pdfinfo", [f], { encoding: "utf8" }).status === 0;

const parseDate = (s) => { const [m, d, y] = s.split("/").map(Number); return new Date(y, m - 1, d); };

async function one(id, out) {
  let b = null;
  // a hung browser must not hold up the parent's queue — nor outlive this process
  setTimeout(() => { try { b?.process()?.kill("SIGKILL"); } catch {} process.exit(4); }, 120000).unref();
  b = await chromium.launch({ headless: true, channel: "chromium", args: ["--disable-blink-features=AutomationControlled"] });
  try {
    const p = await portal(await b.newContext({ userAgent: UA }));
    await sleep(3000);
    fs.writeFileSync(out, Buffer.from(await getBinary(p, `/Online/ExecuteWorkflow.aspx?WorkflowId=${WORKFLOW}&FilingId=${id}`), "base64"));
  } finally { await b.close(); }
}

(async () => {
  if (process.argv[2] === "--one") return one(process.argv[3], process.argv[4]);
  if (process.argv[2] === "--ids") {
    // Every filing of the e-filers' cycle windows (a list of FilingIds, one per line): their typed summaries
    // carry a per-report "Period Total", and the "Aggregate YTD" carries over between reports unevenly, so the
    // cycle is the sum of all the reports, not one year-closing report. Three fresh browsers at a time.
    const ids = fs.readFileSync(process.argv[3], "utf8").split("\n").map((x) => x.trim()).filter(Boolean);
    const todo = ids.filter((id) => !fs.existsSync(path.join(CACHE, "pdf", `${id}.pdf`)));
    console.log(`${todo.length} of ${ids.length} filings to fetch`);
    let k = 0, done = 0;
    const worker = async () => {
      // A long-lived page is fast but now and then mangles a transfer: each file is checked with pdfinfo and
      // fetched again (up to 3 times), and only then from a fresh browser.
      const b = await chromium.launch({ headless: true, channel: "chromium", args: ["--disable-blink-features=AutomationControlled"] });
      let page = await portal(await b.newContext({ userAgent: UA }));
      await sleep(3000);
      while (k < todo.length) {
        const id = todo[k++];
        const pf = path.join(CACHE, "pdf", `${id}.pdf`);
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            fs.writeFileSync(pf, Buffer.from(await getBinary(page, `/Online/ExecuteWorkflow.aspx?WorkflowId=${WORKFLOW}&FilingId=${id}`), "base64"));
            if (fs.readFileSync(pf).subarray(0, 5).toString() === "%PDF-" && valid(pf)) break;
          } catch (e) {
            await page.close().catch(() => {});
            page = await portal(await b.newContext({ userAgent: UA }));
            await sleep(3000);
          }
          if (fs.existsSync(pf)) fs.unlinkSync(pf);
        }
        for (let attempt = 0; attempt < 3 && !(fs.existsSync(pf) && valid(pf)); attempt++) {
          await new Promise((res) => require("child_process").execFile(process.execPath, [__filename, "--one", id, pf], { timeout: 300000, env: process.env }, () => res()));
          if (fs.existsSync(pf) && fs.readFileSync(pf).subarray(0, 5).toString() === "%PDF-" && valid(pf)) break;
          if (fs.existsSync(pf)) fs.unlinkSync(pf);
        }
        if (++done % 25 === 0) console.log(`  ${done}/${todo.length}`);
      }
      await b.close();
    };
    await Promise.all([worker(), worker(), worker()]);
    console.log("ids: done");
    return;
  }
  const years = process.argv.slice(2).map(Number);
  const b = await chromium.launch({ headless: true, channel: "chromium", args: ["--disable-blink-features=AutomationControlled"] });
  const ctx = await b.newContext({ userAgent: UA });
  let p = await portal(ctx);
  for (const d of ["cand", "pdf"]) fs.mkdirSync(path.join(CACHE, d), { recursive: true });
  for (const year of [].concat(...Array(3).fill(years.length ? years : [2019, 2023]))) {
    // 1. entities per seat
    const entFile = path.join(CACHE, `${year}-entities.json`);
    const ents = fs.existsSync(entFile) ? JSON.parse(fs.readFileSync(entFile, "utf8")) : {};
    for (const [chamber, n] of Object.entries(SEATS)) {
      for (let d = 1; d <= n; d++) {
        const key = `${chamber}-${d}`;
        if (ents[key]) continue;
        const r = await retry(() => post(p, "DistrictSearch", { DistrictType: "Legislative", DistrictName: chamber, ElectionYear: String(year), DistrictNumber: String(d) }), key);
        ents[key] = (r.Table ?? []).filter((e) => /candidate/i.test(e.OrganizationType));
        fs.writeFileSync(entFile, JSON.stringify(ents, null, 1));
        await sleep(400);
      }
    }
    // 1b. Candidates the seat search misses (many file only through a committee with no seat on it, "Friends of
    // Trey Lamar"): a name search on the surname, keeping the one candidate or candidate-committee entity whose
    // name holds the surname and the first name (or its nickname).
    if (process.env.MS_POOL) {
      const pool = JSON.parse(fs.readFileSync(process.env.MS_POOL, "utf8")).filter((c) => c.year === year);
      const norm = (x) => x.toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !["jr", "sr", "ii", "iii", "iv"].includes(t));
      for (const c of pool) {
        const seat = `${c.chamber === "house" ? "House" : "Senate"}-${Number(c.district)}`;
        const t = norm(c.name.replace(/["'(].*?["')]/g, " "));
        const nick = (/["'(]([^"')]+)["')]/.exec(c.name) || [])[1];
        const last = t[t.length - 1];
        const firsts = new Set([t[0], ...(nick ? norm(nick) : [])]);
        if ((ents[seat] ?? []).some((e) => norm(e.EntityName).includes(last))) continue;
        const key = `name:${seat}:${last}`;
        if (ents[key]) continue;
        const r = await retry(() => post(p, "CandidateNameSearch", { SearchBy: "Contains", EntityName: last, SearchType: "Candidate" }), key);
        const hits = (r.Table ?? []).filter((e) => { const n = norm(e.EntityName); return n.includes(last) && n.some((w) => firsts.has(w)); });
        ents[key] = hits.length === 1 ? [{ ...hits[0], seat }] : [];
        fs.writeFileSync(entFile, JSON.stringify(ents, null, 1));
        await sleep(400);
      }
    }
    console.log(`${year}: ${Object.values(ents).flat().length} candidate entities`);
    // 2. details + 3. year-closing reports
    let fetched = 0;
    for (const [seat, list] of Object.entries(ents)) {
      for (const e of list) {
        const cf = path.join(CACHE, "cand", `${e.EntityId}.html`);
        if (!fs.existsSync(cf)) {
          fs.writeFileSync(cf, await retry(() => getText(p, `/Online/ViewXSLTFileByName.aspx?providerName=CF_CandidateDetails&EntityId=${e.EntityId}`), e.EntityName));
          await sleep(400);
        }
        const fs_ = filings(fs.readFileSync(cf, "utf8"));
        const want = new Set();
        for (let y = year - 3; y <= year; y++) {
          const closing = fs_.filter((f) => { const t = parseDate(f.date); return t >= new Date(y + 1, 0, 1) && t <= new Date(y + 1, 2, 31); });
          const inYear = fs_.filter((f) => { const t = parseDate(f.date); return t >= new Date(y, 0, 1) && t <= new Date(y, 11, 31); }).sort((a, b) => parseDate(b.date) - parseDate(a.date));
          for (const f of closing.length ? closing : inYear.slice(0, 1)) want.add(f.id);
        }
        for (const id of want) {
          const pf = path.join(CACHE, "pdf", `${id}.pdf`);
          if (fs.existsSync(pf)) continue;
          // Each PDF in a fresh browser (a child process). Two failure modes: a transfer now and then arrives with
          // a few bytes added (a refetch is clean), and some files are malformed on the server itself (the same
          // bytes every time; poppler cannot read the page tree). Up to 4 tries; then the last copy is rebuilt with
          // pypdf (scratch pylib/), which recovers the pages of the malformed ones.
          let good = false;
          for (let attempt = 0; attempt < 4 && !good; attempt++) {
            const r = require("child_process").spawnSync(process.execPath, [__filename, "--one", id, pf], { encoding: "utf8", timeout: 300000, env: process.env });
            good = r.status === 0 && fs.existsSync(pf) && fs.readFileSync(pf).subarray(0, 5).toString() === "%PDF-" && valid(pf);
            if (!good) await sleep(5000);
          }
          if (!good && fs.existsSync(pf) && fs.readFileSync(pf).subarray(0, 5).toString() === "%PDF-") {
            const fixed = pf + ".fixed";
            require("child_process").spawnSync("python3", ["-c", "import sys,pypdf\nr=pypdf.PdfReader(sys.argv[1],strict=False)\nw=pypdf.PdfWriter()\n[w.add_page(p) for p in r.pages]\nw.write(sys.argv[2])", pf, fixed], { env: { ...process.env, PYTHONPATH: path.join(path.dirname(CACHE), "pylib") } });
            if (fs.existsSync(fixed) && valid(fixed)) { fs.renameSync(fixed, pf); good = true; console.log(`  repaired malformed PDF: ${e.EntityName} ${id}`); }
          }
          if (!good) {
            if (fs.existsSync(pf)) fs.unlinkSync(pf);
            console.log(`  unreadable after retries + repair: ${e.EntityName} ${id}`);
            continue;
          }
          fetched++;
          await sleep(600);
        }
      }
      if (seat.endsWith("0")) console.log(`  ${year} ${seat}: ${fetched} reports so far`);
    }
    console.log(`${year}: done, ${fetched} reports fetched`);
  }
  await b.close();
})();
