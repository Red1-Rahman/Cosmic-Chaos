// Snail: Steward of Time. Drifts slowly and owns the time field.
//
// The field radius stays the constant from `arena`; the breathing ring is a
// render concern and never touches the simulation.

import { clamp } from "../../util/rng";
import type { Entity } from "../types";
import type { BehaviourContext } from "./shared";
import { keepInBand, moveInBand } from "./shared";

export const SNAIL = {
  /** Unhurried drift, px per second. */
  driftSpeed: 16,
  margin: 90,
  /** Field readout for the HUD and tests. */
  fieldTimeScale: 0.45,
} as const;

export type SnailState = "glide";

export function updateSnail(snail: Entity, ctx: BehaviourContext): void {
  const dt = ctx.dt;
  let dirX = snail.props.dirX ?? 1;
  let dirY = snail.props.dirY ?? 0;

  [dirX, dirY] = keepInBand(snail, ctx.arena, dirX, dirY, SNAIL.margin);
  moveInBand(snail, ctx.arena, dirX * SNAIL.driftSpeed, dirY * SNAIL.driftSpeed, dt);

  snail.props.dirX = dirX;
  snail.props.dirY = dirY;
  // assets.json names the snail's drift loop `swim`; the lore calls it gliding.
  snail.anim = "swim";
  snail.state = "glide";
  snail.scale = 1;
  snail.alpha = 1;
  // The field follows the snail; radius stays constant so the sim is stable.
  snail.props.fieldRadius = ctx.arena.fieldRadius;
  snail.props.fieldTimeScale = ctx.arena.timeScaleInside;
  snail.props.fieldX = clamp(snail.x, ctx.arena.minX, ctx.arena.maxX);
  snail.props.fieldY = clamp(snail.y, ctx.arena.minY, ctx.arena.maxY);
}