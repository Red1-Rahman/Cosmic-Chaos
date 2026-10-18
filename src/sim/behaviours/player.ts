// Capybara: animation selection, wake splashes, hit reaction and defeat.
//
// Movement itself stays in `sim/world.ts` because the waterbike momentum model
// owns the velocity. This module only reads it and never touches it.

import { clamp } from "../../util/rng";
import type { Entity, World } from "../types";
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
  /** The same attacker cannot hit again for this long. */
  hitCooldownMs: 420,
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
  const cd = Math.max(0, (player.props.splashCd ?? 0) - dt * 1000);
  player.props.splashCd = cd;

  const speed = player.props.speed ?? 0;
  const jumping = (player.props.jumpMs ?? 0) > 0;
  const vx = player.props.vx ?? 0;
  const vy = player.props.vy ?? 0;

  if (jumping) {
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

/** Flash, knockback and health decay. Safe to call several times per step. */
export function hitPlayer(
  world: World,
  player: Entity,
  power: number,
  fromX: number,
  fromY: number,
): void {
  const dx = player.x - fromX;
  const dy = player.y - fromY;
  const d2 = dx * dx + dy * dy;
  const dist = d2 < 1e-9 ? 1 : Math.sqrt(d2);
  player.props.vx = (player.props.vx ?? 0) + (dx / dist) * PLAYER.knockback;
  player.props.vy = (player.props.vy ?? 0) + (dy / dist) * PLAYER.knockback;
  player.hp = clamp(player.hp - power, 0, 1);
  player.props.flashMs = PLAYER.flashMs;
  player.props.hurtMs = PLAYER.regenDelayMs;
  world.events.push({ type: "hit", id: player.id, x: player.x, y: player.y, power });

  if (player.hp <= 0 && world.status === "playing") {
    world.status = "defeat";
    player.anim = "defeat";
    player.state = "defeat";
    world.events.push({ type: "defeat", id: player.id, kind: player.kind });
  }
}

/** Flash decay, squash and out-of-combat regen. Runs once per step. */
export function updatePlayerVitality(player: Entity, ctx: BehaviourContext): void {
  const dt = ctx.dt;
  const flashMs = Math.max(0, (player.props.flashMs ?? 0) - dt * 1000);
  player.props.flashMs = flashMs;
  const flash = PLAYER.flashMs > 0 ? flashMs / PLAYER.flashMs : 0;
  player.scale = 1 + PLAYER.flashScale * flash;
  player.alpha = 1 - PLAYER.flashAlpha * flash;

  const hurtMs = Math.max(0, (player.props.hurtMs ?? 0) - dt * 1000);
  player.props.hurtMs = hurtMs;
  if (hurtMs <= 0 && player.hp < 1 && ctx.world.status === "playing") {
    player.hp = clamp(player.hp + PLAYER.regenPerSecond * dt, 0, 1);
  }
}