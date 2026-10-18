import { envelope, type VoiceSpec } from "./spec";

/** Jump: a quick upward chirp from the waterbike boost. */
export const jump: VoiceSpec = {
  cue: "jump",
  durationSec: 0.24,
  gain: 0.42,
  minIntervalMs: 90,
  tones: [
    {
      wave: "sine",
      freq: { from: 300, to: 760 },
      envelope: envelope([0, 0], [0.05, 1], [0.6, 0.3], [1, 0]),
    },
    {
      wave: "triangle",
      freq: { from: 600, to: 1520 },
      envelope: envelope([0, 0], [0.1, 0.25], [1, 0]),
    },
  ],
};
