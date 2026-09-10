import { expect, test } from "@playwright/test";

test("WAR search and dropdowns keep displayed rows in sync", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/model/war");
  const search = page.getByRole("textbox", { name: "Search performances" });
  const rows = page.locator("tbody tr");
  const checkColumn = async (column: number, pattern: RegExp) => {
    await expect(rows.first().locator("td")).toHaveCount(11);
    for (const value of await rows.locator(`td:nth-child(${column})`).allTextContents()) {
      expect(value).toMatch(pattern);
    }
  };
  await search.fill("2024");
  await checkColumn(5, /^2024$/);
  await search.fill("  vt, 2024 governor  ");
  await checkColumn(4, /^Governor · VT$/);
  await checkColumn(5, /^2024$/);
  await search.fill("Phil Scott");
  await checkColumn(2, /Phil Scott/i);
  await search.fill("");
  await page.getByLabel("Filter by race").selectOption("S");
  await page.getByLabel("Filter by party").selectOption("D");
  await page.getByLabel("Filter by year").selectOption("2022");
  await checkColumn(3, /^D$/);
  await checkColumn(4, /Senate/);
  await checkColumn(5, /^2022$/);
  await search.fill("VT");
  await checkColumn(4, /· VT$/);
  await search.fill("no-such-candidate");
  await expect(page.getByText("No performances match the filters.")).toBeVisible();
  await search.fill("");
  await checkColumn(5, /^2022$/);
  expect(errors.filter((error) => /same key|unique.*key|hydration/i.test(error))).toEqual([]);
});
