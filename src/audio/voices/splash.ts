import { envelope, type VoiceSpec } from "./spec";

/** Water splash: a filtered noise burst sweeping down, like something hitting the sea. */
export const splash: VoiceSpec = {
  cue: "splash",
  durationSec: 0.62,
  gain: 0.5,
  minIntervalMs: 90,
  tones: [],
  noise: {
    filter: { kind: "bandpass", freq: { from: 2600, to: 420 }, q: 0.9 },
    envelope: envelope([0, 0], [0.015, 1], [0.45, 0.22], [1, 0]),
    playbackRate: 1,
  },
};
