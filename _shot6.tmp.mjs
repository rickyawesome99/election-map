import { chromium } from "playwright";
const out = process.argv[2];
const list = JSON.parse(process.argv[3]);
const b = await chromium.launch();
for (const [name, url, dark] of list) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: dark ? "dark" : "light" });
  if (dark) await ctx.addInitScript(() => { try { localStorage.setItem("darkMode", "true"); } catch {} });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto("http://localhost:3000" + url, { waitUntil: "load", timeout: 180000 });
  await p.waitForTimeout(2500);
  const cap = p.getByText(/^2024 precincts\.|result by precinct:/).first();
  await cap.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(3000);
  await p.locator('svg[aria-label$="by precinct"]').first().evaluate((el) => el.scrollIntoView({ block: "center" })).catch((e) => errs.push("no svg"));
  await p.waitForTimeout(2000);
  const hov = p.locator('svg[aria-label$="by precinct"] path[style*="pointer"]').nth(3);
  await hov.hover({ force: true }).catch(() => {});
  await p.waitForTimeout(600);
  console.log(name, (await cap.textContent().catch(() => "")).slice(0, 90), errs);
  await p.screenshot({ path: `${out}/${name}.png` });
  await ctx.close();
}
await b.close();
