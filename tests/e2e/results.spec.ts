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
