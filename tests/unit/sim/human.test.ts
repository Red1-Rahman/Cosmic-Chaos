// Humans: seeded count, slow drift, and a harmless nudge on contact.

import { describe, expect, it } from "vitest";
import { createWorld, drainEvents, step } from "../../../src/sim/world";
import { MOVEMENT, SPAWN_RULES } from "../../../src/sim/game-config";
import { HUMAN } from "../../../src/sim/behaviours/human";
import type { Entity, InputState, World } from "../../../src/sim/types";

const NEUTRAL: InputState = { moveX: 0, moveY: 0, jump: false, action: false };

function input(patch: Partial<InputState> = {}): InputState {
  return { ...NEUTRAL, ...patch };
}

function humans(world: World): Entity[] {
  return world.entities.filter((e) => e.kind === "human");
}

function run(world: World, ticks: number, state: InputState = NEUTRAL): void {
  for (let i = 0; i < ticks; i += 1) step(world, state, MOVEMENT.fixedDt);
}

describe("humans", () => {
  it("spawns a seeded count inside the allowed range", () => {
    for (const seed of [1337, 2026, 7, 99, 40404]) {
      const count = humans(createWorld(seed)).length;
      expect(count).toBeGreaterThanOrEqual(SPAWN_RULES.humanCount.min);
      expect(count).toBeLessThanOrEqual(SPAWN_RULES.humanCount.max);
    }
  });

  it("drifts slowly on the walk and swim loops and stays in the band", () => {
    const world = createWorld(1337);
    const anims = new Set<string>();
    for (const human of humans(world)) {
      const x0 = human.x;
      const y0 = human.y;
      run(world, 60);
      anims.add(human.anim);
      const moved = Math.hypot(human.x - x0, human.y - y0);
      expect(moved).toBeLessThanOrEqual(HUMAN.maxSpeed);
      expect(human.x).toBeGreaterThanOrEqual(world.arena.minX);
      expect(human.x).toBeLessThanOrEqual(world.arena.maxX);
      expect(human.y).toBeGreaterThanOrEqual(world.arena.minY);
      expect(human.y).toBeLessThanOrEqual(world.arena.maxY);
    }
    expect(anims.has("walk") || anims.has("swim")).toBe(true);
  });

  it("nudges and flags when the player bumps one, without taking damage", () => {
    const world = createWorld(1337);
    const human = humans(world)[0];
    const player = world.entities[0];
    if (!human || !player) throw new Error("missing entities");
    human.x = player.x;
    human.y = player.y;
    human.props.pushX = 0;
    human.props.pushY = 0;
    drainEvents(world);
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    expect(human.state).toBe("bumped");
    expect(human.props.bumpedMs).toBeGreaterThan(0);
    expect(Math.abs(human.props.pushX) + Math.abs(human.props.pushY)).toBeGreaterThan(0);
    expect(human.hp).toBe(1);
    // A harmless bump emits no combat event for the pet.
    expect(
      drainEvents(world).filter((e) => e.type === "hit" && e.id === human.id),
    ).toHaveLength(0);
  });

  it("never blocks the player and is never harmed", () => {
    const world = createWorld(1337);
    const player = world.entities[0];
    if (!player) throw new Error("no player");
    for (const human of humans(world)) {
      human.x = player.x;
      human.y = player.y;
    }
    const hpBefore = humans(world).map((h) => h.hp);
    const x0 = player.x;
    run(world, 60, input({ moveX: 1 }));
    expect(player.x).toBeGreaterThan(x0);
    expect(humans(world).map((h) => h.hp)).toEqual(hpBefore);
    expect(drainEvents(world).some((e) => e.type === "defeat")).toBe(false);
  });

  it("keeps bumping on a cooldown rather than every step", () => {
    const world = createWorld(1337);
    const human = humans(world)[0];
    const player = world.entities[0];
    if (!human || !player) throw new Error("missing entities");
    human.x = player.x;
    human.y = player.y;
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    const bumps = human.props.bumps ?? 0;
    human.x = player.x;
    human.y = player.y;
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    expect(human.props.bumps).toBe(bumps);
    for (let i = 0; i < Math.ceil((HUMAN.bumpedMs / 1000) * 60) + 2; i += 1) {
      human.x = player.x;
      human.y = player.y;
      step(world, NEUTRAL, MOVEMENT.fixedDt);
    }
    expect(human.props.bumps).toBe(bumps + 1);
  });
});