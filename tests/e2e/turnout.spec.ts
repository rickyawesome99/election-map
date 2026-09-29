import { expect, test } from "@playwright/test";

// /analysis/turnout: the map with its controls, the state table (office / year pickers, sorting),
// the district table fed by the district slice, and the 2026 estimate with its county split.

test("turnout page shows the national tiles, the map and the state table", async ({ page }) => {
  await page.goto("/analysis/turnout");
  await expect(page.getByRole("heading", { name: "Turnout", level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("2024 President", { exact: true })).toBeVisible();
  await expect(page.getByText("2026 House estimate", { exact: true })).toBeVisible();

  const byState = page.locator("section#by-state");
  await expect(byState.getByRole("heading", { name: "Turnout by state" })).toBeVisible();
  const rows = byState.locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(50); // 50 states + DC + the national row
  // default: 2024 President sorted by rate, highest first
  await expect(rows.nth(1).locator("td").nth(3)).toHaveText(/^\d\d\.\d%$/);
  // switch to House 2022: the unopposed flag appears somewhere
  await byState.getByRole("button", { name: "House", exact: true }).click();
  await byState.getByRole("button", { name: "2022", exact: true }).click();
  await expect(byState.getByText(/unopposed/).first()).toBeVisible();
});

test("turnout page loads the district slice and the 2026 estimate", async ({ page }) => {
  await page.goto("/analysis/turnout");
  const districts = page.locator("section#by-district");
  await expect(districts.getByRole("heading", { name: "Turnout by House district" })).toBeVisible({ timeout: 20_000 });
  const rows = districts.locator("tbody tr");
  await expect.poll(async () => rows.count(), { timeout: 20_000 }).toBeGreaterThan(30);
  await expect(rows.first().locator("td").first()).toHaveText(/^[A-Z]{2}-\d\d/);

  const estimate = page.locator("section#estimate");
  await expect(estimate.getByRole("heading", { name: "2026 turnout estimate" })).toBeVisible();
  await expect(estimate.getByText(/Georgia · Senate/)).toBeVisible();
  const counties = estimate.locator("table").first().locator("tbody tr");
  await expect.poll(async () => counties.count(), { timeout: 20_000 }).toBeGreaterThan(100); // Georgia's 159 counties
  await expect(counties.first()).toContainText("Fulton");
});

test("turnout methodology tab renders its backtest", async ({ page }) => {
  await page.goto("/methodology/turnout");
  await expect(page.getByRole("heading", { name: "2022 predicted from 2018" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("SHRINK_VOTES grid")).toBeVisible();
});
