import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  // Discover tests in the public test suite AND in enterprise module test suites
  // (modules/ is a private git submodule; tests only run when it is checked out).
  testMatch: ["tests/e2e/**/*.spec.ts", "modules/**/*.spec.ts"],
  timeout: process.env.CI ? 60_000 : 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: process.env.CI ? "off" : "on-first-retry",
    screenshot: "only-on-failure",
    locale: "en",
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start the Next.js dev server automatically when running locally
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
