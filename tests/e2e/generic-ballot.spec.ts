import { expect, test } from "@playwright/test";

// /analysis/generic-ballot: the generic ballot against the House vote on three bases, the 50-state
// House-vote map with its year / basis controls, and the 2026 chain from poll average to House vote.

const MARGIN = /^([DR]\+\d+\.\d|EVEN)$/;

test("generic ballot page shows the yearly table, the state map and the 2026 chain", async ({ page }) => {
  await page.goto("/analysis/generic-ballot");
  await expect(page.getByRole("heading", { name: "Generic Ballot vs Popular Vote", level: 1 })).toBeVisible({ timeout: 20_000 });

  // one row per election year, every margin formatted
  const years = page.getByRole("table", { name: "Generic ballot and House vote by year" });
  await expect(years.locator("tbody tr", { hasText: "2024" })).toHaveCount(1);
  await expect(years.locator("tbody tr", { hasText: "2024" }).locator("td").nth(3)).toHaveText(MARGIN);

  // the map opens on the 2026 forecast; switching to 2024 and the contested basis changes the table heading
  const byState = page.getByRole("table", { name: "House popular vote by state" });
  await expect(page.getByRole("heading", { name: /By state, 2026 forecast/ })).toBeVisible();
  await page.getByRole("group", { name: "Year" }).getByRole("button", { name: "2024" }).click();
  await expect(page.getByRole("heading", { name: /By state, 2024/ })).toBeVisible();
  await page.getByRole("group", { name: "Basis" }).getByRole("button", { name: "Contested seats only" }).click();
  // Massachusetts dropped five seats in 2024
  const ma = byState.locator("tbody tr", { hasText: "Massachusetts" });
  await expect(ma.locator("td").nth(2)).toHaveText("4");
  await expect(ma.locator("td").last()).toContainText("MA-03 (no Republican)");

  // the 2026 chain table ends with history's translation
  const chain = page.getByRole("table", { name: /chain from generic ballot to House vote/ });
  await expect(chain.locator("tbody tr")).toHaveCount(7);
  await expect(chain.locator("tbody tr").first().locator("td").last()).toHaveText(MARGIN);
});

test("generic ballot map is drawn and the analysis index links to the page", async ({ page }) => {
  await page.goto("/analysis/generic-ballot");
  await expect(page.getByLabel(/Map legend/).filter({ visible: true })).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => page.locator("svg path").count(), { timeout: 20_000 }).toBeGreaterThan(50);
  await page.goto("/analysis");
  await page.getByRole("link", { name: /Generic Ballot vs Popular Vote/ }).click();
  await expect(page).toHaveURL(/\/analysis\/generic-ballot$/);
});
