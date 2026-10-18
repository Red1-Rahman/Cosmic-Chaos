// Seeded initial placement. Everything here is pure: same stream, same result.

import type { Rng } from "../util/rng";
import { ARENA, SPAWN_RULES } from "./game-config";
import type { Entity, EntityKind } from "./types";

export interface Placement {
  x: number;
  y: number;
}

type Fraction = { readonly x: readonly [number, number]; readonly y: readonly [number, number] };

/** Map a 0..1 fraction of the play band to a point inside it. */
function pointInFraction(rng: Rng, f: Fraction): Placement {
  return {
    x: ARENA.minX + rng.range(f.x[0], f.x[1]) * (ARENA.maxX - ARENA.minX),
    y: ARENA.minY + rng.range(f.y[0], f.y[1]) * (ARENA.maxY - ARENA.minY),
  };
}

function inBand(p: Placement): boolean {
  return p.x >= ARENA.minX && p.x <= ARENA.maxX && p.y >= ARENA.minY && p.y <= ARENA.maxY;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/** True when the point sits inside the snail's time field, with a small margin. */
export function insideField(p: Placement, field: Placement, radius: number): boolean {
  return distance(p.x, p.y, field.x, field.y) < radius;
}

/**
 * Rejection sampling inside a fraction of the play band. `accept` rejects a
 * candidate; after maxAttempts the last candidate is nudged toward the band
 * centre until it fits, so the function always returns a usable point.
 */
function findSpot(rng: Rng, f: Fraction, accept: (p: Placement) => boolean): Placement {
  for (let attempt = 0; attempt < SPAWN_RULES.maxAttempts; attempt += 1) {
    const candidate = pointInFraction(rng, f);
    if (accept(candidate)) return candidate;
  }
  // Deterministic fallback: spiral out from the band centre in fixed steps.
  const cx = (ARENA.minX + ARENA.maxX) / 2;
  const cy = (ARENA.minY + ARENA.maxY) / 2;
  for (let attempt = 1; attempt <= SPAWN_RULES.maxAttempts * 8; attempt += 1) {
    const angle = attempt * 2.39996;
    const radius = 6 + attempt * 4;
    const candidate = {
      x: Math.min(Math.max(cx + Math.cos(angle) * radius, ARENA.minX), ARENA.maxX),
      y: Math.min(Math.max(cy + Math.sin(angle) * radius * 0.4, ARENA.minY), ARENA.maxY),
    };
    if (inBand(candidate) && accept(candidate)) return candidate;
  }
  return { x: cx, y: cy };
}

function makeEntity(
  id: string,
  kind: EntityKind,
  p: Placement,
  props: Record<string, number> = {},
): Entity {
  return {
    id,
    kind,
    x: Math.round(p.x * 1e6) / 1e6,
    y: Math.round(p.y * 1e6) / 1e6,
    facing: 1,
    anim: "idle",
    animMs: 0,
    scale: 1,
    alpha: 1,
    timeScale: 1,
    hp: 1,
    state: "idle",
    props,
  };
}

/**
 * One player, one snail, one orca, one shark, one tarantula and 3 to 6 humans.
 * Enemies stay at least spawnMinDistance from the player and nothing is placed
 * inside the snail's time field, including the player.
 */
export function createInitialEntities(rng: Rng): Entity[] {
  const playerSpot = findSpot(rng, SPAWN_RULES.playerFraction, inBand);
  const player = makeEntity("player", "player", playerSpot, { vx: 0, vy: 0 });

  // The snail owns the time field, so it goes down before anything that must
  // avoid it. It also keeps its distance from the player, otherwise the player
  // would start inside the field.
  const fieldMargin = ARENA.fieldRadius + 8;
  const snailSpot = findSpot(
    rng,
    SPAWN_RULES.enemyFraction,
    (p) => distance(p.x, p.y, player.x, player.y) >= fieldMargin,
  );
  const snail = makeEntity("snail", "snail", snailSpot);

  const outsideField = (p: Placement): boolean =>
    distance(p.x, p.y, snail.x, snail.y) >= fieldMargin;
  const awayFromPlayer = (p: Placement): boolean =>
    distance(p.x, p.y, player.x, player.y) >= SPAWN_RULES.spawnMinDistance;

  const orca = makeEntity(
    "orca-1",
    "orca",
    findSpot(rng, SPAWN_RULES.enemyFraction, (p) => awayFromPlayer(p) && outsideField(p)),
  );
  const shark = makeEntity(
    "shark-1",
    "shark",
    findSpot(rng, SPAWN_RULES.enemyFraction, (p) => awayFromPlayer(p) && outsideField(p)),
    { dashPhase: 0, dirX: rng.next() < 0.5 ? -1 : 1, dirY: rng.next() < 0.5 ? -1 : 1 },
  );
  const tarantula = makeEntity(
    "tarantula-1",
    "tarantula",
    findSpot(rng, SPAWN_RULES.enemyFraction, (p) => awayFromPlayer(p) && outsideField(p)),
  );

  const humans: Entity[] = [];
  const humanCount = rng.int(SPAWN_RULES.humanCount.min, SPAWN_RULES.humanCount.max);
  for (let i = 0; i < humanCount; i += 1) {
    humans.push(
      makeEntity(
        `human-${String(i + 1)}`,
        "human",
        findSpot(rng, SPAWN_RULES.ambientFraction, outsideField),
        { vx: 0, vy: 0 },
      ),
    );
  }

  return [player, snail, orca, shark, tarantula, ...humans];
}
