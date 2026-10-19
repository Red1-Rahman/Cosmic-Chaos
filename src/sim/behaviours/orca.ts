// Orca: Warden of the Rule. Chase, telegraph, lunge, recover, and get out of
// the water when the water cannon puts it down.
//
// Every speed below is px per second and is multiplied by the caller's
// time-scaled dt, so the same constants make the Orca visibly slower inside
// the snail's time field without any extra code here.

import { clamp } from "../../util/rng";
import { updateStagger } from "../arena-objects";
import type { Entity } from "../types";
import { hitPlayer } from "./player";
import type { BehaviourContext } from "./shared";
import { dist2, faceFromDX, moveInBand, steerToward, tickTimer, unitDirection } from "./shared";

export const ORCA = {
  idleMs: 500,
  /** Pursuit speed, px per second. */
  chaseSpeed: 205,
  /**
   * Lead time in seconds: the chase aims where the player will be, so cutting
   * across the Orca's path pulls it wide instead of gluing it to the tail.
   */
  leadSeconds: 0.55,
  /** Lead is capped so a fast player cannot send the Orca off the map. */
  maxLeadPx: 180,
  /** Distance at which the wind-up starts. */
  telegraphRange: 230,
  /** Fixed wind-up: it stops and plays jump, which is the dodge cue. */
  telegraphMs: 420,
  /** Committed dash, px per second. */
  lungeSpeed: 700,
  lungeMs: 360,
  /** Stagger after a missed lunge: slower and much easier to dodge. */
  recoverMs: 900,
  recoverSpeedScale: 0.35,
  /** Contact while lunging is what hurts the player. */
  contactRadius: 48,
  hitPower: 0.22,
  /** Repeat wind-ups cannot start again until this cooldown clears. */
  cooldownMs: 500,
  /** How fast a cannon knockback decays, per second. */
  knockbackDrag: 3.4,
} as const;

export type OrcaState = "idle" | "chase" | "telegraph" | "lunge" | "recover" | "staggered";

function beginTelegraph(orca: Entity): void {
  orca.state = "telegraph";
  orca.props.timer = ORCA.telegraphMs;
  orca.props.dirX = 0;
  orca.props.dirY = 0;
  orca.anim = "jump";
}

function beginLunge(orca: Entity, player: Entity): void {
  orca.state = "lunge";
  orca.props.timer = ORCA.lungeMs;
  const [dx, dy] = unitDirection(orca.x, orca.y, player.x, player.y);
  orca.props.dirX = dx;
  orca.props.dirY = dy;
  faceFromDX(orca, dx);
  orca.anim = "jump";
}

function beginRecover(orca: Entity): void {
  orca.state = "recover";
  orca.props.timer = ORCA.recoverMs;
  orca.props.cooldown = ORCA.cooldownMs;
  orca.anim = "swim";
}

/** Knockback from a pellet decays exponentially, exactly like the player's drag. */
function applyKnockback(orca: Entity, dt: number): { x: number; y: number } {
  const damp = Math.exp(-ORCA.knockbackDrag * dt);
  const x = (orca.props.pushX ?? 0) * damp;
  const y = (orca.props.pushY ?? 0) * damp;
  orca.props.pushX = Math.abs(x) < 0.5 ? 0 : x;
  orca.props.pushY = Math.abs(y) < 0.5 ? 0 : y;
  return { x: orca.props.pushX, y: orca.props.pushY };
}

function resolveLungeContact(orca: Entity, ctx: BehaviourContext): void {
  const player = ctx.world.entities.find((e) => e.kind === "player");
  if (!player) return;
  const reach = ORCA.contactRadius * ORCA.contactRadius;
  if (dist2(orca.x, orca.y, player.x, player.y) > reach) return;
  hitPlayer(ctx.world, player, ORCA.hitPower, orca.x, orca.y, orca);
  // A spent lunge always ends in recovery, whether it connected, was dodged or
  // was parried: the Orca has committed either way.
  beginRecover(orca);
}

export function updateOrca(orca: Entity, ctx: BehaviourContext): void {
  const player = ctx.world.entities.find((e) => e.kind === "player");
  if (!player) return;
  const dt = ctx.dt;
  const pvx = player.props.vx ?? 0;
  const pvy = player.props.vy ?? 0;

  const push = applyKnockback(orca, dt);
  const active = updateStagger(orca, ctx);
  if (!active) {
    // Toppled: drift with whatever the last hit gave it, and do nothing else.
    moveInBand(orca, ctx.arena, push.x, push.y, dt);
    orca.state = "staggered";
    orca.anim = "idle";
    orca.props.dist2 = dist2(orca.x, orca.y, player.x, player.y);
    return;
  }

  switch (orca.state as OrcaState) {
    case "idle": {
      orca.anim = "idle";
      if (tickTimer(orca, "timer", dt) <= 0) {
        orca.state = "chase";
        orca.anim = "swim";
      }
      break;
    }
    case "chase": {
      orca.anim = "swim";
      const leadX = clamp(pvx * ORCA.leadSeconds, -ORCA.maxLeadPx, ORCA.maxLeadPx);
      const leadY = clamp(pvy * ORCA.leadSeconds, -ORCA.maxLeadPx, ORCA.maxLeadPx);
      const d2 = steerToward(
        orca,
        ctx.arena,
        player.x + leadX,
        player.y + leadY,
        ORCA.chaseSpeed,
        dt,
      );
      moveInBand(orca, ctx.arena, push.x, push.y, dt);
      faceFromDX(orca, player.x + leadX - orca.x);
      const cd = Math.max(0, (orca.props.cooldown ?? 0) - dt * 1000);
      orca.props.cooldown = cd;
      if (d2 < ORCA.telegraphRange * ORCA.telegraphRange && cd <= 0) beginTelegraph(orca);
      break;
    }
    case "telegraph": {
      // Wind-up: it stops dead so the tell is readable, and plays jump.
      orca.anim = "jump";
      orca.props.vx = 0;
      orca.props.vy = 0;
      faceFromDX(orca, player.x - orca.x);
      if (tickTimer(orca, "timer", dt) <= 0) beginLunge(orca, player);
      break;
    }
    case "lunge": {
      orca.anim = "jump";
      moveInBand(
        orca,
        ctx.arena,
        (orca.props.dirX ?? 0) * ORCA.lungeSpeed + push.x,
        (orca.props.dirY ?? 0) * ORCA.lungeSpeed + push.y,
        dt,
      );
      resolveLungeContact(orca, ctx);
      if (orca.state === "lunge" && tickTimer(orca, "timer", dt) <= 0) beginRecover(orca);
      break;
    }
    case "recover": {
      orca.anim = "swim";
      steerToward(
        orca,
        ctx.arena,
        player.x,
        player.y,
        ORCA.chaseSpeed * ORCA.recoverSpeedScale,
        dt,
      );
      faceFromDX(orca, player.x - orca.x);
      if (tickTimer(orca, "timer", dt) <= 0) {
        orca.state = "chase";
        orca.anim = "swim";
      }
      break;
    }
    default:
      orca.state = "chase";
      orca.anim = "swim";
      break;
  }

  orca.props.dist2 = dist2(orca.x, orca.y, player.x, player.y);
}
