import { expect, test, type Page } from "@playwright/test";

// /results: the election-night page. civicAPI is stubbed with a payload built from the page's own
// priors (so every county matches by FIPS) — the real feed serves randomized test data before
// Nov 3 and live counts after, neither of which a test can assert on.

type Prior = { id: string; civicId: number | null; office: string; label: string; dem: { name: string; party: string }; rep: { name: string; party: string }; counties: { fips: string; name: string; votes: number; margin: number }[] };

// The page reads civicAPI only from 5 PM ET on election day; tests that need the feed run their
// browser clock at 9 PM ET that night.
const ELECTION_NIGHT = new Date("2026-11-04T02:00:00Z");

// The local intake store (scripts/results-live.mjs, dev only) and the dev archive would hand the
// page tonight's real results; the tests read the stubbed feed alone, as the deployed site does.
async function stubLocal(page: Page) {
  await page.route("**/api/results/live**", (route) => route.fulfill({ json: { available: false, now: 0, races: [] } }));
  await page.route("**/api/results/archive**", (route) => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith("/series") ? { senate: [], governor: [], house: [] } : { snapshots: [] } }));
}

async function stubFeed(page: Page) {
  await stubLocal(page);
  const priors: Prior[] = [];
  for (const office of ["senate", "governor", "house"]) {
    const res = await page.request.get(`/api/results/priors/${office}`);
    expect(res.ok()).toBeTruthy();
    priors.push(...((await res.json()).races as Prior[]));
  }
  const byCivic = new Map(priors.filter((p) => p.civicId).map((p) => [String(p.civicId), p]));
  await page.route("https://civicapi.org/api/v2/**", (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/").pop()!;
    const p = byCivic.get(id);
    if (!p) return route.fulfill({ status: 404, json: { error: "unknown" } });
    // Half of every county is in, with the Republican 2 points better than the prior everywhere.
    const regions: Record<string, unknown> = {};
    let dem = 0, rep = 0;
    for (const c of p.counties) {
      const total = Math.round(c.votes * 0.5), m = c.margin + 2;
      const r = Math.round((total * (100 + m)) / 200), d = total - r;
      dem += d; rep += r;
      regions[c.fips] = { name: c.name, type: "County", fips: c.fips, percent_reporting: 50, candidates: [
        { name: p.dem.name, party: "Democratic", votes: d, percent: (d / total) * 100 }, { name: p.rep.name, party: "Republican", votes: r, percent: (r / total) * 100 }] };
    }
    const light = url.searchParams.has("light");
    return route.fulfill({ json: {
      election_name: p.label, percent_reporting: 55, test_data: false, last_updated: "2026-11-04T01:30:00.000Z", called_at: null,
      candidates: [{ name: p.dem.name, party: "Democratic", votes: dem, percent: 48, winner: false }, { name: p.rep.name, party: "Republican", votes: rep, percent: 50, winner: false }],
      ...(light ? {} : { region_results: regions }),
    } });
  });
  return priors;
}

test("the dashboard, map and tables fill from the feed and a race opens with its counties", async ({ page }) => {
  await stubFeed(page);
  await page.clock.setFixedTime(ELECTION_NIGHT);
  await page.goto("/results");
  await expect(page.getByText(/Latest data \d/)).toBeVisible({ timeout: 60_000 });
  // Every race is reporting; the Senate tile says so and the popular vote is in.
  const senate = page.locator("section", { hasText: "Balance of power" }).locator("h3", { hasText: "Senate" }).locator("..").locator("..");
  await expect(senate).toContainText("35/35 reporting");
  await expect(senate).toContainText("Popular vote");
  // Latest updates lists the races whose count moved.
  await expect(page.locator("section", { hasText: "Latest updates" }).locator("li").first()).toContainText(/[DR]\+\d/);
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
  await expect(detail.locator("table tbody tr").first()).toContainText("50%");
  expect(page.url()).toMatch(/#house-/);
  // The race opens as its own page; its back button returns to the results.
  await page.getByRole("button", { name: "← All results" }).click();
  await expect(page.getByRole("heading", { name: "2026 Results" })).toBeVisible();
  expect(page.url()).not.toMatch(/#/);
});

test("the county table's swing view compares each seat with its own last election", async ({ page }) => {
  const priors = await stubFeed(page);
  await page.clock.setFixedTime(ELECTION_NIGHT);
  const open = async (hash: string) => {
    await page.goto(`/results#${hash}`);
    await page.getByRole("button", { name: "Swing", exact: true }).last().click();
    return page.locator("#race-detail table").last();
  };
  const heads = (t: Awaited<ReturnType<typeof open>>) => t.locator("thead th:visible").allInnerTexts();
  // Nebraska's Ricketts seat was last up in the 2024 special, not Fischer's regular race that year.
  let table = await open("senate-NE-2");
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
  table = await open("senate-GA");
  await expect(table.locator("thead")).toContainText(/vs '20/i);
  await expect(table.locator("thead")).toContainText(/vs Sen '22/i);
  // Ohio's special is for the Vance seat, last up in 2022; 2024's race was the state's other seat.
  table = await open("senate-OH-2");
  await expect(table.locator("thead")).toContainText(/vs '22/i);
  await expect(table.locator("thead")).toContainText(/vs Sen '24/i);
  table = await open("governor-NH");
  await expect(table.locator("thead")).toContainText(/vs '24/i);
  await expect(table.locator("thead")).not.toContainText(/vs Sen/i);
  // A district inside one county is the district's own presidential result, not an estimate.
  table = await open("house-1707");
  await expect(table.locator("thead")).toContainText(/vs '24/i);
  await expect(table.locator("tbody tr").first()).toContainText(/[DR]\+\d/);
  await expect(table.locator("tbody tr").first()).not.toContainText("~");
  // A split county in a larger district is marked as one; then back to the results.
  const split = priors.find((p) => p.office === "house" && (p.counties as { pres24Est?: boolean }[]).some((c) => c.pres24Est))!;
  table = await open(`house-${split.id}`);
  await expect(table.locator("tbody")).toContainText("~");
  await table.locator("thead th", { hasText: /pres '24|vs '24/i }).first().click();
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(table.locator("thead")).toContainText("Edge");
});

test("a test-data payload is hidden", async ({ page }) => {
  await stubLocal(page);
  await page.route("https://civicapi.org/api/v2/**", (route) => route.fulfill({ json: { percent_reporting: 90, test_data: true, candidates: [{ name: "A", party: "Democratic", votes: 100, percent: 60 }, { name: "B", party: "Republican", votes: 50, percent: 40 }] } }));
  await page.clock.setFixedTime(ELECTION_NIGHT);
  await page.goto("/results");
  await expect(page.getByText("civicAPI is serving pre-election test data")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("nothing counted yet")).toBeVisible();
});

test("the overview links to the results page", async ({ page }) => {
  await page.goto("/overview");
  await page.getByRole("link", { name: /Election Night Results/ }).click();
  await expect(page).toHaveURL(/\/results$/);
  // Results is reached from the overview only: no tab for it (user, 2026-10-25).
  await expect(page.locator("nav").getByRole("link", { name: "Results" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "2026 Results" })).toBeVisible({ timeout: 30_000 });
});

test("before election night the page reads nothing from civicAPI", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T16:00:00Z"));
  let calls = 0;
  await stubLocal(page);
  await page.route("https://civicapi.org/**", (route) => { calls++; return route.abort(); });
  await page.goto("/results");
  await expect(page.getByText("Live results begin on election night")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Balance of power")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(calls).toBe(0);
});

test("election night shows real results only: no simulated night, no replay control", async ({ page }) => {
  // The replay is switched off for the night (ResultsPage SHOW_REPLAY): even with ?test=1 and a
  // simulated night in the archive, the page neither lists nor replays it.
  await stubFeed(page);
  await page.unroute("**/api/results/archive**");
  await page.route("**/api/results/archive**", (route) => route.fulfill({ json: { snapshots: [{ file: "sim-test/2026-11-04T01-00-00-000Z.json.gz", fetchedAt: "2026-11-04T01:00:00.000Z", set: "sim-test" }] } }));
  await page.clock.setFixedTime(ELECTION_NIGHT);
  await page.goto("/results?test=1");
  await expect(page.getByText(/Latest data \d/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Replay archive")).toHaveCount(0);
  await expect(page.getByText("SIMULATED NIGHT")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview a simulated night" })).toHaveCount(0);
});

test("the map's Swing tab colors counties by swing vs Pres '24 and its cards give that margin", async ({ page, isMobile }) => {
  await stubFeed(page);
  await page.clock.setFixedTime(ELECTION_NIGHT);
  for (const race of ["senate-GA", "house-1707"]) {
    await page.goto(`/results#${race}`);
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
  await stubFeed(page);
  await page.clock.setFixedTime(ELECTION_NIGHT);
  await page.goto("/results");
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
  await stubFeed(page);
  await page.clock.setFixedTime(ELECTION_NIGHT);
  // The widest cases: a long county name, and a special's longer heading.
  for (const race of ["senate-VA-2", "senate-NE-2"]) {
    await page.goto(`/results#${race}`);
    await page.getByRole("button", { name: "Swing", exact: true }).last().click();
    await expect(page.locator("#race-detail table").last().locator("thead")).toContainText(/vs Sen '/i);
    const scroller = page.locator("#race-detail table").last().locator("..");
    expect(await scroller.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("on a 320px phone the page, race table and county table fit without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await stubFeed(page);
  await page.clock.setFixedTime(ELECTION_NIGHT);
  // Anything wider than its box, page-level or inside a scroller (the nav's own tab strip aside).
  const overflow = () => page.evaluate(() => [document.documentElement, ...document.querySelectorAll("main *")]
    .filter((e) => e.scrollWidth > e.clientWidth + 1 && (e === document.documentElement || /(auto|scroll)/.test(getComputedStyle(e).overflowX)))
    .map((e) => `${e.tagName}.${e.className} ${e.clientWidth}/${e.scrollWidth}`));
  await page.goto("/results");
  await expect(page.getByText(/Latest data \d/)).toBeVisible({ timeout: 60_000 });
  expect(await overflow()).toEqual([]);
  await page.goto("/results#senate-GA");
  await expect(page.locator("#race-detail table tbody tr").first()).toContainText("50%", { timeout: 60_000 });
  expect(await overflow()).toEqual([]);
});
