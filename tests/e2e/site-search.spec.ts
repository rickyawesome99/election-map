import { expect, test } from "@playwright/test";
import { queryIndex } from "../../lib/searchQuery";

test("district numbers and state abbreviations match whole tokens", () => {
  const entries = ["PA-01", "PA-10", "CA-01"].map((label) => ({ label, sublabel: "House seat", href: `/house/${label.toLowerCase()}`, terms: `${label} house district` }));
  for (const query of ["PA-1", "PA01", "pa, district 1", "PA 1st"]) {
    expect(queryIndex(entries, query).map((entry) => entry.label)).toEqual(["PA-01"]);
  }
});

test("site search finds profiles, seats, and year-specific elections", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "Search states, seats, races, and candidates" });
  const results = page.getByRole("listbox", { name: "Search results" });
  await search.fill("Vermont");
  await expect(results.getByRole("option").first()).toHaveAttribute("href", "/states/vt");
  await search.fill("vt, 2024 governor");
  await expect(results.getByRole("option").first()).toHaveAttribute("href", "/governor/vt/2024");
  await search.fill("VT senate seat 2");
  await expect(results.getByRole("option").first()).toHaveAttribute("href", "/senate/vt2");
  await search.fill("Phil Scott");
  await expect(results.getByRole("option").first()).toHaveAttribute("href", /\/candidates\/phil-scott/);
  await search.fill("PA-7");
  await expect(results.getByRole("option").first()).toHaveAttribute("href", "/house/pa-07");
  await search.fill("PA-07 2022");
  await expect(results.getByRole("option").first()).toHaveAttribute("href", "/house/pa-07/2022");
  await search.fill("2024");
  await expect(results.getByRole("option").first()).toHaveAttribute("href", /\/2024$/);
  await search.fill("no-such-candidate");
  await expect(results).toContainText("No matches");
  await search.fill("Vermont");
  await search.press("ArrowDown");
  await expect(results.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await search.press("Escape");
  await expect(results).toBeHidden();
  await search.fill("vt 2024 governor");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/governor\/vt\/2024$/);
});
