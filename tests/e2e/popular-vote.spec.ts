import { expect, test } from "@playwright/test";

// /analysis/popular-vote: the record chart, the three-marker inputs table, the marker-against-result
// panels with their outcome and election filters, and the 2026 projection table.

test("popular vote page shows the markers, the panels and the projection table", async ({ page }) => {
  await page.goto("/analysis/popular-vote");
  await expect(page.getByRole("heading", { name: "Popular Vote", level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Generic ballot average", { exact: true })).toBeVisible();
  await expect(page.getByText("Gallup Q3 2026 party ID", { exact: true })).toBeVisible();

  // Inputs: five complete elections plus 2026, with Gallup's Q3 2026 reading on the last row.
  const inputs = page.locator("table").first();
  const rows = inputs.locator("tbody tr");
  await expect(rows).toHaveCount(6);
  await expect(rows.last()).toContainText("2026");
  await expect(rows.last()).toContainText("R 39 · D 50");

  // Three panels, each a labelled SVG; the election filter dims the other cycle's points.
  const panels = page.locator("svg[role=img][aria-label*='against the']");
  await expect(panels).toHaveCount(3);
  await page.getByRole("button", { name: "Midterms", exact: true }).click();
  await expect(page.getByText(/all-five slope, centered on these/).first()).toBeVisible();
  // every House view carries a 2026 point; the presidential panels have none
  await expect(panels.first().locator("text", { hasText: /^2026 [DR]\+/ })).toBeVisible();
  await page.getByRole("button", { name: "Presidential popular vote", exact: true }).click();
  await expect(page.getByText(/No presidential vote in 2026/).first()).toBeVisible();
  await expect(panels.first().locator("text", { hasText: /^2026 [DR]\+/ })).toHaveCount(0);

  // Projection table: one row per marker, a margin in the all-elections column.
  const projection = page.locator("table").nth(1);
  await expect(projection.locator("tbody tr")).toHaveCount(3);
  await expect(projection.locator("tbody tr").first().locator("td").nth(1)).toContainText(/[DR]\+\d+\.\d|EVEN/);
});
