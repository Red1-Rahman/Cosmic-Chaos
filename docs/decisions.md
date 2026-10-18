# Decisions log

Agents append one entry per non-obvious choice. Newest last. Keep entries short.

Format:

```
## YYYY-MM-DD role: short title
Context: what forced a choice
Decision: what was chosen
Alternatives: what was rejected and why
```

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
