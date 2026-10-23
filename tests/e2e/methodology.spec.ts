import { expect, test } from "@playwright/test";

// Two methodology pages. /methodology is the public, plain-language one behind the footer link;
// /analysis/internal-methodology is the working specification (every constant, the backtests, the full
// change log), listed under Analysis → Internal. Both read their numbers from the code that runs the
// models, and both use the same tab keys. These checks cover the routing and that the live numbers on
// the pages are the ones the rest of the site shows.

const PUBLIC_TABS: [string, string, string][] = [
  ["Forecast", "/methodology", "How a race forecast is built"],
  ["State TPL", "/methodology/state-tpl", "A state's lean in a neutral year"],
  ["District TPL", "/methodology/district-tpl", "A district's lean, on the 2026 lines"],
  ["County TPL", "/methodology/county-tpl", "The same lean, county by county"],
  ["WAR", "/methodology/war", "How much better than a generic nominee"],
  ["Turnout", "/methodology/turnout", "Who votes, and how many will"],
  ["State Legislatures", "/methodology/state-leg", "Every state legislative seat"],
  ["Precinct Districts", "/methodology/precinct-district", "A district, precinct by precinct"],
];

const INTERNAL = "/analysis/internal-methodology";
const INTERNAL_TABS: [string, string, string][] = [
  ["Forecast", INTERNAL, "One equation, three offices"],
  ["State TPL", `${INTERNAL}/state-tpl`, "A state's lean in a neutral year"],
  ["District TPL", `${INTERNAL}/district-tpl`, "A district's lean, on the 2026 lines"],
  ["County TPL", `${INTERNAL}/county-tpl`, "The state pipeline, measured in one county"],
  ["WAR", `${INTERNAL}/war`, "How much better than a generic nominee"],
  ["Legislative atlas", `${INTERNAL}/state-leg`, "One page per chamber, one record per district"],
  ["Change Log", `${INTERNAL}/changelog`, "Change log"],
];

test("methodology is reached from the footer, not the top navigation", async ({ page }) => {
  await page.goto("/overview");
  const topNav = page.locator("nav").first();
  const labels = await topNav.getByRole("link").allTextContents();
  expect(labels).not.toContain("Methodology");
  await page.locator("footer").getByRole("link", { name: "Methodology", exact: true }).click();
  await expect(page).toHaveURL(/\/methodology$/);
  await expect(page.getByRole("heading", { name: "Methodology", level: 1 })).toBeVisible({ timeout: 20_000 });
});

test("every public tab renders its plain-language explanation", async ({ page }) => {
  await page.goto("/methodology");
  const models = page.getByRole("navigation", { name: "Models" });
  for (const [label, url, heading] of PUBLIC_TABS) {
    await models.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${url}$`), { timeout: 20_000 });
    await expect(models.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: heading, level: 2 })).toBeVisible({ timeout: 20_000 });
  }
  expect((await page.goto("/methodology/not-a-model"))?.status()).toBe(404);
});

test("internal methodology is listed under Analysis and renders every model's specification", async ({ page }) => {
  await page.goto("/analysis");
  await page.getByRole("link", { name: /Internal Methodology/ }).click();
  await expect(page).toHaveURL(new RegExp(`${INTERNAL}$`));
  await expect(page.getByRole("heading", { name: "Internal Methodology", level: 1 })).toBeVisible({ timeout: 20_000 });
  const models = page.getByRole("navigation", { name: "Models" });
  for (const [label, url, heading] of INTERNAL_TABS) {
    await models.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${url}$`), { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: heading, level: 2 })).toBeVisible({ timeout: 20_000 });
    if (label !== "Change Log") await expect(page.getByRole("heading", { name: "Revision history", level: 2 })).toBeVisible();
  }
  expect((await page.goto(`${INTERNAL}/not-a-model`))?.status()).toBe(404);
});

test("the public forecast tab's worked race matches the race page it links to", async ({ page }) => {
  await page.goto("/methodology");
  const overview = page.locator("section#overview");
  const projected = (await overview.getByText("Projected margin", { exact: true }).locator("xpath=ancestor::div[2]").textContent()) ?? "";
  const margin = projected.match(/[DR]\+\d+\.\d/g)?.at(-1);
  expect(margin).toBeTruthy();
  await overview.getByRole("link", { name: /Senate$/ }).click();
  await expect(page.getByText(margin!, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
});

test("the internal forecast tab's worked example matches the race page it links to", async ({ page }) => {
  await page.goto(INTERNAL);
  const overview = page.locator("section#overview");
  const projected = (await overview.getByText("Projected Margin", { exact: true }).last().locator("xpath=ancestor::div[1]").textContent()) ?? "";
  const margin = projected.match(/[DR]\+\d+\.\d/g)?.at(-1);
  expect(margin).toBeTruthy();
  await overview.getByRole("link", { name: /Senate$/ }).click();
  await expect(page.getByText(margin!, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
});

test("calibration tables are populated from the backtest", async ({ page }) => {
  await page.goto(`${INTERNAL}#calibration`);
  const cal = page.locator("section#calibration");
  await expect(cal.getByRole("row", { name: /^Senate/ }).first()).toBeVisible();
  expect(await cal.locator("tbody tr").count()).toBeGreaterThan(25);
});

test("public sources is reached from the footer and links out to its publishers", async ({ page }) => {
  await page.goto("/methodology");
  const labels = await page.getByRole("navigation", { name: "Models" }).getByRole("link").allTextContents();
  expect(labels.at(-1)).toBe("Precinct Districts");
  expect(labels).not.toContain("What's changed");
  expect(labels).not.toContain("Sources");
  await page.locator("footer").getByRole("link", { name: "Sources", exact: true }).click();
  await expect(page).toHaveURL(/\/sources$/);
  await expect(page.getByRole("heading", { name: "Sources", level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Where the data comes from", level: 2 })).toBeVisible();
  for (const name of ["Federal Election Commission — bulk data", "Dave's Redistricting App — VTD election data", "OpenElections", "Wikipedia election articles"]) {
    await expect(page.getByRole("link", { name, exact: true }).first()).toHaveAttribute("href", /^https:\/\//);
  }
  // the internal detail stays on Internal Methodology
  await expect(page.getByRole("heading", { name: "Provenance not recorded" })).toHaveCount(0);
});

test("internal sources is the last internal tab, with the full detail", async ({ page }) => {
  await page.goto(INTERNAL);
  const labels = await page.getByRole("navigation", { name: "Models" }).getByRole("link").allTextContents();
  expect(labels.at(-1)).toBe("Sources");
  await page.goto(`${INTERNAL}/sources`);
  await expect(page.getByRole("heading", { name: "Where every number comes from", level: 2 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Provenance not recorded", level: 2 })).toBeVisible();
  // the legislative-map table is read live: one row per state with a sourced map
  expect(await page.locator("section#boundaries tbody tr").count()).toBeGreaterThanOrEqual(45);
});
