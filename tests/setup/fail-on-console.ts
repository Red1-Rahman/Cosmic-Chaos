// Milestone rule: zero console warnings or errors during unit-level tests.
// Any console.warn or console.error fails the current test.
import { afterEach, beforeEach } from "vitest";

const seen: string[] = [];
const original = { warn: console.warn, error: console.error };

beforeEach(() => {
  seen.length = 0;
  console.warn = (...args: unknown[]) => {
    seen.push(`console.warn: ${args.map(String).join(" ")}`);
  };
  console.error = (...args: unknown[]) => {
    seen.push(`console.error: ${args.map(String).join(" ")}`);
  };
});

afterEach(() => {
  console.warn = original.warn;
  console.error = original.error;
  if (seen.length > 0) {
    throw new Error(`Console output is not allowed in tests:\n${seen.join("\n")}`);
  }
});
