import { envelope, type VoiceSpec } from "./spec";

/** Laser ping: a bright descending sine with a quieter body an octave down. */
export const laser: VoiceSpec = {
  cue: "laser",
  durationSec: 0.22,
  gain: 0.34,
  minIntervalMs: 45,
  tones: [
    {
      wave: "sine",
      freq: { from: 1850, to: 520 },
      envelope: envelope([0, 0], [0.02, 1], [0.55, 0.18], [1, 0]),
    },
    {
      wave: "triangle",
      freq: { from: 760, to: 240 },
      envelope: envelope([0, 0], [0.04, 0.42], [1, 0]),
    },
  ],
};
