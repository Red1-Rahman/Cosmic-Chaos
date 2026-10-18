// Humans: non-sentient pets. Scenery with a little physics. They can never
// block the player and they can never be harmed as a mechanic.

import { clamp } from "../../util/rng";
import type { Entity } from "../types";
import type { BehaviourContext } from "./shared";
import { dist2, keepInBand, moveInBand } from "./shared";

export const HUMAN = {
  minSpeed: 12,
  maxSpeed: 26,
  margin: 60,
  /** Bump reach, px. */
  bumpRadius: 34,
  /** How hard the player shoves them, px per second. */
  bumpImpulse: 190,
  /** The bumped flag lasts this long so render can flash a response. */
  bumpedMs: 620,
} as const;

export type HumanState = "drift" | "bumped";

const BUMP_RADIUS_SQ = HUMAN.bumpRadius * HUMAN.bumpRadius;

/** Deterministic per-id seed: no RNG stream, no clock, no Math.random. */
function seedFromId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function seedProps(human: Entity): void {
  const seed = seedFromId(human.id);
  human.props.driftDirX = seed % 2 === 0 ? 1 : -1;
  human.props.driftDirY = ((seed >>> 1) % 2 === 0 ? 1 : -1) * 0.35;
  human.props.driftSpeed =
    HUMAN.minSpeed + ((seed >>> 2) % 1000) / 1000 * (HUMAN.maxSpeed - HUMAN.minSpeed);
  human.props.bumpedMs = 0;
  human.props.bumpCd = 0;
}

export function updateHuman(human: Entity, ctx: BehaviourContext): void {
  const dt = ctx.dt;
  if (human.props.driftSpeed === undefined) seedProps(human);

  const bumpedLeft = Math.max(0, (human.props.bumpedMs ?? 0) - dt * 1000);
  human.props.bumpedMs = bumpedLeft;
  human.state = bumpedLeft > 0 ? "bumped" : "drift";

  let dirX = human.props.driftDirX ?? 1;
  let dirY = human.props.driftDirY ?? 0;
  [dirX, dirY] = keepInBand(human, ctx.arena, dirX, dirY, HUMAN.margin);

  const speed = human.props.driftSpeed ?? HUMAN.minSpeed;
  // The nudge from a bump decays with the same exponential drag the player uses.
  const pushX = (human.props.pushX ?? 0) * Math.exp(-2.6 * dt);
  const pushY = (human.props.pushY ?? 0) * Math.exp(-2.6 * dt);
  human.props.pushX = pushX;
  human.props.pushY = pushY;

  moveInBand(human, ctx.arena, dirX * speed + pushX, dirY * speed + pushY, dt);

  // Walk when the drift is mostly horizontal, swim when it is not. Both are
  // drift loops in assets.json, so the pet never looks like it is animating.
  human.anim = Math.abs(dirX) >= Math.abs(dirY) * 2 ? "walk" : "swim";
  human.scale = 1;
  human.alpha = 1;

  const player = ctx.world.entities.find((e) => e.kind === "player");
  const cd = Math.max(0, (human.props.bumpCd ?? 0) - ctx.fixedDt * 1000);
  human.props.bumpCd = cd;
  if (player && cd <= 0 && dist2(human.x, human.y, player.x, player.y) < BUMP_RADIUS_SQ) {
    const dx = human.x - player.x;
    const dy = human.y - player.y;
    const d2 = dx * dx + dy * dy;
    const dist = d2 < 1e-9 ? 1 : Math.sqrt(d2);
    human.props.pushX = (human.props.pushX ?? 0) + (dx / dist) * HUMAN.bumpImpulse;
    human.props.pushY = (human.props.pushY ?? 0) + (dy / dist) * HUMAN.bumpImpulse;
    human.props.bumpedMs = HUMAN.bumpedMs;
    human.props.bumpCd = HUMAN.bumpedMs;
    human.state = "bumped";
    // Only the pet is touched. The player is never stopped or redirected, so a
    // human can never block the player.
    human.props.bumps = (human.props.bumps ?? 0) + 1;
  }
  human.props.driftDirX = dirX;
  human.props.driftDirY = clamp(dirY, -1, 1);
}