// Tarantula: Celestial Overlord. Hovers above the play band, plays idle, and
// reacts exactly once to something the player does. No combat, ever.

import { clamp } from "../../util/rng";
import type { Entity } from "../types";
import type { BehaviourContext } from "./shared";
import { faceFromDX } from "./shared";

export const TARANTULA = {
  /** How far above the shallow edge of the play band it hovers, in px. */
  hoverAboveBand: 74,
  /** Largest figure on screen by a wide margin. */
  scale: 1.75,
  /** Very slow lateral drift so it is never a statue. */
  driftSpeed: 14,
  /** The one reaction: look toward the player, then one show-off jump. */
  lookMs: 900,
  jumpMs: 420,
  /** The reaction fires at most once per run. */
  maxReactions: 1,
} as const;

export type TarantulaState = "idle" | "react";

export function updateTarantula(tarantula: Entity, ctx: BehaviourContext): void {
  const dt = ctx.dt;
  const player = ctx.world.entities.find((e) => e.kind === "player");

  tarantula.scale = TARANTULA.scale;
  tarantula.alpha = 1;
  tarantula.y = ctx.arena.minY - TARANTULA.hoverAboveBand;

  // Exactly one reaction: the first time the player fires the laser.
  const fired = (tarantula.props.reactions ?? 0) < TARANTULA.maxReactions && ctx.world.events.some(
    (e) => e.type === "laser" && e.id === ctx.world.playerId,
  );
  if (fired) {
    tarantula.props.reactions = (tarantula.props.reactions ?? 0) + 1;
    tarantula.props.lookMs = TARANTULA.lookMs;
    tarantula.state = "react";
    if (player) faceFromDX(tarantula, player.x - tarantula.x);
  }

  if (tarantula.state === "react") {
    const lookLeft = Math.max(0, (tarantula.props.lookMs ?? 0) - dt * 1000);
    tarantula.props.lookMs = lookLeft;
    if (player) faceFromDX(tarantula, player.x - tarantula.x);
    const jumpedFor = Math.max(0, TARANTULA.lookMs - lookLeft);
    tarantula.anim = jumpedFor < TARANTULA.jumpMs ? "jump" : "idle";
    if (lookLeft <= 0) {
      tarantula.state = "idle";
      tarantula.anim = "idle";
    }
  } else {
    tarantula.anim = "idle";
    const dirX = (tarantula.props.driftDir ?? 1) as number;
    tarantula.x = clamp(
      tarantula.x + dirX * TARANTULA.driftSpeed * dt,
      ctx.arena.minX,
      ctx.arena.maxX,
    );
    if (tarantula.x <= ctx.arena.minX || tarantula.x >= ctx.arena.maxX) {
      tarantula.props.driftDir = -dirX;
    }
  }
}