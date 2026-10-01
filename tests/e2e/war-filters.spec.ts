import { expect, test } from "@playwright/test";

// The candidates view: search and the filters keep the race table in sync, and clicking a
// name opens that person's record under the table.
test("Candidates search, filters and the candidate record stay in sync", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/model/candidates");
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
  await checkColumn(1, /VT Governor/);
  await search.fill("Phil Scott");
  await checkColumn(2, /Phil Scott/i);
  await search.fill("");
  await page.getByLabel("Filter by year").selectOption("2022");
  await page.getByRole("button", { name: "S", exact: true }).click();
  await checkColumn(1, /^S2022/);
  await search.fill("no-such-candidate");
  await expect(page.getByText("No performances match the filters.")).toBeVisible();
  await search.fill("");

  // A name opens the record and puts the selection in the URL.
  await page.getByRole("button", { name: "All", exact: true }).first().click();
  await page.getByLabel("Filter by year").selectOption("2024");
  await search.fill("Phil Scott");
  await rows.first().getByRole("link", { name: "Phil Scott" }).click();
  await expect(page).toHaveURL(/c=phil-scott/);
  await expect(page.getByText("Selected candidate")).toBeVisible();
  await expect(page.getByText("WAR by cycle")).toBeVisible();

  expect(errors.filter((error) => /same key|unique.*key|hydration/i.test(error))).toEqual([]);
});

test("Old sub-tab URLs forward to the new layout", async ({ page }) => {
  await page.goto("/model/state?modelState=OH");
  await expect(page).toHaveURL(/\/model\/oh$/);
  await page.goto("/model/states/ga");
  await expect(page).toHaveURL(/\/model\/ga$/);
  await page.goto("/model/war");
  await expect(page).toHaveURL(/\/model\/candidates$/);
});
