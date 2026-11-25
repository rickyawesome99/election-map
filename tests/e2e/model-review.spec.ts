import { test, expect } from "@playwright/test";

// /analysis/model-review: the final 2026 forecast graded against the results. The scorecard, map
// and race grades follow the saved results file; the reruns are a dated snapshot.

test("model review renders its sections and the graded race table responds", async ({ page }) => {
  await page.goto("/analysis/model-review");
  await expect(page.getByRole("heading", { level: 1, name: "2026 Model Review" })).toBeVisible();
  for (const id of ["summary", "scorecard", "map", "seats", "calls", "environment", "test", "polls", "parts", "field", "changes", "races", "method"]) {
    await expect(page.locator(`section#${id}`)).toHaveCount(1);
  }
  await expect(page.getByRole("img", { name: "Scatter of forecast margin against result margin" })).toBeVisible();

  const races = page.locator("section#races");
  await races.scrollIntoViewIfNeeded();
  const table = races.getByRole("table", { name: "Forecast and result for every race" });
  await expect(table.locator("tbody tr").first()).toBeVisible();
  await races.getByRole("button", { name: "Senate", exact: true }).click();
  await races.getByRole("button", { name: "Missed calls" }).click();
  await expect(table.locator("tbody tr").first()).toContainText("✗");
  await races.getByLabel("Filter races").fill("zzzz");
  await expect(races.getByText("No race matches.")).toBeVisible();
});

test("the analysis hub links to the model review", async ({ page }) => {
  await page.goto("/analysis");
  await page.getByRole("link", { name: /2026 Model Review/ }).click();
  await expect(page).toHaveURL(/\/analysis\/model-review$/);
});
