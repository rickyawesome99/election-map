import { expect, test, type Page } from "@playwright/test";

// /district-finder: the address search must survive either geocoder failing. A street address is
// answered by the Census (through /api/districts) with Nominatim as its fallback, a place name the
// other way round; the suggestion list is fed by a stubbed Photon response.

const ADDRESS = "350 Fifth Ave, New York, NY";

// The map canvas only exists once the page has hydrated — typing before that is lost.
async function openFinder(page: Page) {
  await page.goto("/district-finder");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
}

async function search(page: Page, address: string) {
  await openFinder(page);
  await page.getByPlaceholder("Enter any US address").fill(address);
  await page.getByPlaceholder("Enter any US address").press("Enter");
}

test("a street address is answered by the Census geocoder with Nominatim down", async ({ page }) => {
  await page.route("https://nominatim.openstreetmap.org/**", (route) => route.abort());
  await page.route("https://photon.komoot.io/**", (route) => route.fulfill({ json: { features: [] } }));
  await search(page, ADDRESS);
  await expect(page.getByText("350 5th Ave, New York, NY 10118")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("US House · NY-12")).toBeVisible();
});

test("a street address falls back to Nominatim when the Census lookup fails", async ({ page }) => {
  let nominatimCalls = 0;
  await page.route("**/api/districts?address=*", (route) => route.fulfill({ status: 502, json: { error: "Census geocoder error" } }));
  await page.route("https://nominatim.openstreetmap.org/search**", (route) => {
    nominatimCalls++;
    return route.fulfill({ json: [{ lat: "40.7484", lon: "-73.9857", display_name: "Empire State Building, 350, 5th Avenue, Manhattan, New York, United States" }] });
  });
  await page.route("https://photon.komoot.io/**", (route) => route.fulfill({ json: { features: [] } }));
  await search(page, ADDRESS);
  await expect(page.getByText("US House · NY-12")).toBeVisible({ timeout: 25_000 });
  expect(nominatimCalls).toBe(1);
});

test("a place name falls back to the Census geocoder when Nominatim finds nothing", async ({ page }) => {
  await page.route("https://nominatim.openstreetmap.org/**", (route) => route.fulfill({ json: [] }));
  await page.route("https://photon.komoot.io/**", (route) => route.fulfill({ json: { features: [] } }));
  await search(page, "Empire State Building, 350 Fifth Ave, New York, NY");
  await expect(page.getByText("US House · NY-12")).toBeVisible({ timeout: 25_000 });
});

test("suggestions come from Photon, US results only, and never from Nominatim", async ({ page }) => {
  let nominatimCalls = 0;
  await page.route("https://nominatim.openstreetmap.org/**", (route) => { nominatimCalls++; return route.abort(); });
  await page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({
      json: {
        features: [
          { properties: { countrycode: "US", name: "Empire State Building", housenumber: "350", street: "5th Avenue", city: "New York", state: "New York" } },
          { properties: { countrycode: "CA", name: "350 5th Avenue", housenumber: "350", street: "5th Avenue", city: "Calgary", state: "Alberta" } },
          { properties: { countrycode: "US", name: "Springfield", city: "Springfield", state: "Illinois" } },
        ],
      },
    }),
  );
  await openFinder(page);
  await page.getByPlaceholder("Enter any US address").pressSequentially("350 fifth", { delay: 30 });
  const items = page.locator("form ul li");
  await expect(items).toHaveText(["350 5th Avenue, New York, New York", "Springfield, Illinois"]);
  expect(nominatimCalls).toBe(0);
});

// Linn, Osage County: MO-03 on the 2022 lines Missouri votes on, but MO-05 in the Census's current
// layer, which drew the 2025 redraw the courts threw out.
test("Missouri is looked up on the 2022 lines, not the blocked 2025 redraw", async ({ request }) => {
  const res = await request.get("/api/districts?lat=38.46&lng=-91.86");
  expect(res.ok()).toBe(true);
  expect((await res.json()).lookup.usHouse.label).toBe("US House · MO-03");
});

// One address per redrawn state whose district number changed on the 2026 lines: the finder has to
// name the district on the ballot (and link its race), not the one the address sits in today.
for (const [address, was, label, href] of [
  ["301 W 2nd St, Austin, TX", "TX-37", "US House · TX-10", "/house/tx-10"],
  ["425 N El Dorado St, Stockton, CA", "CA-09", "US House · CA-13", "/house/ca-13"],
  ["100 N Andrews Ave, Fort Lauderdale, FL", "FL-23", "US House · FL-20", "/house/fl-20"],
]) {
  test(`${address} (${was} until 2026) resolves to its 2026 district`, async ({ request }) => {
    const res = await request.get(`/api/districts?${new URLSearchParams({ address })}`);
    expect(res.ok()).toBe(true);
    const { usHouse } = (await res.json()).lookup;
    expect(usHouse.label).toBe(label);
    expect(usHouse.href).toBe(href);
  });
}

test("a redrawn-state search links to the race page for the 2026 district", async ({ page }) => {
  await page.route("https://photon.komoot.io/**", (route) => route.fulfill({ json: { features: [] } }));
  await search(page, "301 W 2nd St, Austin, TX");
  const row = page.getByRole("link", { name: /US House · TX-10/ });
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.click();
  await expect(page).toHaveURL(/\/house\/tx-10$/);
});
