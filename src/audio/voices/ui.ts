import { envelope, type VoiceSpec } from "./spec";

/** UI click: dry, short, almost no tail. */
export const ui: VoiceSpec = {
  cue: "ui",
  durationSec: 0.07,
  gain: 0.4,
  minIntervalMs: 40,
  tones: [
    {
      wave: "square",
      freq: { from: 940, to: 660 },
      envelope: envelope([0, 0], [0.08, 1], [1, 0]),
    },
  ],
};
