// Everything in the water that is not a character: the static level geometry,
// the loose cosmic cores, the live water-cannon pellets and the objective book.
//
// Pure simulation. No DOM, no clocks, no randomness beyond the seeded stream the
// caller hands in. Every function here takes the world or the pieces it needs and
// writes into them, so `world.ts` stays the only place that decides the order.

import { CORES, DODGE, OBSTACLES, STAGGER, STAGGERABLE, WEAPON } from "./game-config";
import { clamp } from "../util/rng";
import type { LevelDefinition, LevelObjective } from "./levels";
import type {
  Arena,
  Core,
  Entity,
  GameEvent,
  ObjectiveState,
  Obstacle,
  Pellet,
  World,
} from "./types";

/** Hit box of a character, used for reef and pellet collisions. */
export const BODY_RADIUS = 22;

/** Stable 0..1 value from a seeded draw, used only for cosmetic variety. */
const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

// ---------------------------------------------------------------------------
// Static geometry
// ---------------------------------------------------------------------------

/**
 * Build the level's obstacles. Authored in arena pixels and then nudged inside the
 * play band, so a hand placed reef can never end up half off the water even if a
 * human edits a level later.
 */
export function buildObstacles(level: LevelDefinition): Obstacle[] {
  const margin = OBSTACLES.edgeMargin;
  return level.obstacles.map((spec, index) => ({
    id: `obstacle-${String(index + 1)}`,
    kind: spec.kind,
    x: round6(clamp(spec.x, OBSTACLES_MIN_X + margin, OBSTACLES_MAX_X - margin)),
    y: round6(clamp(spec.y, OBSTACLES_MIN_Y + margin, OBSTACLES_MAX_Y - margin)),
    r: spec.r,
    phase: round6(((index * 37) % 100) / 100),
  }));
}

const OBSTACLES_MIN_X = 74;
const OBSTACLES_MAX_X = 1334;
const OBSTACLES_MIN_Y = 486;
const OBSTACLES_MAX_Y = 648;

/** True when the point is inside any obstacle disc. */
export function insideObstacle(
  x: number,
  y: number,
  obstacles: readonly Obstacle[],
  extra: number,
): Obstacle | undefined {
  for (const obstacle of obstacles) {
    const dx = x - obstacle.x;
    const dy = y - obstacle.y;
    const reach = obstacle.r + extra;
    if (dx * dx + dy * dy <= reach * reach) return obstacle;
  }
  return undefined;
}

/**
 * Push an entity out of every reef it is standing in and back inside the band.
 *
 * The push is radial, so an entity sliding along a reef is steered around it
 * rather than stopped dead by it: that is what makes a reef a real obstacle for
 * the chase without ever trapping anyone in a corner.
 */
export function resolveObstacleOverlap(
  entity: Entity,
  arena: Arena,
  obstacles: readonly Obstacle[],
): boolean {
  let touched = false;
  for (const obstacle of obstacles) {
    const dx = entity.x - obstacle.x;
    const dy = entity.y - obstacle.y;
    const reach = obstacle.r + BODY_RADIUS;
    const d2 = dx * dx + dy * dy;
    if (d2 >= reach * reach) continue;
    touched = true;
    const dist = Math.sqrt(d2);
    // Dead centre is not a real case, but a deterministic nudge is better than NaN.
    const nx = dist > 1e-6 ? dx / dist : 1;
    const ny = dist > 1e-6 ? dy / dist : 0;
    entity.x = obstacle.x + nx * reach;
    entity.y = obstacle.y + ny * reach;
  }
  entity.x = clamp(entity.x, arena.minX, arena.maxX);
  entity.y = clamp(entity.y, arena.minY, arena.maxY);
  return touched;
}

/** True while the entity is mid dodge and is allowed to pass through reefs. */
export function dodgingThrough(entity: Entity): boolean {
  return (entity.props.dodgeBurstMs ?? 0) > 0 || (entity.props.dodgeMs ?? 0) > 0;
}

/** True while the rider is briefly untouchable. */
export function isInvulnerable(player: Entity): boolean {
  if ((player.props.dodgeMs ?? 0) > 0) return true;
  return (player.props.parryWindowMs ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Cosmic cores
// ---------------------------------------------------------------------------

/** Build the level's cores along a spread of hand picked lanes. */
export function buildCores(level: LevelDefinition): Core[] {
  const lanes: readonly { readonly fx: number; readonly fy: number }[] = [
    { fx: 0.08, fy: 0.28 },
    { fx: 0.2, fy: 0.72 },
    { fx: 0.34, fy: 0.44 },
    { fx: 0.48, fy: 0.84 },
    { fx: 0.61, fy: 0.2 },
    { fx: 0.74, fy: 0.62 },
    { fx: 0.87, fy: 0.34 },
    { fx: 0.95, fy: 0.78 },
  ];
  const width = OBSTACLES_MAX_X - OBSTACLES_MIN_X;
  const height = OBSTACLES_MAX_Y - OBSTACLES_MIN_Y;
  const count = Math.min(level.cores, lanes.length);
  const cores: Core[] = [];
  for (let index = 0; index < count; index += 1) {
    const lane = lanes[index % lanes.length];
    if (lane === undefined) continue;
    cores.push({
      id: `core-${String(index + 1)}`,
      x: round6(OBSTACLES_MIN_X + lane.fx * width),
      y: round6(OBSTACLES_MIN_Y + lane.fy * height),
      taken: false,
    });
  }
  return cores;
}

/** How many cores are still floating. */
export function coresLeft(world: World): number {
  let left = 0;
  for (const core of world.cores) if (!core.taken) left += 1;
  return left;
}

/**
 * Pick up every core the rider is touching. A dodge counts as a pickup, because
 * sliding through a core is exactly as deliberate as driving into it.
 */
export function collectCores(world: World, player: Entity): void {
  const reach = CORES.radius + CORES.pickupReach + BODY_RADIUS;
  const reachSq = reach * reach;
  for (const core of world.cores) {
    if (core.taken) continue;
    const dx = core.x - player.x;
    const dy = core.y - player.y;
    if (dx * dx + dy * dy > reachSq) continue;
    core.taken = true;
    core.x = round6(core.x);
    world.events.push({
      type: "collect",
      id: core.id,
      x: core.x,
      y: core.y,
      total: world.cores.length,
    });
  }
}

// ---------------------------------------------------------------------------
// Water cannon
// ---------------------------------------------------------------------------

/** Spawn one pellet in front of the rider. Returns it, or null when the cannon is hot. */
export function fireWaterCannon(world: World, player: Entity, events: GameEvent[]): Pellet | null {
  if ((player.props.fireCd ?? 0) > 0) return null;
  if (world.pellets.length >= WEAPON.maxPellets) return null;
  player.props.fireCd = WEAPON.fireCooldownMs;
  // The pellet leaves along the facing, with a little of the current velocity so a
  // moving rider leads its own shot instead of firing out of its own wake.
  const dirX = player.facing;
  const dirY = 0;
  const pellet: Pellet = {
    id: `pellet-${String(world.tick)}-${String(world.pellets.length)}`,
    x: round6(player.x + dirX * WEAPON.muzzleOffset),
    y: round6(player.y + dirY * WEAPON.muzzleOffset),
    vx: round6(dirX * WEAPON.pelletSpeed + (player.props.vx ?? 0) * 0.35),
    vy: round6(dirY * WEAPON.pelletSpeed + (player.props.vy ?? 0) * 0.35),
    lifeMs: WEAPON.pelletLifeMs,
  };
  world.pellets.push(pellet);
  events.push({ type: "laser", id: player.id, x: pellet.x, y: pellet.y });
  return pellet;
}

/** Which enemies a pellet may topple. Humans are scenery and are never hit. */
function isStaggerable(entity: Entity): boolean {
  return (STAGGERABLE as readonly string[]).includes(entity.kind);
}

/**
 * Advance every pellet one step: move it, then resolve it against reefs and
 * wardens. A pellet that hits nothing is removed when its life runs out.
 *
 * Pellets move on unscaled dt, like the cannon itself: the rider's own clock
 * running slow inside the Snail's field does not slow the water coming out.
 */
export function stepPellets(world: World, player: Entity, fixedDt: number): void {
  const kept: Pellet[] = [];
  const enemies = world.entities.filter((entity) => entity.kind !== "player");
  for (const pellet of world.pellets) {
    pellet.lifeMs -= fixedDt * 1000;
    if (pellet.lifeMs <= 0) continue;

    const steps = 2;
    let alive = true;
    for (let i = 0; i < steps && alive; i += 1) {
      pellet.x += pellet.vx * (fixedDt / steps);
      pellet.y += pellet.vy * (fixedDt / steps);

      if (insideObstacle(pellet.x, pellet.y, world.obstacles, WEAPON.pelletRadius) !== undefined) {
        world.events.push({ type: "blocked", x: pellet.x, y: pellet.y });
        alive = false;
        break;
      }

      for (const enemy of enemies) {
        if (!isStaggerable(enemy)) continue;
        if ((enemy.props.staggeredMs ?? 0) > 0) continue;
        const dx = enemy.x - pellet.x;
        const dy = enemy.y - pellet.y;
        const reach = WEAPON.pelletRadius + BODY_RADIUS;
        if (dx * dx + dy * dy > reach * reach) continue;
        applyStaggerHit(world, enemy, pellet, player);
        alive = false;
        break;
      }
    }
    if (alive) kept.push(pellet);
  }
  world.pellets = kept;
}

/** One pellet landing on one warden. */
function applyStaggerHit(world: World, enemy: Entity, pellet: Pellet, player: Entity): void {
  const meter = (enemy.props.staggerMeter ?? 0) + WEAPON.pelletStagger;
  enemy.props.staggerMeter = meter;
  const dx = pellet.vx;
  const dy = pellet.vy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 1e-6) {
    enemy.props.pushX = (enemy.props.pushX ?? 0) + (dx / len) * STAGGER.knockback * 0.35;
    enemy.props.pushY = (enemy.props.pushY ?? 0) + (dy / len) * STAGGER.knockback * 0.35;
  }
  if (meter < STAGGER.threshold) return;

  enemy.props.staggerMeter = 0;
  enemy.props.staggeredMs = STAGGER.recoveryMs;
  enemy.props.staggerCd = STAGGER.rehitCooldownMs;
  enemy.props.pushX = (enemy.props.pushX ?? 0) + (dx / (len > 1e-6 ? len : 1)) * STAGGER.knockback;
  enemy.alpha = 0.55;
  world.staggerTally[enemy.kind] = (world.staggerTally[enemy.kind] ?? 0) + 1;
  world.events.push({ type: "stagger", id: enemy.id, kind: enemy.kind, x: enemy.x, y: enemy.y });
  // The rider that landed the shot owns the credit, for the objective book.
  entityCredit(world, player.id, enemy.kind);
}

/** Records which rider scored a topple. Only the player exists, so this is small. */
function entityCredit(world: World, playerId: string, kind: string): void {
  const key = `by-${playerId}-${kind}`;
  world.staggerTally[key] = (world.staggerTally[key] ?? 0) + 1;
}

/**
 * Decay every toppled enemy and return it to the fight. Returns true when a
 * warden has just come back up, so the caller can let it move again.
 */
export function updateStagger(entity: Entity, ctx: { dt: number; fixedDt: number }): boolean {
  const staggered = entity.props.staggeredMs ?? 0;
  if (staggered <= 0) {
    entity.alpha = 1;
    entity.props.staggerMeter = Math.max(0, entity.props.staggerMeter ?? 0);
    return true;
  }
  const left = staggered - ctx.dt * 1000;
  entity.props.staggeredMs = Math.max(0, left);
  entity.props.staggerCd = Math.max(0, (entity.props.staggerCd ?? 0) - ctx.fixedDt * 1000);
  entity.alpha = 0.35 + 0.25 * (left / STAGGER.recoveryMs);
  if (left <= 0) {
    entity.props.staggeredMs = 0;
    entity.alpha = 1;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Objective book
// ---------------------------------------------------------------------------

/** Fresh objective state for a level. */
export function buildObjectives(level: LevelDefinition): ObjectiveState[] {
  return level.objectives.map((objective: LevelObjective) => ({
    id: objective.id,
    kind: objective.kind,
    label: objective.label,
    target: objective.target,
    count: 0,
    done: false,
    targetKind: objective.targetKind,
  }));
}

/** Every objective done? */
export function objectivesComplete(objectives: readonly ObjectiveState[]): boolean {
  return objectives.length > 0 && objectives.every((objective) => objective.done);
}

/**
 * Bring every objective up to date and announce the ones that just closed.
 * Called once per step, after the level's rules have had their turn.
 */
export function updateObjectives(world: World, elapsedSeconds: number): void {
  const coresTaken = world.cores.length - coresLeft(world);
  for (const objective of world.objectives) {
    if (objective.done) continue;
    if (objective.kind === "collect") {
      objective.count = coresTaken;
    } else if (objective.kind === "stagger") {
      objective.count = world.staggerTally[objective.targetKind] ?? 0;
    } else {
      objective.count = Math.round(elapsedSeconds);
    }
    if (objective.count < objective.target) continue;
    objective.count = objective.target;
    objective.done = true;
    world.events.push({ type: "objective", id: objective.id, label: objective.label });
  }
}

/** Compact "2/4" style progress text for the HUD. */
export function objectiveProgress(objective: ObjectiveState): string {
  return `${String(Math.min(objective.count, objective.target))}/${String(objective.target)}`;
}

/** How far through the whole objective book the run is, 0..1. */
export function objectivesProgress(objectives: readonly ObjectiveState[]): number {
  if (objectives.length === 0) return 1;
  let done = 0;
  for (const objective of objectives) {
    if (objective.target <= 0) {
      done += 1;
      continue;
    }
    done += Math.min(1, Math.max(0, objective.count / objective.target));
  }
  return done / objectives.length;
}

/** Dodge cooldown readiness, 0 while cooling down and 1 when ready. */
export function cooldownReady(ms: number): number {
  return clamp(1 - ms / DODGE.cooldownMs, 0, 1);
}
