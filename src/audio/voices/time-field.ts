import { envelope, type VoiceSpec } from "./spec";

/** Entering the Snail's field: everything slides down and smears. */
export const timeFieldEnter: VoiceSpec = {
  cue: "timeFieldEnter",
  durationSec: 0.72,
  gain: 0.45,
  minIntervalMs: 300,
  tones: [
    {
      wave: "sine",
      freq: { from: 1240, to: 250 },
      envelope: envelope([0, 0], [0.06, 1], [0.55, 0.35], [1, 0]),
    },
    {
      wave: "triangle",
      freq: { from: 620, to: 124 },
      envelope: envelope([0, 0], [0.14, 0.4], [1, 0]),
    },
  ],
  noise: {
    filter: { kind: "highpass", freq: { from: 3000, to: 700 }, q: 1.1 },
    envelope: envelope([0, 0], [0.1, 0.3], [1, 0]),
    playbackRate: 0.7,
  },
};

/** Leaving the field: the world snaps back up. */
export const timeFieldExit: VoiceSpec = {
  cue: "timeFieldExit",
  durationSec: 0.5,
  gain: 0.4,
  minIntervalMs: 300,
  tones: [
    {
      wave: "sine",
      freq: { from: 250, to: 1240 },
      envelope: envelope([0, 0], [0.05, 1], [0.6, 0.28], [1, 0]),
    },
    {
      wave: "triangle",
      freq: { from: 500, to: 2480 },
      envelope: envelope([0, 0], [0.2, 0.3], [1, 0]),
    },
  ],
  noise: {
    filter: { kind: "highpass", freq: { from: 700, to: 3600 }, q: 1.1 },
    envelope: envelope([0, 0], [0.05, 0.25], [1, 0]),
    playbackRate: 1.3,
  },
};
