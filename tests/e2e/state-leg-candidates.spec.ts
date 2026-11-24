import { expect, test } from "@playwright/test";

// Every state legislative candidate 2016–2026 has a page at /candidates/[name]-[st], beside the
// federal candidates; a person with both records gets one page.

test("a state legislator's page lists their generals and links back to the district", async ({ page }) => {
  await page.goto("/candidates/bill-roemer-oh");
  await expect(page.getByRole("heading", { name: "Bill Roemer" })).toBeVisible();
  await expect(page.getByText("State Representative · Ohio HD 31")).toBeVisible();
  await expect(page.getByText("4W–0L")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ohio State House · HD 38/ }).first()).toBeVisible();
  await expect(page.getByText("2012 map").first()).toBeVisible();
  // Opponents link to their own pages.
  await page.getByRole("link", { name: "Rita Darrow" }).click();
  await expect(page).toHaveURL(/\/candidates\/rita-darrow-oh$/);
  await expect(page.getByText("Lost").first()).toBeVisible();
});

test("a 2026 candidate's race is a row of the electoral history with its result, and spellings resolve to one page", async ({ page }) => {
  await page.goto("/candidates/j-noah-spinner-oh");
  // The counted 2026 race sits in the history, not in a "2026 Race" section with a projection.
  await expect(page.getByRole("heading", { name: "Electoral History" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2026 Race" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Ohio State House · HD 31/ })).toBeVisible();
  await expect(page.getByText(/^(Won|Lost)$/).first()).toBeVisible();
  await expect(page.getByText(/\d+W.\d+L/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Mike Kahoe" })).toBeVisible();

  // "Adam Miller" (2024, MEDSL) and "Adam C. Miller" (Klarner) are one person.
  await page.goto("/candidates/adam-miller-oh");
  await expect(page.getByRole("heading", { name: "Adam C. Miller" })).toBeVisible();
});

test("a state legislator who ran for federal office has one merged page, reachable from both slugs", async ({ page }) => {
  await page.goto("/candidates/josh-turek-ia");
  await expect(page.getByRole("heading", { name: "Josh Turek" })).toBeVisible();
  await expect(page.getByText("Iowa · U.S. Senate")).toBeVisible();
  await expect(page.getByRole("link", { name: /Iowa State House · HD 20/ }).first()).toBeVisible();
  await page.goto("/candidates/josh-turek");
  await expect(page.getByRole("link", { name: /Iowa State House · HD 20/ }).first()).toBeVisible();
});

test("the atlas links candidates to their pages and search finds a legislator", async ({ page }) => {
  await page.goto("/states/oh/legislature/house#hd-31");
  await page.waitForLoadState("networkidle");
  const search = page.getByRole("combobox", { name: "Search states, seats, races, and candidates" });
  const results = page.getByRole("listbox", { name: "Search results" });
  await search.fill("Brigid Kelly");
  // The legislator index is a second, ~3 MB fetch that starts at the third character.
  await expect(results.getByRole("option").first()).toHaveAttribute("href", "/candidates/brigid-kelly-oh", { timeout: 20_000 });
  await search.fill("");

  await page.getByRole("link", { name: "Brigid Kelly" }).first().click();
  await expect(page).toHaveURL(/\/candidates\/brigid-kelly-oh$/);
  await expect(page.getByText("3W–0L")).toBeVisible();
});
