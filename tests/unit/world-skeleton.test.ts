import { describe, expect, it } from "vitest";
import { createWorld, drainEvents, hashWorld, step } from "../../src/sim/world";
import { ARENA, MOVEMENT } from "../../src/sim/game-config";
import type { Entity, InputState, World } from "../../src/sim/types";

const NEUTRAL: InputState = { moveX: 0, moveY: 0, jump: false, action: false };

function input(patch: Partial<InputState> = {}): InputState {
  return { ...NEUTRAL, ...patch };
}

function need(entity: Entity | undefined): Entity {
  if (entity === undefined) throw new Error("expected an entity");
  return entity;
}

function run(world: World, ticks: number, state: InputState = NEUTRAL): void {
  for (let i = 0; i < ticks; i += 1) step(world, state, MOVEMENT.fixedDt);
}

describe("createWorld", () => {
  it("mirrors the arena constants", () => {
    const world = createWorld(1337);
    expect(world.arena.w).toBe(ARENA.w);
    expect(world.arena.h).toBe(ARENA.h);
    expect(world.arena.fieldRadius).toBe(ARENA.fieldRadius);
    expect(world.arena.timeScaleInside).toBe(ARENA.timeScaleInside);
    expect(world.arena.minX).toBe(ARENA.minX);
    expect(world.arena.maxX).toBe(ARENA.maxX);
    expect(world.arena.minY).toBe(ARENA.minY);
    expect(world.arena.maxY).toBe(ARENA.maxY);
  });

  it("starts at tick 0 with the player id and playing status", () => {
    const world = createWorld(1337);
    expect(world.seed).toBe(1337);
    expect(world.tick).toBe(0);
    expect(world.timeMs).toBe(0);
    expect(world.playerId).toBe("player");
    expect(world.status).toBe("playing");
    expect(world.fieldTimeScale).toBe(1);
  });

  it("emits one spawn event per entity", () => {
    const world = createWorld(1337);
    const spawns = world.events.filter((e) => e.type === "spawn");
    expect(spawns).toHaveLength(world.entities.length);
    expect(spawns[0]).toEqual({
      type: "spawn",
      id: "player",
      kind: "player",
      x: world.entities[0]?.x,
      y: world.entities[0]?.y,
    });
    expect(world.events).toHaveLength(world.entities.length);
  });

  it("spawns the same world for the same seed and a different one otherwise", () => {
    expect(hashWorld(createWorld(1337))).toBe(hashWorld(createWorld(1337)));
    expect(hashWorld(createWorld(1337))).not.toBe(hashWorld(createWorld(2026)));
  });

  it("has the player as the first entity", () => {
    expect(createWorld(1337).entities[0]?.id).toBe("player");
  });
});

describe("step", () => {
  it("advances the tick and the clock by the fixed dt", () => {
    const world = createWorld(1337);
    drainEvents(world);
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    expect(world.tick).toBe(1);
    expect(world.timeMs).toBeCloseTo(1000 / 60, 6);
  });

  it("keeps the player inside the play band", () => {
    const world = createWorld(1337);
    const player = need(world.entities[0]);
    for (let i = 0; i < 600; i += 1) {
      step(world, input({ moveX: 1, moveY: 1 }), MOVEMENT.fixedDt);
      expect(player.x).toBeLessThanOrEqual(ARENA.maxX + 1e-9);
      expect(player.y).toBeLessThanOrEqual(ARENA.maxY + 1e-9);
      expect(player.x).toBeGreaterThanOrEqual(ARENA.minX - 1e-9);
      expect(player.y).toBeGreaterThanOrEqual(ARENA.minY - 1e-9);
    }
  });

  it("moves the player and faces the way it travels", () => {
    const world = createWorld(1337);
    const player = need(world.entities[0]);
    const startX = player.x;
    run(world, 60, input({ moveX: 1 }));
    expect(player.x).toBeGreaterThan(startX);
    expect(player.facing).toBe(1);
    run(world, 120, input({ moveX: -1 }));
    expect(player.facing).toBe(-1);
  });

  it("clamps input axes to [-1, 1]", () => {
    const world = createWorld(1337);
    const overshoot = createWorld(1337);
    run(world, 30, input({ moveX: 9, moveY: -9 }));
    run(overshoot, 30, input({ moveX: 1, moveY: -1 }));
    expect(hashWorld(world)).toBe(hashWorld(overshoot));
  });

  it("emits a jump event and uses the jump animation", () => {
    const world = createWorld(1337);
    drainEvents(world);
    step(world, input({ jump: true }), MOVEMENT.fixedDt);
    const events = drainEvents(world);
    expect(events.some((e) => e.type === "jump")).toBe(true);
    expect(world.entities[0]?.anim).toBe("jump");
  });

  it("emits a laser event on the primary action", () => {
    const world = createWorld(1337);
    drainEvents(world);
    step(world, input({ action: true }), MOVEMENT.fixedDt);
    expect(drainEvents(world).some((e) => e.type === "laser")).toBe(true);
  });

  it("advances every animMs and scales it inside the time field", () => {
    const world = createWorld(1337);
    const snail = need(world.entities.find((e) => e.kind === "snail"));
    const player = need(world.entities[0]);
    const outside = need(world.entities.find((e) => e.kind === "orca"));
    player.x = snail.x;
    player.y = snail.y;
    drainEvents(world);
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    expect(player.timeScale).toBeCloseTo(ARENA.timeScaleInside, 9);
    expect(world.fieldTimeScale).toBeCloseTo(ARENA.timeScaleInside, 9);
    expect(outside.animMs).toBeCloseTo((1000 / 60) * outside.timeScale, 6);
    expect(player.animMs).toBeCloseTo((1000 / 60) * ARENA.timeScaleInside, 6);
  });

  it("emits timeFieldEnter and timeFieldExit as the player crosses the field", () => {
    const world = createWorld(1337);
    const snail = need(world.entities.find((e) => e.kind === "snail"));
    const player = need(world.entities[0]);
    player.x = snail.x - ARENA.fieldRadius - 40;
    player.y = snail.y;
    drainEvents(world);
    step(world, input({ moveX: 1 }), MOVEMENT.fixedDt);
    expect(drainEvents(world).some((e) => e.type === "timeFieldEnter")).toBe(true);
    run(world, 300, input({ moveX: 1 }));
    expect(player.timeScale).toBe(1);
  });

  it("is deterministic: same seed and same inputs give the same hash", () => {
    const a = createWorld(1337);
    const b = createWorld(1337);
    run(a, 180, input({ moveX: 0.7, moveY: -0.3 }));
    run(b, 180, input({ moveX: 0.7, moveY: -0.3 }));
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it("freezes once the world is defeated", () => {
    const world = createWorld(1337);
    world.status = "defeat";
    run(world, 10);
    expect(world.tick).toBe(0);
  });
});

describe("drainEvents", () => {
  it("returns events once and empties the queue", () => {
    const world = createWorld(1337);
    const first = drainEvents(world);
    expect(first.length).toBeGreaterThan(0);
    expect(world.events).toHaveLength(0);
    expect(drainEvents(world)).toHaveLength(0);
  });
});

describe("hashWorld", () => {
  it("ignores float noise below 1e-6", () => {
    const world = createWorld(1337);
    const player = need(world.entities[0]);
    const before = hashWorld(world);
    player.x += 1e-9;
    expect(hashWorld(world)).toBe(before);
    player.x += 1e-3;
    expect(hashWorld(world)).not.toBe(before);
  });

  it("changes when any field changes", () => {
    const world = createWorld(1337);
    const before = hashWorld(world);
    world.tick += 1;
    expect(hashWorld(world)).not.toBe(before);
  });

  it("is stable across runs", () => {
    expect(hashWorld(createWorld(1337))).toMatch(/^[0-9a-f]{8}$/);
  });
});
