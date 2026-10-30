import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  // Tests that depend on the live Census geocoder run locally only (see district-finder.spec.ts).
  grepInvert: process.env.CI ? /@live-census/ : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    // CI tests the production build (`npm run build` runs first in the workflow); locally the
    // suite reuses the always-on dev server. `npx next dev` (not `npm run dev`) so a fallback
    // start never runs the predev generators over a server that is already up.
    command: process.env.CI
      ? "npx next start --hostname 127.0.0.1 --port 3000"
      : "npx next dev --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
