// The window.__cosmic hook is installed by src/app/test-hooks.ts, and only when the
// URL carries ?test=1. It is declared optional on purpose: before the game has booted,
// and on a page loaded without ?test=1, the property genuinely does not exist, and a
// spec must be allowed to ask that question without lying to the type system.
//
// The shape lives in tests/e2e/helpers.ts, in one place.

import type { CosmicSnapshot } from "./helpers";

declare global {
  interface Window {
    __cosmic?: CosmicSnapshot;
  }
}

export {};
