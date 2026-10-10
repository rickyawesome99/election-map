import { expect, test } from "@playwright/test";

// /analysis/pollsters: the ratings table (filter, search, sort, expandable record), the regional
// grid and the current-cycle house effects, plus the grade and house-effect columns the race
// pages' polls table takes from the same data.

const GRADE = /^(A\+|A|A-|B\+|B|B-|C\+|C|C-|D|F)$/;

test("pollster ratings page lists graded pollsters and opens a record", async ({ page }) => {
  await page.goto("/analysis/pollsters");
  await expect(page.getByRole("heading", { name: "Pollster Ratings", level: 1 })).toBeVisible({ timeout: 20_000 });

  const ratings = page.getByRole("tabpanel", { name: "Ratings" });
  const rows = ratings.locator("tbody tr");
  // the first 50 rows, then a button for the rest
  await expect(rows).toHaveCount(50);
  await ratings.getByRole("button", { name: /^Show all \d+ pollsters$/ }).click();
  expect(await rows.count()).toBeGreaterThan(100);
  await ratings.getByRole("button", { name: "Show the first 50 only" }).click();
  await expect(rows).toHaveCount(50);
  // default view is graded pollsters, best first: every row carries a letter grade
  await expect(rows.first().locator("td").first()).toHaveText(GRADE);

  await ratings.getByRole("searchbox", { name: "Find a pollster" }).fill("Emerson");
  await expect(rows).toHaveCount(1);
  await ratings.getByRole("button", { name: "Emerson College", exact: true }).click();
  await expect(ratings.getByText("By cycle", { exact: true })).toBeVisible();
  await expect(ratings.getByText("By region", { exact: true })).toBeVisible();

  // unrated pollsters only show outside the default scope
  await ratings.getByRole("searchbox", { name: "Find a pollster" }).fill("");
  await ratings.getByRole("button", { name: "Polling in 2026" }).click();
  await ratings.getByRole("button", { name: /^Show all \d+ pollsters$/ }).click(); // unrated sort last
  await expect(ratings.getByText("NR", { exact: true }).first()).toBeVisible();
});

test("pollster ratings page has the regional grid and this cycle's house effects", async ({ page }) => {
  await page.goto("/analysis/pollsters");
  const regional = page.locator("section", { has: page.getByRole("heading", { name: "By Region" }) });
  for (const region of ["National", "Northeast", "Rust Belt", "Sun Belt", "South", "Mountain", "Pacific"])
    await expect(regional.getByRole("columnheader", { name: region, exact: true })).toBeVisible({ timeout: 20_000 });
  const effects = page.getByRole("table", { name: /house effects by pollster/ }).getByRole("row");
  expect(await effects.count()).toBeGreaterThan(10);
  await expect(effects.first()).toContainText(/[DR]\+\d+\.\d|Even/);
});

test("analysis index links to the pollster ratings", async ({ page }) => {
  await page.goto("/analysis");
  await page.getByRole("link", { name: /Pollster Ratings/ }).click();
  await expect(page).toHaveURL(/\/analysis\/pollsters$/);
});

test("race polls table shows the pollster grade and the house-effect adjustment", async ({ page }) => {
  await page.goto("/senate/nh");
  const table = page.locator("table", { has: page.getByRole("columnheader", { name: "House effect" }) });
  await expect(table).toBeVisible({ timeout: 20_000 });
  await expect(table.getByRole("columnheader", { name: "Grade" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Adjusted" })).toBeVisible();
  await expect(table.locator("tbody tr").first().locator("td").nth(1)).toHaveText(/^(A\+|A|A-|B\+|B|B-|C\+|C|C-|D|F|NR)$/);
});

test("a pollster's page lists every poll, filters by cycle, and links back from the ratings table", async ({ page }) => {
  await page.goto("/analysis/pollsters");
  const ratings = page.getByRole("tabpanel", { name: "Ratings" });
  await ratings.getByRole("searchbox", { name: "Find a pollster" }).fill("Emerson");
  await ratings.getByRole("button", { name: "Emerson College", exact: true }).click();
  await ratings.getByRole("link", { name: /Every Emerson College poll/ }).click();
  await expect(page).toHaveURL(/\/analysis\/pollsters\/emerson-college$/);
  await expect(page.getByRole("heading", { name: "Emerson College", level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/^Record · \d+% right$/)).toBeVisible();
  await expect(page.getByText("Avg. miss", { exact: true }).first()).toBeVisible();

  const how = page.locator("section", { has: page.getByRole("heading", { name: "How the Grade Is Calculated" }) });
  await expect(how.getByText(/^score = weighted total ÷ \(weight \+ 12\) = /)).toBeVisible();
  await expect(how.getByRole("row", { name: /^Total/ })).toBeVisible();

  const polls = page.locator("section", { has: page.getByRole("heading", { name: "Every Poll" }) });
  const rows = polls.locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(50);
  await polls.getByRole("combobox", { name: "Cycle" }).selectOption("2024");
  await expect(rows.first().locator("td").first()).toHaveText("2024");
  await expect(rows.first().locator("td").nth(5)).toHaveText(/^([DR]\+\d+\.\d|Even|\+\d+\.\d)$/);
});

test("pollster ratings page has a Polls tab with this cycle's latest race polls", async ({ page }) => {
  await page.goto("/analysis/pollsters");
  await expect(page.getByRole("tab", { name: "Ratings" })).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
  await page.getByRole("tab", { name: "Polls" }).click();
  await expect(page).toHaveURL(/#polls$/);
  const panel = page.getByRole("tabpanel", { name: "Polls" });
  const rows = panel.locator("tbody tr");
  await expect(rows).toHaveCount(50);
  await expect(rows.first().locator("td").last()).toHaveText(/^([DR]\+\d+\.\d|Even)$/);
  await expect(page.getByRole("tabpanel", { name: "Ratings" })).toBeHidden();

  // the tab is linkable
  await page.goto("/analysis/pollsters#polls");
  await expect(page.getByRole("tab", { name: "Polls" })).toHaveAttribute("aria-selected", "true");
  const link = panel.locator("tbody tr").first().getByRole("link").last();
  await link.click();
  await expect(page).toHaveURL(/\/analysis\/pollsters\/[a-z0-9-]+$/);
});

test("ratings table columns stay put when switching between Graded, Polling in 2026 and All", async ({ page }) => {
  await page.goto("/analysis/pollsters");
  const panel = page.getByRole("tabpanel", { name: "Ratings" });
  await expect(panel.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
  const columns = () => panel.locator("thead th").evaluateAll((ths) => {
    const left = ths[0].closest("table")!.getBoundingClientRect().left;
    return ths.map((t) => [Math.round(t.getBoundingClientRect().left - left), Math.round(t.getBoundingClientRect().width)]);
  });
  const graded = await columns();
  await panel.getByRole("button", { name: "Polling in 2026" }).click();
  expect(await columns()).toEqual(graded);
  await panel.getByRole("button", { name: "All", exact: true }).click();
  await panel.getByRole("button", { name: /^Show all/ }).click();
  expect(await columns()).toEqual(graded);
});

test("Polls tab race links go to the seat that is up this cycle", async ({ page, request }) => {
  await page.goto("/analysis/pollsters#polls");
  const panel = page.getByRole("tabpanel", { name: "Polls" });
  await expect(panel.locator("tbody tr")).toHaveCount(50, { timeout: 20_000 });
  const hrefs = [...new Set(await panel.locator('tbody a[href^="/senate/"], tbody a[href^="/governor/"], tbody a[href^="/house/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))];
  expect(hrefs.length).toBeGreaterThan(5);
  for (const href of hrefs) {
    const html = await (await request.get(href)).text();
    expect(html, href).not.toMatch(/<title>[^<]*No Election/);
  }
});

test("source links appear only in a pollster page's Every Poll table", async ({ page }) => {
  await page.goto("/analysis/pollsters/emerson-college");
  const polls = page.locator("section", { has: page.getByRole("heading", { name: "Every Poll" }) });
  await expect(polls.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
  await polls.getByRole("combobox", { name: "Cycle" }).selectOption("2024");
  const links = polls.locator('tbody a[target="_blank"]');
  expect(await links.count()).toBeGreaterThan(50);
  await expect(links.first()).toHaveAttribute("href", /^https?:\/\//);
  await expect(links.first()).toHaveAttribute("rel", /noopener/);

  await page.goto("/analysis/pollsters#polls");
  await expect(page.getByRole("tabpanel", { name: "Polls" }).locator("tbody tr")).toHaveCount(50, { timeout: 20_000 });
  await expect(page.getByRole("tabpanel", { name: "Polls" }).locator('a[target="_blank"]')).toHaveCount(0);
});
