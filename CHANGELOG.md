# Changelog

All notable features of Cosmic Chaos are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release dates are UTC, written as `DD Mon YYYY` (e.g. `19 Oct 2026`).

## [Unreleased]

### Added

- Play-on-itch.io badge in the README linking to the released build

### Changed

- The deploy workflow is hardened: named steps running under `set -euo pipefail`, version detection that survives a missing previous `package.json`, a check that the build produced `dist/index.html`, a check that `index.html` sits at the root of `game.zip`, retries while downloading butler, and a fail-fast check that `ITCH_USER`, `ITCH_PROJECT` and `BUTLER_API_KEY` are configured
- Butler is downloaded from `broth.itch.zone` and the release version is pushed with `--userversion`

### Fixed

- The spec gate derived its repository root by hand, dropping the leading `/` on macOS and Linux so four content-contract tests failed there; it now reuses the shared root from the spec helpers
- The e2e storage spy wrote to the stores it was watching: assigning `setItem`, `removeItem` and `clear` onto `localStorage` is itself a named-property write in Firefox and WebKit, which planted exactly the three keys `stateless.spec.ts` counts while leaving the spy uninstalled; the spy now patches `Storage.prototype`, so it records writes on every engine instead of none on those two
- The two snail time-field tests could not survive their own stage: the Orca kills the rider during the long reads (five hull hits of 0.22 each land in 13–16 simulated seconds) and a defeated world answers every poll the same way forever, so the reads had to both protect the rider and re-deal the opening. The reads are now driven and judged inside the page, in one `requestAnimationFrame` module: it steers for the field centre with the same goal keys and tick-measured stall escapes the node driver uses (the sideways shove also points toward the goal's side of the water now, so a rider pinned to a band edge slides back into open water instead of wedging forever), it judges the whole invariant of the phase on single atomic samples and latches the verdict the frame it holds — only one sample can be caught mid-crossing, where the flag and the scale do not yet agree, and the latch waits for a sample where they do — and the node side only polls the latch, re-clicking the defeat dialog's "Try again" so a run ended under a read deals the same opening again. The latch is never missed by a poll, because a node-side loop costs one to several rendered frames per pass and is glacial exactly when the world moves fastest, while the in-page module judges every frame
- The Warden's dashes are dodged by a page-side reflex that schedules off the simulation's own clock instead of reacting: the wind-up is a fixed 420 ms and the dash covers at most about 260 ms more, so one dodge burst fired 270 sim-ms into a wind-up carries 420 ms of invulnerability across the contact range of every possible lunge, however slow the machine; a dash whose wind-up was never seen (the watcher joined mid-wind-up) presses at once, and a press is held for several frames before the keyup, because the input source polls a held-key set once per frame and never sees a press and a release inside one JavaScript turn
- The briefing screen re-renders on every frame, and each re-render re-assigned the story avatar's image source with the same URL; Firefox restarts an image request whenever its source is assigned again, so the in-flight request was aborted and a new one started about 60 times a second — the avatar never finished loading on Firefox and every aborted fetch surfaced as a `requestfailed` entry, failing the e2e console guard on random tests (seen on every Ubuntu + firefox CI run since the guard was added). The source is now assigned only when the speaker actually changes, which loads it once on every engine
- The HUD and the rest of the DOM trail the simulation by whole seconds on a crowded machine, because page frames land a few times per second while the fixed-step sim keeps stepping on its clock with clamped catch-up; the HUD readout and field-marker checks therefore no longer ride inside the atomic sample and instead retry across that whole window on their own, and the per-test timeout was raised to 45 s to hold a re-dealt cycle with margin
- The orca state-cycle test needed 900 animation frames to finish inside Playwright's default 30 second timeout, so an engine rendering below 30 fps could not pass it; the sampling now stops the moment `chase`, `telegraph` and `lunge` have all been seen, with the frame cap and the assertions unchanged

## [0.1.0] - 19 Oct 2026

Initial release.

### Added

**Campaign**

- Five hand-authored levels across three scene modes: Lab Breach, Candy Current and Cosmic Correction
- Sequential level unlocking with a level picker
- Briefing screens with story beats, objective targets and a gameplay hint; victory and defeat screens
- Objective kinds: collect cosmic cores, topple wardens, survive the correction
- Pause, resume, restart and next-level flows
- Scrolling Apache 2.0 licence reader, closed with Escape

**Cast** (six characters, placed from a seeded spawn)

- Pilot the Capybara waterbike
- Orca warden that chases, telegraphs and lunges
- Shark Cosmic Avenger that runs a fixed diagonal dash
- Snail Steward whose time field slows everything inside it
- Tarantula Celestial Overlord hovering overhead, reacting to fire
- Drifting human pets

**Controls**

- Keyboard (WASD / arrows), Gamepad API and mobile touch controls (D-pad plus a 2x2 action cluster)
- Space to hop; water cannon on J, Shift, click or tap; K to dodge; L to parry
- Mouse and tap firing merged with whichever device is steering
- Rider-name field that never leaks keystrokes into the game

**Physics and combat**

- Waterbike momentum with acceleration, drag and reef collision
- Water cannon that staggers and topples wardens, never harms
- Dodge burst with invulnerability that passes through reefs
- Parry window that turns an attack and topples the attacker
- Static reefs and kelp pillars
- Snail time field that measurably changes the tick rate of what is inside it

**Presentation**

- Camera zoomed onto the play band across eight viewport presets, with letterboxing / pillarboxing and pixelated upscale
- Procedural Web Audio (engine hum, laser, splash, hit, jump, defeat, UI clicks) with no audio files
- HUD: hull meter, time-field readout, action readiness meters, objective board, dialogue, pause and mute
- Staged first-run tutorial that introduces one concept at a time
- Reduced-motion support and a `?debug=1` overlay

**Meta**

- Stateless and fully deterministic; `?seed=` replays a run exactly
- `?test=1` read-only hooks for automated tests
- Version-bump auto-deploy to itch.io
