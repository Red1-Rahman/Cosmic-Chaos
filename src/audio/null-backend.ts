// Does nothing at all. Used when audio is switched off or when no context can
// be created, and it is the reference for what "harmless" looks like: calling
// any method before unlock is fine and costs nothing.

import type { AudioBackend, PlayOutcome } from "./backend";
import type { AudioCue } from "./port";
import type { VoiceSchedule } from "./schedule";

export interface NullBackendOptions {
  /** Virtual clock in seconds. Defaults to a frozen zero. */
  readonly clock?: () => number;
}

export function createNullBackend(options?: NullBackendOptions): AudioBackend {
  const clock = options?.clock ?? ((): number => 0);
  return {
    name: "null",
    now: () => clock(),
    unlock: () => undefined,
    isReady: () => false,
    play: (_cue: AudioCue, _schedule: VoiceSchedule, _outcome: PlayOutcome) => undefined,
    setEngine: () => undefined,
    setMuted: () => undefined,
    dispose: () => undefined,
  };
}
