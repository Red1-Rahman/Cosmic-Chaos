import { defineConfig, devices } from "@playwright/test";

type Browser = "chromium" | "firefox" | "webkit";

const requested = process.env["E2E_BROWSER"] ?? "chromium";
if (requested !== "chromium" && requested !== "firefox" && requested !== "webkit") {
  throw new Error(`E2E_BROWSER must be chromium, firefox or webkit. Got: ${requested}`);
}
const browser: Browser = requested;

const device = {
  chromium: devices["Desktop Chrome"],
  firefox: devices["Desktop Firefox"],
  webkit: devices["Desktop Safari"],
}[browser];

// Chromium only: lets headless audio tests start without a real user gesture.
const launchArgs = browser === "chromium" ? ["--autoplay-policy=no-user-gesture-required"] : [];

export default defineConfig({
  testDir: "tests",
  timeout: 30_000,
  retries: 0, // no retries: a flaky test is a bug, not noise
  fullyParallel: true,
  forbidOnly: true,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    launchOptions: { args: launchArgs },
  },
  projects: [
    { name: "api", testDir: "tests/api", testMatch: "**/*.spec.ts" },
    { name: "e2e", testDir: "tests/e2e", testMatch: "**/*.spec.ts", use: { ...device } },
  ],
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
