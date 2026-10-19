# Milestone 1 handoff: Cosmic Ocean Arena, then the campaign

Status: done. `npm run test:ci` passes all ten gates with zero failures and zero
console warnings on the gate machine (windows + chromium). The macos + webkit and
ubuntu + firefox jobs run after it in CI and are not verified here.

## What shipped

**The arena (Milestone 1).** One canvas, contain-fitted into all eight viewport
presets, letterboxed or pillarboxed, pixelated. All six characters spawn from the
seeded Mulberry32 stream. Keyboard, gamepad and a virtual touch D-pad all steer
the Capybara waterbike. The Orca chases, telegraphs and lunges. The Snail's time
field measurably changes the tick rate of whatever is inside it. Every sound is
synthesized at runtime; no audio files exist.

**The game around it.** A home menu (Play, Levels, Controls, License) with a rider
name that lives only in the tab. Five levels, each with its own seed offset, brief,
objective book and authored reef layout, unlocked in order. Three objective kinds:
collect cores, topple wardens with the water cannon, stay afloat. The cannon
fires real pellets that reefs can stop; the dodge is a burst with invulnerability
that passes through reefs; the parry turns a lunge around and takes the warden
down with it. Character dialogue fires off gameplay events, and the HUD carries an
objective board, three readiness meters, a clock and a dialogue box.

## Gates

```
npm run test:ci  -> harness, lint, spec, format, syntax, unit, cross-module, e2e, api, regression: all PASS
```

## Things a later milestone should know

- **The play band is 1260 x 162 px.** Every level's reef layout is authored inside
  it. A wider band means editing `assets.json#arena.playBand`, `ARENA` in
  `src/sim/game-config.ts` together, and re-authoring five level layouts.
- **Nothing is persisted.** Level progress, the rider name and mute state all die
  with the tab. Any save would need a decision, not just code.
- **`hashWorld` folds level, obstacles, cores, pellets, objectives, the stagger
  tally and the current dialogue line.** Any change to those changes the golden.
- **`?seed=` still reproduces a run exactly**; a level only adds a fixed offset.
- **Procedural art is the bottleneck for new level props.** Reefs, kelp, cores,
  pellets, the parry ring and the dodge streak are all Canvas 2D paths in
  `src/render/props.ts`. A human adding sprite art would let these become sprites.

## Ideas for a later milestone, not built

- Boss variants of the Orca and Shark that use the existing stagger meter as a
  phase counter.
- Human pets as movable cover: bump one into a reef to block a lunge.
- A time-field toggle, so the Snail can open and close the window the level wants.
- Multiplayer-free "ghost runs": replay your own seed after a loss.
- Longer dialogue with branching, once the cast has enough voice to justify it.
