// The six cues the water cannon, the dodge, the parry and the objective book
// added after Milestone 1. Grouped in one file because they are all short,
// same-shaped one-shots and belong to one change.

import { envelope, type VoiceSpec } from "./spec";

/** Dodge: a downward whoosh with a splash tail, like a hull slapping water. */
export const dodge: VoiceSpec = {
  cue: "dodge",
  durationSec: 0.34,
  gain: 0.42,
  minIntervalMs: 90,
  tones: [
    {
      wave: "triangle",
      freq: { from: 620, to: 180 },
      envelope: envelope([0, 0], [0.02, 0.9], [0.4, 0.2], [1, 0]),
    },
  ],
  noise: {
    filter: { kind: "bandpass", freq: { from: 1800, to: 300 }, q: 1.2 },
    envelope: envelope([0, 0], [0.03, 0.8], [0.5, 0.15], [1, 0]),
    playbackRate: 1.1,
  },
};

/** Parry: a bright metallic ring. The deflect sound, not the hit sound. */
export const parry: VoiceSpec = {
  cue: "parry",
  durationSec: 0.42,
  gain: 0.46,
  minIntervalMs: 90,
  tones: [
    {
      wave: "square",
      freq: { from: 1320, to: 1980 },
      envelope: envelope([0, 0], [0.01, 1], [0.35, 0.3], [1, 0]),
      vibrato: { steps: 4, cents: 18 },
    },
    {
      wave: "sine",
      freq: { from: 2640, to: 1980 },
      envelope: envelope([0, 0], [0.03, 0.45], [1, 0]),
    },
  ],
};

/** Core pickup: a rising two step chime. Small, bright, unmistakably a reward. */
export const collect: VoiceSpec = {
  cue: "collect",
  durationSec: 0.3,
  gain: 0.4,
  minIntervalMs: 70,
  tones: [
    {
      wave: "sine",
      freq: { from: 780, to: 1180 },
      envelope: envelope([0, 0], [0.02, 1], [0.5, 0.35], [1, 0]),
    },
    {
      wave: "triangle",
      freq: { from: 1170, to: 1560 },
      envelope: envelope([0.08, 0], [0.14, 0.6], [1, 0]),
    },
  ],
};

/** A warden going down: a descending wobble with a low body under it. */
export const stagger: VoiceSpec = {
  cue: "stagger",
  durationSec: 0.55,
  gain: 0.48,
  minIntervalMs: 110,
  tones: [
    {
      wave: "sawtooth",
      freq: { from: 520, to: 130 },
      envelope: envelope([0, 0], [0.02, 0.9], [0.5, 0.25], [1, 0]),
      vibrato: { steps: 4, cents: 42 },
    },
    {
      wave: "sine",
      freq: { from: 160, to: 62 },
      envelope: envelope([0, 0], [0.05, 0.55], [1, 0]),
    },
  ],
};

/** A pellet stopped by a reef: a short damp knock. */
export const block: VoiceSpec = {
  cue: "block",
  durationSec: 0.16,
  gain: 0.32,
  minIntervalMs: 60,
  tones: [
    {
      wave: "triangle",
      freq: { from: 240, to: 140 },
      envelope: envelope([0, 0], [0.03, 0.8], [1, 0]),
    },
  ],
  noise: {
    filter: { kind: "lowpass", freq: { from: 1400, to: 320 }, q: 0.6 },
    envelope: envelope([0, 0], [0.02, 0.5], [1, 0]),
    playbackRate: 0.9,
  },
};

/** Level cleared: a rising chord, the only cue allowed to sound long and bright. */
export const victory: VoiceSpec = {
  cue: "victory",
  durationSec: 1.1,
  gain: 0.5,
  minIntervalMs: 500,
  tones: [
    {
      wave: "sine",
      freq: { from: 392, to: 523 },
      envelope: envelope([0, 0], [0.06, 1], [0.6, 0.45], [1, 0]),
    },
    {
      wave: "triangle",
      freq: { from: 587, to: 784 },
      envelope: envelope([0.12, 0], [0.2, 0.7], [0.75, 0.3], [1, 0]),
    },
    {
      wave: "sine",
      freq: { from: 784, to: 1046 },
      envelope: envelope([0.26, 0], [0.34, 0.5], [1, 0]),
    },
  ],
};
