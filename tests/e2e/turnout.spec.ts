import { expect, test } from "@playwright/test";

// /analysis/turnout: the map with its controls, the state table (office / year pickers, sorting),
// the district table fed by the district slice, and the 2026 estimate with its county split.

test("turnout page shows the national figures, the map and the state table", async ({ page }) => {
  await page.goto("/analysis/turnout");
  await expect(page.getByRole("heading", { name: "Turnout", level: 1 })).toBeVisible({ timeout: 20_000 });
  // the national figures live in the standfirst
  const standfirst = page.locator("header", { has: page.getByRole("heading", { level: 1 }) }).locator("p");
  await expect(standfirst).toContainText(/In 2024, \d+\.\d% of eligible citizens voted for president/);
  await expect(standfirst).toContainText(/For 2026 we expect about \d+ million House votes/);

  const byState = page.locator("section#by-state");
  await expect(byState.getByRole("heading", { name: "Turnout by state" })).toBeVisible();
  const rows = byState.locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(50); // 50 states + DC + the national row
  // default: 2024 President sorted by rate, highest first
  await expect(rows.nth(1).locator("td").nth(3)).toHaveText(/^\d\d\.\d%$/);
  // switch to House 2022 (the office and year pickers sit on the map and drive the table):
  // the unopposed flag appears somewhere. Retried because a change sent before hydration is lost.
  const yearPicker = page.getByLabel("Year", { exact: true });
  await expect(async () => {
    await page.getByLabel("Race", { exact: true }).selectOption("house");
    await expect(yearPicker.locator("option", { hasText: "2022" })).toHaveCount(1, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await yearPicker.selectOption("2022");
  await expect(byState.getByText(/unopposed/).first()).toBeVisible();
});

test("turnout page loads the district slice and the 2026 estimate", async ({ page }) => {
  await page.goto("/analysis/turnout");
  // The district table is the Districts level of the map section. Retried because a click sent
  // before hydration is lost.
  const districts = page.locator("section#by-district");
  await expect(async () => {
    await page.getByRole("button", { name: "Districts", exact: true }).click();
    await expect(districts).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(districts.getByRole("heading", { name: "Turnout by House district" })).toBeVisible({ timeout: 20_000 });
  const rows = districts.locator("tbody tr");
  await expect.poll(async () => rows.count(), { timeout: 20_000 }).toBeGreaterThan(30);
  await expect(rows.first().locator("td").first()).toHaveText(/^[A-Z]{2}-\d\d/);

  // The 2026 estimate is the "2026 estimate" metric, scoped to the map's office picker.
  await page.getByLabel("Metric", { exact: true }).selectOption({ label: "2026 estimate" });
  await page.getByLabel("Race", { exact: true }).selectOption("senate");
  const estimate = page.locator("section#estimate");
  await expect(estimate.getByRole("heading", { name: "2026 turnout estimate" })).toBeVisible();
  // The county split is the "By county" view: Georgia's Senate race.
  await estimate.getByRole("button", { name: "By county", exact: true }).click();
  await estimate.getByLabel("State", { exact: true }).selectOption("GA");
  const counties = estimate.locator("table").first().locator("tbody tr");
  await expect(counties.first()).toContainText("Fulton", { timeout: 20_000 });
  // The table opens on the top 25 counties; "Show all" unfolds the rest.
  await estimate.getByRole("button", { name: /Show all \d+ counties/ }).click();
  await expect.poll(async () => counties.count(), { timeout: 20_000 }).toBeGreaterThan(100); // Georgia's 159 counties
});

test("turnout methodology tab renders its backtest", async ({ page }) => {
  await page.goto("/analysis/internal-methodology/turnout");
  await expect(page.getByRole("heading", { name: "2022 predicted from 2018" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("SHRINK_VOTES grid")).toBeVisible();
});

test("turnout page shows the implied generic ballot", async ({ page }) => {
  await page.goto("/analysis/turnout");
  const section = page.locator("section#implied-ballot");
  await expect(section.getByRole("heading", { name: "Implied generic ballot" })).toBeVisible({ timeout: 20_000 });
  await expect(section.getByText("All three combined")).toBeVisible();
  await expect(section.getByText(/^(D|R)\+\d+\.\d$|^EVEN$/).first()).toBeVisible();
});

test("race pages show the projected county map", async ({ page }) => {
  await page.goto("/senate/ga");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Projected County Results" }) });
  await expect(section).toBeVisible({ timeout: 20_000 });
  await expect(section.getByText(/estimated votes/)).toBeVisible();
  await expect(section.getByText(/How this is built/)).toBeVisible();

  await page.goto("/house/oh-12");
  const tabs = page.getByRole("tablist", { name: "District map view" });
  await expect(tabs.getByRole("tab", { name: "2026 projection" })).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
  await expect(page.getByText(/Projected 2026 result by county/)).toBeVisible();
  await tabs.getByRole("tab", { name: "District lines" }).click();
  await expect(page.getByText(/Projected 2026 result by county/)).toHaveCount(0);
});
