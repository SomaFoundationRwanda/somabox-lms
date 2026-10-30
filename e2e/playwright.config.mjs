import { defineConfig, devices } from "@playwright/test";
import { APP_URL } from "./support/env.mjs";

// Run with `pnpm test:e2e` from the repository root. One worker: every spec shares one
// database (the school), and specs build their own courses so they don't trip over each other.
export default defineConfig({
  testDir: "./specs",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    // Like many people's devices: no smooth scrolling or transitions, so elements are where
    // they're drawn when a test clicks them.
    reducedMotion: "reduce",
    baseURL: APP_URL,
    locale: "en-GB",
    timezoneId: "Africa/Kigali",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testDir: ".", testMatch: /auth\.setup\.mjs/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
    // Request counts per journey (e2e/metrics), only when asked for: E2E_METRICS=1 ... --project=metrics
    ...(process.env.E2E_METRICS ? [{ name: "metrics", testDir: "./metrics", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] }] : []),
  ],
  webServer: {
    command: "node server.mjs",
    url: APP_URL,
    timeout: 600_000, // includes `next build`
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  },
});
