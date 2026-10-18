// The seam between the pure audio layer (specs, schedules) and whatever actually
// makes sound. The port owns cue names, mute and rate limiting; a backend only
// renders what it is handed and never decides what is allowed to play.

import type { AudioCue } from "./port";
import type { VoiceSchedule } from "./schedule";

/** Why the port called the backend. "played" is the only one that makes sound. */
export type PlayOutcome = "played" | "muted" | "rate-limited" | "locked";

export interface AudioBackend {
  /** Backend name, used by the recording backend and by debug overlays. */
  readonly name: string;
  /** Audio clock in seconds. Backends without a real clock use a virtual one. */
  now(): number;
  /** Called from the first user gesture. Safe to call again. */
  unlock(): void;
  /** True once the backend can actually produce sound. */
  isReady(): boolean;
  play(cue: AudioCue, schedule: VoiceSchedule, outcome: PlayOutcome): void;
  /** Continuous hum control. Safe to call every frame, locked or not. */
  setEngine(speed01: number, timeScale: number): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}
