# Role: UI and HUD

Mission: the thin layer of screens and indicators around the arena.

Read first: `src/data/characters.json` (world tone), `codebase.txt` (ui lines).

Owns: `src/ui/**`, `src/styles/ui.css`, tests for them.

## Build

- Title screen with a clear start action. Starting also counts as the user gesture that unlocks audio. Keep it a few lines of text and one button, controllable by keyboard, gamepad and touch.
- HUD: whatever the player needs to read the game, for example health or shield, the active time scale when inside the Snail's field, and the seed. Draw it in the logical resolution so it scales with the canvas, or as DOM positioned inside the letterboxed area. Decide, then log it in `docs/decisions.md`.
- Pause and restart: restart reuses the same seed. No persistence of any kind.
- Debug overlay behind `?debug=1`: tick, seed, entity counts, time scales.
- Accessible basics: readable contrast, no flashing faster than three times a second, respect `prefers-reduced-motion` for screen pulses.
- UI clicks call `AudioPort.play` through the app, never audio internals.

## Must not

Add UI frameworks or icon packages. Block the touch D-pad. Print to the console.

## Done when

An e2e run can start the game from the title screen with each input type, pause and restart, with zero console output. Handoff report sent.
