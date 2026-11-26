import { expect, test, type Page } from "@playwright/test";

const RACE_PAGE = /\/senate\/[a-z]{2}\d?$/;

// A mouse click on a forecast-map state goes straight to its race page; a tap (phones and tablets)
// opens the preview card with a "Race page →" link instead. Presses walk the interactive features
// until one of those has happened, since some bounding-box points fall outside irregular shapes.
async function openFirstInteractiveMapFeature(page: import("@playwright/test").Page, projectName: string) {
  const mobile = projectName.includes("mobile");
  const geographies = page.locator("path.rsm-geography");
  await expect(geographies.first()).toBeVisible();
  const count = await geographies.count();

  for (let index = 0; index < count; index += 1) {
    const geography = geographies.nth(index);
    const box = await geography.boundingBox().catch(() => null);
    if (!box || box.width < 8 || box.height < 8) continue;
    const fill = await geography.evaluate((element) => getComputedStyle(element).fill).catch(() => "");
    if (fill === "rgb(200, 205, 211)") continue;

    for (const [xRatio, yRatio] of [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]]) {
      const x = box.x + box.width * xRatio;
      const y = box.y + box.height * yRatio;
      if (mobile) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      try {
        if (mobile) await expect(page.getByRole("link", { name: "Race page →" }).first()).toBeVisible({ timeout: 250 });
        else await expect(page).toHaveURL(RACE_PAGE, { timeout: 500 });
        return;
      } catch {
        // Try the next point or feature.
      }
    }
  }
  throw new Error("no forecast-map feature responded to a press");
}

async function expectRaceOpened(page: import("@playwright/test").Page, projectName: string) {
  if (projectName.includes("mobile")) {
    const moreInfo = page.getByRole("link", { name: "Race page →" }).first();
    await expect(moreInfo).toBeVisible();
    await expect(moreInfo).toHaveAttribute("href", /^\/senate\/[a-z]{2}\d?$/);
  } else {
    await expect(page).toHaveURL(RACE_PAGE);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("U.S. Senate");
  }
}

// The Forecast tab has no chamber title since 2026-11-17 (user: "the tab says which chamber it is"):
// the chamber tabs above the race list mark the open one with aria-current.
const chamberTab = (page: Page, label: "House" | "Senate" | "Governor") =>
  page.locator("nav button[aria-current]").filter({ hasText: new RegExp(`^${label}$`) });
async function expectChamber(page: Page, label: "House" | "Senate" | "Governor") {
  await expect(chamberTab(page, label)).toHaveAttribute("aria-current", "true");
}

test("top-level tabs keep the URL and visible page in sync", async ({ page }) => {
  await page.goto("/overview");

  await page.getByRole("link", { name: "Analysis", exact: true }).click();
  await expect(page).toHaveURL(/\/analysis$/);
  await page.getByRole("link", { name: /Current Seat Delegation/ }).click();
  await expect(page).toHaveURL(/\/analysis\/delegation$/);
  await expect(page.getByRole("heading", { name: "Current Seat Delegation" })).toBeVisible();

  await page.getByRole("link", { name: "TPL" }).click();
  await expect(page).toHaveURL(/\/model$/);
  await expect(page.getByRole("heading", { name: "True Partisan Lean", level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Forecast", exact: true }).click();
  await expect(page).toHaveURL(/\/forecast(\?chamber=senate)?$/);
  await expectChamber(page, "Senate");
});

test("forecast tab returns to the last selected chamber after visiting analysis", async ({ page }) => {
  await page.goto("/forecast?chamber=senate");
  await expectChamber(page, "Senate");

  await chamberTab(page, "Governor").click();
  await expect(page).toHaveURL(/\/forecast(\?chamber=governor)?$/);
  await expectChamber(page, "Governor");

  await page.getByRole("link", { name: "Analysis" }).click();
  await expect(page).toHaveURL(/\/analysis$/);

  await page.getByRole("link", { name: "Forecast", exact: true }).click();
  await expect(page).toHaveURL(/\/forecast(\?chamber=governor)?$/);
  await expectChamber(page, "Governor");
});

test("a forecast-map state opens its race page on click, its preview card on tap", async ({ page }, testInfo) => {
  await page.goto("/forecast?chamber=senate");
  await expectChamber(page, "Senate");
  await openFirstInteractiveMapFeature(page, testInfo.project.name);
  await expectRaceOpened(page, testInfo.project.name);
});

test("race table links render the destination page on the first click", async ({ page }) => {
  await page.goto("/forecast?chamber=senate");
  await expectChamber(page, "Senate");

  await page.getByRole("link", { name: "Alabama" }).first().click();
  await expect(page).toHaveURL(/\/senate\/al$/);
  await expect(page.getByRole("link", { name: "Alabama" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alabama U.S. Senate", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2026 Election", exact: true })).toBeVisible();
});

test("forecast buttons remount a clickable map", async ({ page }, testInfo) => {
  await page.goto("/forecast?chamber=senate");
  await expectChamber(page, "Senate");

  await chamberTab(page, "House").click();
  await expect(page).toHaveURL(/\/forecast(\?chamber=house)?$/);
  await expectChamber(page, "House");

  await chamberTab(page, "Senate").click();
  await expect(page).toHaveURL(/\/forecast(\?chamber=senate)?$/);
  await expectChamber(page, "Senate");
  await openFirstInteractiveMapFeature(page, testInfo.project.name);
  await expectRaceOpened(page, testInfo.project.name);
});

test("analysis links render on the first click", async ({ page }) => {
  await page.goto("/analysis");
  await page.getByRole("link", { name: "OH-31" }).click();
  await expect(page).toHaveURL(/\/analysis\/districts\/oh-hd-31$/);
  await expect(page.getByRole("heading", { name: "House District 31" })).toBeVisible();
});

// /house, /senate and /governor are chamber pages since 2026-11-25 (the forecast moved to /forecast);
// the Chambers tab opens a menu of the four chamber pages, built like the States tab.
test("the Chambers menu opens each chamber page", async ({ page }) => {
  await page.goto("/overview");
  for (const [label, url, title] of [["House", /\/house$/, "U.S. House"], ["Senate", /\/senate$/, "U.S. Senate"], ["Governor", /\/governor$/, "Governors"], ["Legislatures", /\/legislatures$/, "State Legislatures"]] as const) {
    await page.getByRole("button", { name: "Chambers" }).click();
    await page.getByRole("dialog", { name: "Choose a chamber" }).getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Control map" })).toBeVisible();
  }
});

test("a chamber page lists every seat and filters them", async ({ page }) => {
  await page.goto("/senate");
  await expect(page.locator("tbody tr")).toHaveCount(100);
  await page.getByRole("textbox", { name: "Filter seats" }).fill("Ohio");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("link", { name: "Ohio (special)" }).click();
  await expect(page).toHaveURL(/\/senate\/oh2$/);
});
