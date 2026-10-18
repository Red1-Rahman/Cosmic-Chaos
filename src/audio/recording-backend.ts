// Records what the port asked for instead of making a sound. Tests assert on
// these entries; nothing here touches Web Audio, so it runs in node.

import type { AudioBackend, PlayOutcome } from "./backend";
import type { AudioCue } from "./port";
import type { VoiceSchedule } from "./schedule";

export interface RecordedPlay {
  readonly kind: "play";
  readonly cue: AudioCue;
  readonly at: number;
  readonly outcome: PlayOutcome;
  readonly partCount: number;
  readonly gain: number;
}

export interface RecordedEngine {
  readonly kind: "engine";
  readonly speed01: number;
  readonly timeScale: number;
}

export interface RecordedFlag {
  readonly kind: "flag";
  readonly name: "unlock" | "muted" | "dispose";
  readonly value: boolean;
}

export type RecordedEntry = RecordedPlay | RecordedEngine | RecordedFlag;

export interface RecordingBackendOptions {
  /** Audio clock in seconds. Defaults to a virtual clock stepping 1/60s per call. */
  readonly clock?: () => number;
  /** Report isReady() as true from the start, so cues count as played. */
  readonly ready?: boolean;
}

export interface RecordingBackend extends AudioBackend {
  readonly entries: readonly RecordedEntry[];
  /** Every cue that was actually allowed through, in order. */
  played(cue?: AudioCue): readonly AudioCue[];
  reset(): void;
}

export function createRecordingBackend(options?: RecordingBackendOptions): RecordingBackend {
  const settings = options ?? {};
  const entries: RecordedEntry[] = [];
  const ready = settings.ready ?? true;
  const stepSeconds = 1 / 60;
  let virtualTime = 0;
  const clock =
    settings.clock ??
    ((): number => {
      const value = virtualTime;
      virtualTime += stepSeconds;
      return value;
    });

  return {
    name: "recording",
    entries,
    now: () => clock(),
    unlock: () => {
      entries.push({ kind: "flag", name: "unlock", value: true });
    },
    isReady: () => ready,
    play: (cue: AudioCue, schedule: VoiceSchedule, outcome: PlayOutcome) => {
      entries.push({
        kind: "play",
        cue,
        at: schedule.startTime,
        outcome,
        partCount: schedule.parts.length,
        gain: schedule.gain,
      });
    },
    setEngine: (speed01: number, timeScale: number) => {
      entries.push({ kind: "engine", speed01, timeScale });
    },
    setMuted: (muted: boolean) => {
      entries.push({ kind: "flag", name: "muted", value: muted });
    },
    dispose: () => {
      entries.push({ kind: "flag", name: "dispose", value: true });
    },
    played: (cue?: AudioCue) => {
      const all = entries
        .filter((e): e is RecordedPlay => e.kind === "play" && e.outcome === "played")
        .map((e) => e.cue);
      return cue === undefined ? all : all.filter((c) => c === cue);
    },
    reset: () => {
      entries.length = 0;
      virtualTime = 0;
    },
  };
}
