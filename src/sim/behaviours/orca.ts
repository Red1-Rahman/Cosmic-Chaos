// Orca: Warden of the Rule. Chase, telegraph, lunge, recover.
//
// Every speed below is px per second and is multiplied by the caller's
// time-scaled dt, so the same constants make the Orca visibly slower inside
// the snail's time field without any extra code here.

import { clamp } from "../../util/rng";
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
} as const;

export type OrcaState = "idle" | "chase" | "telegraph" | "lunge" | "recover";

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

function resolveLungeContact(orca: Entity, ctx: BehaviourContext): void {
  const player = ctx.world.entities.find((e) => e.kind === "player");
  if (!player) return;
  const reach = ORCA.contactRadius * ORCA.contactRadius;
  if (dist2(orca.x, orca.y, player.x, player.y) > reach) return;
  hitPlayer(ctx.world, player, ORCA.hitPower, orca.x, orca.y);
  beginRecover(orca);
}

export function updateOrca(orca: Entity, ctx: BehaviourContext): void {
  const player = ctx.world.entities.find((e) => e.kind === "player");
  if (!player) return;
  const dt = ctx.dt;
  const pvx = player.props.vx ?? 0;
  const pvy = player.props.vy ?? 0;

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
        (orca.props.dirX ?? 0) * ORCA.lungeSpeed,
        (orca.props.dirY ?? 0) * ORCA.lungeSpeed,
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