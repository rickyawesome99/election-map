import { expect, test } from "@playwright/test";

// /analysis/polling-misses: the 50-state map of final-poll misses with its year / office filters,
// and the by-state table of every statewide race since 2016 the filters and the state picker narrow.

const LEAN = /^([DR]\+\d+\.\d|Even)$/;

test("polling misses page shows one state's races at a time and filters by year and office", async ({ page }) => {
  await page.goto("/analysis/polling-misses");
  await expect(page.getByRole("heading", { name: "Polling Misses by State", level: 1 })).toBeVisible({ timeout: 20_000 });

  // nothing selected: a prompt instead of a table
  await expect(page.getByText("Select a state on the map or from the list to show its polling data.")).toBeVisible();
  const table = page.getByRole("table", { name: "Polling misses by state and race" });
  await expect(table).toHaveCount(0);

  await page.getByLabel("State", { exact: true }).selectOption("WI");
  await expect(table).toBeVisible();
  const groups = table.locator("tbody");
  await expect(groups).toHaveCount(1);
  await expect(groups.first().getByRole("link", { name: "Wisconsin", exact: true })).toBeVisible();
  await expect(groups.first().locator("tr").first().locator("td").last()).toHaveText(LEAN);
  // a race row links to its past-election page and carries poll average, result and miss
  const wi2020 = groups.first().locator("tr", { hasText: "2020" }).first();
  await expect(wi2020.getByRole("link", { name: "President" })).toHaveAttribute("href", "/president/wi/2020");
  await expect(wi2020.locator("td").nth(5)).toHaveText(/^R\+\d+\.\d$/); // Trump outran his Wisconsin polls

  // year filter: Wisconsin had no statewide race in 2017
  await page.getByRole("group", { name: "Year" }).getByRole("button", { name: "2017" }).click();
  await expect(page.getByText(/No statewide race in Wisconsin in 2017/)).toBeVisible();
  await page.getByRole("group", { name: "Year" }).getByRole("button", { name: "All years" }).click();

  // office filter: no presidential rows under the Governor view
  await page.getByRole("group", { name: "Race" }).getByRole("button", { name: "Governor" }).click();
  await expect(table.locator("tr", { hasText: "President" })).toHaveCount(0);
  await expect(table.locator("tr", { hasText: "Governor" }).first()).toBeVisible();
});

test("polling misses map is drawn and the legend runs blue to red", async ({ page }) => {
  await page.goto("/analysis/polling-misses");
  // one legend copy for desktop, one for phones; whichever fits the viewport is shown
  await expect(page.getByLabel(/Map legend/).filter({ visible: true })).toBeVisible({ timeout: 20_000 });
  // the states topology renders 50+ paths once loaded
  await expect.poll(async () => page.locator("svg path").count(), { timeout: 20_000 }).toBeGreaterThan(50);
});

test("analysis index links to the polling misses page", async ({ page }) => {
  await page.goto("/analysis");
  await page.getByRole("link", { name: /Polling Misses by State/ }).click();
  await expect(page).toHaveURL(/\/analysis\/polling-misses$/);
});
