// Types shared by every sim module. Pure data, no logic, no imports.

import type { SpeakerKey } from "./dialogue";

export interface InputState {
  moveX: number; // [-1, 1]
  moveY: number; // [-1, 1]
  jump: boolean;
  /** Water cannon trigger. */
  action: boolean;
  /** Dodge burst: a shove with invulnerability while it lasts. */
  dodge: boolean;
  /** Parry: a short window that turns an incoming attack around. */
  parry: boolean;
}

export type EntityKind = "player" | "orca" | "shark" | "tarantula" | "snail" | "human";

export interface Entity {
  id: string;
  kind: EntityKind;
  x: number;
  y: number;
  facing: 1 | -1;
  anim: string; // animation name to sample from assets.json
  animMs: number; // elapsed ms inside the current animation
  scale: number; // extra multiplier for squash, flash and depth
  alpha: number; // 0..1
  timeScale: number; // time scale currently applied to this entity
  hp: number; // 0..1 fraction
  state: string; // per-kind behaviour state, surfaced by the HUD and debug overlay
  props: Record<string, number>; // per-kind scratch, render and HUD read known keys
}

export interface Arena {
  w: number;
  h: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  fieldRadius: number;
  timeScaleInside: number;
}

export type ObstacleKind = "reef" | "pillar";

/** Static level geometry. Never moves, never rotates, never expires. */
export interface Obstacle {
  id: string;
  kind: ObstacleKind;
  x: number;
  y: number;
  r: number;
  /** Stable 0..1 phase so the renderer can vary its look without a clock. */
  phase: number;
}

/** One live water-cannon pellet. */
export interface Pellet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
}

/** A loose cosmic core waiting to be picked up. */
export interface Core {
  id: string;
  x: number;
  y: number;
  taken: boolean;
}

export type ObjectiveKind = "collect" | "stagger" | "survive";

export interface ObjectiveState {
  id: string;
  kind: ObjectiveKind;
  label: string;
  target: number;
  count: number;
  done: boolean;
  /** Only for `stagger`: which enemy kind the count belongs to. */
  targetKind: string;
}

/** One line of character speech currently on screen. */
export interface DialogueLine {
  speaker: SpeakerKey;
  line: string;
  msLeft: number;
}

export type GameEvent =
  | { type: "hit"; id: string; x: number; y: number; power: number }
  | { type: "jump"; id: string; x: number; y: number }
  | { type: "splash"; id: string; x: number; y: number; power: number }
  | { type: "laser"; id: string; x: number; y: number }
  | { type: "dodge"; id: string; x: number; y: number }
  | { type: "parry"; id: string; x: number; y: number }
  | { type: "parrySuccess"; id: string; kind: EntityKind; x: number; y: number }
  | { type: "blocked"; x: number; y: number }
  | { type: "collect"; id: string; x: number; y: number; total: number }
  | { type: "stagger"; id: string; kind: EntityKind; x: number; y: number }
  | { type: "objective"; id: string; label: string }
  | { type: "dialogue"; speaker: string; line: string }
  | { type: "victory"; id: string; x: number; y: number }
  | { type: "timeFieldEnter"; id: string; x: number; y: number }
  | { type: "timeFieldExit"; id: string; x: number; y: number }
  | { type: "spawn"; id: string; kind: EntityKind; x: number; y: number }
  | { type: "defeat"; id: string; kind: EntityKind }
  | { type: "ui"; name: string };

export type WorldStatus = "playing" | "defeat" | "victory";

/**
 * The staged onboarding run's private book. Pure data; the logic lives in
 * `sim/tutorial.ts`. Optional on a world so a normal run is completely unchanged and
 * every existing fixture keeps working.
 */
export interface TutorialState {
  /** 0..5, the card currently on screen. */
  stage: number;
  /** True once the last stage has run its course and nothing is withheld any more. */
  finished: boolean;
  /** Pixels the rider has covered since the current stage began. */
  travelled: number;
  /** Rider position at the previous step, feeding the travelled accumulator. */
  lastX: number;
  lastY: number;
  /** Steps spent in the current stage, driving every fallback timeout. */
  stageTicks: number;
  /** Entities withheld until a later stage reveals them. */
  pendingEntities: Entity[];
  /** Cores withheld until the collection stage reveals them. */
  pendingCores: Core[];
}

export interface World {
  seed: number;
  tick: number;
  timeMs: number;
  arena: Arena;
  entities: Entity[]; // stable order: player first, then spawn order
  playerId: string;
  fieldTimeScale: number; // time scale currently applied to the player
  status: WorldStatus;
  events: GameEvent[];
  /** Which level this world was built for. 1 based. */
  levelId: number;
  obstacles: Obstacle[];
  pellets: Pellet[];
  cores: Core[];
  objectives: ObjectiveState[];
  /** Stagger tops per enemy kind, counted over the whole run. */
  staggerTally: Record<string, number>;
  /** The line currently on screen, or null. */
  dialogue: DialogueLine | null;
  /** Staged onboarding book, present only while a tutorial run is in progress. */
  tutorial?: TutorialState;
}
