// Deterministic world simulation. Pure: no DOM, no clocks, no Math.random.
//
// The tick, the fixed timestep, the time field, the player waterbike movement,
// the level geometry, the water cannon, the dodge, the parry, the objective book
// and the dialogue all live here. Per-character behaviour lives in
// `sim/behaviours/*` and is dispatched from `step` once every entity has its time
// scale for this step.

import { clamp, createRng } from "../util/rng";
import {
  buildCores,
  buildObjectives,
  buildObstacles,
  collectCores,
  dodgingThrough,
  objectivesComplete,
  resolveObstacleOverlap,
  stepPellets,
  updateObjectives,
} from "./arena-objects";
import { updateHuman } from "./behaviours/human";
import { updateOrca } from "./behaviours/orca";
import {
  startDodge,
  startParry,
  updatePlayerPresentation,
  updatePlayerVitality,
  updateWaterCannon,
} from "./behaviours/player";
import { updateShark } from "./behaviours/shark";
import type { BehaviourContext } from "./behaviours/shared";
import { updateSnail } from "./behaviours/snail";
import { updateTarantula } from "./behaviours/tarantula";
import { dialogueDuration, lineFor, type Trigger } from "./dialogue";
import { ARENA, DODGE, MOVEMENT } from "./game-config";
import { FIRST_LEVEL_ID, levelById, levelSeed } from "./levels";
import { createInitialEntities, distance } from "./spawn";
import { beginTutorial, stepTutorial } from "./tutorial";
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

/**
 * Build the world for a level. The level's own seed offset is applied to the
 * base seed, so `?seed=` still reproduces a run exactly and two levels never
 * deal the same arena by accident.
 *
 * With `options.tutorial`, the world opens with only the rider on the water and the
 * rest of the cast plus the cores held in a backlog that the tutorial hands over one
 * stage at a time. Every entity keeps the position the seeded spawner gave it, so the
 * run stays fully deterministic and a revealed character lands where it always would.
 */
export function createWorld(
  seed: number,
  levelId: number = FIRST_LEVEL_ID,
  options: { tutorial?: boolean } = {},
): World {
  const level = levelById(levelId);
  const runSeed = levelSeed(seed, level.id);
  const rng = createRng(runSeed).fork("sim");
  const obstacles = buildObstacles(level);
  const allEntities = createInitialEntities(rng, obstacles);
  const allCores = buildCores(level);
  const objectives = buildObjectives(level);

  const player = allEntities.find((entity) => entity.kind === "player");
  const tutorial =
    options.tutorial === true
      ? beginTutorial(allEntities, allCores, player?.x ?? 0, player?.y ?? 0)
      : undefined;

  // A tutorial world shows only the rider up front; everything else waits in the backlog.
  const entities =
    tutorial === undefined ? allEntities : allEntities.filter((entity) => entity.kind === "player");
  const cores = tutorial === undefined ? allCores : [];
  const events: GameEvent[] = entities.map((e) => ({
    type: "spawn",
    id: e.id,
    kind: e.kind,
    x: e.x,
    y: e.y,
  }));

  const world: World = {
    seed: runSeed,
    tick: 0,
    timeMs: 0,
    arena: makeArena(),
    entities,
    playerId: PLAYER_ID,
    fieldTimeScale: 1,
    status: "playing",
    events,
    levelId: level.id,
    obstacles,
    pellets: [],
    cores,
    objectives,
    staggerTally: {},
    dialogue: null,
  };
  if (tutorial !== undefined) world.tutorial = tutorial;
  return world;
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

  // The dodge and the parry are edge triggered, so a held key fires exactly once.
  if (input.dodge) startDodge(player, world.events, moveX, moveY);
  if (input.parry) startParry(player, world.events);
  if (input.action) updateWaterCannon(world, player, world.events);

  // Read after the triggers: a dodge that begins this step already ignores reefs.
  const dodging = dodgingThrough(player);

  const bursting = (player.props.dodgeBurstMs ?? 0) > 0 && (player.props.dodgeMs ?? 0) > 0;
  if (bursting) {
    player.props.vx = (player.props.vx ?? 0) + (player.props.dodgeDirX ?? 0) * DODGE.impulse;
    player.props.vy = (player.props.vy ?? 0) + (player.props.dodgeDirY ?? 0) * DODGE.impulse;
  }

  const vx = player.props.vx ?? 0;
  const vy = player.props.vy ?? 0;

  const nextVx = vx + moveX * MOVEMENT.accel * dt;
  const nextVy = vy + moveY * MOVEMENT.accel * dt;
  const damp = Math.exp(-MOVEMENT.dragPerSecond * dt);
  let dampedVx = nextVx * damp;
  let dampedVy = nextVy * damp;
  const speed = Math.sqrt(dampedVx * dampedVx + dampedVy * dampedVy);
  const topSpeed = bursting ? MOVEMENT.maxSpeed * 1.9 : MOVEMENT.maxSpeed;
  if (speed > topSpeed) {
    dampedVx = (dampedVx / speed) * topSpeed;
    dampedVy = (dampedVy / speed) * topSpeed;
  }

  player.props.vx = dampedVx;
  player.props.vy = dampedVy;
  player.x = clamp(player.x + dampedVx * dt, world.arena.minX, world.arena.maxX);
  player.y = clamp(player.y + dampedVy * dt, world.arena.minY, world.arena.maxY);
  player.props.speed = Math.min(Math.sqrt(dampedVx * dampedVx + dampedVy * dampedVy), topSpeed);

  if (!dodging) {
    resolveObstacleOverlap(player, world.arena, world.obstacles);
  }

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
}

/**
 * Read the events this step produced and let the cast react. Priority order is
 * the order a player would notice them in: a victory beats everything, then a
 * defeat, then whatever just happened to the player.
 */
const TRIGGER_PRIORITY: readonly Trigger[] = [
  "victory",
  "defeat",
  "objectiveDone",
  "parry",
  "staggerOrca",
  "staggerShark",
  "hurt",
  "dodge",
  "collect",
  "timeField",
];

function triggerOf(event: GameEvent): Trigger | undefined {
  switch (event.type) {
    case "victory":
      return "victory";
    case "defeat":
      return "defeat";
    case "objective":
      return "objectiveDone";
    case "parrySuccess":
      return "parry";
    case "stagger":
      return event.kind === "orca" ? "staggerOrca" : "staggerShark";
    case "hit":
      return "hurt";
    case "dodge":
      return "dodge";
    case "collect":
      return "collect";
    case "timeFieldEnter":
      return "timeField";
    default:
      return undefined;
  }
}

/** Counter per trigger, so a repeated trigger walks its own line list. */
const triggerCounts = new WeakMap<World, Map<Trigger, number>>();

function pumpDialogue(world: World, fromIndex: number): void {
  let counts = triggerCounts.get(world);
  if (counts === undefined) {
    counts = new Map<Trigger, number>();
    triggerCounts.set(world, counts);
  }
  const fresh = world.events.slice(fromIndex);
  if (fresh.length === 0) return;

  const byTrigger = new Map<Trigger, number>();
  for (const event of fresh) {
    const trigger = triggerOf(event);
    if (trigger === undefined) continue;
    byTrigger.set(trigger, (byTrigger.get(trigger) ?? 0) + 1);
  }
  if (byTrigger.size === 0) return;

  for (const trigger of TRIGGER_PRIORITY) {
    const fired = byTrigger.get(trigger);
    if (fired === undefined || fired <= 0) continue;
    const seen = counts.get(trigger) ?? 0;
    counts.set(trigger, seen + fired);
    const line = lineFor(trigger, seen);
    world.dialogue = {
      speaker: line.speaker,
      line: line.text,
      msLeft: dialogueDuration(line.text),
    };
    return;
  }
}

function tickDialogue(world: World, fixedDt: number): void {
  const current = world.dialogue;
  if (current === null) return;
  current.msLeft -= fixedDt * 1000;
  if (current.msLeft <= 0) world.dialogue = null;
}

/** One fixed simulation step. `fixedDt` never changes, not even in the field. */
export function step(world: World, input: InputState, fixedDt: number): void {
  if (world.status !== "playing") return;
  world.tick += 1;
  world.timeMs += fixedDt * 1000;
  const mark = world.events.length;

  const player = findEntity(world, world.playerId);
  if (!player) return;

  player.timeScale = timeScaleAt(world, player.x, player.y);
  world.fieldTimeScale = player.timeScale;

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

  // Behaviours run after the time scales are resolved, so each one gets a dt
  // that is already scaled by the field it is standing in.
  advancePlayer(world, player, input, fixedDt * player.timeScale);
  const arena = world.arena;
  const ctxFor = (entity: Entity): BehaviourContext => ({
    world,
    arena,
    dt: fixedDt * entity.timeScale,
    fixedDt,
  });

  for (const entity of world.entities) {
    if (entity.kind === "player") continue;
    const ctx = ctxFor(entity);
    if (entity.kind === "orca") updateOrca(entity, ctx);
    else if (entity.kind === "shark") updateShark(entity, ctx);
    else if (entity.kind === "tarantula") updateTarantula(entity, ctx);
    else if (entity.kind === "snail") updateSnail(entity, ctx);
    else updateHuman(entity, ctx);
    // Reefs are solid for everything on the water. The push is radial, so a
    // warden chasing into one is steered around it instead of pinned to it.
    if (entity.kind !== "tarantula") {
      resolveObstacleOverlap(entity, world.arena, world.obstacles);
    }
  }

  updatePlayerPresentation(world, player, fixedDt * player.timeScale);
  updatePlayerVitality(player, ctxFor(player));

  collectCores(world, player);
  // Pellets travel on the unscaled step: a slowed rider still fires at full pace.
  stepPellets(world, player, fixedDt);
  tickDialogue(world, fixedDt);

  updateObjectives(world, world.tick * fixedDt);
  if (objectivesComplete(world.objectives)) {
    world.status = "victory";
    player.state = "victory";
    world.events.push({ type: "victory", id: player.id, x: player.x, y: player.y });
  }

  // The tutorial reads this step's events to close a stage. A run that just ended
  // stops advancing so its card can never change under a victory or defeat screen.
  if (world.status === "playing") stepTutorial(world, player, mark);

  pumpDialogue(world, mark);
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
    `level=${String(world.levelId)}`,
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
  for (const obstacle of world.obstacles) {
    parts.push(["obstacle", obstacle.id, obstacle.kind, q(obstacle.x), q(obstacle.y)].join("|"));
  }
  for (const core of world.cores) {
    parts.push(["core", core.id, q(core.x), q(core.y), String(core.taken)].join("|"));
  }
  for (const pellet of world.pellets) {
    parts.push(
      [
        "pellet",
        pellet.id,
        q(pellet.x),
        q(pellet.y),
        q(pellet.vx),
        q(pellet.vy),
        q(pellet.lifeMs),
      ].join("|"),
    );
  }
  for (const objective of world.objectives) {
    parts.push(
      [
        "objective",
        objective.id,
        objective.kind,
        String(objective.target),
        String(objective.count),
        String(objective.done),
      ].join("|"),
    );
  }
  for (const key of Object.keys(world.staggerTally).sort()) {
    parts.push(["tally", key, String(world.staggerTally[key] ?? 0)].join("|"));
  }
  parts.push(
    world.dialogue === null
      ? "dialogue=none"
      : `dialogue=${world.dialogue.speaker}:${world.dialogue.line}`,
  );
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
