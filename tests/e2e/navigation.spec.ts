import { expect, test } from "@playwright/test";

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
  await expect(page).toHaveURL(/\/senate$/);
  await expect(page.getByRole("heading", { name: "U.S. Senate" })).toBeVisible();
});

test("forecast tab returns to the last selected chamber after visiting analysis", async ({ page }) => {
  await page.goto("/senate");
  await expect(page.getByRole("heading", { name: "U.S. Senate" })).toBeVisible();

  await page.getByRole("button", { name: "Governor" }).click();
  await expect(page).toHaveURL(/\/governor$/);
  await expect(page.getByRole("heading", { name: "Governors" })).toBeVisible();

  await page.getByRole("link", { name: "Analysis" }).click();
  await expect(page).toHaveURL(/\/analysis$/);

  await page.getByRole("link", { name: "Forecast", exact: true }).click();
  await expect(page).toHaveURL(/\/governor$/);
  await expect(page.getByRole("heading", { name: "Governors" })).toBeVisible();
});

test("a forecast-map state opens its race page on click, its preview card on tap", async ({ page }, testInfo) => {
  await page.goto("/senate");
  await expect(page.getByRole("heading", { name: "U.S. Senate" })).toBeVisible();
  await openFirstInteractiveMapFeature(page, testInfo.project.name);
  await expectRaceOpened(page, testInfo.project.name);
});

test("race table links render the destination page on the first click", async ({ page }) => {
  await page.goto("/senate");
  await expect(page.getByRole("heading", { name: "U.S. Senate" })).toBeVisible();

  await page.getByRole("link", { name: "Alabama" }).first().click();
  await expect(page).toHaveURL(/\/senate\/al$/);
  await expect(page.getByRole("link", { name: "Alabama" }).first()).toBeVisible();
  await expect(page.getByText("2026 Regular U.S. Senate Race")).toBeVisible();
});

test("forecast buttons remount a clickable map", async ({ page }, testInfo) => {
  await page.goto("/senate");
  await expect(page.getByRole("heading", { name: "U.S. Senate" })).toBeVisible();

  await page.getByRole("button", { name: "House" }).click();
  await expect(page).toHaveURL(/\/house$/);
  await expect(page.getByRole("heading", { name: "U.S. House" })).toBeVisible();

  await page.getByRole("button", { name: "Senate" }).click();
  await expect(page).toHaveURL(/\/senate$/);
  await expect(page.getByRole("heading", { name: "U.S. Senate" })).toBeVisible();
  await openFirstInteractiveMapFeature(page, testInfo.project.name);
  await expectRaceOpened(page, testInfo.project.name);
});

test("analysis links render on the first click", async ({ page }) => {
  await page.goto("/analysis");
  await page.getByRole("link", { name: "OH-31" }).click();
  await expect(page).toHaveURL(/\/analysis\/districts\/oh-hd-31$/);
  await expect(page.getByRole("heading", { name: "House District 31" })).toBeVisible();
});
