// Snail: slow drift, constant field radius, and the time scale it imposes.

import { describe, expect, it } from "vitest";
import { createWorld, drainEvents, step } from "../../../src/sim/world";
import { ARENA, MOVEMENT } from "../../../src/sim/game-config";
import { SNAIL } from "../../../src/sim/behaviours/snail";
import type { Entity, InputState, World } from "../../../src/sim/types";

const NEUTRAL: InputState = {
  moveX: 0,
  moveY: 0,
  jump: false,
  action: false,
  dodge: false,
  parry: false,
};

function input(patch: Partial<InputState> = {}): InputState {
  return { ...NEUTRAL, ...patch };
}

function need(world: World, kind: Entity["kind"]): Entity {
  const found = world.entities.find((e) => e.kind === kind);
  if (!found) throw new Error(`no ${kind}`);
  return found;
}

function run(world: World, ticks: number, state: InputState = NEUTRAL): void {
  for (let i = 0; i < ticks; i += 1) step(world, state, MOVEMENT.fixedDt);
}

describe("snail", () => {
  it("drifts slowly with the glide loop and stays in the band", () => {
    const world = createWorld(1337);
    const snail = need(world, "snail");
    const x0 = snail.x;
    run(world, 60);
    expect(snail.anim).toBe("swim");
    expect(snail.state).toBe("glide");
    const travelled = Math.abs(snail.x - x0);
    expect(travelled).toBeGreaterThan(0);
    expect(travelled).toBeLessThan(SNAIL.driftSpeed);
    expect(snail.x).toBeGreaterThanOrEqual(world.arena.minX);
    expect(snail.x).toBeLessThanOrEqual(world.arena.maxX);
  });

  it("keeps a constant field radius and time scale, exposed for the HUD", () => {
    const world = createWorld(1337);
    const snail = need(world, "snail");
    run(world, 120);
    expect(snail.props.fieldRadius).toBe(ARENA.fieldRadius);
    expect(snail.props.fieldTimeScale).toBe(ARENA.timeScaleInside);
    expect(snail.props.fieldX).toBeCloseTo(snail.x, 9);
    expect(snail.props.fieldY).toBeCloseTo(snail.y, 9);
  });

  it("slows entities inside the field without changing the fixed step", () => {
    const world = createWorld(1337);
    const snail = need(world, "snail");
    const player = need(world, "player");
    const outside = need(world, "orca");
    player.x = snail.x;
    player.y = snail.y;
    outside.x = snail.x + ARENA.fieldRadius + 200;
    outside.y = snail.y;
    const outsideAnimMs = outside.animMs;
    drainEvents(world);
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    expect(player.timeScale).toBe(ARENA.timeScaleInside);
    expect(world.fieldTimeScale).toBe(ARENA.timeScaleInside);
    expect(outside.timeScale).toBe(1);
    expect(player.animMs - 0).toBeCloseTo((1000 / 60) * ARENA.timeScaleInside, 6);
    expect(outside.animMs - outsideAnimMs).toBeCloseTo(1000 / 60, 6);
    // The world clock itself never slows.
    expect(world.timeMs).toBeCloseTo(1000 / 60, 6);
  });

  it("changes how fast the player accelerates inside the field", () => {
    const inside = createWorld(1337);
    const outside = createWorld(1337);
    const snail = need(inside, "snail");
    for (const world of [inside, outside]) {
      const p = need(world, "player");
      p.props.vx = 0;
      p.props.vy = 0;
      p.props.speed = 0;
    }
    const pin = need(inside, "player");
    pin.x = snail.x;
    pin.y = snail.y;
    run(inside, 30, input({ moveX: 1 }));
    run(outside, 30, input({ moveX: 1 }));
    expect(need(inside, "player").props.vx ?? 0).toBeLessThan(
      need(outside, "player").props.vx ?? 0,
    );
  });
});
