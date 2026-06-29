import { expect, test } from "@playwright/test";

async function selectFirstInteractiveMapFeature(page: import("@playwright/test").Page, projectName: string) {
  const geographies = page.locator("path.rsm-geography");
  await expect(geographies.first()).toBeVisible();
  const count = await geographies.count();
  const tapOrClick = async (x: number, y: number) => {
    if (projectName.includes("mobile")) {
      await page.touchscreen.tap(x, y);
    } else {
      await page.mouse.click(x, y);
    }
  };

  for (let index = 0; index < count; index += 1) {
    const geography = geographies.nth(index);
    const box = await geography.boundingBox();
    const fill = await geography.evaluate((element) => getComputedStyle(element).fill);
    if (!box || box.width < 8 || box.height < 8) continue;
    if (fill === "rgb(200, 205, 211)") continue;

    for (const [xRatio, yRatio] of [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]]) {
      await tapOrClick(box.x + box.width * xRatio, box.y + box.height * yRatio);
      const moreInfo = page.getByRole("link", { name: "More Info" });
      try {
        await expect(moreInfo.first()).toBeVisible({ timeout: 250 });
        return;
      } catch {
        // Some geography bounding-box points fall outside irregular SVG shapes.
      }
    }
  }
}

test("top-level tabs keep the URL and visible page in sync", async ({ page }) => {
  await page.goto("/?tab=overview");

  await page.getByRole("button", { name: "States" }).click();
  await expect(page).toHaveURL(/\/\?tab=states$/);
  await expect(page.getByRole("heading", { name: "States" })).toBeVisible();

  await page.getByRole("button", { name: "TPL" }).click();
  await expect(page).toHaveURL(/\/\?tab=model$/);
  await expect(page.getByRole("button", { name: "State TPL" })).toBeVisible();

  await page.getByRole("button", { name: "2026 Forecast" }).click();
  await expect(page).toHaveURL(/\/\?tab=forecast$/);
  await expect(page.getByRole("button", { name: "House" })).toBeVisible();
});

test("forecast map selection exposes a working more-info link", async ({ page }, testInfo) => {
  await page.goto("/?tab=senate");
  await expect(page.getByRole("heading", { name: "Senate Races" })).toBeVisible();
  await selectFirstInteractiveMapFeature(page, testInfo.project.name);

  const moreInfo = page.getByRole("link", { name: "More Info" }).first();
  await expect(moreInfo).toBeVisible();
  await expect(moreInfo).toHaveAttribute("href", /\/senate\/[a-z]{2}(?:-\d+)?\?from=/);
});

test("race table links render the destination page on the first click", async ({ page }) => {
  await page.goto("/?tab=senate");
  await expect(page.getByRole("heading", { name: "Senate Races" })).toBeVisible();

  await page.getByRole("link", { name: "Alabama" }).first().click();
  await expect(page).toHaveURL(/\/senate\/al\?from=/);
  await expect(page.getByRole("link", { name: "Alabama" }).first()).toBeVisible();
  await expect(page.getByText("2026 Regular U.S. Senate Race")).toBeVisible();
});

test("forecast buttons remount a clickable map", async ({ page }, testInfo) => {
  await page.goto("/?tab=overview");

  await page.getByRole("button", { name: "House" }).click();
  await expect(page).toHaveURL(/\/\?tab=house$/);
  await expect(page.getByRole("heading", { name: "House Races" })).toBeVisible();

  await page.getByRole("button", { name: "Senate" }).click();
  await expect(page).toHaveURL(/\/\?tab=senate$/);
  await expect(page.getByRole("heading", { name: "Senate Races" })).toBeVisible();
  await selectFirstInteractiveMapFeature(page, testInfo.project.name);
  await expect(page.getByRole("link", { name: "More Info" }).first()).toBeVisible();
});

test("analysis links render on the first click", async ({ page }) => {
  await page.goto("/analysis");
  await page.getByRole("link", { name: "OH-31" }).click();
  await expect(page).toHaveURL(/\/analysis\/oh-31$/);
  await expect(page.getByRole("heading", { name: /OH-31/i })).toBeVisible();
});
