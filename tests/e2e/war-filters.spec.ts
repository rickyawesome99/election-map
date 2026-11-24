import { expect, test } from "@playwright/test";

// The candidates view: search and the filters keep the table in sync, and clicking a row
// opens that race's WAR calculation under it.
test("Candidates search, filters and the row calculation stay in sync", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/war");
  const search = page.getByRole("searchbox", { name: "Search performances" });
  const table = page.locator("table").first();
  const rows = table.locator("tbody tr");
  const checkColumn = async (column: number, pattern: RegExp) => {
    await expect(rows.first()).toBeVisible();
    for (const value of await rows.locator(`td:nth-child(${column})`).allTextContents()) {
      expect(value).toMatch(pattern);
    }
  };

  // The newest cycle renders in; the full table follows.
  await expect(page.getByText(/candidate-performances/).first()).toBeVisible();
  await search.fill("vt governor");
  await checkColumn(4, /Gov · VT/);
  await search.fill("Phil Scott");
  await checkColumn(2, /Phil Scott/i);
  await search.fill("");
  await page.getByLabel("Filter by year").selectOption("2022");
  await page.getByRole("button", { name: "S", exact: true }).click();
  await checkColumn(3, /^2022$/);
  await checkColumn(4, /^Sen/);
  await search.fill("no-such-candidate");
  await expect(page.getByText("No performances match the filters.")).toBeVisible();
  await search.fill("");

  // A row opens the race's calculation under it; the name links to the candidate's page.
  await page.getByRole("button", { name: "All", exact: true }).first().click();
  await page.getByLabel("Filter by year").selectOption("2024");
  await search.fill("Phil Scott");
  await expect(rows.first().getByRole("link", { name: "Phil Scott" })).toHaveAttribute("href", "/candidates/phil-scott");
  await rows.first().locator("td").nth(5).click();
  await expect(rows.first()).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(/How Phil Scott.s 2024 WAR is built/i)).toBeVisible();
  await expect(page.getByText("generic vs generic")).toBeVisible();
  await rows.first().locator("td").nth(5).click();
  await expect(page.getByText(/WAR is built/i)).toHaveCount(0);

  // ?c=slug (the candidate page's "WAR breakdown" link) narrows the table to that candidate.
  await page.goto("/war?c=phil-scott");
  await expect(page.getByText("Showing every scored race for")).toBeVisible();
  await checkColumn(2, /Phil Scott/i);

  expect(errors.filter((error) => /same key|unique.*key|hydration/i.test(error))).toEqual([]);
});

test("Old sub-tab URLs forward to the new layout", async ({ page }) => {
  await page.goto("/model/state?modelState=OH");
  await expect(page).toHaveURL(/\/model\/oh$/);
  await page.goto("/model/states/ga");
  await expect(page).toHaveURL(/\/model\/ga$/);
  await page.goto("/model/war");
  await expect(page).toHaveURL(/\/war$/);
  await page.goto("/model/candidates?state=OH");
  await expect(page).toHaveURL(/\/war\?state=OH$/);
});
