import { expect, test } from "@playwright/test";

// One page per past Senate/Governor election, nested under the seat (/senate/pa2/2022).
// The page is built from the forecast data's pastResults + the county files + the WAR table,
// so these checks read real figures from the rendered page.

test("Pennsylvania 2022 Senate election page shows the result, map and post-analysis", async ({ page }) => {
  await page.goto("/senate/pa2/2022");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Fetterman");
  await expect(page.getByText("2,751,012")).toBeVisible();
  await expect(page.getByText("2,487,260")).toBeVisible();
  await expect(page.getByText("TPL expected margin")).toBeVisible();
  await expect(page.getByText("Polls missed by")).toBeVisible();
  // 67 counties drawn.
  await expect(page.locator("path.rsm-geography")).toHaveCount(67, { timeout: 20_000 });
  // The seat's other elections are one click away.
  await expect(page.locator('nav[aria-label="Other elections for this seat"] a', { hasText: "2016" })).toHaveAttribute("href", "/senate/pa2/2016");
});

test("Georgia 2022 Senate runoff is labelled and scores no polling error", async ({ page }) => {
  await page.goto("/senate/ga2/2022");
  await expect(page.getByText(/Runoff, December 6, 2022/)).toBeVisible();
  await expect(page.getByText("Late polls, first round")).toBeVisible();
});

test("Georgia 2020 special election page labels the special and the runoff date", async ({ page }) => {
  await page.goto("/senate/ga2/2020");
  await expect(page.getByText(/Special election · Runoff, January 5, 2021/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Warnock");
});

test("Governor election page renders and unknown years 404", async ({ page }) => {
  await page.goto("/governor/pa/2022");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Shapiro");
  const missing = await page.goto("/governor/pa/2021");
  expect(missing?.status()).toBe(404);
});

test("presidential state pages render with electoral votes, and Maine lists its district votes", async ({ page }) => {
  await page.goto("/president/pa/2020");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Biden");
  await expect(page.getByText(/20 electoral votes/).first()).toBeVisible();
  await expect(page.locator("path.rsm-geography")).toHaveCount(67, { timeout: 20_000 });
  await expect(page.getByText("Polls missed by")).toBeVisible();
  await page.goto("/president/me/2020");
  await expect(page.getByText(/ME-02: R\+/)).toBeVisible();
  const missing = await page.goto("/president/pa/2012");
  expect(missing?.status()).toBe(404);
});

test("House election pages draw the district's counties with shared counties hatched", async ({ page }) => {
  await page.goto("/house/pa-07/2022");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Wild");
  await expect(page.getByText(/on the 2022 map/)).toBeVisible();
  // The map is plain SVG: the district's pieces are painted, other districts' shares hatched.
  await expect(page.locator("svg pattern")).toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator("svg path[fill^='url(#hatch']").first()).toBeVisible();
  const missing = await page.goto("/house/pa-07/2021");
  expect(missing?.status()).toBe(404);
});

test("seat page ledger rows link to the election pages", async ({ page }) => {
  await page.goto("/senate/pa2");
  const details = page.getByRole("link", { name: "2022 election details" });
  await expect(details).toHaveAttribute("href", "/senate/pa2/2022");
});
