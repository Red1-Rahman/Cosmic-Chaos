import { describe, expect, it } from "vitest";
import { createRng } from "../../src/util/rng";
import { ARENA, SPAWN_RULES } from "../../src/sim/game-config";
import { createInitialEntities, distance, insideField } from "../../src/sim/spawn";
import type { Entity, EntityKind } from "../../src/sim/types";

function byKind(entities: Entity[], kind: EntityKind): Entity[] {
  return entities.filter((e) => e.kind === kind);
}

function expectEntity(entity: Entity | undefined): Entity {
  if (entity === undefined) throw new Error("expected an entity");
  return entity;
}

const SEEDS = [1337, 1, 2, 99, 4242, 7, 65535, 2026];

describe("createInitialEntities", () => {
  it("spawns one player, one of each character and 3 to 6 humans", () => {
    const entities = createInitialEntities(createRng(1337).fork("sim"));
    const counts = new Map<EntityKind, number>();
    for (const e of entities) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    expect(counts.get("player")).toBe(1);
    expect(counts.get("orca")).toBe(1);
    expect(counts.get("shark")).toBe(1);
    expect(counts.get("tarantula")).toBe(1);
    expect(counts.get("snail")).toBe(1);
    const humans = counts.get("human") ?? 0;
    expect(humans).toBeGreaterThanOrEqual(SPAWN_RULES.humanCount.min);
    expect(humans).toBeLessThanOrEqual(SPAWN_RULES.humanCount.max);
  });

  it("puts the player first and keeps ids unique", () => {
    const entities = createInitialEntities(createRng(1337).fork("sim"));
    expect(entities[0]?.kind).toBe("player");
    expect(entities[0]?.id).toBe("player");
    const ids = entities.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("places everything inside the play band", () => {
    for (const seed of SEEDS) {
      for (const e of createInitialEntities(createRng(seed).fork("sim"))) {
        expect(e.x).toBeGreaterThanOrEqual(ARENA.minX);
        expect(e.x).toBeLessThanOrEqual(ARENA.maxX);
        expect(e.y).toBeGreaterThanOrEqual(ARENA.minY);
        expect(e.y).toBeLessThanOrEqual(ARENA.maxY);
      }
    }
  });

  it("keeps the orca at least 220 px from the player", () => {
    for (const seed of SEEDS) {
      const entities = createInitialEntities(createRng(seed).fork("sim"));
      const player = expectEntity(byKind(entities, "player")[0]);
      const orca = expectEntity(byKind(entities, "orca")[0]);
      expect(distance(player.x, player.y, orca.x, orca.y)).toBeGreaterThanOrEqual(
        SPAWN_RULES.spawnMinDistance,
      );
    }
  });

  it("spawns nothing inside the snail time field", () => {
    for (const seed of SEEDS) {
      const entities = createInitialEntities(createRng(seed).fork("sim"));
      const snail = expectEntity(byKind(entities, "snail")[0]);
      for (const e of entities) {
        if (e.kind === "snail") continue; // the snail owns the field
        expect({ seed, id: e.id, inside: insideField(e, snail, ARENA.fieldRadius) }).toEqual({
          seed,
          id: e.id,
          inside: false,
        });
      }
    }
  });

  it("is identical for the same seed", () => {
    const a = createInitialEntities(createRng(1337).fork("sim"));
    const b = createInitialEntities(createRng(1337).fork("sim"));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("differs across seeds", () => {
    const a = JSON.stringify(createInitialEntities(createRng(1337).fork("sim")));
    const b = JSON.stringify(createInitialEntities(createRng(2026).fork("sim")));
    expect(a).not.toBe(b);
  });

  it("initialises every field the contract promises", () => {
    for (const e of createInitialEntities(createRng(1337).fork("sim"))) {
      expect(e.anim).toBe("idle");
      expect(e.animMs).toBe(0);
      expect(e.alpha).toBe(1);
      expect(e.scale).toBe(1);
      expect(e.timeScale).toBe(1);
      expect(e.hp).toBe(1);
      expect([1, -1]).toContain(e.facing);
      expect(typeof e.state).toBe("string");
      expect(typeof e.props).toBe("object");
    }
  });
});
