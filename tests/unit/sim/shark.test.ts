// Shark: repeating circle, pause, dash along a diagonal.

import { describe, expect, it } from "vitest";
import { createWorld, drainEvents, step } from "../../../src/sim/world";
import { MOVEMENT } from "../../../src/sim/game-config";
import { SHARK } from "../../../src/sim/behaviours/shark";
import type { Entity, InputState, World } from "../../../src/sim/types";

const NEUTRAL: InputState = { moveX: 0, moveY: 0, jump: false, action: false };

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

describe("shark dash loop", () => {
  it("cycles circle, pause and dash and uses both animations", () => {
    const world = createWorld(1337);
    const shark = need(world, "shark");
    const seen = new Set<string>();
    for (let i = 0; i < 600; i += 1) {
      step(world, NEUTRAL, MOVEMENT.fixedDt);
      seen.add(shark.state);
    }
    expect(seen.has("circle")).toBe(true);
    expect(seen.has("pause")).toBe(true);
    expect(seen.has("dash")).toBe(true);
  });

  it("swims while patrolling and dashing, and idles in the pause beat", () => {
    const world = createWorld(1337);
    const shark = need(world, "shark");
    shark.state = "circle";
    shark.props.timer = 1000;
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    expect(shark.anim).toBe("swim");
    shark.state = "pause";
    shark.props.timer = 1000;
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    expect(shark.anim).toBe("idle");
    shark.state = "dash";
    shark.props.timer = 1000;
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    expect(shark.anim).toBe("swim");
  });

  it("dashes much faster than it patrols, along a fixed diagonal", () => {
    const world = createWorld(1337);
    const shark = need(world, "shark");
    shark.x = world.arena.minX + 120;
    shark.y = world.arena.minY + 20;
    shark.props.dirX = 1;
    shark.props.dirY = 1;
    shark.state = "circle";
    shark.props.timer = 10000;
    const circleX = shark.x;
    run(world, 10);
    const circleTravel = shark.x - circleX;

    shark.state = "dash";
    shark.props.timer = 10000;
    shark.x = world.arena.minX + 120;
    shark.y = world.arena.minY + 20;
    shark.props.dirX = 1;
    shark.props.dirY = 1;
    const dashX = shark.x;
    run(world, 10);
    const dashTravel = shark.x - dashX;

    expect(dashTravel / circleTravel).toBeCloseTo(SHARK.dashSpeed / SHARK.circleSpeed, 2);
    // Equal x and y velocity keeps it on the diagonal the art is drawn for.
    expect(shark.x - dashX - (shark.y - (world.arena.minY + 20))).toBeCloseTo(0, 6);
  });

  it("turns around instead of leaving the arena", () => {
    const world = createWorld(1337);
    const shark = need(world, "shark");
    shark.x = world.arena.minX + 5;
    shark.y = world.arena.minY + 40;
    shark.props.dirX = -1;
    shark.props.dirY = 1;
    shark.state = "dash";
    shark.props.timer = 10000;
    run(world, 10);
    expect(shark.props.dirX).toBe(1);
    expect(shark.x).toBeGreaterThanOrEqual(world.arena.minX);
    expect(shark.x).toBeLessThanOrEqual(world.arena.maxX);
  });

  it("deals weaker contact damage than the orca, on a cooldown", () => {
    const world = createWorld(1337);
    const shark = need(world, "shark");
    const player = need(world, "player");
    shark.x = player.x + 10;
    shark.y = player.y;
    shark.state = "circle";
    shark.props.timer = 10000;
    drainEvents(world);
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    const afterFirst = player.hp;
    expect(afterFirst).toBeLessThan(1);
    expect(afterFirst).toBeGreaterThan(1 - SHARK.hitPower - 1e-9);
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    expect(player.hp).toBe(afterFirst);
    expect(SHARK.hitPower).toBeLessThan(0.34);
  });
});