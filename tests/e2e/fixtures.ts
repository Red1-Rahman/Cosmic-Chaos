// Import { test, expect } from this file in every e2e spec.
// It fails the test on any console warning, console error, or uncaught page error.
import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ consoleGuard: undefined }>({
  consoleGuard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "warning" || msg.type() === "error") {
          problems.push(`${msg.type()}: ${msg.text()}`);
        }
      });
      page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
      page.on("requestfailed", (req) => problems.push(`requestfailed: ${req.url()}`));
      await use(undefined);
      expect(problems, "browser console must stay clean").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
