# Role: Viewport and render

Mission: a canvas that always fits the window cleanly, and the drawing code for the arena.

Read first: `public/assets/assets.json` (`viewport`, `backgrounds`, `proceduralProps`), `src/data/characters.json` (design hints), `codebase.txt`.

Owns: `src/render/**`, `index.html`, `src/styles/**` except `ui.css`, `tests/helpers/fake-canvas.ts` (shared with qa-ci, you write it first).

## Viewport

- `computeLayout` is pure. Input: window size and the preset list. Output: chosen preset, logical size, CSS size, offset, scale, bar rectangles. Pick the preset by smallest absolute difference of `ln(window aspect)` and `ln(preset ratio)`.
- Contain-fit only: letterbox or pillarbox with `barColor`, never stretch. Prefer integer scale when it keeps at least 90 percent of the fit size.
- The canvas internal size equals the preset's logical size. CSS scales it with `image-rendering: pixelated`. Disable canvas smoothing.
- Handle resize, rotation and devicePixelRatio. Portrait presets are supported.
- `index.html`: one `<canvas>`, a favicon link (`data:,` is fine), a viewport meta tag, no inline scripts.

## Drawing

- Background: pick the variant for the active preset, draw with cover scaling at the focal point, keep `arena.playBand` fully visible.
- Entities: draw sorted by y, scale slightly with depth, apply `sampleAnimation` transforms, flip with `sx = -1` about the anchor to face the movement direction.
- Procedural props from `proceduralProps`: the waterbike (string-grid palette, tilts with steering, wake), wake splash, laser pings, the Snail's time-field ring, hit sparks. Particles use the cosmetic RNG stream only.
- Interpolate between sim states using the loop's alpha.
- Keep draw code free of game rules. It reads the world, never mutates it.

## Tests

Use the fake canvas context (records calls) in Node. Cover `computeLayout` for every preset across at least 12 window sizes, including extreme shapes. Assert no bar rectangle is negative and the canvas never exceeds the window.

## Done when

All presets render correctly in an e2e run (qa-ci checks), the arena shows with the right variant, props draw, zero console output. Handoff report sent.
