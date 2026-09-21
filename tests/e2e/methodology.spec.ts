import { expect, test } from "@playwright/test";

// /methodology: one tab per model, each reading its constants and fitted values from the code
// that runs the model. These checks cover the tab routing and that the live numbers on the page
// are the ones the rest of the site shows.

const TABS: [string, string, string][] = [
  ["Forecast", "/methodology", "One equation, three offices"],
  ["State TPL", "/methodology/state-tpl", "A state's lean in a neutral year"],
  ["District TPL", "/methodology/district-tpl", "A district's lean, on the 2026 lines"],
  ["County TPL", "/methodology/county-tpl", "The state pipeline, measured in one county"],
  ["WAR", "/methodology/war", "How much better than a generic nominee"],
  ["Change Log", "/methodology/changelog", "Change log"],
];

test("methodology sits between Analysis and District Finder in the top navigation", async ({ page }) => {
  await page.goto("/overview");
  const labels = await page.locator("nav").first().getByRole("link").allTextContents();
  expect(labels.slice(labels.indexOf("Analysis"), labels.indexOf("Analysis") + 3)).toEqual(["Analysis", "Methodology", "District Finder"]);
  await page.getByRole("link", { name: "Methodology", exact: true }).click();
  await expect(page).toHaveURL(/\/methodology$/);
  await expect(page.getByRole("heading", { name: "Methodology", level: 1 })).toBeVisible({ timeout: 20_000 });
});

test("every model tab renders its own specification", async ({ page }) => {
  await page.goto("/methodology");
  const models = page.getByRole("navigation", { name: "Models" });
  for (const [label, url, heading] of TABS) {
    await models.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${url}$`));
    await expect(models.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: heading, level: 2 })).toBeVisible({ timeout: 20_000 });
    if (label !== "Change Log") await expect(page.getByRole("heading", { name: "Revision history", level: 2 })).toBeVisible();
  }
  expect((await page.goto("/methodology/not-a-model"))?.status()).toBe(404);
});

test("the forecast tab's worked example matches the race page it links to", async ({ page }) => {
  await page.goto("/methodology");
  const overview = page.locator("section#overview");
  const projected = (await overview.getByText("Projected Margin", { exact: true }).last().locator("xpath=ancestor::div[1]").textContent()) ?? "";
  const margin = projected.match(/[DR]\+\d+\.\d/g)?.at(-1);
  expect(margin).toBeTruthy();
  await overview.getByRole("link", { name: /Senate$/ }).click();
  await expect(page.getByText(margin!, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
});

test("calibration tables are populated from the backtest", async ({ page }) => {
  await page.goto("/methodology#calibration");
  const cal = page.locator("section#calibration");
  await expect(cal.getByRole("row", { name: /^Senate/ }).first()).toBeVisible();
  expect(await cal.locator("tbody tr").count()).toBeGreaterThan(25);
});
