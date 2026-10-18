import { envelope, type VoiceSpec } from "./spec";

/** Hit: a short thud plus a noise scrape. Stylised and bloodless. */
export const hit: VoiceSpec = {
  cue: "hit",
  durationSec: 0.3,
  gain: 0.5,
  minIntervalMs: 60,
  tones: [
    {
      wave: "triangle",
      freq: { from: 340, to: 110 },
      envelope: envelope([0, 0], [0.03, 1], [0.5, 0.25], [1, 0]),
    },
    {
      wave: "sine",
      freq: { from: 180, to: 70 },
      envelope: envelope([0, 0], [0.06, 0.6], [1, 0]),
    },
  ],
  noise: {
    filter: { kind: "lowpass", freq: { from: 2600, to: 380 }, q: 0.7 },
    envelope: envelope([0, 0], [0.02, 0.7], [0.4, 0.12], [1, 0]),
    playbackRate: 1.4,
  },
};
