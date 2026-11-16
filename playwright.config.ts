import { defineConfig, devices } from "@playwright/test";

// Locally, PW_CHROME=1 uses the installed Chrome instead of a downloaded Chromium.
const channel = process.env.PW_CHROME ? "chrome" : undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    // The service worker is tested on its own; everywhere else it would only hide stale builds.
    serviceWorkers: "block",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel, viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { ...devices["Pixel 7"], channel } },
  ],
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
