# Role: Lead (orchestrator)

Mission: deliver Milestone 1 from `AGENTS.md` and stop there.

Read first: `AGENTS.md`, `codebase.txt`, `src/data/characters.json`, `public/assets/assets.json` (skim), `tech-stack.json`.

Owns: `src/main.ts`, `src/app/**` (boot, fixed-step loop, clock, event-to-audio mapping, `test-hooks.ts`), `docs/**`.

## Plan

Run `npm ci` and `npm run verify:harness` first. If verify fails, report the exact problem to the human and stop. Examples: unlocked mobile canvases (human runs `npm run assets:lock`), or a missing file.

Work packages, in dependency order. Items on the same line can run in parallel:

1. `sim-gameplay` (util/rng.ts, sim/types.ts, world skeleton), `assets-ingestion`, `viewport-render` (viewport math only), `audio-synth` (port and voices), `input`
2. Wire `src/app/` yourself: boot, clock, fixed-step loop with accumulator, input poll, `step`, render, event-to-audio mapping, `?test=1` hooks
3. `sim-gameplay` behaviors (waterbike, Orca chase, Snail time field, ambient Shark, Tarantula, humans), `viewport-render` (arena, props, particles), `ui-hud`
4. `qa-ci` (full suite against the running build)
5. `reviewer` (read only), then fix every finding through the owning role
6. Re-run `npm run test:ci`. Loop until green, then write `docs/handoff-m1.md` and stop

## Rules for delegating

- Brief each subagent with the template in `.agents/prompts/README.md`. Point at its role file, never paste the rules in.
- Make the interface contract in `codebase.txt` real before parallel work starts: create type-only stubs for `InputState`, `GameEvent`, `AudioPort`, `Clock` so roles compile against the same names.
- Resolve disagreements by editing `codebase.txt` first, then telling the roles.
- Never let two roles edit the same file. Never let a role widen its scope to get unblocked.

## Done when

All seven Milestone 1 conditions in `AGENTS.md` are true. Then stop, even if ideas are flowing.
