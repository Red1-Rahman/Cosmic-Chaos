// Whole-system determinism: 600 scripted steps from seed 1337 must hash the
// same on every run, on every OS.

import { describe, expect, it } from "vitest";
import { createWorld, drainEvents, hashWorld, step } from "../../src/sim/world";
import { MOVEMENT } from "../../src/sim/game-config";
import { ARENA } from "../../src/sim/game-config";
import type { Entity, GameEvent, InputState, World } from "../../src/sim/types";

const NEUTRAL: InputState = { moveX: 0, moveY: 0, jump: false, action: false };

function need(world: World, kind: Entity["kind"]): Entity {
  const found = world.entities.find((e) => e.kind === kind);
  if (!found) throw new Error(`no ${kind}`);
  return found;
}

function input(patch: Partial<InputState> = {}): InputState {
  return { ...NEUTRAL, ...patch };
}

/**
 * Scripted input list: move, dive, hop, fire, drive at the snail field, leave
 * it again, then strafe across it. 600 entries in total.
 */
function script(): InputState[] {
  const list: InputState[] = [];
  const phase = (ticks: number, state: InputState): void => {
    for (let i = 0; i < ticks; i += 1) list.push(state);
  };
  phase(60, input({ moveX: 1 }));
  phase(30, input({ moveY: 1 }));
  phase(24, input({ jump: true }));
  phase(36, input({ moveX: 1, action: true }));
  phase(60, input({ moveX: -1, moveY: 0.5 }));
  phase(90, input({ moveX: -1 }));
  phase(40, input({ moveY: -1, moveX: 0.4 }));
  phase(30, input({ action: true, jump: true }));
  phase(120, input({ moveX: 0.8, moveY: -0.3 }));
  phase(110, input({ moveX: -0.6 }));
  return list;
}

function replay(seed: number, inputs: InputState[]): World {
  const world = createWorld(seed);
  drainEvents(world);
  for (const state of inputs) {
    step(world, state, MOVEMENT.fixedDt);
    // Drain every step so nothing depends on how often the app drains.
    drainEvents(world);
  }
  return world;
}

describe("seeded 600 step replay", () => {
  const inputs = script();

  it("covers every scripted input kind", () => {
    expect(inputs).toHaveLength(600);
    expect(inputs.some((i) => i.jump)).toBe(true);
    expect(inputs.some((i) => i.action)).toBe(true);
    expect(inputs.some((i) => i.moveX !== 0)).toBe(true);
    expect(inputs.some((i) => i.moveY !== 0)).toBe(true);
  });

  it("produces an identical hash on two identical runs", () => {
    const a = replay(1337, inputs);
    const b = replay(1337, inputs);
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(hashWorld(a)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("produces a different hash for a different seed", () => {
    expect(hashWorld(replay(1337, inputs))).not.toBe(hashWorld(replay(2026, inputs)));
  });

  it("produces a different hash for a different input list", () => {
    const tweaked = inputs.slice();
    tweaked[100] = input({ moveX: -1, jump: true });
    expect(hashWorld(replay(1337, inputs))).not.toBe(hashWorld(replay(1337, tweaked)));
  });

  it("exercises the snail field, combat and the whole cast", () => {
    const world = createWorld(1337);
    const snail = world.entities.find((e) => e.kind === "snail");
    const orca = world.entities.find((e) => e.kind === "orca");
    const player = need(world, "player");
    if (!snail || !orca) throw new Error("missing entities");
    // Stand in the open water next to the field so the crossing happens fast.
    player.x = snail.x - world.arena.fieldRadius - 40;
    player.y = snail.y;
    // Park the Orca: this test is about the field and the shark loop, not dying.
    orca.x = world.arena.maxX - 6;
    orca.y = world.arena.minY + 6;

    const events: GameEvent[] = [];
    const sharkStates = new Set<string>();
    for (const state of inputs) {
      orca.state = "idle";
      orca.props.timer = 100000;
      step(world, state, MOVEMENT.fixedDt);
      events.push(...drainEvents(world));
      sharkStates.add(need(world, "shark").state);
    }
    const kinds = new Set(events.map((e) => e.type));
    expect(kinds.has("timeFieldEnter")).toBe(true);
    expect(kinds.has("timeFieldExit")).toBe(true);
    expect(kinds.has("laser")).toBe(true);
    expect(kinds.has("jump")).toBe(true);
    expect(kinds.has("splash")).toBe(true);
    expect(sharkStates.has("dash")).toBe(true);
  });

  it("lets the orca land a lunge and shows the player taking damage", () => {
    const world = createWorld(1337);
    const orca = world.entities.find((e) => e.kind === "orca");
    const player = world.entities[0];
    if (!orca || !player) throw new Error("missing entities");
    orca.x = player.x - 150;
    orca.y = player.y;
    const events: GameEvent[] = [];
    for (let i = 0; i < 600; i += 1) {
      step(world, NEUTRAL, MOVEMENT.fixedDt);
      events.push(...drainEvents(world));
    }
    expect(events.some((e) => e.type === "hit")).toBe(true);
    expect(player.hp).toBeLessThan(1);
  });

  it("keeps every entity inside the arena the whole way through", () => {
    const world = createWorld(1337);
    for (const state of inputs) {
      step(world, state, MOVEMENT.fixedDt);
      for (const entity of world.entities) {
        expect(entity.x).toBeGreaterThanOrEqual(ARENA.minX - 1e-6);
        expect(entity.x).toBeLessThanOrEqual(ARENA.maxX + 1e-6);
        if (entity.kind !== "tarantula") {
          expect(entity.y).toBeGreaterThanOrEqual(ARENA.minY - 1e-6);
          expect(entity.y).toBeLessThanOrEqual(ARENA.maxY + 1e-6);
        }
      }
    }
  });
});