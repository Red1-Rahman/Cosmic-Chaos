import type { AudioCue } from "../port";
import { block, collect, dodge, parry, stagger, victory } from "./actions";
import { defeat } from "./defeat";
import { engineSpec, type EngineSpec } from "./engine";
import { hit } from "./hit";
import { jump } from "./jump";
import { laser } from "./laser";
import { splash } from "./splash";
import { timeFieldEnter, timeFieldExit } from "./time-field";
import type { VoiceSpec } from "./spec";
import { ui } from "./ui";

export * from "./spec";
export * from "./engine";
export {
  laser,
  splash,
  ui,
  hit,
  jump,
  defeat,
  timeFieldEnter,
  timeFieldExit,
  dodge,
  parry,
  collect,
  stagger,
  block,
  victory,
};

/** Every one-shot cue, keyed by the name the game asks for. */
export const VOICES: Readonly<Record<AudioCue, VoiceSpec>> = {
  laser,
  splash,
  hit,
  jump,
  defeat,
  ui,
  timeFieldEnter,
  timeFieldExit,
  dodge,
  parry,
  collect,
  stagger,
  block,
  victory,
};

export const DEFAULT_ENGINE: EngineSpec = engineSpec;

/** Cue names, in a stable order. Useful for tests and for the recording backend. */
export const AUDIO_CUES: readonly AudioCue[] = [
  "laser",
  "splash",
  "hit",
  "jump",
  "defeat",
  "ui",
  "timeFieldEnter",
  "timeFieldExit",
  "dodge",
  "parry",
  "collect",
  "stagger",
  "block",
  "victory",
];
