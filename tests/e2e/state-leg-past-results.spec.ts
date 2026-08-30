import { expect, test } from "@playwright/test";

// North Carolina is the sharpest case for the year selector: its House was redrawn three times
// inside the covered range, so each past year has to pull a DIFFERENT boundary file.
test("the state legislature year selector swaps results and the map era together", async ({ page }) => {
  const boundaryRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url()).pathname;
    if (url.startsWith("/state-leg-districts")) boundaryRequests.push(url);
  });

  await page.goto("/states/nc/legislature");
  await expect(page.getByRole("heading", { name: "State House Districts" })).toBeVisible();

  await page.getByRole("button", { name: "Past results" }).click();
  await expect(page.getByRole("heading", { name: "2024 State House Results" })).toBeVisible();

  // The most recent election was held on the map the page already shows, so no historical file.
  expect(boundaryRequests).toContain("/state-leg-districts/house/NC.json");
  expect(boundaryRequests.some((u) => u.includes("historical"))).toBe(false);

  // A district row carries real vote counts, not the incumbent columns.
  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toContainText(/[\d,]{4,}/);
  await expect(page.getByRole("columnheader", { name: "Democratic" })).toBeVisible();

  await page.getByRole("button", { name: "2018", exact: true }).click();
  await expect(page.getByRole("heading", { name: "2018 State House Results" })).toBeVisible();
  await expect
    .poll(() => boundaryRequests.some((u) => u === "/state-leg-districts-historical/house/NC-2018.json"))
    .toBe(true);
  await expect(page.getByText("2011-cycle map", { exact: false })).toHaveCount(0);
  await expect(page.getByText(/boundaries used in 2018/)).toBeVisible();

  // 2016 was a different map again — the selector must not reuse 2018's file.
  await page.getByRole("button", { name: "2016", exact: true }).click();
  await expect
    .poll(() => boundaryRequests.some((u) => u === "/state-leg-districts-historical/house/NC-2016.json"))
    .toBe(true);
});

// Oklahoma declares unopposed candidates elected without printing the race, so 70 of its 2022
// House districts have a seat and no ballots — the case that must never render as an exact tie.
test("a chamber with no published count shows it as such rather than as a tie", async ({ page }) => {
  await page.goto("/states/ok/legislature");
  await page.getByRole("button", { name: "Past results" }).click();
  await page.getByRole("button", { name: "2022", exact: true }).click();
  await expect(page.getByRole("heading", { name: "2022 State House Results" })).toBeVisible();
  await expect(page.getByText("No vote count published").first()).toBeVisible();
  await expect(page.getByText("No count", { exact: false }).first()).toBeVisible();
});
