import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://127.0.0.1:3000";
const level = process.argv[3] ?? "district";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.addInitScript(() => {
  window.__fetches = [];
  const orig = window.fetch;
  window.fetch = (...a) => { window.__fetches.push(String(a[0])); return orig(...a); };
});
await page.goto(`${base}/historical`, { waitUntil: "networkidle" });
const label = level === "county" ? "County" : level === "district" ? "District" : "State";
await page.locator(".md\\:flex button", { hasText: label }).first().click();
await page.waitForTimeout(3000);
await page.waitForLoadState("networkidle");
const result = await page.evaluate(async () => {
  const paths = Array.from(document.querySelectorAll("svg path")).filter((p) => !p.closest("defs") && p.style && p.style.fill);
  const fetchesBefore = window.__fetches.length;
  const step = Math.max(1, Math.floor(paths.length / 60));
  const sample = paths.filter((_, i) => i % step === 0).slice(0, 60);
  const t0 = performance.now();
  let prev = null;
  for (const p of sample) {
    if (prev) prev.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: p }));
    p.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: prev ?? document.body }));
    prev = p;
    await new Promise((r) => requestAnimationFrame(r));
  }
  const elapsed = performance.now() - t0;
  // mousemove storm: 60 moves inside the map container (the old maps re-rendered on each)
  const box = document.querySelector("svg")?.closest("div");
  const t1 = performance.now();
  for (let i = 0; i < 60; i++) {
    box?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 300 + i * 5, clientY: 300 + (i % 7) }));
    await new Promise((r) => requestAnimationFrame(r));
  }
  const moveElapsed = performance.now() - t1;
  await new Promise((r) => setTimeout(r, 1500));
  return { paths: paths.length, hovers: sample.length, msPerHover: +(elapsed / sample.length).toFixed(1), msPerMouseMove: +(moveElapsed / 60).toFixed(1), fetchesDuring: window.__fetches.slice(fetchesBefore).length };
});
console.log(JSON.stringify({ level, ...result }));
await browser.close();
