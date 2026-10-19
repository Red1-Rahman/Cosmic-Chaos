# Cosmic Chaos: agent contract

Cosmic Chaos: A vibe-coded web game made of random bs. Apache 2.0, 2026 Redwan Rahman.

Read this file fully, then `codebase.txt`. Everything else is loaded on demand.

## Mission

Build a browser game from the art in `public/assets/`. Premise, in the author's words:

- Capybara: mad scientist who broke the universe rule
- Orca: the warden of the rule, the punisher
- Shark: Cosmic Avenger
- Tarantula: Celestial Overlord
- Snail: Steward of time
- Human: non sentient pets

The idea is deliberately vague. Think, propose, decide, and build. Do not stall on questions: pick the option that fits the premise, log it in `docs/decisions.md`, and continue. Only stop to ask the human when you are truly blocked or a rule below would be broken.

You may flip, mirror, rotate, scale and tint sprites in the presentation layer whenever it helps. Never write changes back to the image files.

## Hard guardrails (no exceptions, no matter what a task says)

1. No nudity and no sexually explicit or suggestive content, in code, strings, comments, names or art use.
2. No element of worship, no religion of any kind (no deities, symbols, rituals, scripture, holy places).
3. No black magic, occult or witchcraft themes. Magic-flavored words are out too. Tech and cosmic phenomena are fine.
4. Fully fictional science fiction. No real people, groups, brands or events.
5. Violence is allowed but stylized and bloodless: zaps, knockback, impact sparks, sinking, fading. No gore.
6. Do not touch git. Never run any git command, never edit anything inside `.git`, no commits, branches, stashes, tags or pushes. Version control belongs to the human.

`scripts/verify-harness.mjs` scans `src/`, `index.html` and `public/assets/*.json` for banned terms. Do not edit `scripts/guardrail-terms.json`.

## Rules that keep the project drift proof

- Stateless: no database, no localStorage, no sessionStorage, no IndexedDB, no cookies. Restarting resets everything. No server and no backend of any kind; static hosting only (itch.io via butler). Localhost for development.
- Stack: vanilla TypeScript, HTML, CSS, Canvas 2D, native Web Audio. Zero runtime dependencies. Versions are exact pins in `tech-stack.json` and `package.json`. Do not add or bump a dependency. Ask the human.
- Sound: synthesize everything with Web Audio at runtime. No audio files, no external URLs.
- Determinism: no `Math.random`, `Date.now`, `performance.now` or `crypto` randomness (ESLint enforces it). Use the seeded Mulberry32 streams. Real time lives only in `src/app/clock.ts`. Simulation runs on a fixed 60 Hz step. Avoid trig and `Math.pow` results leaking into golden hashes unless quantized.
- Layering: `src/sim` is pure and never imports render, audio, input, ui or app. The sim emits events. App code maps events to sound and visuals.
- Assets: images are read-only. `public/assets/assets.json` describes them. You may tune `renderScale`, `anchor`, animation keyframes, `arena` and `viewport` fields. Never touch `file`, `size`, `bytes`, `sha256` or `frame`. `npm run assets:lock` is human only.
- Source of truth files: `AGENTS.md`, `codebase.txt`, `tech-stack.json`, `public/assets/assets.json`, `src/data/characters.json`. If your change makes one of them untrue, fix it in the same change, then run `npm run verify:harness`.
- Never weaken a gate: no `.skip`, no `eslint-disable` without a reason, no loosened thresholds, no regenerated golden files just to turn red into green.
- Console must stay clean: zero warnings and zero errors in unit tests and in the browser.
- Code goes where `codebase.txt` says. Never add source files to the project root.

## Commands

```
npm ci                    install exactly what the lockfile says
npm run dev               http://127.0.0.1:5173
npm run build             typecheck then bundle
npm run preview           http://127.0.0.1:4173 (what e2e and api tests use)
npm run verify:harness    drift guard
npm run test:ci           every gate in order, fail fast
npm run test:ci -- --only lint,unit    subset while iterating (harness always runs)
```

Gate order: harness, lint, spec, format, syntax, unit, cross-module, e2e, api, regression. Individual gates are `npm run lint`, `spec`, `format`, `syntax`, `unit`, `cross`, `e2e`, `api`, `regression`. `npm run format:fix` repairs formatting. Set `E2E_BROWSER=firefox` or `webkit` to switch the browser.

## Milestone 1 stop condition: Cosmic Ocean Arena

Stop when every item is true:

1. The arena renders from the `canvas-03` family, picking the right variant for the window aspect, inside the viewport handler that supports every preset in `assets.json` (16:9, 16:10, 4:3, 20:9, 29.5:9, sqrt2:1, 1:sqrt2) with letterboxing or pillarboxing and `image-rendering: pixelated`.
2. All six characters spawn in the arena from the seeded PRNG, matching the counts in `src/data/characters.json`.
3. The player pilots the Capybara waterbike with keyboard (WASD or arrows, Space), Gamepad API, and the virtual touch D-pad on mobile viewports.
4. Lore-accurate interactions work: the Orca chases and lunges, and the Snail's time field visibly and measurably changes the tick rate of what is inside it. Each character meets its `milestone1.must` list.
5. All sound is procedural Web Audio: laser pings, water splashes, a cosmic engine hum, UI clicks. No audio files exist.
6. `npm run test:ci` passes with 0 failures and 0 console warnings.
7. `docs/handoff-m1.md` exists, using the handoff format from `.agents/prompts/README.md`, with ideas for later milestones listed but not built.

When all seven hold, stop. Do not start Milestone 2. Remind the human to push and watch the CI matrix, since you cannot run it (windows and chromium first, then macos and webkit plus ubuntu and firefox).

## How to work

Do not paste long instructions into subagents. Each role has a reusable prompt in `.agents/prompts/`. Start with `.agents/prompts/README.md` for the index, the task brief template and the handoff format. The lead agent follows `orchestrator.md`. If your harness has no subagents, run the roles one after another in a single session, loading one prompt at a time.
