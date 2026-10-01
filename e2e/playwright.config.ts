import { defineConfig, devices } from "@playwright/test";

// Runs against the live site unless told otherwise:  E2E_BASE_URL=http://localhost:3000 npm run e2e
const baseURL = process.env.E2E_BASE_URL ?? "https://amazon-rebuild-8x-five.vercel.app";

export default defineConfig({
  testDir: "./tests",
  // Real payments through Stripe's hosted page and a webhook round trip: minutes, not seconds.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // One at a time: these act on one shared live store, and each test pays for real (test mode).
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
