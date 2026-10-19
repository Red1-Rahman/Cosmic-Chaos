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
