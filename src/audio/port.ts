import type { AudioBackend } from "./backend";
import { createWebAudioBackend } from "./web-audio-backend";
import { scheduleVoice } from "./schedule";
import { VOICES } from "./voices";

export type AudioCue =
  "laser" | "splash" | "hit" | "jump" | "defeat" | "ui" | "timeFieldEnter" | "timeFieldExit";

export interface AudioPort {
  unlock(): void;
  play(cue: AudioCue): void;
  setEngine(speed01: number, timeScale: number): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

export interface AudioPortOptions {
  /** Defaults to the Web Audio backend. Tests and headless runs pass their own. */
  readonly backend?: AudioBackend;
  /** Starting mute state. The UI toggle calls setMuted later. */
  readonly muted?: boolean;
}

/**
 * The only audio surface the rest of the game knows.
 *
 * The port is deliberately boring: it clamps and forwards, applies mute, and
 * drops cues that arrive faster than the voice allows so a burst of events
 * cannot stack into a wall of noise. Every method is safe to call before
 * unlock() and after dispose().
 */
export function createAudioPort(options?: AudioPortOptions): AudioPort {
  const settings = options ?? {};
  const backend: AudioBackend = settings.backend ?? createWebAudioBackend();
  const lastPlayed = new Map<AudioCue, number>();
  let muted = settings.muted ?? false;
  let disposed = false;

  return {
    unlock(): void {
      if (disposed) return;
      backend.unlock();
    },

    play(cue: AudioCue): void {
      if (disposed) return;
      const spec = VOICES[cue];
      const now = backend.now();
      if (muted) {
        backend.play(cue, scheduleVoice(spec, now), "muted");
        return;
      }
      const last = lastPlayed.get(cue);
      if (last !== undefined && now - last < spec.minIntervalMs / 1000) {
        backend.play(cue, scheduleVoice(spec, now), "rate-limited");
        return;
      }
      const outcome = backend.isReady() ? "played" : "locked";
      // Only a cue that actually sounded counts against the rate limit, so a
      // locked or muted start does not swallow the first real play after unlock.
      if (outcome === "played") lastPlayed.set(cue, now);
      backend.play(cue, scheduleVoice(spec, now), outcome);
    },

    setEngine(speed01: number, timeScale: number): void {
      if (disposed) return;
      backend.setEngine(
        Number.isFinite(speed01) ? speed01 : 0,
        Number.isFinite(timeScale) ? timeScale : 1,
      );
    },

    setMuted(next: boolean): void {
      muted = next;
      if (disposed) return;
      backend.setMuted(next);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      lastPlayed.clear();
      backend.dispose();
    },
  };
}
