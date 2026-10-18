// Helpers shared by the per-character behaviours. Pure math only: no DOM, no
// clocks, no randomness. Distances are compared squared so no square root runs
// unless a direction actually has to be normalised.

import { clamp } from "../../util/rng";
import type { Arena, Entity, World } from "../types";

/** Context handed to a behaviour every step. `dt` is already time-scaled. */
export interface BehaviourContext {
  world: World;
  arena: Arena;
  /** Seconds of simulated time this step, already multiplied by timeScale. */
  dt: number;
  /** Unscaled fixed step in seconds, for cooldowns that must not slow down. */
  fixedDt: number;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Move an entity by a velocity in px per second, clamped to the play band. */
export function moveInBand(entity: Entity, arena: Arena, vx: number, vy: number, dt: number): void {
  entity.x = clamp(entity.x + vx * dt, arena.minX, arena.maxX);
  entity.y = clamp(entity.y + vy * dt, arena.minY, arena.maxY);
}

/**
 * Steering that closes the gap to a target point. `speed` is px per second so
 * the caller's scaled dt slows the entity down inside the snail time field.
 * Returns the distance squared that was closed on.
 */
export function steerToward(
  entity: Entity,
  arena: Arena,
  targetX: number,
  targetY: number,
  speed: number,
  dt: number,
): number {
  const dx = targetX - entity.x;
  const dy = targetY - entity.y;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1e-9) return d2;
  const dist = Math.sqrt(d2);
  moveInBand(entity, arena, (dx / dist) * speed, (dy / dist) * speed, dt);
  return d2;
}

/** Normalised direction, written into the props the caller asked for. */
export function unitDirection(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): [number, number] {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1e-9) return [1, 0];
  const dist = Math.sqrt(d2);
  return [dx / dist, dy / dist];
}

/** Face the way a horizontal move is travelling. */
export function faceFromDX(entity: Entity, dx: number): void {
  if (dx > 0.01) entity.facing = 1;
  else if (dx < -0.01) entity.facing = -1;
}

export function findEntity(world: World, kind: Entity["kind"]): Entity | undefined {
  return world.entities.find((e) => e.kind === kind);
}

/** Countdown a millisecond timer stored in props. Returns ms still left. */
export function tickTimer(entity: Entity, key: string, dt: number): number {
  const left = Math.max(0, (entity.props[key] ?? 0) - dt * 1000);
  entity.props[key] = left;
  return left;
}

/** Start a millisecond timer only when it is not already running. */
export function startTimer(entity: Entity, key: string, ms: number): void {
  if ((entity.props[key] ?? 0) <= 0) entity.props[key] = ms;
}

/**
 * Reflect a heading when it runs out of the play band. Returns the heading that
 * survived, so callers can store it and never jitter on the edge.
 */
export function keepInBand(
  entity: Entity,
  arena: Arena,
  dirX: number,
  dirY: number,
  margin: number,
): [number, number] {
  let nx = dirX;
  let ny = dirY;
  if (entity.x <= arena.minX + margin && nx < 0) nx = -nx;
  if (entity.x >= arena.maxX - margin && nx > 0) nx = -nx;
  if (entity.y <= arena.minY + margin && ny < 0) ny = -ny;
  if (entity.y >= arena.maxY - margin && ny > 0) ny = -ny;
  return [nx, ny];
}
