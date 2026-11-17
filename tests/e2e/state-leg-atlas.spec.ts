import { expect, test } from "@playwright/test";

// Ohio House District 31 is the atlas's reference district: it was a Cincinnati seat on the 2012
// map, moved to Summit County in 2022 and kept only 39% of its population in the 2024 redraw, so
// every section of the page has something real to show.
test("the chamber atlas opens a district from the hash and from the switcher", async ({ page }) => {
  await page.goto("/states/oh/legislature/house#hd-31");
  await expect(page.getByRole("heading", { name: "Ohio Legislature" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "State House District 31" })).toBeVisible();
  await expect(page.getByText("Bill Roemer", { exact: true }).first()).toBeVisible();

  // Electoral history carries named candidates and the lines each race ran on.
  await expect(page.getByText("Brigid Kelly").first()).toBeVisible();
  await expect(page.getByText("2012 map").first()).toBeVisible();
  // Redistricting history describes the 2022 rebuild.
  await expect(page.getByText(/none of its population was in the 2012 HD-31/)).toBeVisible();

  // The switcher (select + locator map) steps to another district: hash and detail follow.
  const pick = page.getByLabel("Choose a district").locator("visible=true").first(); // two in the page, one shown per screen size
  await expect(pick.locator("option:checked")).toHaveText(/^HD 31 ·/);
  await pick.selectOption({ index: 31 }); // HD 32
  await expect(page).toHaveURL(/#hd-32$/);
  await expect(page.getByRole("heading", { name: "State House District 32" })).toBeVisible();
  await expect(pick.locator("option:checked")).toHaveText(/^HD 32 ·/);
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
  // The chamber header carries the 2026 status; the district hero its projected margin, beside the
  // switcher's locator map.
  await expect(page.getByText("Up in 2026").first()).toBeVisible();
  await expect(page.getByText("= Projected margin")).toBeVisible();
  await expect(page.getByRole("img", { name: "Map of House districts" })).toBeVisible();

  await page.goto("/legislatures");
  await expect(page.getByRole("heading", { name: "State Legislatures" })).toBeVisible();
  const ohio = page.locator("table tbody tr", { hasText: "Ohio" }).filter({ hasText: "House" }).first();
  await expect(ohio).toContainText("99");
  // Phones list the chambers instead of the table; either way a visible Ohio House link exists.
  await page.locator('a[href="/states/oh/legislature/house"]:visible').first().click();
  await expect(page).toHaveURL(/\/states\/oh\/legislature\/house$/);
  // Since the election the chamber header runs from the pre-election composition to the 2026
  // results, with the adjusted (imputed-seat) margin beside each; the projection is a map view.
  await expect(page.getByText(/Now · as of/).first()).toBeVisible();
  await expect(page.getByText("2026 results").first()).toBeVisible();
  await expect(page.getByText("Adjusted", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: "2026 projection" })).toBeVisible();
});
