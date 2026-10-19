import type { Entity, World } from "../sim/types";

/**
 * Read-only snapshot for e2e tests and the debug overlay. Only installed when the URL
 * carries `?test=1`, so a normal player never sees it.
 */
export interface CosmicEntitySnapshot {
  readonly id: string;
  readonly kind: Entity["kind"];
  readonly x: number;
  readonly y: number;
  readonly facing: Entity["facing"];
  readonly hp: number;
  readonly state: string;
  readonly anim: string;
  readonly timeScale: number;
  readonly inTimeField: boolean;
  /** Behaviour counter published as `props.reactions` (the Tarantula's look and jump). */
  readonly reactions: number;
}

export interface CosmicObjectiveSnapshot {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly target: number;
  readonly done: boolean;
}

export interface CosmicSnapshot {
  readonly tick: number;
  readonly seed: number;
  readonly timeMs: number;
  readonly timeScale: number;
  readonly status: World["status"];
  readonly levelId: number;
  readonly fieldRadius: number;
  readonly fieldX: number;
  readonly fieldY: number;
  /** Cores still floating in the water. */
  readonly coresLeft: number;
  /** Live water-cannon pellets. */
  readonly pellets: readonly { readonly x: number; readonly y: number }[];
  readonly objectives: readonly CosmicObjectiveSnapshot[];
  readonly dialogue: { readonly speaker: string; readonly line: string } | null;
  readonly entities: readonly CosmicEntitySnapshot[];
}

interface HookHost {
  __cosmic?: unknown;
}

const freezeEntity = (
  entity: Entity,
  fieldRadius: number,
  fieldX: number,
  fieldY: number,
): CosmicEntitySnapshot => {
  const dx = entity.x - fieldX;
  const dy = entity.y - fieldY;
  const insideField = dx * dx + dy * dy <= fieldRadius * fieldRadius;
  return Object.freeze({
    id: entity.id,
    kind: entity.kind,
    x: entity.x,
    y: entity.y,
    facing: entity.facing,
    hp: entity.hp,
    state: entity.state,
    anim: entity.anim,
    timeScale: entity.timeScale,
    inTimeField: insideField,
    reactions: entity.props["reactions"] ?? 0,
  });
};

/** Builds a fresh plain snapshot. The world is never handed out. */
export function snapshotWorld(world: World): CosmicSnapshot {
  const snail = world.entities.find((entity) => entity.kind === "snail");
  const fieldRadius = typeof snail?.props.fieldRadius === "number" ? snail.props.fieldRadius : 0;
  const fieldX = typeof snail?.props.fieldX === "number" ? snail.props.fieldX : 0;
  const fieldY = typeof snail?.props.fieldY === "number" ? snail.props.fieldY : 0;
  let coresLeft = 0;
  for (const core of world.cores) if (!core.taken) coresLeft += 1;
  return Object.freeze({
    tick: world.tick,
    seed: world.seed,
    timeMs: world.timeMs,
    timeScale: world.fieldTimeScale,
    status: world.status,
    levelId: world.levelId,
    fieldRadius,
    fieldX,
    fieldY,
    coresLeft,
    pellets: Object.freeze(
      world.pellets.map((pellet) => Object.freeze({ x: pellet.x, y: pellet.y })),
    ),
    objectives: Object.freeze(
      world.objectives.map((objective) =>
        Object.freeze({
          id: objective.id,
          label: objective.label,
          count: objective.count,
          target: objective.target,
          done: objective.done,
        }),
      ),
    ),
    dialogue:
      world.dialogue === null
        ? null
        : Object.freeze({ speaker: world.dialogue.speaker, line: world.dialogue.line }),
    entities: Object.freeze(
      world.entities.map((entity) => freezeEntity(entity, fieldRadius, fieldX, fieldY)),
    ),
  });
}

/**
 * Installs `window.__cosmic` as a getter, so a test always reads the live world and can
 * never hold a stale object or mutate game state through it.
 */
export function installTestHooks(target: Window, getWorld: () => World): () => void {
  const host = target as unknown as HookHost;
  const previous = Object.getOwnPropertyDescriptor(host, "__cosmic");
  Object.defineProperty(host, "__cosmic", {
    configurable: true,
    enumerable: true,
    get: () => snapshotWorld(getWorld()),
  });
  return () => {
    if (previous !== undefined) Object.defineProperty(host, "__cosmic", previous);
    else delete host.__cosmic;
  };
}

/** True when the URL asks for the test hooks. */
export function wantsTestHooks(search: string): boolean {
  return new URLSearchParams(search).get("test") === "1";
}
