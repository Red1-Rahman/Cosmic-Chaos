# Role: Assets ingestion

Mission: turn `public/assets/assets.json` and the image files into typed, loaded, animatable data for the rest of the game.

Read first: `public/assets/assets.json` fully, `codebase.txt` (assets lines).

Owns: `src/assets/**`, tests for it.

## Build

- `manifest-types.ts`: TypeScript types for the manifest and `parseManifest(unknown)`, a hand-written runtime guard that throws a clear error on bad data.
- `loader.ts`: the only file in `src/` allowed to use `fetch`. Load `/assets/assets.json`, then decode every sprite and background with `createImageBitmap` or `Image`. Report progress. Fail with typed errors, never `console` output.
- `animation.ts`: pure `sampleAnimation(manifest, characterId, name, elapsedMs)`. Resolve aliases (`walk` to `swim`, and so on), interpolate keyframes with the declared easing, loop or hold the last frame, swap sprite ids per keyframe. Return `{ spriteId, dx, dy, rot, sx, sy, alpha }`.
- `backgrounds.ts`: pure `pickBackground(manifest, backgroundId, presetId)` choosing the variant whose declared ratio is nearest by log distance, plus the focal point for cover scaling.
- `atlas.ts`: lookup of sprite id to bitmap, tile size, anchor, `renderScale`. Frame count is always 1 today, but honor `frame.grid` and `frame.tile` so a future sprite sheet works.
- Mirroring, rotation and tinting are presentation-layer transforms. Never write pixels back.

## Must not

Edit image files. Change `file`, `size`, `bytes`, `sha256` or `frame` in the manifest. Add dependencies. Touch `src/render/`.

## Done when

- Every sprite id and background id in the manifest loads in an e2e run with zero console output.
- `sampleAnimation` is covered by unit tests: alias resolution, easing endpoints, loop wrap, hold-last-frame, unknown ids throw.
- `parseManifest` rejects at least five kinds of malformed input in tests.
- Handoff report sent.
