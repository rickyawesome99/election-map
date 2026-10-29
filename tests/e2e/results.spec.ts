import { expect, test, type Page } from "@playwright/test";

// /results: the election-night page. civicAPI is stubbed with a payload built from the page's own
// priors (so every county matches by FIPS) — the real feed serves randomized test data before
// Nov 3 and live counts after, neither of which a test can assert on.

type Prior = { id: string; civicId: number | null; office: string; label: string; dem: { name: string; party: string }; rep: { name: string; party: string }; counties: { fips: string; name: string; votes: number; margin: number }[] };

// The page reads civicAPI only from 5 PM ET on election day; tests that need the feed run their
// browser clock at 9 PM ET that night.
const ELECTION_NIGHT = new Date("2026-11-04T02:00:00Z");

async function stubFeed(page: Page) {
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
  await expect(page.getByText(/fetched \d/)).toBeVisible({ timeout: 60_000 });
  // Every race is reporting; the Senate tile says so and the popular vote is in.
  const senate = page.locator("section", { hasText: "Balance of power" }).locator("h3", { hasText: "Senate" }).locator("..").locator("..");
  await expect(senate).toContainText("35/35 reporting");
  await expect(senate).toContainText("Popular vote");
  // The race table's rows show a counted margin and a projection.
  const first = page.locator("[data-race-row]").first();
  await expect(first).toContainText(/[DR]\+\d/);
  await first.click();
  const detail = page.locator("#race-detail");
  await expect(page.getByText("Balance of power")).toHaveCount(0);
  await expect(detail).toContainText("Projected final margin");
  await expect(detail).toContainText("counties reporting");
  await expect(detail.locator("table tbody tr").first()).toContainText("50%");
  expect(page.url()).toMatch(/#senate-/);
  // The race opens as its own page; its back button returns to the results.
  await page.getByRole("button", { name: "← All results" }).click();
  await expect(page.getByRole("heading", { name: "2026 Results" })).toBeVisible();
  expect(page.url()).not.toMatch(/#/);
});

test("a test-data payload is hidden", async ({ page }) => {
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

test("the replay control steps through archived snapshots", async ({ page }) => {
  // The archive route is stubbed: two snapshots, the second with more votes in one race.
  const priors = await stubFeed(page);
  const tx = priors.find((p) => p.id === "TX-2")!;
  const snap = (mult: number) => ({ fetchedAt: `2026-11-04T0${mult}:00:00.000Z`, races: { [String(tx.civicId)]: {
    percent_reporting: 40 * mult, test_data: false, candidates: [{ name: tx.dem.name, party: "Democratic", votes: 1000 * mult, percent: 50 }, { name: tx.rep.name, party: "Republican", votes: 900 * mult, percent: 45 }],
    region_results: Object.fromEntries(tx.counties.slice(0, 3).map((c) => [c.fips, { name: c.name, type: "County", fips: c.fips, candidates: [{ name: tx.dem.name, party: "Democratic", votes: 300 * mult }, { name: tx.rep.name, party: "Republican", votes: 300 * mult }] }])),
  } } });
  await page.route("**/api/results/archive**", (route) => {
    const file = new URL(route.request().url()).searchParams.get("file");
    if (!file) return route.fulfill({ json: { snapshots: [{ file: "sim-test/2026-11-04T01-00-00-000Z.json.gz", fetchedAt: "2026-11-04T01:00:00.000Z", set: "sim-test" }, { file: "sim-test/2026-11-04T02-00-00-000Z.json.gz", fetchedAt: "2026-11-04T02:00:00.000Z", set: "sim-test" }] } });
    return route.fulfill({ json: snap(file.includes("T02") ? 2 : 1) });
  });
  await page.clock.setFixedTime(ELECTION_NIGHT);
  await page.goto("/results");
  await expect(page.getByText("Replay archive")).toBeVisible({ timeout: 60_000 });
  await page.getByText("Start from the first snapshot").click();
  await expect(page.getByText(/snapshot from/)).toBeVisible();
  // Only Texas is in the snapshot: the Senate tile shows one race reporting, with the first snapshot's votes.
  const senate = page.locator("section", { hasText: "Balance of power" }).locator("h3", { hasText: "Senate" }).locator("..").locator("..");
  await expect(senate).toContainText("1/35 reporting");
  // One race: Texas's share of votes moves with the snapshot (1,000 D of 1,900, then the same split doubled).
  await expect(senate).toContainText("D 52.6%");
  await page.getByLabel("Next snapshot").click();
  await expect(page.getByText(/2 \/ 2/)).toBeVisible();
  await page.getByRole("button", { name: "Back to live" }).click();
  await expect(page.getByText(/fetched \d/)).toBeVisible({ timeout: 60_000 });
  await expect(senate).toContainText("35/35 reporting");
});

test("before election night the page reads nothing from civicAPI", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T16:00:00Z"));
  let calls = 0;
  await page.route("https://civicapi.org/**", (route) => { calls++; return route.abort(); });
  await page.goto("/results");
  await expect(page.getByText("Live results begin on election night")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Balance of power")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(calls).toBe(0);
});

test("?test=1 previews the stored simulated night without reading civicAPI", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T16:00:00Z"));
  let calls = 0;
  await page.route("https://civicapi.org/**", (route) => { calls++; return route.abort(); });
  await page.route("**/api/results/archive**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/series")) return route.fulfill({ json: { senate: [], governor: [], house: [] } });
    const file = new URL(route.request().url()).searchParams.get("file");
    if (!file) return route.fulfill({ json: { snapshots: [{ file: "sim-test/2026-11-04T01-00-00-000Z.json.gz", fetchedAt: "2026-11-04T01:00:00.000Z", set: "sim-test" }] } });
    return route.fulfill({ json: { fetchedAt: "2026-11-04T01:00:00.000Z", races: {} } });
  });
  await page.goto("/results?test=1");
  await expect(page.getByText("SIMULATED NIGHT")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/1 \/ 1/)).toBeVisible();
  expect(calls).toBe(0);
});

test("without the dev archive the preview replays the published simulated night", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T16:00:00Z"));
  let calls = 0;
  await page.route("https://civicapi.org/**", (route) => { calls++; return route.abort(); });
  // As on the deployed site: the archive routes list nothing.
  await page.route("**/api/results/archive**", (route) => route.fulfill({ json: { snapshots: [] } }));
  await page.goto("/results");
  await page.getByRole("button", { name: "Preview a simulated night" }).click({ timeout: 60_000 });
  await expect(page.getByText("SIMULATED NIGHT")).toBeVisible();
  await page.getByRole("slider", { name: "Snapshot" }).fill("64");
  await expect(page.getByText(/65 \/ 65/)).toBeVisible();
  const senate = page.locator("section", { hasText: "Balance of power" }).locator("h3", { hasText: "Senate" }).locator("..").locator("..");
  await expect(senate).toContainText(/[1-9]\d*\/35 reporting/, { timeout: 30_000 });
  expect(calls).toBe(0);
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
  await expect(page.getByText(/fetched \d/)).toBeVisible({ timeout: 60_000 });
  expect(await overflow()).toEqual([]);
  await page.goto("/results#senate-GA");
  await expect(page.locator("#race-detail table tbody tr").first()).toContainText("50%", { timeout: 60_000 });
  expect(await overflow()).toEqual([]);
});
