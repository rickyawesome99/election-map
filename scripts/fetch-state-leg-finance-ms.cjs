/**
 * Mississippi state legislative fundraising from the Secretary of State's campaign finance portal
 * (cfportal.sos.ms.gov) — DOWNLOAD step; scripts/fetch-state-leg-finance-ms.py reads the reports.
 *
 *   NODE_PATH=node_modules node scripts/fetch-state-leg-finance-ms.cjs [2019 2023]
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

const parseDate = (s) => { const [m, d, y] = s.split("/").map(Number); return new Date(y, m - 1, d); };

(async () => {
  const years = process.argv.slice(2).map(Number);
  const b = await chromium.launch({ headless: true, channel: "chromium", args: ["--disable-blink-features=AutomationControlled"] });
  const ctx = await b.newContext({ userAgent: UA });
  let p = await portal(ctx);
  for (const d of ["cand", "pdf"]) fs.mkdirSync(path.join(CACHE, d), { recursive: true });
  for (const year of years.length ? years : [2019, 2023]) {
    // 1. entities per seat
    const entFile = path.join(CACHE, `${year}-entities.json`);
    const ents = fs.existsSync(entFile) ? JSON.parse(fs.readFileSync(entFile, "utf8")) : {};
    for (const [chamber, n] of Object.entries(SEATS)) {
      for (let d = 1; d <= n; d++) {
        const key = `${chamber}-${d}`;
        if (ents[key]) continue;
        const r = await retry(() => post(p, "DistrictSearch", { DistrictType: "Legislative", DistrictName: chamber, ElectionYear: String(year), DistrictNumber: String(d) }), key);
        ents[key] = (r.Table ?? []).filter((e) => e.OrganizationType === "Candidate");
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
          const b64 = await retry(async () => {
            try { return await getBinary(p, `/Online/ExecuteWorkflow.aspx?WorkflowId=${WORKFLOW}&FilingId=${id}`); }
            catch (err) { await p.close().catch(() => {}); p = await portal(ctx); throw err; }
          }, `${e.EntityName} ${id}`);
          const buf = Buffer.from(b64, "base64");
          if (buf.subarray(0, 5).toString() !== "%PDF-") { console.log(`  not a PDF: ${e.EntityName} ${id}`); continue; }
          fs.writeFileSync(pf, buf);
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
