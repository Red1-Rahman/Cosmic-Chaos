// Shark: Cosmic Avenger. A wide diagonal circuit that alternates a slow patrol
// with a committed straight dash. No AI beyond the timer, by design.

import type { Entity } from "../types";
import { hitPlayer } from "./player";
import type { BehaviourContext } from "./shared";
import { dist2, faceFromDX, keepInBand, moveInBand, tickTimer } from "./shared";

export const SHARK = {
  /** Slow patrol along the diagonal, px per second. */
  circleSpeed: 130,
  circleMs: 2200,
  /** Idle beat between patrol and dash, so the loop reads as a pattern. */
  pauseMs: 300,
  /** Committed dash along the same diagonal, px per second. */
  dashSpeed: 620,
  dashMs: 520,
  /** Keep this far from the band edges so a turn never looks like a wall hit. */
  margin: 40,
  /** Optional contact damage, deliberately weaker than the Orca's. */
  contactRadius: 40,
  hitPower: 0.12,
  hitCooldownMs: 1100,
} as const;

/** Squared reach, computed once: squared comparisons avoid the square root. */
const CONTACT_RADIUS_SQ = SHARK.contactRadius * SHARK.contactRadius;

export type SharkState = "circle" | "pause" | "dash";

export function updateShark(shark: Entity, ctx: BehaviourContext): void {
  const dt = ctx.dt;
  let dirX = shark.props.dirX ?? 1;
  let dirY = shark.props.dirY ?? 1;
  if (shark.props.timer === undefined) shark.props.timer = SHARK.circleMs;
  [dirX, dirY] = keepInBand(shark, ctx.arena, dirX, dirY, SHARK.margin);
  const raw = shark.state as SharkState;
  const state: SharkState = raw === "dash" || raw === "pause" ? raw : "circle";

  if (state === "circle") {
    shark.anim = "swim";
    moveInBand(shark, ctx.arena, dirX * SHARK.circleSpeed, dirY * SHARK.circleSpeed, dt);
    shark.state = "circle";
    if (tickTimer(shark, "timer", dt) <= 0) {
      shark.props.timer = SHARK.pauseMs;
      shark.state = "pause";
    }
  } else if (state === "pause") {
    shark.anim = "idle";
    if (tickTimer(shark, "timer", dt) <= 0) {
      shark.props.timer = SHARK.dashMs;
      shark.state = "dash";
    }
  } else {
    shark.anim = "swim";
    moveInBand(shark, ctx.arena, dirX * SHARK.dashSpeed, dirY * SHARK.dashSpeed, dt);
    shark.state = "dash";
    if (tickTimer(shark, "timer", dt) <= 0) {
      shark.props.timer = SHARK.circleMs;
      shark.state = "circle";
    }
  }

  shark.props.dirX = dirX;
  shark.props.dirY = dirY;
  faceFromDX(shark, dirX);

  const cd = Math.max(0, (shark.props.hitCd ?? 0) - ctx.fixedDt * 1000);
  shark.props.hitCd = cd;
  const player = ctx.world.entities.find((e) => e.kind === "player");
  if (player && cd <= 0 && dist2(shark.x, shark.y, player.x, player.y) < CONTACT_RADIUS_SQ) {
    shark.props.hitCd = SHARK.hitCooldownMs;
    hitPlayer(ctx.world, player, SHARK.hitPower, shark.x, shark.y);
  }
}
