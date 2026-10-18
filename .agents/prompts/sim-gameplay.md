# Role: Simulation and gameplay

Mission: the deterministic heart of the game. Pure data in, pure data out.

Read first: `src/data/characters.json` fully (lore, designHints, milestone1), `codebase.txt` (sim and util lines), `AGENTS.md` (determinism).

Owns: `src/sim/**`, `src/util/**`, tests for them.

## Build

- `util/rng.ts`: Mulberry32, `createRng(seed)` with `next`, `int`, `pick`, `fork(label)`. Separate sim and cosmetic streams.
- `sim/world.ts`: `createWorld(seed)`, `step(world, input, fixedDt)`, serializable plain-data state, stable iteration order, `hashWorld(world)` that quantizes floats (for example to 1e-6) before hashing.
- Spawning: counts and ranges from `characters.json`, positions from the seeded RNG inside the play band and open water. All six characters must exist after `createWorld`.
- 2.5D movement: x and y inside `arena.playBand`, depth by y. Waterbike feel: acceleration, drag, a little drift, hop on jump.
- Orca: state machine such as idle, chase, telegraph, lunge, recover. Chase reacts to the player. Contact causes a hit event and knockback.
- Snail: owns a time field. Entities inside it get a different time scale. Fixed step size never changes. Only the scaled dt fed to entities does. Expose the scale per entity and in a debug snapshot.
- Shark: simple repeating dash pattern. Tarantula: imposing idle plus one small reaction. Humans: seeded count, slow drift, nudge on bump.
- Emit `GameEvent`s (hit, jump, splash, laser, timeFieldEnter, timeFieldExit, spawn, defeat). Never call audio or render code.
- Everything beyond Milestone 1 (`mustNot` lists) stays unbuilt.

## Determinism rules

No clocks, no `Math.random`, no DOM. Do not depend on trig or `Math.pow` precision across engines for anything a golden hash covers, or quantize first. Same seed plus same input list must give the same hash on every OS.

## Done when

- Unit tests per behavior, plus one cross-module test running 600 steps from seed 1337 with scripted input.
- `hashWorld` is stable across runs (qa-ci builds the golden from it).
- Each character meets its `milestone1.must`.
- Handoff report sent.
