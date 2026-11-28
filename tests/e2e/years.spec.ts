import { expect, test } from "@playwright/test";

// /years: each election year as a whole. The national environment, one summary per office on the
// ballot (seats before and after, a map, the flips), then the Overview's state boxes; the title and
// year switcher stay mounted while the year under them changes.

const MARGIN = /^([DR]\+\d+\.\d|Even)$/;

test("a midterm year shows its environment, its four offices and the state boxes", async ({ page }) => {
  await page.goto("/years/2018");
  await expect(page.getByRole("heading", { name: "2018 Elections", level: 1 })).toBeVisible({ timeout: 30_000 });

  const env = page.locator("#environment");
  await expect(env.getByText("Blended national vote")).toBeVisible();
  await expect(env.getByText("Trump approval")).toBeVisible();
  await expect(env.getByText("43.5% approve")).toBeVisible();
  await expect(env.getByText("63% of blend")).toBeVisible();
  // House, Senate, governor and legislatures voted; no president.
  await expect(env.getByText("President", { exact: true })).toHaveCount(0);

  await expect(page.locator("#president")).toHaveCount(0);
  await expect(page.locator("#house")).toContainText("Democrats gained 41 seats and won the House, 235–199.");
  await expect(page.locator("#senate")).toContainText("Republicans gained 2 seats and kept the Senate, 53–47.");
  await expect(page.locator("#governor")).toContainText("Democrats gained 7 governorships");
  await expect(page.locator("#legislature")).toContainText("chambers changed hands");
  await expect(page.locator("#house").getByText("As cast").locator("xpath=following-sibling::*[1]")).toHaveText(MARGIN);

  // the state boxes at the foot open a state's profile on the hash
  await page.locator("#states").getByRole("link", { name: /^PA · Pennsylvania/ }).click();
  await expect(page).toHaveURL(/\/years\/2018#PA$/);
  await expect(page.locator("#states").getByRole("link", { name: "Open the Pennsylvania state page" })).toBeVisible();
});

test("the switcher steps through years, odd ones included, without leaving the page", async ({ page }) => {
  await page.goto("/years/2018");
  await expect(page.getByRole("heading", { name: "2018 Elections", level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("navigation", { name: "Election year" }).getByRole("button", { name: "Previous: 2017" }).click();
  await expect(page).toHaveURL(/\/years\/2017$/);
  await expect(page.getByRole("heading", { name: "2017 Elections", level: 1 })).toBeVisible({ timeout: 30_000 });
  // An off year: governors and legislatures only, and a box for each state that voted.
  await expect(page.locator("#house")).toHaveCount(0);
  await expect(page.locator("#governor")).toContainText("Democrats gained 1 governorship");
  await expect(page.locator("#states").getByRole("navigation", { name: "States" }).getByRole("link")).toHaveCount(2);

  await page.getByRole("navigation", { name: "Election year" }).getByRole("button", { name: "2024", exact: true }).click();
  await expect(page).toHaveURL(/\/years\/2024$/);
  await expect(page.locator("#president")).toContainText("Donald Trump defeated Kamala Harris, 312–226 in electoral votes");
});
