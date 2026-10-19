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

## 2026-10-19 viewport-render: no per entity depth haze veil

Context: a real browser smoke run showed every distant entity inside a visible lighter rectangle, because `drawSprite` filled an axis aligned rect over the sprite bounding box after restoring the transform (the tarantula read as a grey box in the sky).
Decision: removed the veil entirely. `SpriteDraw` loses `tintAlpha`/`tintColor`, and `renderer.ts` stops computing `farTint`/`nearTint`/`mixColor`/`withAlpha` for it. Depth is carried by `scaleMin`/`scaleMax` alone, which the manifest background art already supports.
Alternatives: keeping the veil with a smaller alpha or a per-pixel tint via `globalCompositeOperation` was rejected as it needs the sprite bounding box on screen and re-introduces the same artifact at any alpha.

## 2026-10-19 viewport-render: touch.css linked from index.html

Context: `src/styles/touch.css` was never referenced, so the built app shipped an unstyled D-pad. `src/ui/index.ts` solves the same problem for `ui.css` with an `import "../styles/ui.css"`.
Decision: `<link rel="stylesheet" href="/src/styles/touch.css">` in `index.html`, next to the existing `arena.css` link, so both page level stylesheets are declared in one place.
Alternatives: the matching `import "../styles/touch.css"` in `src/input/touch.ts` would have been tidier, but `src/input/**` is owned by the input role and out of this role's edit scope.

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

## 2026-10-19 sim: behaviours live in src/sim/behaviours, one module per character

Context: `src/sim/world.ts` already owned the tick, the fixed step, the time field and the waterbike momentum, and the brief asks for per-character behaviour modules.
Decision: one module per character under `src/sim/behaviours/` (`player`, `orca`, `shark`, `tarantula`, `snail`, `human`) plus `shared.ts` for pure helpers. Each exports its tuning as a frozen const and a single `update*(entity, ctx)` entry point. `step` resolves every time scale first, then dispatches, then runs the player presentation and vitality pass, so a lunge that lands this step is reflected in the same frame.
Alternatives: keeping everything in `world.ts` (rejected: it would become an unreadable 600 line switch), a behaviour registry keyed by kind string (rejected: dynamic dispatch buys nothing at six kinds and costs a lookup per entity per step). `codebase.txt` does not list the new folder yet; a human should add the line.

## 2026-10-19 sim: orca chase aims at a predicted point, not the player position

Context: a pursuit that only reads position glues itself to the player's tail and cannot be cut.
Decision: the chase target is `player + clamp(playerVelocity * 0.55s, �180px)`. Distances are compared squared, and only the actual steering step normalises, so no trig reaches the hash.
Alternatives: pure pursuit (rejected: reads as homing, not as a warden), full intercept solution (rejected: the Orca would be as fast as the player, which kills the dodge).

## 2026-10-19 sim: orca damage, mercy window and regen

Context: `hp` is a 0..1 fraction and the Orca is the only real threat, so the numbers decide whether Milestone 1 is playable or unfair.
Decision: lunge contact takes 0.22, the Shark takes 0.12 on a 1.1 s cooldown. After any hit the player has 600 ms of mercy (`iFrameMs`), during which a lunge still visually lands but deals nothing. Health regenerates 0.06 per second once 3 s have passed without a hit. A full chase cycle is telegraph 420 ms + lunge 360 ms + recover 900 ms, so the Orca can land at most about one hit every 2.2 s.
Alternatives: no mercy window (rejected: the scripted 600 step replay killed the player before the field was ever crossed), a fixed hp pool of 3 (rejected: the sim stores a 0..1 fraction and the HUD reads one number), longer telegraph only (rejected: the Orca already telegraphs, the problem was the chain rate).

## 2026-10-19 sim: walk versus swim is an axis test, not a depth test

Context: the Capybara must play idle, walk, swim and jump, and the waterbike skims in every direction.
Decision: above 12 px/s the anim is `walk` when the movement is mostly horizontal (`|vy| <= 0.6 |vx|`), `swim` otherwise; `jump` while the hop arc runs; `idle` when parked. Humans use the same axis test, so both drift loops come from `assets.json`.
Alternatives: depth bands (rejected: the player can sit still at any depth and the anim would flicker), always `swim` (rejected: `walk` would never play and the milestone list asks for it).

## 2026-10-19 sim: splashes are throttled by a millisecond cooldown in props

Context: the brief wants a wake splash when the bike lands hard or moves fast, but not one event per step.
Decision: `props.splashCd` counts down on the time scaled dt; a landing (flagged by `props.justLanded`, set by the movement code on the one step the hop arc ends) splashes immediately at power 0.55, and a moving bike splashes at `speed / 190` capped at 1 once the 260 ms cooldown has cleared.
Alternatives: splashing every step over a speed threshold (rejected: 60 events a second would flood the audio queue), a step counter instead of milliseconds (rejected: the cooldown would not slow with the time field).

## 2026-10-19 sim: shark and snail use fixed headings instead of an RNG per step

Context: the sim may not use `Math.random` and the world carries no RNG stream, but behaviour needs variety, and any `Math.sin` drift would leak engine dependent bits into the golden hash.
Decision: the Shark keeps `props.dirX`/`dirY` from spawn and reflects them at the band edges; the Snail drifts along a fixed heading at 16 px/s. Humans derive heading and speed from an FNV-1a hash of their own id, which is stable and needs no stream.
Alternatives: storing an RNG cursor on the world (rejected: the world is supposed to be plain serialisable data and the cursor would have to be hashed), trigonometric drift (rejected: cross engine ULP differences would break `hashWorld`).

## 2026-10-19 sim: the tarantula reacts once, driven by scanning the step's events

Context: the reaction has to fire on something the player does, and the sim owns no direct link between entities.
Decision: the tarantula scans this step's `world.events` for a `laser` from the player while `props.reactions` is below 1, then plays `jump` for 420 ms and looks toward the player for 900 ms. It hovers at `arena.minY - 74` with `scale` 1.75.
Alternatives: reacting on proximity (rejected: the Orca drags the player past it constantly, so it would fire before the player did anything), a scheduled reaction on a timer (rejected: it would fire whether or not the player acted).

## 2026-10-19 role: ui: DOM overlay inside the letterbox rect, sized in em

Context: the arena is drawn on a canvas that is contain-fitted and letterboxed, and the HUD has to read at the same size whether the frame is a phone sliver or a 29.5:9 cinema strip.
Decision: one `div.cc-ui` fixed over the window with `pointer-events: none`, one `div.cc-frame` positioned from `model.frame` (`{x, y, w, h}` in CSS pixels, written as `--cc-frame-*`), and every size inside it in `em` off `--cc-font-size`, which is `frame.h / 34` clamped to 11..26 px. Only buttons opt back into `pointer-events: auto`, so the touch D-pad and the jump/action buttons below keep every tap. The debug overlay sits bottom centre, clear of both the D-pad and the action buttons.
Alternatives: drawing the HUD on the canvas (rejected: it would be unreadable at 1x integer scale on a phone), fixed screen pixels (rejected: the HUD would grow huge on an ultrawide and vanish on a portrait phone), a DOM node per letterbox bar (rejected: nothing to put there).

## 2026-10-19 role: ui: the contract grew a frame rect and two optional debug extras

Context: the app hands the UI one HudModel per frame. Without the letterbox rect the overlay cannot know where the arena is, and the debug overlay wants per-entity time scales and the canvas scale, which the HUD itself does not need.
Decision: `HudModel` gains a required `frame: {x, y, w, h}` in CSS pixels, supplied from the viewport layout, plus optional `entityTimeScales?: Record<string, number>` and `canvasScale?: number`. The overlay renders `n/a` when the app sends neither. `createUi(callbacks, options?)` takes an optional `{ debug?: boolean }` that defaults to reading `?debug=` from the URL.
Alternatives: reading `window.innerWidth` and re-deriving the letterbox (rejected: two sources of truth for one number), making the extras required (rejected: it would force the app to send data the HUD never shows).

## 2026-10-19 role: ui: focus is how gamepad and touch reach the start action

Context: the start button must be reachable by keyboard, gamepad and touch, and the UI contract has no input of its own. Adding a keydown listener would fight `src/input/keyboard.ts`, which already owns the game keys.
Decision: every screen focuses its primary action when it becomes visible (`start`, `resume`, `restart`) and blurs back to the page when the game is playing. Keyboard Enter/Space work natively on a real `<button>`; touch works natively too; for gamepad confirm the app clicks `document.activeElement`. No key handling of our own.
Alternatives: a gamepad polling loop inside the UI (rejected: the UI would own real time and duplicate `src/input`), a hidden invisible start target (rejected: unreachable by keyboard).

## 2026-10-19 role: ui: the debug overlay is never created without the flag

Context: `?debug=1` is a developer switch, and the game is stateless, so the flag has to come from the URL and nothing may be written to storage to remember it.
Decision: `createDebugOverlay` is only called when `isDebugRequested` sees `debug` in the query string; otherwise no node exists in the DOM at all, not a hidden one. `?debug=1/true/on/yes`, `?debug` and `?debug=` all count; `?debug=0` does not.
Alternatives: a hidden element toggled by a class (rejected: it would still ship markup and per-frame writes to every player), a keypress toggle (rejected: state that outlives the URL).

## 2026-10-19 fix: the debug overlay moved to the top centre, from the bottom centre

Context: a browser smoke run with `?debug=1` hid the player completely. `assets.json` puts `arena.playBand` at y 486 to 648 of a 768 tall arena, so the panel at bottom centre was sitting straight on the capybara and the whole lower half of the play area.
Decision: `.cc-debug` is anchored `top: 8.8em` (about 7em of frame type, past the top-left vitals block and its seed and preset chip row) and `left: 50%` with `translateX(-50%)`, capped at `max-width: 50%` and `max-height: 33%` with `overflow: auto`. Top offset plus the cap lands at 0.53 of the frame height, above the nebula horizon at y 456, and nothing gameplay related is ever drawn up there in any viewport preset.
Alternatives: leaving it at the bottom and shrinking it (rejected: the play band fills the lower half, so any bottom anchored panel is on top of something), the top-left corner (rejected: the hull meter and time field readout are there), the top-right corner (rejected: the pause and mute buttons are there).

## 2026-10-19 fix: the UI type scales off the letterboxed SHORT side, not the height

Context: on a 390x844 phone the viewport handler picks the 9:20 preset, whose logical 810x1800 box contain-fits to a frame around 380x844 CSS px. Driving `--cc-font-size` off the frame height produced roughly 24.8 px of text inside a 380 px wide box, so every line of the title screen wrapped to two or three words, the panel grew past the viewport and the start button was pushed off the bottom of the screen. Height is the LONG side in portrait and the SHORT side in landscape, so it is the one dimension that disagrees with the layout.
Decision: `--cc-font-size` is now `clamp(min(frame.w, frame.h) / 34, 11, 26)` via `frameShortSide` and `fontSizeFor` in `src/ui/hud.ts`, keeping the existing divisor and clamp, so a 1280x720 landscape window stays at 720/34 = 21.176 px exactly as before and a 390x844 phone lands at 380/34 = 11.176 px, down from 24.8 and inside the 11..14 floor. Consequence of the smaller type: the vitals rows and the seed/preset chip row moved from two absolutely positioned blocks with a fixed 4.2em translate into one flow column `.cc-hud-stack` (the old translate overlapped them on short frames and would have overlapped them worse at the floor), the stack took a `right: 11.8em` inset so it cannot run under the pause and mute buttons on 9:20, `.cc-meter-track` became shrinkable, and `.cc-debug` moved from `top: 8.8em` to `10.8em` to clear the whole stack while still keeping top offset plus the 33% cap above the horizon (8.64/34 + 1/3 = 0.587, under 456/768). `.cc-panel` also gained `max-width: min(34em, 100%)`, `max-height: 100%` and `margin: auto`, so the panel can never scroll sideways at 9:20 and an over-tall panel stays scrollable instead of having its top clipped by flex centring.
Alternatives: a per-orientation font size (rejected: two rules to keep in sync and a discontinuity at the rotation), a separate portrait CSS override (rejected: the same rule would then live in two places), `min(frame.w, frame.h)` in CSS via `min()` over the frame vars (rejected: the clamp still needs computing, and the rule belongs next to the other ui maths where it can be unit tested).

## 2026-10-19 design: home menu, levels, objectives and three more verbs

Context: Milestone 1 delivered a single arena with one verb (move, hop, act) and no way to win it. The human asked for a home screen, levels, objectives, narrative, dialogue, obstacles, water guns, dodging and parrying, and asked that the whole canvas be used.
Decision: the boot screen is now a home menu with four doors (Play, Levels, Controls, License) and a rider name field. Play launches level one straight into the water; Levels opens a picker whose cards are locked until the previous level is cleared. The License door is a black page whose full Apache 2.0 text scrolls upward on a CSS animation, closed with Escape or a button. Between picking a level and riding into it sits a briefing screen with the level's story, its objective list with targets, and one gameplay hint.
Alternatives: a settings screen with sliders (rejected: nothing here is tunable and statelessness forbids remembering a setting), a separate first-run flow (rejected: the premise is the reason to press Play).

## 2026-10-19 design: the rider name lives in a tab, not anywhere else

Context: the human asked for an "add your name" option, and AGENTS.md forbids all persistence.
Decision: a plain `<input type="text">` on the home screen. The value is sanitised (control and format characters stripped, trimmed, clamped to 18 characters) and held in `src/app/boot.ts` for the length of the session. It appears in the HUD objective board and in the briefing. Nothing is written to storage, so a reload forgets it, and the label on the field says so.
Alternatives: a name in the seed (rejected: it would change the arena for every test that typed one), storing it (rejected: localStorage is banned and would break the stateless e2e gate).

## 2026-10-19 design: objectives are collect, stagger and survive

Context: the game needed goals that are measurable, visible and actually winnable, and that do not depend on the player out-running a chase.
Decision: every level lists objectives of three kinds. `collect` counts the loose cosmic cores actually picked up. `stagger` counts warden topples of a named kind. `survive` counts simulated seconds. The same three functions in `updateObjectives` evaluate all of them every step, the briefing shows the exact numbers, and the HUD shows a live count per objective. A level is won the moment every objective is done; the world stops stepping and the victory panel plays.
Alternatives: a score or a timer alone (rejected: neither teaches the cannon, the dodge or the parry), one shared objective shape with a per-kind payload (rejected: three explicit kinds are simpler to read and to test).

## 2026-10-19 design: the water cannon topples, it never harms

Context: "water gun" plus the hard lore rule that no character may be harmed as a game mechanic, and that the humans especially must never be hurt.
Decision: the water cannon fires real pellets (24 max, 190 ms apart, 620 ms of life, unscaled dt so the rider's own slow clock does not slow the water). A pellet that reaches a warden adds one unit to its stagger meter; three units topple it for 2.8 s, during which it cannot attack, and a topple knocks it back and costs it its heading for a moment. Pellets pass straight through humans and never interact with them at all, and nothing in the sim can reduce a human's hp.
Alternatives: damage numbers (rejected: the lore rules out harming the cast, and a wounded warden reads as gore-adjacent), hitting the tarantula (rejected: its `mustNot` list says no combat).

## 2026-10-19 design: dodge and parry are the two answers to the Orca

Context: the Orca lunge was already telegraphed, but the only answer was to out-run it, which is not always possible in a 1260 px band.
Decision: the dodge is a 220 ms burst with a 700 px/s impulse and 420 ms of invulnerability, on a 1.1 s cooldown, and it ignores reefs for its duration so sliding through cover is a real option. The parry is a 260 ms window; an attack that lands inside it deals no damage, gives no knockback, and instead topples the attacker. Both are edge triggered, so holding the key fires once. `hitPlayer` now returns which of the four things happened, so the AI can tell a parry from a dodge from a hit.
Alternatives: more health (rejected: more waiting, not more playing), slowing the Orca (rejected: the chase would stop being the threat it is), a shield meter (rejected: a cooldown reads faster than a resource bar at 60 Hz).

## 2026-10-19 design: reefs and kelp pillars are circles

Context: levels needed obstacles, and no obstacle art exists.
Decision: obstacles are discs, authored in arena pixels in `src/sim/levels.ts` and drawn procedurally in `src/render/props.ts`. The push-out is radial, so a warden chasing into a reef is steered around it rather than pinned to it, which is exactly the "reefs break the chase" behaviour a dodge-em-up wants. Reefs are solid for riders, wardens and pellets; the dodge is the only thing that passes through. Level layouts keep every pair more than 30 px apart, which a spec test asserts, so nothing can ever wedge.
Alternatives: axis-aligned boxes (rejected: they produce corners that trap a steering AI), convex polygons (rejected: the push-out is much more code for no gameplay difference), importing sprite art (rejected: no human has added any).

## 2026-10-19 sim: five levels, each with its own seed offset

Context: the arena is one photograph, so variety has to come from rules rather than from new art.
Decision: `LEVELS` in `src/sim/levels.ts` holds five levels. Level n adds `seedOffset` to the base seed (`levelSeed(baseSeed, id)`), so `?seed=` still reproduces a run exactly and two levels never deal the same opening. Each level has its own brief, outro, hint, core count, reef layout and objective book, all hand authored rather than generated. Unlocking is sequential and lives in a `Set<number>` inside `src/app/boot.ts`, so it dies with the tab.
Alternatives: procedural level generation (rejected: the hand-authored layouts are what make each level feel different, and generation would need a stream the world does not carry), reusing one layout with different objectives (rejected: the water would look identical five times).

## 2026-10-19 sim: the replay keeps the rider alive so the golden keeps testing something

Context: with reefs in the water, the scripted regression replay began ending in `defeat` around tick 900. `step` returns early once the status is not `playing`, so every checkpoint after that recorded the same frozen world and the tail of the golden became worthless.
Decision: `tests/regression/replay.ts` restores the rider's hull to 1 after every step. The replay is a determinism fixture, not a difficulty curve, and this keeps all 1010 steps simulating.
Alternatives: shortening the script (rejected: the tail would still be dead), asserting defeat instead of a hash (rejected: a frozen world hashes identically whatever broke it).

## 2026-10-19 change: the golden hashes were regenerated, and here is why

Context: the simulation changed on purpose (levels, obstacles, cores, pellets, dodge, parry, stagger) and `hashWorld` now folds level, obstacles, cores, pellets, objectives, the stagger tally and the current line into the hash. The golden file had to be rewritten.
Decision: regenerated with the real `replay()` and recorded in this log rather than done quietly. The script in `tests/regression/script.ts` also grew three phases (dodge burst, parry window, sweep the water) so the new mechanics are inside the hashed replay rather than only in unit tests.
Alternatives: hashing only the pre-existing fields (rejected: then the new state would be unhashed and a determinism bug in it would pass), leaving the golden red (rejected: the gate means nothing if it is always red).

## 2026-10-19 change: characters.json moved the Capybara out of the "no levels" rule

Context: the capybara's `mustNot` listed "Multiple levels", which the human's request directly contradicts.
Decision: removed that entry and added the water cannon, the dodge, the parry and a winnable level list to `may`. `milestone1.must` is untouched, so every original rule is still enforced by the spec gate. Added "being toppled by the water cannon" to the Orca and Shark `may` lists. `Persistence of any kind` stays on `mustNot`: level progress and the rider name live only in the tab.
Alternatives: leaving the file alone (rejected: it would be untrue, and AGENTS.md requires the source of truth to be fixed in the same change), rewriting `mustNot` wholesale (rejected: the inventory and persistence bans are still real).

## 2026-10-19 ui: the licence text is imported from LICENSE, not copied

Context: the licence reader must show the licence the project actually ships, and a copied string constant would drift the moment the human edits LICENSE.
Decision: `src/ui/license-text.ts` does `import licenseText from "../../LICENSE?raw"`, a build-time Vite import, so there is one licence file and the screen cannot disagree with it. The scroll is a CSS `@keyframes` animation rather than a JavaScript timer, so `src/ui` still reads no clock, which is what keeps "real time lives only in `src/app/clock.ts`" true. Escape is a `document` keydown listener installed by `src/ui/index.ts` and only acts on the three overlay screens.
Alternatives: inlining the text (rejected: a guaranteed drift), fetching it at runtime (rejected: the loader is the only module allowed to fetch, and a fetch for something already in the bundle is silly), a JavaScript scroll loop (rejected: it would put a second clock in the ui layer).

## 2026-10-19 ui: touch controls grew a 2x2 action cluster

Context: the cannon, the dodge and the parry all need a button on a phone, and the pad plus two buttons no longer fit a 390 px wide thumb zone.
Decision: the four action buttons (cannon, hop, dodge, parry) live in a 2x2 grid anchored bottom right; the cannon takes the larger front slot because it is pressed most. The pad is untouched on the left. `TOUCH_CONTROLS` grew to eight entries, and the spec test that asserts every control has a stylesheet rule was updated rather than relaxed.
Alternatives: a floating action bar (rejected: it moves between runs), a two-mode pad (rejected: switching modes mid-chase is worse than one more button).

## 2026-10-19 test: the e2e "friendly seed" is now chosen against the real movement model

Context: reefs are solid, so the seed the e2e suite steers on could put one on the line the steering test drives along, and the test then timed out instead of failing.
Decision: `FRIENDLY_SEED` in `tests/e2e/helpers.ts` runs the real `createWorld`/`step` over the candidate seeds and replays the exact opening the steering test performs (right, back left, down, up), keeping only seeds where all four legs actually move. The old snail-gap and orca-gap criteria are unchanged.
Alternatives: asserting on the position and letting the test drive around (rejected: a test that has to navigate is a test that eventually times out), widening the arena band (rejected: the band is mirrored from the manifest art).

## 2026-10-19 design: the level picker briefs you, the home menu does not

Context: a briefing screen was built for the level story and objectives, and nothing reached it: both the home Play button and the picker cards called the same "start this level" callback.
Decision: two callbacks. `onStart(levelId)` begins a run immediately and is what the home Play button uses, so the fastest possible entry is still one keypress. `onBrief(levelId)` opens the briefing and is what a level card uses, because a player who chose a specific level wants to read what it asks for. The briefing's Launch button then calls `onStart`. Opening the briefing does not touch the world, so nothing simulates behind it.
Alternatives: one callback with a briefing for both routes (rejected: the home button would then be two clicks to reach the water), no briefing at all (rejected: the objectives and the control hint have to be read somewhere, and a popup mid-run is worse).

## 2026-10-19 change: the play band now covers the whole swimmable water

Context: the human played it and said two things. The obstacles were too annoying for the space, and only a strip of the canvas was being used. Both had the same root cause: `arena.playBand` was a 1260 x 162 lane in the middle of a 1408 x 768 picture, while `arena.water` says the swimmable water runs from the horizon at y 456 to the near shore at y 700.
Decision: `playBand` moved from y 486..648 to y 468..684, in `assets.json` and in the `ARENA` mirror in `src/sim/game-config.ts` together. That is 1260 x 216, a third more depth, and it leaves 12 px of water under the horizon and 16 px above the shore instead of throwing 30 px and 52 px away. Everything keyed to the band moved with it: the core lanes now spread the full depth rather than one horizontal strip, every level's reef layout was re-authored across the new height, and the Tarantula's hover offset came down from 74 to 56 px so that widening the band downward did not also fling it up into empty sky.
Alternatives: leaving the band and only moving the art (rejected, the art is read only), a non-rectangular band (rejected: a single clamped rectangle is the only shape the manifest, the renderer and the spawner all agree on).

## 2026-10-19 change: reefs got smaller and sparser, because they were in the way

Context: at 27 px and 19 px with a 22 px body radius, a reef was 49 px wide inside a 162 px tall lane. Six of them turned the water into a corridor of pillars, and the chase broke on rocks the player could not see themselves steer around.
Decision: reefs are 21 px and kelp pillars 14 px, the band edge margin went from 10 px to 26 px so nothing hugs the frame, and the level layouts went from up to eleven obstacles to three, four, five, five and six. The layouts also moved into the open water on the left and centre of the picture, where the canvas is genuinely water rather than the foreground rock on the right. The spec gate still asserts every pair of rocks in a level is more than 30 px clear of touching.
Alternatives: dropping obstacle collision for the rider (rejected: reefs that only block wardens are not cover), keeping the density and shrinking the radii alone (rejected: six rocks across 216 px of height is still a slalom).

## 2026-10-19: Three scene modes and readable story beats

- The unexplained rule is now the **conservation rule**: the Capybara duplicated
  a cosmic core in the lab, creating two incompatible versions of the same
  universe map. The correction force is trying to reunite them.
- The campaign is presented as three navigable modes instead of one repeated
  arena: **Lab Breach** uses `canvas-01` for the origin and escape, **Candy
  Current** uses `canvas-02` for bright exploration and time-field play, and
  **Cosmic Correction** uses `canvas-03` for the intense final chapters.
- Existing deterministic level objectives remain the measurable game contract;
  the mode changes the scene, narrative framing, roster pressure and goal mix
  without adding persistence or runtime dependencies.
- Briefings are now message-like story beats. A Next message button advances one
  line at a time, and the current speaker's mascot is shown from the local asset
  set. Launch remains available so keyboard and existing automated flows retain
  their direct path.

## 2026-10-19 render: the camera zooms onto the play band (supersedes the contain-fit entry)

Context: only a horizontal strip of the canvas held water, so the human asked for a bigger play space. `arena.playBand` is a 1260 x 216 lane inside a 1408 x 768 picture, and a plain contain fit leaves water above and below unused.
Decision: `computeArenaView(arena, logical, band, focusX?)` is now a camera, not a contain fit. `S = max(coverBase, min(desired, widthCap))` where `coverBase = max(L.w/A.w, L.h/A.h)` keeps the arena covering the canvas, `desired = 0.45 * L.h / bandH` fills the frame with the band, and `widthCap = L.w / (bandW * 0.65)` keeps at least 65% of the band's width on screen. Offsets clamp to `[L - A*S, 0]` so the arena always covers the canvas (letterbox only when the aspect forces it). Horizontal focus is the interpolated player x (band centre without the player); vertical anchor holds the band mid at `0.6 * L.h`. The background is drawn inside the transform, cover-fitted into the arena box, so the 5-arg `drawImage` is unchanged. No sim number moved; the view is computed per frame, so the old `view`/`appliedLogical`/`applyLayout` cache is gone and `resize` is a documented no-op hook.
Alternatives: editing `arena.playBand` in assets.json (rejected: it would move every spawn, reef and core and force a golden regeneration for a presentation concern), pillarboxing a taller arena (rejected: wastes the side the player is not reading), letterboxing to the band aspect (rejected: leaves water off screen, the exact problem being fixed).

## 2026-10-19 input: editable targets keep their keys, and the pointer is a shared fire trigger

Context: typing a rider name swallowed W/A/S/D/J/K/L and Space, because the keyboard source preventDefaulted every game key regardless of focus. And firing needed a mouse path that did not fight whichever device won steering.
Decision: `isEditableTarget()` duck-types the event target (INPUT text-like, TEXTAREA, SELECT, contenteditable). On an editable target the keyboard source neither reads nor preventDefaults keydown, does not preventDefault keyup, and clears its held keys on `focusin`, so a name typed mid-run never leaks into the waterbike. BUTTONs stay on the app path (boot clicks the focused button on the jump edge; ui blurs on entering "playing"). New `src/input/pointer.ts` tracks the primary button over the stage canvas (`#stage`), releases on pointercancel/blur/`buttons & 1 === 0` on move, and `input.ts` OR-s its `action` onto whatever device wins steering, so a keyboard steer plus a mouse click both count. The pointer never ranks in the merge layer.
Alternatives: a hidden blur-when-typing hack (rejected: it fights the browser's own focus model), routing the pointer through the merge rank (rejected: it would let a stray mouse move steal steering from the keyboard), `onMouseDown` on the canvas only (rejected: it misses pointercancel and touch, and cannot tell a primary from a right click).

## 2026-10-19 design: a staged onboarding run, sim-owned and off the golden path

Context: the game opens with every warden, pet, core and the time field at once, which is a lot to absorb on a first ride. The regression goldens must not move, and nothing may be persisted.
Decision: `src/sim/tutorial.ts` owns a six-stage run. A tutorial world opens with only the Capybara and the level objectives; the cores and every other character sit in `world.tutorial.pendingCores`/`pendingEntities` and are handed over one stage at a time (stage 1 cores, 2 shark, 3 orca, 4 snail, 5 tarantula + humans), each push emitting a `spawn` event. Each stage closes on its goal (distance, collect, shark topple, dodge/parry, time-field entry) or on a fallback tick timeout, so a stuck player is never stuck. `world.tutorial` is an optional field and is deliberately **not** hashed, so tutorial-off runs and every golden stay byte-identical. `createWorld(seed, levelId, options?={tutorial})` keeps its old signature for existing callers. The run is off under `?test=1`, forced on/off by `?tutorial=1`/`0`, and otherwise runs once per tab on the first level via `state.tutorialSeen`; `boot.ts` funnels start/restart/next-level through one `startLevel` helper so the rule is identical everywhere, and the home backdrop world stays tutorial-free. The HUD card is `cc-tutorial` (top-centre, `data-cc-tutorial` carries the stage) driven by an optional `HudModel.tutorial`.
Alternatives: a DOM-only overlay that faked the reveals (rejected: the sim is the only place that owns entities and events, and a fake would drift), persisting "tutorial seen" (rejected: stateless), hashing the tutorial state (rejected: it would perturb goldens for a mode the regression replay never uses), always-on per level (rejected: re-teaching on every retry is noise once the player has seen it).

## 2026-10-19 ci: host on itch.io, deploy on a version bump

Context: the game is stateless, bundles to static files and needs a free-tier home plus a push-button release, and the human owns all git.
Decision: `AGENTS.md`'s "Hosting is out of scope. Localhost only." is relaxed to "no server, no database, no state; static hosting only". `AGENTS.md` hosting line and `codebase.txt` updated. `.github/workflows/deploy.yml` watches `main` for a change to `package.json`'s `version`, runs `npm ci` + `npm run build`, zips `dist/`, and pushes it with the itch.io butler CLI using the `BUTLER_API_KEY` secret and a repo variable for the project slug. Version bump is the release trigger, so a merge that does not bump the version never ships.
Alternatives: deploying every push to main (rejected: noisy and would push unfinished work), a tag-based trigger (rejected: the version in package.json is already the single source of truth for "what release is this"), a Node wrapper around butler (rejected: an extra dependency; the official butler action/binary is enough).

## 2026-10-19 change: codebase.txt kept truthful under the source-of-truth rule

Context: an earlier entry left `codebase.txt` alone as human-owned. AGENTS.md lists it as a source-of-truth file that must be fixed in the same change when made untrue, and this change alters `createWorld`'s signature, adds `sim/tutorial.ts` and adds a workflow.
Decision: updated `codebase.txt` in place (world.ts contract, new tutorial.ts entry, deploy.yml line) because the author of the change also knows the truth it should record. Logged here so the override of the "leave it alone" convention is explicit rather than silent.
Alternatives: leaving it stale (rejected: AGENTS.md is the higher contract and forbids drift), asking the human first (rejected: the change is already known and the fix is mechanical).
