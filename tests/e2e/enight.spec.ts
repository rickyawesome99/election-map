import { expect, test, type Page } from "@playwright/test";

// /enight: the static archive of the 2026 count (public/results-archive-2026/), 338 snapshots from
// 6 PM ET Nov 3 to 6 PM ET Nov 16 with a time slider. The page reads no live feed and no clock, so
// these tests run on the real archive with no stubs; every test fails if the page calls civicAPI or
// the dev-only live and archive routes.

type Prior = { id: string; office: string; counties: { pres24Est?: boolean }[] };

async function guard(page: Page) {
  const calls: string[] = [];
  await page.route(/civicapi\.org|\/api\/enight\/(live|archive)/, (route) => { calls.push(route.request().url()); return route.abort(); });
  return calls;
}

/** Open the page (or a race on it) and wait for the archive's board. */
async function open(page: Page, hash = "") {
  await page.goto(`/enight${hash ? `#${hash}` : ""}`);
  await expect(page.getByLabel("Snapshot", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Loading the results archive")).toHaveCount(0);
}

const slider = (page: Page) => page.getByLabel("Snapshot", { exact: true });

test("the archive opens on the final count and steps, jumps and plays through time", async ({ page }) => {
  const calls = await guard(page);
  await open(page);
  await expect(page.getByText("Results archive")).toBeVisible();
  await expect(slider(page)).toHaveValue("337");
  await expect(page.getByText("Nov 16, 6:00 PM ET").first()).toBeVisible();
  await expect(page.getByText("338 / 338")).toBeVisible();
  const senate = page.locator("section", { hasText: "Balance of power" }).locator("h3", { hasText: "Senate" }).locator("..").locator("..");
  await expect(senate).toContainText("35/35 reporting");
  // First snapshot: 6 PM ET election night, nothing counted.
  await page.getByRole("button", { name: "First snapshot" }).click();
  await expect(slider(page)).toHaveValue("0");
  await expect(page.getByText("Nov 3, 6:00 PM ET").first()).toBeVisible();
  // Stepping and the keyboard.
  await page.getByRole("button", { name: "Next snapshot" }).click();
  await expect(slider(page)).toHaveValue("1");
  await page.keyboard.press("ArrowRight");
  await expect(slider(page)).toHaveValue("2");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(slider(page)).toHaveValue("14");
  await page.keyboard.press("ArrowLeft");
  await expect(slider(page)).toHaveValue("13");
  // Latest updates is folded away by default (user, 2026-11-18); open it. Open, it keeps one height
  // whatever the number of races that moved (blank rows fill in).
  await page.getByRole("button", { name: /^Latest updates/ }).click();
  await expect(page.getByRole("button", { name: /^Latest updates/ })).toHaveAttribute("aria-expanded", "true");
  const latest = page.locator("section", { hasText: "Latest updates" }).first();
  const h0 = await latest.evaluate((e) => e.getBoundingClientRect().height);
  // Mid-night: counts are in and Latest updates lists what moved since the snapshot before.
  await slider(page).fill("40");
  await expect(page.getByText(/^Nov 3, \d+:\d\d PM ET$/).first()).toBeVisible();
  await expect(page.locator("section", { hasText: "Latest updates" }).locator("li").first()).toContainText(/[DR]\+\d/);
  expect(await latest.evaluate((e) => e.getBoundingClientRect().height)).toBeCloseTo(h0, 0);
  // Play advances on its own; pause stops it.
  await page.getByRole("button", { name: "Play" }).click();
  await expect.poll(async () => Number(await slider(page).inputValue()), { timeout: 10_000 }).toBeGreaterThan(41);
  await page.getByRole("button", { name: "Pause" }).click();
  const at = await slider(page).inputValue();
  await page.waitForTimeout(1500);
  await expect(slider(page)).toHaveValue(at);
  await page.getByRole("button", { name: "Final snapshot" }).click();
  await expect(slider(page)).toHaveValue("337");
  expect(calls).toEqual([]);
});

test("the dashboard, map and tables fill from the archive and a race opens with its counties", async ({ page }) => {
  const calls = await guard(page);
  await open(page);
  // By state: one state's races as cards, its House popular vote first.
  await page.getByRole("button", { name: "By state" }).click();
  await page.getByLabel("State", { exact: true }).selectOption("GA");
  const georgia = page.locator("section", { hasText: "Georgia races" });
  await expect(georgia).toContainText("House popular vote");
  await expect(georgia).toContainText("Statewide");
  await expect(georgia).toContainText("GA-01");
  await page.getByRole("button", { name: "Table", exact: true }).click();
  // The race table's rows show a counted margin and a projection.
  const first = page.locator("[data-race-row]").first();
  await expect(first).toContainText(/[DR]\+\d/);
  await first.click();
  const detail = page.locator("#race-detail");
  await expect(page.getByText("Balance of power")).toHaveCount(0);
  await expect(detail).toContainText("Projected final margin");
  await expect(detail).toContainText("counties reporting");
  await expect(detail).toContainText(/Polls close \d/i);
  expect(page.url()).toMatch(/#house-/);
  // The race page keeps the time bar: stepping back moves the race too.
  await page.getByRole("button", { name: "First snapshot" }).click();
  await expect(slider(page)).toHaveValue("0");
  await expect(detail).not.toContainText("Called for");
  await page.getByRole("button", { name: "Final snapshot" }).click();
  // Its back button returns to the results.
  await page.getByRole("button", { name: "← All results" }).click();
  await expect(page.getByRole("heading", { name: "2026 Election Night" })).toBeVisible();
  expect(page.url()).not.toMatch(/#/);
  expect(calls).toEqual([]);
});

test("the county table's swing view compares each seat with its own last election", async ({ page }) => {
  const priors: Prior[] = (await (await page.request.get("/api/enight/priors/house")).json()).races;
  const openSwing = async (hash: string) => {
    await open(page, hash);
    await page.getByRole("button", { name: "Swing", exact: true }).last().click();
    return page.locator("#race-detail table").last();
  };
  const heads = (t: Awaited<ReturnType<typeof openSwing>>) => t.locator("thead th:visible").allInnerTexts();
  // Nebraska's Ricketts seat was last up in the 2024 special, not Fischer's regular race that year.
  let table = await openSwing("senate-NE-2");
  const ne = (await heads(table)).join(" | ").replace(/\s+/g, " ").toUpperCase();
  if (page.viewportSize()!.width >= 640) expect(ne).toBe("COUNTY | MARGIN | SWING VS '24 SPECIAL | SWING VS SEN '24 | SWING VS PRES '24 | COUNTED ▾ | IN");
  else expect(ne).toContain("SWING VS '24 SP.");
  // Every county has a baseline, and a swing the feed's margin less it.
  await expect(table.locator("tbody tr").first()).toContainText(/[DRI]\+\d/);
  // Osborn is an independent in the D slot: his swings read as Democratic ones, his margins keep his own letter.
  const seatSwing = table.locator("tbody tr").first().locator("td").nth(2);
  await expect(seatSwing).toContainText(/^[DR]\+\d/);
  await expect(seatSwing).not.toContainText(/\bI\+\d/);
  await expect(table.locator("thead")).not.toContainText(/Vote\s*margin|Edge|TPL|Proj/i);
  table = await openSwing("senate-GA");
  await expect(table.locator("thead")).toContainText(/vs '20/i);
  await expect(table.locator("thead")).toContainText(/vs Sen '22/i);
  // Ohio's special is for the Vance seat, last up in 2022; 2024's race was the state's other seat.
  table = await openSwing("senate-OH-2");
  await expect(table.locator("thead")).toContainText(/vs '22/i);
  await expect(table.locator("thead")).toContainText(/vs Sen '24/i);
  table = await openSwing("governor-NH");
  await expect(table.locator("thead")).toContainText(/vs '24/i);
  await expect(table.locator("thead")).not.toContainText(/vs Sen/i);
  // A district inside one county is the district's own presidential result, not an estimate.
  table = await openSwing("house-1707");
  await expect(table.locator("thead")).toContainText(/vs '24/i);
  await expect(table.locator("tbody tr").first()).toContainText(/[DR]\+\d/);
  await expect(table.locator("tbody tr").first()).not.toContainText("~");
  // A split county in a larger district is marked as one; then back to the results.
  const split = priors.find((p) => p.counties.some((c) => c.pres24Est))!;
  table = await openSwing(`house-${split.id}`);
  await expect(table.locator("tbody")).toContainText("~");
  await table.locator("thead th", { hasText: /pres '24|vs '24/i }).first().click();
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(table.locator("thead")).toContainText("Edge");
});

test("the overview links to the results page", async ({ page }) => {
  await page.goto("/overview");
  await page.getByRole("link", { name: /Election Night Results/ }).click();
  await expect(page).toHaveURL(/\/enight$/);
  // The election-night page is reached from the overview only: the 2026 Results page is listed under Analysis (user, 2026-11-25).
  await expect(page.locator("nav").getByRole("link", { name: "Election Night" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "2026 Election Night" })).toBeVisible({ timeout: 30_000 });
});

test("the map's Swing tab colors counties by swing vs Pres '24 and its cards give that margin", async ({ page, isMobile }) => {
  for (const race of ["senate-GA", "house-1707"]) {
    await open(page, race);
    await page.getByRole("button", { name: "Swing", exact: true }).first().click();
    const detail = page.locator("#race-detail");
    await expect(detail).toContainText("Each county's counted margin minus its 2024 presidential margin");
    const county = detail.locator("svg path[style*='cursor'], svg path.rsm-geography").first();
    if (!isMobile) {
      await county.dispatchEvent("mouseover");
      const tip = page.locator(".pointer-events-none.rounded-lg", { hasText: "Swing vs Pres '24" });
      await expect(tip).toBeVisible();
      await expect(tip).toContainText(/[DR]\+\d/);
      await expect(tip).not.toContainText("Votes");
    }
    await county.dispatchEvent("click");
    const panel = detail.locator("[data-county-card='panel']", { hasText: "Swing vs Pres '24" });
    await expect(panel).toContainText(/[DR]\+\d/);
    // The panel follows the map's tab.
    await page.getByRole("button", { name: "Counted", exact: true }).last().click();
    await expect(detail.locator("[data-county-card='panel']")).not.toContainText("Swing vs Pres '24");
  }
});

test("the national map's Swing tab compares each office with Pres '24", async ({ page, isMobile }) => {
  await open(page);
  await page.getByRole("button", { name: "Swing", exact: true }).click();
  for (const [office, note] of [["House", "Each district's counted margin minus its 2024 presidential margin on the 2026 lines"], ["Senate", "Each state's counted margin"], ["Governor", "Each state's counted margin"]]) {
    await page.getByRole("button", { name: office, exact: true }).first().click();
    await expect(page.getByText(note)).toBeVisible();
    await expect(page.getByText("Called flip")).toHaveCount(0);
  }
  if (!isMobile) {
    // Some states have no governor race, so hover until one answers.
    const tip = page.locator(".pointer-events-none.rounded-lg", { hasText: "Pres '24" });
    for (let i = 0; i < 12 && !(await tip.count()); i++) await page.locator("svg path.rsm-geography").nth(i).dispatchEvent("mouseover");
    await expect(tip).toContainText("Swing");
    await expect(tip).toContainText(/[DR]\+\d/);
    await expect(tip).not.toContainText("Forecast");
  }
});

test("on a 320px phone the swing view's extra Senate column fits without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  // The widest cases: a long county name, and a special's longer heading.
  for (const race of ["senate-VA-2", "senate-NE-2"]) {
    await open(page, race);
    await page.getByRole("button", { name: "Swing", exact: true }).last().click();
    await expect(page.locator("#race-detail table").last().locator("thead")).toContainText(/vs Sen '/i);
    const scroller = page.locator("#race-detail table").last().locator("..");
    expect(await scroller.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("on a 320px phone the page, race table and county table fit without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  // Anything wider than its box, page-level or inside a scroller (the nav's own tab strip aside).
  const overflow = () => page.evaluate(() => [document.documentElement, ...document.querySelectorAll("main *")]
    .filter((e) => e.scrollWidth > e.clientWidth + 1 && (e === document.documentElement || /(auto|scroll)/.test(getComputedStyle(e).overflowX)))
    .map((e) => `${e.tagName}.${e.className} ${e.clientWidth}/${e.scrollWidth}`));
  await open(page);
  expect(await overflow()).toEqual([]);
  await open(page, "senate-GA");
  await expect(page.locator("#race-detail table tbody tr").first()).toContainText(/[DR]\+\d/, { timeout: 60_000 });
  expect(await overflow()).toEqual([]);
});
