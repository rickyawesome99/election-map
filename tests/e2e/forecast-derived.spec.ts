import { expect, test } from "@playwright/test";

// Ratings are derived from the projected margin (lib/forecast.ts → marginToRating), never
// entered by hand or set from the win probability. These tests read the rendered pages and
// check that every rating shown beside a margin is that margin's bucket.

const RATING = /^(Safe|Likely|Lean|Tilt) [DR]$/;
const MARGIN = /^[DR]\+\d+(?:\.\d)?$/;

// Mirrors marginToRating in lib/colorScale.ts (R-positive margin).
function ratingOf(margin: number): string {
  if (margin >= 15) return "Safe R";
  if (margin >= 5) return "Likely R";
  if (margin >= 1) return "Lean R";
  if (margin >= 0) return "Tilt R";
  if (margin > -1) return "Tilt D";
  if (margin >= -5) return "Lean D";
  if (margin >= -15) return "Likely D";
  return "Safe D";
}

function parseMargin(text: string): number {
  // A projected margin never reads "EVEN": a near-tie shows "D+0.0" / "R+0.0" and the letter is the call.
  const value = Number(text.slice(2)) || 0.001;
  return text.startsWith("R") ? value : -value;
}

for (const chamber of ["senate", "governor", "house"] as const) {
  test(`${chamber} race list ratings are the bucket of the displayed margin`, async ({ page }) => {
    await page.goto(`/${chamber}`);
    await expect(page.getByText(RATING).first()).toBeVisible({ timeout: 20_000 });

    // For each rating label, the nearest ancestor holding exactly one margin figure is its row.
    const pairs = await page.evaluate(([ratingSrc, marginSrc]) => {
      const rating = new RegExp(ratingSrc), margin = new RegExp(marginSrc);
      const leaves = [...document.querySelectorAll("body *")].filter((el) => el.children.length === 0);
      const out: { rating: string; margin: string }[] = [];
      for (const el of leaves) {
        const text = el.textContent?.trim() ?? "";
        if (!rating.test(text)) continue;
        let node: Element | null = el.parentElement;
        for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
          const margins = [...node.querySelectorAll("*")].filter((m) => m.children.length === 0 && margin.test(m.textContent?.trim() ?? ""));
          if (margins.length === 1) { out.push({ rating: text, margin: margins[0].textContent!.trim() }); break; }
          if (margins.length > 1) break;
        }
      }
      return out;
    }, [RATING.source, MARGIN.source]);

    expect(pairs.length).toBeGreaterThan(5);
    for (const { rating, margin } of pairs) {
      const m = parseMargin(margin);
      // The page rounds the margin to one decimal, so a race on a band edge may sit either side.
      const allowed = new Set([ratingOf(m - 0.05), ratingOf(m), ratingOf(m + 0.05)]);
      expect(allowed, `${margin} shown as ${rating}`).toContain(rating);
    }
  });
}

test("race page shows the derived probability, range and rating", async ({ page }) => {
  await page.goto("/senate/oh2");
  await expect(page.getByText("Win Probability").first()).toBeVisible();
  await expect(page.getByText("80% Range").first()).toBeVisible();
  await expect(page.getByText("Projected Margin").first()).toBeVisible();
  await expect(page.getByText(RATING).first()).toBeVisible();
});

test("overview draws the simulated seat distribution for each chamber", async ({ page }) => {
  await page.goto("/overview");
  await expect(page.getByText("Seat Distribution")).toBeVisible();
  for (const chamber of ["House", "Senate", "Governors"]) {
    const chart = page.getByRole("img", { name: new RegExp(`^${chamber}: simulated Democratic seats`) });
    await expect(chart).toBeVisible();
    expect(await chart.locator("rect").count()).toBeGreaterThan(6);
  }
  await expect(page.getByText(/[DR] control \d+%/).first()).toBeVisible();
});
