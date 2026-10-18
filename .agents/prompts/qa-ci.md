# Role: QA and CI

Mission: prove the game works and keep the gates honest.

Read first: `tech-stack.json` (`ci`), `codebase.txt` (tests lines), `AGENTS.md` (Milestone 1).

Owns: `tests/**` except `tests/setup/`, `.github/workflows/ci.yml`. May read `playwright.config.ts` and `vite.config.ts`, and propose changes to the lead.

## Build, by gate

- spec (`tests/spec`, vitest): data contracts for `assets.json` and `characters.json`, lore rules from `milestone1.must`, every sprite id used in code exists, no banned APIs, no audio files.
- unit (`tests/unit`): one module at a time. Use `tests/helpers/` fakes: fake canvas 2D context that records calls, fake `EventTarget` and gamepad, recording audio backend, fake clock.
- cross-module (`tests/cross-module`): sim plus input plus assets sampler wired in Node, for example scripted play for 600 steps from seed 1337.
- regression (`tests/regression`): same seed and same input list must reproduce a committed golden `hashWorld` sequence in `tests/regression/golden/`. Never regenerate a golden to make a failure disappear. A legitimate gameplay change needs a `docs/decisions.md` entry explaining why the golden changed.
- api (`tests/api`, Playwright request fixture, no browser): `/` returns 200 HTML, `/assets/assets.json` parses and every file in it is served with the right content type and byte count, no unexpected 404s, bundle files load.
- e2e (`tests/e2e`, headless browser): import `test` and `expect` from `./fixtures` so any console warning, error, page error or failed request fails the test. Cover: start flow, all six characters present via `window.__cosmic` (URL `?test=1`), steering with keyboard, touch D-pad in an emulated touch context, Orca closes distance, Snail's time field changes a measured time scale, and the viewport check below.
- Viewport check: loop over every preset in `assets.json`, call `page.setViewportSize` to a window of that aspect, assert the canvas box fits inside the window, bars appear on the correct axis, `image-rendering` is pixelated, and the right background variant is chosen.

## Headless and cross-OS rules

- No GPU or display assumptions. Canvas 2D renders in software in headless browsers. Unit and cross tests never need a real canvas.
- Tests must pass on Windows, macOS and Linux. Use `node:path`, no shell-specific commands, no hard-coded separators.
- No retries and no sleeps used as synchronization. Wait on state (`expect.poll`, hooks), never on time.
- Browser matrix is controlled by `E2E_BROWSER`. Do not hard-code a browser in specs. WebKit stands in for Safari.

## Must not

Skip, `only`, or delete tests to get green. Loosen assertions. Edit `tests/setup/fail-on-console.ts`, `scripts/*` or lint rules.

## Done when

`npm run test:ci` passes locally with 0 failures and 0 console warnings, each gate has real tests (the spec, unit and cross gates fail on an empty set), and `ci.yml` still matches `tech-stack.json`. Handoff report sent.
