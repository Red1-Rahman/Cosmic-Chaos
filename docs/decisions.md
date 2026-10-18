# Decisions log

Agents append one entry per non-obvious choice. Newest last. Keep entries short.

Format:

```
## YYYY-MM-DD role: short title
Context: what forced a choice
Decision: what was chosen
Alternatives: what was rejected and why
```

## 2026-10-19 sim: arena constants mirrored, not imported

Context: `src/sim` may not fetch or import `src/assets`, but the sim needs the play band, field radius and default seed.
Decision: `src/sim/game-config.ts` mirrors `public/assets/assets.json` `arena` verbatim (`ARENA`, `SPAWN_RULES`, `MOVEMENT` exported). The sim reads only that file.
Alternatives: importing the JSON directly was rejected because it would couple the pure sim to the assets layer and its loader types. qa-ci owns a spec test asserting the mirror still matches assets.json.

## 2026-10-19 sim: spawn order and field avoidance

Context: `createWorld` must place every character from the seeded stream, and nothing may start inside the snail's time field, which also rules out the player.
Decision: order is player, snail, then orca, shark, tarantula, humans. The snail is placed first with the extra constraint `distance >= fieldRadius + 8` from the player, so the player never starts in the field. Orca, shark and tarantula use `spawnMinDistance` 220 plus the field margin. Rejection sampling runs 24 attempts (`assets.json maxAttempts`), then falls back to a deterministic golden-angle spiral so the function can never fail to return a point.
Alternatives: placing the snail last and re-checking the player was rejected as it wastes stream draws and makes the seed hard to reason about. Entity ids are `player`, `snail`, `<kind>-1`, `human-1..n`.

## 2026-10-19 sim: hash quantisation

Context: golden replay hashes must not trip over float noise.
Decision: `hashWorld` rounds every number to 1e-6 before FNV-1a hashing and serialises `props` with sorted keys, so the hash is independent of prop insertion order. Output is an 8 hex digit string.
Alternatives: hashing raw floats was rejected because it is unstable across engines.

## 2026-10-19 viewport-render: letterbox bar colour

Context: `assets.json` has no `barColor`, but the letterbox and pillarbox bars have to be
some colour, and the same value must exist in CSS and in Canvas 2D so the debug overlay
matches the page.
Decision: `#05060f`, a near-black with a blue cast, exposed as `BAR_COLOR` in
`src/render/viewport.ts` and mirrored as `--bar-color` in `src/styles/arena.css`.
Alternatives: pure `#000000` (dead flat, harsher on OLED), and `#0b1026` from the arena
horizon (too light, reads as part of the scene).

## 2026-10-19 viewport-render: contain-fit, integer scale and device pixels

Context: the manifest locks the canvas internal size to the preset logical size, so
devicePixelRatio cannot change the render resolution.
Decision: contain-fit only. `scale = min(winW/logicalW, winH/logicalH)`, rounded down to a
whole number when that whole number keeps at least `integerScaleMinFill` (0.9) of the fit
and is at least 1. CSS size is then snapped to whole device pixels and clamped to the
window, so the pixelated upscale stays crisp on HiDPI and can never overflow.
Alternatives: stretching to fill (rejected, distorts every sprite), rendering at
window times devicePixelRatio (rejected, changes the logical size the sim works in).

## 2026-10-19 viewport-render: eight presets and the computeLayout signature

Context: `assets.json` lists eight viewport presets. The last two, `1:sqrt2` and `9:20`,
are portrait and name `canvas-03-mobile`; the rest name `canvas-03`. `tech-stack.json`
only listed seven.
Decision: handle all eight, and add `"9:20"` to `tech-stack.json#viewport.presets` so the
source of truth matches the manifest. `computeLayout(win, presets, devicePixelRatio?)`
picks the preset internally and delegates to `computeLayoutForPreset(win, preset)`, which
is the escape hatch when a caller already knows the preset.
Alternatives: hardcoding a seven preset list in TypeScript (rejected, it drifts), and
picking the nearest preset by raw ratio difference (rejected, log distance treats wide and
narrow gaps equally, which matches how the presets are spaced).

## 2026-10-19 role: audio: schedule events instead of node graphs

Context: voice specs must be assertable in node, but `src/audio/web-audio-backend.ts` needs real Web Audio types and the AudioContext may only be created inside `unlock()`.
Decision: `voices/*.ts` are plain data using locally declared `WaveKind`/`FilterKind` unions; `schedule.ts` expands a spec plus a start time into absolute-time parameter events (`gain`, `frequency`, `filterFrequency`, `detune`) with linear ramps and a quantized detune wobble. Only the backend touches DOM types.
Alternatives: hand-written ramps per voice (rejected: untestable sound design), DOM types inside the specs (rejected: drags Web Audio into node tests).

## 2026-10-19 role: audio: engine hum is a continuous voice, not a one-shot

Context: `setEngine(speed01, timeScale)` must be safe to call every frame, before `unlock()`, and must pitch down inside the Snail's field.
Decision: `voices/engine.ts` holds an `EngineSpec` plus pure `engineFrequency`, `engineGain` and `engineFilterHz`. The backend starts two oscillators at `unlock()` and moves them with `setTargetAtTime`; a locked backend drops the update.
Alternatives: restarting oscillators per change (rejected: clicks and node churn), reading the time scale from the sim (rejected: `src/audio` must not import `src/sim`).

## 2026-10-19 role: audio: rate limiting only counts cues that sounded

Context: `play()` before `unlock()` must be harmless, but the clock is frozen at zero until a context exists, so naive last-played tracking would swallow the first real play after unlocking.
Decision: `port.ts` records a timestamp only when the outcome was `played`. `muted`, `rate-limited` and `locked` attempts are still forwarded so the recording backend can assert on them.
Alternatives: recording every attempt (rejected: a locked start ate the first cue after unlock).

## 2026-10-19 role: audio: noise buffer comes from the cosmetic RNG stream

Context: `Math.random` is banned and the noise bursts must be reproducible.
Decision: one shared 2 second mono buffer filled from `createRng(seed).fork("audio:noise")`; buffer start offsets are integer arithmetic on the schedule start time.
Alternatives: `crypto` noise (banned), a fresh buffer per burst (rejected: wasted buffers, worse reproducibility).

## 2026-10-19 role: audio: codebase.txt describes a narrower AudioPort

Context: `codebase.txt` line 71 lists `AudioPort { unlock(), play(cue), setMuted(bool) }`, but the lead's contract adds `setEngine` and `dispose`.
Decision: implemented the lead's five-method contract. `codebase.txt` is human-owned and was left alone; the human should update that line.
Alternatives: dropping `setEngine` (rejected: the hum has no other driver), editing `codebase.txt` (rejected: human-owned).

## 2026-10-19 role: render: the arena is contain fitted into every preset

Context: the canvas buffer is the preset logical size (1408x792, 1770x540, 810x1800, ...), never the 1408x768 arena, so arena coordinates cannot be canvas coordinates.
Decision: `computeArenaView(arena, logical)` is a contain fit, cached per layout by `resize()` and refreshed when the preset id or the logical size changes. Every prop, entity and particle is drawn in arena coordinates inside `translate(offset) + scale(k)`, so `arena.playBand` is fully on screen at all eight presets. The background is the exception: it is cover fitted to the whole canvas, because it is art rather than a coordinate space and must never leave a gap.
Alternatives: cover fitting the arena (rejected: pushed the play band off screen on the tall presets), stretching the arena (rejected: the viewport contract is contain only), one canvas pixel per arena pixel (rejected: portrait presets would lose a third of the arena).

## 2026-10-19 role: render: the renderer caches the previous tick instead of asking the sim

Context: `render(ctx, world, layout, alpha)` gets one world snapshot plus the loop interpolation alpha, and the sim is forbidden from knowing about the renderer.
Decision: the renderer keeps a private `previous { tick, positions }` from the last frame and interpolates x and y only when `previous.tick === world.tick - 1`; otherwise it uses the world position as is. The cache is presentation state, never written back.
Alternatives: adding previous/next positions to `Entity` (rejected: doubles sim state and the golden hash), ignoring alpha entirely (rejected: 60Hz sim on a 144Hz display judders).

## 2026-10-19 role: render: cosmetic one-shots arrive through pushEvent

Context: the app drains `world.events` for audio and UI, so the renderer cannot consume the queue itself, and the sim must not know about particles.
Decision: `Renderer.pushEvent(event)` queues hit, splash and laser events into a 64 entry cosmetic buffer that the next `render` drains into the particle system. The world queue is never touched and never mutated.
Alternatives: passing a list into `render` (rejected: changes the agreed signature every frame), cloning `world.events` (rejected: allocation per frame for data the app already has).

## 2026-10-19 role: render: reduced motion is a flag on the Renderer, not a media query

Context: `prefers-reduced-motion` is a browser global, and `src/render` should stay testable in node.
Decision: `createRenderer(manifest, atlas, { reducedMotion })` plus `setReducedMotion(bool)`. Under it, particle counts, jet flutter, the time field breath and the crystal pulse all collapse to a steady value, and enabling it clears anything already in flight. The app owns the `matchMedia` listener.
Alternatives: `matchMedia` inside the renderer (rejected: DOM global in a node tested module), an option the caller must remember to pass (rejected: silently ignored accessibility).

## 2026-10-19 role: render: flashes are rate limited by a hold-per-step limiter

Context: no flash may change more than three times per second, but hit sparks are driven by a decaying value that moves every frame.
Decision: `createFlashLimiter()` holds the quantized level until `flashStep(timeMs)` advances, so the visible level can change at most `MAX_FLASH_HZ` (3) times per second. `quantizeFlash` alone is the pure snap, exported for tests.
Alternatives: dropping flashes past a threshold (rejected: the hit response would vanish), smoothing the decay (rejected: still crosses more than three levels a second).

## 2026-10-19 role: render: props are read field by field with manifest defaults

Context: `proceduralProps` is a heterogeneous array and `shape`, `jets`, `wake` and `colors` are loosely typed dicts that may be absent.
Decision: `readWaterbike`, `readTimeField`, `readCrystalGlow` and `readStardust` in `props.ts` parse field by field and fall back to the shipped values, so a missing or partial prop never throws mid frame and never silently draws a zero sized shape.
Alternatives: casting the raw dicts (rejected: a missing field would reach Canvas as NaN), throwing on a bad prop (rejected: the renderer must never break the frame loop).
