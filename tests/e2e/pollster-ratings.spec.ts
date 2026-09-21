import { expect, test } from "@playwright/test";

// /analysis/pollsters: the ratings table (filter, search, sort, expandable record), the regional
// grid and the current-cycle house effects, plus the grade and house-effect columns the race
// pages' polls table takes from the same data.

const GRADE = /^(A\+|A|A-|B\+|B|B-|C\+|C|C-|D|F)$/;

test("pollster ratings page lists graded pollsters and opens a record", async ({ page }) => {
  await page.goto("/analysis/pollsters");
  await expect(page.getByRole("heading", { name: "Pollster Ratings", level: 1 })).toBeVisible({ timeout: 20_000 });

  const ratings = page.locator("section", { has: page.getByRole("heading", { name: "Ratings", exact: true }) });
  const rows = ratings.locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(100);
  // default view is graded pollsters, best first: every row carries a letter grade
  await expect(rows.first().locator("td").first()).toHaveText(GRADE);

  await ratings.getByRole("searchbox", { name: "Find a pollster" }).fill("Emerson");
  await expect(rows).toHaveCount(1);
  await ratings.getByRole("button", { name: "Emerson College", exact: true }).click();
  await expect(ratings.getByText("By cycle", { exact: true })).toBeVisible();
  await expect(ratings.getByText("By region", { exact: true })).toBeVisible();

  // unrated pollsters only show outside the default scope
  await ratings.getByRole("searchbox", { name: "Find a pollster" }).fill("");
  await ratings.getByRole("button", { name: "Polling in 2026" }).click();
  await expect(ratings.getByText("NR", { exact: true }).first()).toBeVisible();
});

test("pollster ratings page has the regional grid and this cycle's house effects", async ({ page }) => {
  await page.goto("/analysis/pollsters");
  const regional = page.locator("section", { has: page.getByRole("heading", { name: "By Region" }) });
  for (const region of ["National", "Northeast", "Rust Belt", "Sun Belt", "South", "Plains & Mountain", "Pacific"])
    await expect(regional.getByRole("columnheader", { name: region, exact: true })).toBeVisible({ timeout: 20_000 });
  const effects = page.getByRole("table", { name: /house effects by pollster/ }).getByRole("row");
  expect(await effects.count()).toBeGreaterThan(10);
  await expect(effects.first()).toContainText(/[DR]\+\d+\.\d|Even/);
});

test("analysis index links to the pollster ratings", async ({ page }) => {
  await page.goto("/analysis");
  await page.getByRole("link", { name: /Pollster Ratings/ }).click();
  await expect(page).toHaveURL(/\/analysis\/pollsters$/);
});

test("race polls table shows the pollster grade and the house-effect adjustment", async ({ page }) => {
  await page.goto("/senate/nh");
  const table = page.locator("table", { has: page.getByRole("columnheader", { name: "House effect" }) });
  await expect(table).toBeVisible({ timeout: 20_000 });
  await expect(table.getByRole("columnheader", { name: "Grade" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Adjusted" })).toBeVisible();
  await expect(table.locator("tbody tr").first().locator("td").nth(1)).toHaveText(/^(A\+|A|A-|B\+|B|B-|C\+|C|C-|D|F|NR)$/);
});
