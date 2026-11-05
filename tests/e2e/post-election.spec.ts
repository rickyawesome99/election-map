import { expect, test } from "@playwright/test";

// /analysis/post-election: a small box per state, opening the state's profile on a hash, from the
// saved snapshot (data-entry/results_2026_seats.csv). The figures move with each manual snapshot, so
// these check the page's shape and that it never reads the live feed.

test("every state has a box and nothing reads the feed", async ({ page }) => {
  const feed: string[] = [];
  page.on("request", (r) => { if (r.url().includes("civicapi.org") || r.url().includes("/api/results/")) feed.push(r.url()); });
  await page.goto("/analysis/post-election");
  await expect(page.getByRole("heading", { level: 1, name: "2026 Post Election Analysis" })).toBeVisible();
  const boxes = page.getByRole("navigation", { name: "States" }).getByRole("link");
  await expect(boxes).toHaveCount(50);
  await expect(page.locator("button.rc-card")).toHaveCount(0);
  // All on one view, on any screen.
  await expect(boxes.last()).toBeInViewport();
  await expect(boxes.first()).toHaveText("AK");
  // Coloured by the state's House popular vote, which the box's label states.
  await expect(boxes.first()).toHaveAttribute("aria-label", /^AK · Alaska · House popular vote [DR]\+\d/);
  await expect(boxes.first()).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(feed).toEqual([]);
});

test("the sort buttons reorder the boxes by margin and by closeness", async ({ page }) => {
  await page.goto("/analysis/post-election");
  const boxes = page.getByRole("navigation", { name: "States" }).getByRole("link");
  await expect(boxes.first()).toHaveText("AK");
  // R-positive margins read back off the boxes' labels.
  const margins = async () => (await boxes.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? "")))
    .map((t) => { const m = t.match(/([DR])\+([\d.]+)$/); return m ? (m[1] === "R" ? 1 : -1) * Number(m[2]) : null; })
    .filter((m): m is number => m != null);
  const ascending = (v: number[]) => v.every((x, i) => i === 0 || v[i - 1] <= x);
  const sorts = page.getByRole("group", { name: "Sort the states" });
  await sorts.getByRole("button", { name: "Margin" }).click();
  await expect(sorts.getByRole("button", { name: "Margin" })).toHaveAttribute("aria-pressed", "true");
  const byMargin = await margins();
  expect(byMargin.length).toBeGreaterThan(40);
  expect(ascending(byMargin)).toBe(true);
  expect(byMargin[0]).toBeLessThan(0);
  await sorts.getByRole("button", { name: "Competitive" }).click();
  expect(ascending((await margins()).map(Math.abs))).toBe(true);
  await boxes.first().click();
  await expect(page.locator("button.rc-card").first()).toBeVisible();
  await expect(sorts.getByRole("button", { name: "Competitive" })).toHaveAttribute("aria-pressed", "true");
  await sorts.getByRole("button", { name: "Alphabetical" }).click();
  await expect(boxes.first()).toHaveText("AK");
});

test("hovering a box shows the state's House popular vote margin, on desktop only", async ({ page, isMobile }) => {
  await page.goto("/analysis/post-election");
  const box = page.getByRole("navigation", { name: "States" }).getByRole("link", { name: /^HI · / });
  await expect(box).not.toHaveAttribute("title");
  const tip = page.locator(".pointer-events-none", { hasText: "House popular vote" });
  await expect(tip).toHaveCount(0);
  await box.hover();
  if (isMobile) {
    await expect(tip).toBeHidden();
    return;
  }
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("Hawaii");
  await expect(tip).toContainText(/D\+\d+\.\d/);
  await page.mouse.move(0, 0);
  await expect(tip).toHaveCount(0);
});

test("a box opens the state on the hash with no page load, and Back and a reload keep up", async ({ page }) => {
  await page.goto("/analysis/post-election");
  const documents: string[] = [];
  page.on("request", (r) => { if (r.resourceType() === "document") documents.push(r.url()); });
  const states = page.getByRole("navigation", { name: "States" });
  await states.getByRole("link", { name: /^FL · / }).click();
  await expect(page).toHaveURL(/#FL$/);
  await expect(page.locator("button.rc-card")).toHaveCount(30);
  // The House popular vote sits in the Statewide section, with the governor, Senate and two chamber cards.
  const statewide = page.locator("div.py-3", { hasText: "Statewide" });
  await expect(statewide.getByText("House popular vote")).toBeVisible();
  await expect(statewide.locator("button.rc-card")).toHaveCount(2);
  await expect(statewide.locator(".rc-card")).toHaveCount(5);
  await states.getByRole("link", { name: /^AL · / }).click();
  await expect(page.locator("button.rc-card")).toHaveCount(9);
  expect(documents).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/#FL$/);
  await expect(page.locator("button.rc-card")).toHaveCount(30);
  await page.reload();
  await expect(page.locator("button.rc-card")).toHaveCount(30);
  await page.locator("button.rc-card").first().click();
  await expect(page).toHaveURL(/\/results#governor-FL/);
});

test("a state's legislature cards show its chambers, with or without a 2026 election", async ({ page }) => {
  await page.goto("/analysis/post-election#OH");
  // In the Statewide row, after the federal races, House before Senate.
  const statewide = page.locator("div.py-3", { hasText: "Statewide" });
  const chambers = statewide.locator(".rc-card").filter({ hasText: /^State (House|Senate)/ });
  await expect(chambers.first()).toContainText("State House");
  await expect(chambers.last()).toContainText("State Senate");
  // A chamber a party has settled fills like a called race, with no Called badge.
  await expect(chambers.first()).toHaveAttribute("data-filled", "");
  await expect(chambers.first().locator(".rc-badge")).toHaveCount(0);
  await expect(page.getByText("State Senate", { exact: true })).toBeVisible();
  await expect(page.getByText("State House", { exact: true })).toBeVisible();
  await expect(page.getByText(/^99 up · \d+ called$/)).toBeVisible();
  await expect(page.getByText(/^Net (D|R)\+\d+/).first()).toBeVisible();
  // The delegation follows the seat count: called seats by party, most first, no party with none.
  await expect(page.getByText(/^House · 15 seats · (\d+[DRI] ){1,3}(\d+ Uncalled)?/)).toBeVisible();
  await page.goto("/analysis/post-election#VA");
  await expect(page.getByText("No 2026 Elections", { exact: true })).toHaveCount(2);
  await page.goto("/analysis/post-election#NE");
  await expect(page.getByText("Legislature", { exact: true })).toBeVisible();
  await expect(page.getByText(/^25 up · \d+ called$/)).toBeVisible();
});

test("statewide cards show Vs. GB, House cards show Swing, with an asterisk only where the lines moved", async ({ page }) => {
  await page.goto("/analysis/post-election#TX");
  const cards = page.locator("button.rc-card");
  await expect(cards.filter({ hasText: /^Senate/ }).first()).toContainText(/Vs\. GB [DR]\+\d+\.\d/);
  await expect(cards.filter({ hasText: "TX-35" })).toContainText(/Swing [DR]\+\d+\.\d\*/);
  await expect(cards.filter({ hasText: "TX-15" })).toContainText(/Swing [DR]\+\d+\.\d\*/);
  await expect(page.getByText("Fcst", { exact: false })).toHaveCount(0);
  // Michigan kept its lines, so its swings are from real 2024 results.
  await page.goto("/analysis/post-election#MI");
  await expect(cards.filter({ hasText: "MI-07" })).toContainText(/Swing [DR]\+\d+\.\d/);
  await expect(cards.filter({ hasText: "*" })).toHaveCount(0);
});
