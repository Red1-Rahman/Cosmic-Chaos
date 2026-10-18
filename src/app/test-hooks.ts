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
}

export interface CosmicSnapshot {
  readonly tick: number;
  readonly seed: number;
  readonly timeMs: number;
  readonly timeScale: number;
  readonly status: World["status"];
  readonly fieldRadius: number;
  readonly fieldX: number;
  readonly fieldY: number;
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
  });
};

/** Builds a fresh plain snapshot. The world is never handed out. */
export function snapshotWorld(world: World): CosmicSnapshot {
  const snail = world.entities.find((entity) => entity.kind === "snail");
  const fieldRadius = typeof snail?.props.fieldRadius === "number" ? snail.props.fieldRadius : 0;
  const fieldX = typeof snail?.props.fieldX === "number" ? snail.props.fieldX : 0;
  const fieldY = typeof snail?.props.fieldY === "number" ? snail.props.fieldY : 0;
  return Object.freeze({
    tick: world.tick,
    seed: world.seed,
    timeMs: world.timeMs,
    timeScale: world.fieldTimeScale,
    status: world.status,
    fieldRadius,
    fieldX,
    fieldY,
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
