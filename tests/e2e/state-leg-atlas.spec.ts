import { expect, test } from "@playwright/test";

// Ohio House District 31 is the atlas's reference district: it was a Cincinnati seat on the 2012
// map, moved to Summit County in 2022 and kept only 39% of its population in the 2024 redraw, so
// every section of the page has something real to show.
test("the chamber atlas opens a district from the hash and from a box", async ({ page }) => {
  await page.goto("/states/oh/legislature/house#hd-31");
  await expect(page.getByRole("heading", { name: "Ohio State House" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "State House District 31" })).toBeVisible();
  await expect(page.getByText("Bill Roemer (R)").first()).toBeVisible();

  // Electoral history carries named candidates and the lines each race ran on.
  await expect(page.getByText("Brigid Kelly").first()).toBeVisible();
  await expect(page.getByText("2016–2020 map").first()).toBeVisible();
  // Redistricting history describes the 2022 rebuild.
  await expect(page.getByText(/none of its population was in the 2016–2020 HD-31/)).toBeVisible();

  // Clicking another box changes the hash and the detail.
  await page.getByRole("option", { name: "31", exact: true }).waitFor();
  await page.getByRole("option", { name: "32", exact: true }).click();
  await expect(page).toHaveURL(/#hd-32$/);
  await expect(page.getByRole("heading", { name: "State House District 32" })).toBeVisible();

  // Color modes and filters are present and change the selector's state.
  await page.getByRole("tab", { name: "2024 President" }).click();
  await expect(page.getByText(/Color is the 2024 presidential margin/)).toBeVisible();
  await page.getByRole("button", { name: "Competitive" }).click();
  await expect(page.getByText(/of 99 districts/)).toBeVisible();
});

test("the state page's legislature section links into the atlas and Nebraska has one chamber", async ({ page }) => {
  // The legislature overview folded into the state page; its old URL forwards there.
  await page.goto("/states/oh/legislature");
  await expect(page).toHaveURL(/\/states\/oh#legislature$/);
  await page.getByRole("link", { name: /^Explore 99 districts/ }).click();
  await expect(page).toHaveURL(/\/states\/oh\/legislature\/house$/);
  await page.goto("/states/oh/legislature#senate");
  await expect(page).toHaveURL(/\/states\/oh\/legislature\/senate$/);

  const missing = await page.goto("/states/ne/legislature/house");
  expect(missing?.status()).toBe(404);
  await page.goto("/states/ne/legislature/senate");
  await expect(page.getByRole("heading", { name: "Nebraska Legislature" })).toBeVisible();
});

test("the 2026 outlook and the State Legislatures board agree on a chamber", async ({ page }) => {
  await page.goto("/states/oh/legislature/house#hd-31");
  await expect(page.getByRole("heading", { name: "2026 outlook" })).toBeVisible();
  await expect(page.getByText(/P\(Democratic\)/)).toBeVisible();
  await expect(page.getByText("= Projected margin")).toBeVisible();
  // The projection is the default colour mode where the chamber is on the ballot.
  await expect(page.getByRole("tab", { name: "2026 projection", selected: true })).toBeVisible();
  await expect(page.getByText(/Color is the projected 2026 margin/)).toBeVisible();

  await page.goto("/legislatures");
  await expect(page.getByRole("heading", { name: "State Legislatures" })).toBeVisible();
  const ohio = page.locator("table tbody tr", { hasText: "Ohio" }).filter({ hasText: "House" }).first();
  await expect(ohio).toContainText("99");
  await ohio.getByRole("link", { name: "Ohio" }).click();
  await expect(page).toHaveURL(/\/states\/oh\/legislature\/house$/);
  await expect(page.getByText("2026 projection").first()).toBeVisible();
});
