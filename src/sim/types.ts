// Types shared by every sim module. Pure data, no logic, no imports.

export interface InputState {
  moveX: number; // [-1, 1]
  moveY: number; // [-1, 1]
  jump: boolean;
  action: boolean;
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

export type GameEvent =
  | { type: "hit"; id: string; x: number; y: number; power: number }
  | { type: "jump"; id: string; x: number; y: number }
  | { type: "splash"; id: string; x: number; y: number; power: number }
  | { type: "laser"; id: string; x: number; y: number }
  | { type: "timeFieldEnter"; id: string; x: number; y: number }
  | { type: "timeFieldExit"; id: string; x: number; y: number }
  | { type: "spawn"; id: string; kind: EntityKind; x: number; y: number }
  | { type: "defeat"; id: string; kind: EntityKind }
  | { type: "ui"; name: string };

export type WorldStatus = "playing" | "defeat";

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
}
