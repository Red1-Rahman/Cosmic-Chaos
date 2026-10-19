// Capybara: animation selection, wake splashes, the water cannon, the dodge, the
// parry, the hit reaction and defeat.
//
// Movement itself stays in `sim/world.ts` because the waterbike momentum model
// owns the velocity. This module reads it and never fights it.

import { clamp } from "../../util/rng";
import { fireWaterCannon } from "../arena-objects";
import { DODGE, PARRY, STAGGER, WEAPON } from "../game-config";
import type { Entity, GameEvent, World } from "../types";
import type { BehaviourContext } from "./shared";

export const PLAYER = {
  /** Below this speed the bike is considered parked. */
  moveEpsilon: 12,
  /** |vy| above |vx| times this reads as swimming rather than skimming. */
  swimAxisBias: 0.6,
  /** Wakes start above this speed, in px per second. */
  splashSpeed: 190,
  /** Minimum gap between two wake splashes, in ms. */
  splashCooldownMs: 260,
  /** Landing after a hop always splashes; this is its strength. */
  landSplashPower: 0.55,
  /** The same player cannot be hit again for this long: a mercy window. */
  hitCooldownMs: 600,
  /** Knockback impulse in px per second. */
  knockback: 330,
  /** Flash duration in ms, and how far it drives scale and alpha. */
  flashMs: 340,
  flashScale: 0.3,
  flashAlpha: 0.45,
  /** Out-of-combat regen: this long without a hit, then this fraction per second. */
  regenDelayMs: 3000,
  regenPerSecond: 0.06,
} as const;

/** What a call to `hitPlayer` actually did. The AI branches on it. */
export type HitResult = "hit" | "parried" | "dodged" | "ignored";

/**
 * Landing splash. `advancePlayer` flags `justLanded` on the step the hop arc
 * finishes, so this never has to guess whether the arc crossed zero.
 */
function splashTick(world: World, player: Entity): void {
  if ((player.props.justLanded ?? 0) <= 0) return;
  player.props.justLanded = 0;
  player.props.splashCd = 0;
  world.events.push({
    type: "splash",
    id: player.id,
    x: player.x,
    y: player.y,
    power: PLAYER.landSplashPower,
  });
}

/**
 * Pick the animation that matches what the bike is doing right now, and emit a
 * throttled wake splash. Throttling is a millisecond cooldown in props, so a
 * fast player cannot stack a splash event on every single step.
 */
export function updatePlayerPresentation(world: World, player: Entity, dt: number): void {
  if (world.status !== "playing") {
    player.anim = "defeat";
    player.state = world.status === "victory" ? "victory" : "defeat";
    return;
  }
  const cd = Math.max(0, (player.props.splashCd ?? 0) - dt * 1000);
  player.props.splashCd = cd;

  const speed = player.props.speed ?? 0;
  const jumping = (player.props.jumpMs ?? 0) > 0;
  const dodging = (player.props.dodgeMs ?? 0) > 0;
  const parrying = (player.props.parryWindowMs ?? 0) > 0;
  const vx = player.props.vx ?? 0;
  const vy = player.props.vy ?? 0;

  if (dodging) {
    player.anim = "jump";
    player.state = "dodge";
  } else if (parrying) {
    player.anim = "jump";
    player.state = "parry";
  } else if (jumping) {
    player.anim = "jump";
    player.state = "jump";
  } else if (speed > PLAYER.moveEpsilon) {
    const swimming = Math.abs(vy) > Math.abs(vx) * PLAYER.swimAxisBias;
    player.anim = swimming ? "swim" : "walk";
    player.state = swimming ? "swim" : "move";
  } else {
    player.anim = "idle";
    player.state = "idle";
  }

  splashTick(world, player);

  if (cd <= 0 && speed > PLAYER.splashSpeed) {
    player.props.splashCd = PLAYER.splashCooldownMs;
    world.events.push({
      type: "splash",
      id: player.id,
      x: player.x,
      y: player.y,
      power: clamp(speed / PLAYER.splashSpeed, 0, 1),
    });
  }
}

/**
 * Try to start a dodge. Returns true when one actually began, so the caller knows
 * it has to apply the impulse exactly once.
 */
export function startDodge(
  player: Entity,
  events: GameEvent[],
  dirX: number,
  dirY: number,
): boolean {
  if ((player.props.dodgeCd ?? 0) > 0) return false;
  if ((player.props.dodgeMs ?? 0) > 0) return false;
  player.props.dodgeCd = DODGE.cooldownMs;
  player.props.dodgeMs = DODGE.iframeMs;
  player.props.dodgeBurstMs = DODGE.burstMs;
  const len = Math.sqrt(dirX * dirX + dirY * dirY);
  const nx = len > 1e-6 ? dirX / len : player.facing;
  const ny = len > 1e-6 ? dirY / len : 0;
  player.props.dodgeDirX = nx;
  player.props.dodgeDirY = ny;
  events.push({ type: "dodge", id: player.id, x: player.x, y: player.y });
  return true;
}

/** Try to open the parry window. */
export function startParry(player: Entity, events: GameEvent[]): boolean {
  if ((player.props.parryCd ?? 0) > 0) return false;
  player.props.parryCd = PARRY.cooldownMs;
  player.props.parryWindowMs = PARRY.windowMs;
  events.push({ type: "parry", id: player.id, x: player.x, y: player.y });
  return true;
}

/** Fire the water cannon if it is off cooldown. */
export function updateWaterCannon(world: World, player: Entity, events: GameEvent[]): void {
  fireWaterCannon(world, player, events);
}

/**
 * Take a hit. The parry window turns the attack around instead of eating it, and
 * a dodge burst makes the rider untouchable. Returns which of those happened.
 */
export function hitPlayer(
  world: World,
  player: Entity,
  power: number,
  fromX: number,
  fromY: number,
  attacker: Entity | undefined,
): HitResult {
  if (world.status !== "playing") return "ignored";

  // A parry beats everything: no damage, no knockback, and the attacker goes down.
  if ((player.props.parryWindowMs ?? 0) > 0) {
    player.props.parryWindowMs = 0;
    player.props.parryCd = Math.max(player.props.parryCd ?? 0, PARRY.successLockMs);
    player.props.flashMs = PLAYER.flashMs;
    if (attacker !== undefined && (attacker.props.staggeredMs ?? 0) <= 0) {
      attacker.props.staggerMeter = STAGGER.threshold;
      attacker.props.staggeredMs = STAGGER.recoveryMs;
      attacker.props.staggerCd = STAGGER.rehitCooldownMs;
      const dx = attacker.x - player.x;
      const dy = attacker.y - player.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      attacker.props.pushX = (attacker.props.pushX ?? 0) + (dx / len) * STAGGER.knockback;
      attacker.props.pushY = (attacker.props.pushY ?? 0) + (dy / len) * STAGGER.knockback;
      world.staggerTally[attacker.kind] = (world.staggerTally[attacker.kind] ?? 0) + 1;
    }
    world.events.push({
      type: "parrySuccess",
      id: player.id,
      kind: attacker?.kind ?? "player",
      x: player.x,
      y: player.y,
    });
    return "parried";
  }

  // The dodge burst is the other answer: slip the hit entirely.
  if ((player.props.dodgeMs ?? 0) > 0) return "dodged";

  // A short mercy window after a hit: a lunge still whiffs, it just cannot
  // chain into another hit. Keeps a long chase survivable without dodging.
  if ((player.props.iFrameMs ?? 0) > 0) return "ignored";

  const dx = player.x - fromX;
  const dy = player.y - fromY;
  const d2 = dx * dx + dy * dy;
  const dist = d2 < 1e-9 ? 1 : Math.sqrt(d2);
  player.props.vx = (player.props.vx ?? 0) + (dx / dist) * PLAYER.knockback;
  player.props.vy = (player.props.vy ?? 0) + (dy / dist) * PLAYER.knockback;
  player.hp = clamp(player.hp - power, 0, 1);
  player.props.flashMs = PLAYER.flashMs;
  player.props.hurtMs = PLAYER.regenDelayMs;
  player.props.iFrameMs = PLAYER.hitCooldownMs;
  world.events.push({ type: "hit", id: player.id, x: player.x, y: player.y, power });

  if (player.hp <= 0) {
    world.status = "defeat";
    player.anim = "defeat";
    player.state = "defeat";
    world.events.push({ type: "defeat", id: player.id, kind: player.kind });
  }
  return "hit";
}

/** Flash decay, squash, cooldowns and out-of-combat regen. Runs once per step. */
export function updatePlayerVitality(player: Entity, ctx: BehaviourContext): void {
  const dt = ctx.dt;
  const ms = (player.props["flashMs"] ?? 0) - dt * 1000;
  player.props.flashMs = Math.max(0, ms);
  const flash = Math.max(0, ms) / PLAYER.flashMs;
  player.scale = 1 + PLAYER.flashScale * flash;
  player.alpha = 1 - PLAYER.flashAlpha * flash;

  player.props.hurtMs = Math.max(0, (player.props.hurtMs ?? 0) - dt * 1000);
  player.props.iFrameMs = Math.max(0, (player.props.iFrameMs ?? 0) - dt * 1000);
  player.props.fireCd = Math.max(0, (player.props.fireCd ?? 0) - dt * 1000);
  player.props.dodgeMs = Math.max(0, (player.props.dodgeMs ?? 0) - dt * 1000);
  player.props.dodgeBurstMs = Math.max(0, (player.props.dodgeBurstMs ?? 0) - dt * 1000);
  player.props.parryWindowMs = Math.max(0, (player.props.parryWindowMs ?? 0) - dt * 1000);

  // Cooldowns run on the unscaled step, so being slowed inside the Snail's field
  // never hands the player a free extra dodge or a free extra parry.
  const unscaled = ctx.fixedDt * 1000;
  player.props.dodgeCd = Math.max(0, (player.props.dodgeCd ?? 0) - unscaled);
  player.props.parryCd = Math.max(0, (player.props.parryCd ?? 0) - unscaled);

  const hurtMs = player.props.hurtMs;
  if (hurtMs <= 0 && player.hp < 1 && ctx.world.status === "playing") {
    player.hp = clamp(player.hp + PLAYER.regenPerSecond * dt, 0, 1);
  }
}

/** Read-out helpers for the HUD. 0 means not ready yet. */
export function dodgeReady01(player: Entity): number {
  return clamp(1 - (player.props.dodgeCd ?? 0) / DODGE.cooldownMs, 0, 1);
}

export function parryReady01(player: Entity): number {
  return clamp(1 - (player.props.parryCd ?? 0) / PARRY.cooldownMs, 0, 1);
}

export function cannonReady01(player: Entity): number {
  return clamp(1 - (player.props.fireCd ?? 0) / WEAPON.fireCooldownMs, 0, 1);
}
