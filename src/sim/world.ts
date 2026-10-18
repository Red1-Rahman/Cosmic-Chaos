// Deterministic world simulation. Pure: no DOM, no clocks, no Math.random.
//
// This is the Milestone 1 skeleton. The tick, the fixed timestep, the time
// field, the player waterbike movement and event plumbing live here; the
// per-character enemy behaviours (orca chase, shark dash, tarantula reaction,
// human drift) are added on top by a later brief.

import { clamp, createRng } from "../util/rng";
import { ARENA, MOVEMENT } from "./game-config";
import { createInitialEntities, distance } from "./spawn";
import type { Arena, Entity, GameEvent, InputState, World } from "./types";

const PLAYER_ID = "player";

function makeArena(): Arena {
  return {
    w: ARENA.w,
    h: ARENA.h,
    minX: ARENA.minX,
    maxX: ARENA.maxX,
    minY: ARENA.minY,
    maxY: ARENA.maxY,
    fieldRadius: ARENA.fieldRadius,
    timeScaleInside: ARENA.timeScaleInside,
  };
}

function findEntity(world: World, id: string): Entity | undefined {
  return world.entities.find((e) => e.id === id);
}

export function createWorld(seed: number): World {
  const rng = createRng(seed).fork("sim");
  const entities = createInitialEntities(rng);
  const events: GameEvent[] = entities.map((e) => ({
    type: "spawn",
    id: e.id,
    kind: e.kind,
    x: e.x,
    y: e.y,
  }));

  return {
    seed,
    tick: 0,
    timeMs: 0,
    arena: makeArena(),
    entities,
    playerId: PLAYER_ID,
    fieldTimeScale: 1,
    status: "playing",
    events,
  };
}

/** Time scale applied at a point: inside the snail field it slows down. */
function timeScaleAt(world: World, x: number, y: number): number {
  const snail = world.entities.find((e) => e.kind === "snail");
  if (!snail) return 1;
  const inside = distance(x, y, snail.x, snail.y) < world.arena.fieldRadius;
  return inside ? world.arena.timeScaleInside : 1;
}

function advancePlayer(world: World, player: Entity, input: InputState, dt: number): void {
  const moveX = clamp(input.moveX, -1, 1);
  const moveY = clamp(input.moveY, -1, 1);
  const vx = player.props.vx ?? 0;
  const vy = player.props.vy ?? 0;

  const nextVx = vx + moveX * MOVEMENT.accel * dt;
  const nextVy = vy + moveY * MOVEMENT.accel * dt;
  const damp = Math.exp(-MOVEMENT.dragPerSecond * dt);
  let dampedVx = nextVx * damp;
  let dampedVy = nextVy * damp;
  const speed = Math.sqrt(dampedVx * dampedVx + dampedVy * dampedVy);
  if (speed > MOVEMENT.maxSpeed) {
    dampedVx = (dampedVx / speed) * MOVEMENT.maxSpeed;
    dampedVy = (dampedVy / speed) * MOVEMENT.maxSpeed;
  }

  player.props.vx = dampedVx;
  player.props.vy = dampedVy;
  player.x = clamp(player.x + dampedVx * dt, world.arena.minX, world.arena.maxX);
  player.y = clamp(player.y + dampedVy * dt, world.arena.minY, world.arena.maxY);
  player.props.speed = Math.min(speed, MOVEMENT.maxSpeed);

  if (input.jump && (player.props.jumpMs ?? 0) <= 0) {
    player.props.jumpMs = MOVEMENT.jumpMs;
    world.events.push({ type: "jump", id: player.id, x: player.x, y: player.y });
  }
  const jumpMs = player.props.jumpMs ?? 0;
  const jumping = jumpMs > 0;
  const wasJumping = (player.props.jumpWasActive ?? 0) > 0;
  player.props.jumpWasActive = jumping ? 1 : 0;
  // Landing is the one step where the arc ran and now does not.
  player.props.justLanded = !jumping && wasJumping ? 1 : 0;
  if (jumping) {
    const remaining = Math.max(0, jumpMs - dt * 1000);
    player.props.jumpMs = remaining;
    // Lift is a separate 0..1 arc, not a y offset: y is depth, not height.
    player.props.lift = Math.sin((1 - remaining / MOVEMENT.jumpMs) * Math.PI);
  } else {
    player.props.lift = 0;
  }

  if (Math.abs(moveX) > 0.05) player.facing = moveX > 0 ? 1 : -1;
  if (input.action) {
    world.events.push({ type: "laser", id: player.id, x: player.x, y: player.y });
  }
}

/** One fixed simulation step. `fixedDt` never changes, not even in the field. */
export function step(world: World, input: InputState, fixedDt: number): void {
  if (world.status !== "playing") return;
  world.tick += 1;
  world.timeMs += fixedDt * 1000;

  const player = findEntity(world, world.playerId);
  if (!player) return;

  player.timeScale = timeScaleAt(world, player.x, player.y);
  world.fieldTimeScale = player.timeScale;
  advancePlayer(world, player, input, fixedDt * player.timeScale);

  for (const entity of world.entities) {
    const scale = timeScaleAt(world, entity.x, entity.y);
    if (scale !== entity.timeScale) {
      entity.timeScale = scale;
      world.events.push(
        scale < 1
          ? { type: "timeFieldEnter", id: entity.id, x: entity.x, y: entity.y }
          : { type: "timeFieldExit", id: entity.id, x: entity.x, y: entity.y },
      );
    }
    entity.animMs += fixedDt * 1000 * entity.timeScale;
  }
}

export function drainEvents(world: World): GameEvent[] {
  const events = world.events;
  world.events = [];
  return events;
}

/** Round to 1e-6 so tiny float noise never changes a golden hash. */
function q(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

export function hashWorld(world: World): string {
  const parts: string[] = [
    `seed=${String(world.seed)}`,
    `tick=${String(world.tick)}`,
    `timeMs=${q(world.timeMs)}`,
    `status=${world.status}`,
    `field=${q(world.fieldTimeScale)}`,
  ];
  for (const e of world.entities) {
    parts.push(
      [
        e.id,
        e.kind,
        q(e.x),
        q(e.y),
        String(e.facing),
        e.anim,
        q(e.animMs),
        q(e.scale),
        q(e.alpha),
        q(e.timeScale),
        q(e.hp),
        e.state,
        propsHash(e),
      ].join("|"),
    );
  }
  return hashString(parts.join("\n"));
}

/** Sorted key order so props hashing does not depend on insertion order. */
function propsHash(entity: Entity): string {
  return Object.keys(entity.props)
    .sort()
    .map((key) => `${key}=${q(entity.props[key] ?? 0)}`)
    .join(",");
}

function hashString(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
