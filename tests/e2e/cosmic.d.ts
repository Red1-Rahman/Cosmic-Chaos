// The window.__cosmic hook is installed by src/app/test-hooks.ts, and only when the
// URL carries ?test=1. This declaration lets the e2e specs read it without a cast at
// every call site, and keeps the shape in one place: tests/e2e/helpers.ts.

import type { CosmicSnapshot } from "./helpers";

declare global {
  interface Window {
    __cosmic: CosmicSnapshot;
  }
}

export {};