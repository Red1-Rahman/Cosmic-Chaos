import { envelope, type VoiceSpec } from "./spec";

/** Defeat: a long collapsing drone, the capybara's rule finally bending. */
export const defeat: VoiceSpec = {
  cue: "defeat",
  durationSec: 1.15,
  gain: 0.55,
  minIntervalMs: 400,
  tones: [
    {
      wave: "sawtooth",
      freq: { from: 520, to: 92 },
      vibrato: { steps: 8, cents: 14 },
      envelope: envelope([0, 0], [0.08, 1], [0.65, 0.3], [1, 0]),
    },
    {
      wave: "sine",
      freq: { from: 260, to: 46 },
      detune: 6,
      envelope: envelope([0, 0], [0.12, 0.55], [1, 0]),
    },
  ],
  noise: {
    filter: { kind: "lowpass", freq: { from: 1400, to: 160 }, q: 0.6 },
    envelope: envelope([0, 0], [0.2, 0.22], [1, 0]),
    playbackRate: 0.8,
  },
};
