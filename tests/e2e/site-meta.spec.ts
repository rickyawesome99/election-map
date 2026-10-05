import { expect, test } from "@playwright/test";

// The pieces a visitor never navigates to but every share and search engine reads: the About page
// behind the footer, the sitemap, robots.txt, and the link-preview cards.

test("the footer links to the About page", async ({ page }) => {
  await page.goto("/methodology");
  await page.getByRole("contentinfo").getByRole("link", { name: "About" }).click();
  await expect(page.getByRole("heading", { name: "About", level: 1 })).toBeVisible();
  await expect(page.getByText(/Candidate photos come from official government portraits/)).toBeVisible();
});

test("the sitemap lists race, past-election, candidate and county pages, and no redirects", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text();
  const paths = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  expect(paths.length).toBeGreaterThan(9000);
  for (const p of ["/about", "/senate/ga", "/senate/me2", "/house/oh-09", "/governor/oh", "/house/oh-09/2024", "/president/pa/2024", "/methodology/sources"]) expect(paths).toContain(p);
  expect(paths.some((p) => p.startsWith("/candidates/"))).toBe(true);
  expect(paths.some((p) => p.startsWith("/historical/"))).toBe(true);
  for (const p of ["/states", "/analysis/oh-31"]) expect(paths).not.toContain(p);
  expect(paths.some((p) => p.startsWith("/audit"))).toBe(false);
});

test("robots.txt points at the sitemap and keeps crawlers out of the audit pages", async ({ request }) => {
  const txt = await (await request.get("/robots.txt")).text();
  expect(txt).toMatch(/Disallow: \/audit\//);
  expect(txt).toMatch(/Sitemap: .*\/sitemap\.xml/);
});

test("pages carry share cards: the site card by default, a race card on race pages", async ({ page, request }) => {
  for (const [path, card] of [["/overview", "/opengraph-image"], ["/senate/ga", "/senate/ga/opengraph-image"], ["/house/az-06", "/house/az-06/opengraph-image"]]) {
    await page.goto(path);
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(new URL(image!).pathname).toBe(card);
    const res = await request.get(card);
    expect(res.headers()["content-type"]).toBe("image/png");
  }
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
});
