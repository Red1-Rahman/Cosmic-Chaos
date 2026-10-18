# Decisions log

Agents append one entry per non-obvious choice. Newest last. Keep entries short.

Format:

```
## YYYY-MM-DD role: short title
Context: what forced a choice
Decision: what was chosen
Alternatives: what was rejected and why
```

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
