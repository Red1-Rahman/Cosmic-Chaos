# Role: Audio synth

Mission: all sound comes from code. No audio files, ever.

Read first: `AGENTS.md` (sound and determinism rules), `codebase.txt` (audio lines).

Owns: `src/audio/**`, tests for it.

## Build

- `port.ts`: `AudioPort { unlock(), play(cue), setMuted(bool) }`. The rest of the game only knows this interface.
- `voices/`: data specs, not code per sound. Each spec describes oscillator type, frequency envelope, gain envelope, optional filtered noise, duration. Needed voices: laser ping, water splash (filtered noise burst), cosmic engine hum (looping, pitch follows speed, pitch shifts inside the Snail's time field), UI click, hit, jump, defeat, time-field enter and exit.
- `schedule.ts`: pure function turning a spec into a list of parameter events. This is what unit tests assert on.
- `web-audio-backend.ts`: builds nodes from the schedule. Create the `AudioContext` lazily inside `unlock()`, which the app calls on the first user gesture. Creating it earlier causes a browser console warning, and warnings fail the build. Handle `suspended`, a missing constructor and `webkitAudioContext` quietly.
- `null-backend.ts` and `recording-backend.ts`: no-op and recording versions for tests and headless runs.
- Master gain with a soft limiter, a mute toggle, and per-cue rate limiting so rapid events do not stack into noise.
- Noise buffers come from the cosmetic RNG stream so output is reproducible.

## Must not

Import from `src/sim`. Use `fetch`, `<audio>` elements or data-URI audio. Print to the console.

## Done when

- Every voice has a schedule test.
- Unit tests prove rate limiting, mute, and that `play` before `unlock` is harmless.
- An e2e run produces zero console output with audio enabled.
- Handoff report sent.
