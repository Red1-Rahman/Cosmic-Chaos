// Tarantula: hovering presence plus exactly one reaction.

import { describe, expect, it } from "vitest";
import { createWorld, drainEvents, step } from "../../../src/sim/world";
import { MOVEMENT } from "../../../src/sim/game-config";
import { TARANTULA } from "../../../src/sim/behaviours/tarantula";
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

describe("tarantula", () => {
  it("hovers above the play band and is the largest figure on screen", () => {
    const world = createWorld(1337);
    const tarantula = need(world, "tarantula");
    run(world, 30);
    expect(tarantula.y).toBeLessThan(world.arena.minY);
    for (const entity of world.entities) {
      expect(tarantula.scale).toBeGreaterThanOrEqual(entity.scale);
    }
    expect(tarantula.scale).toBeGreaterThan(1);
  });

  it("plays idle continuously and never attacks", () => {
    const world = createWorld(1337);
    const tarantula = need(world, "tarantula");
    run(world, 300, input({ moveX: 1 }));
    expect(tarantula.anim).toBe("idle");
    expect(tarantula.state).toBe("idle");
    expect(drainEvents(world).some((e) => e.type === "hit" && e.id === tarantula.id)).toBe(false);
  });

  it("looks at the player and shows the jump once when the player fires", () => {
    const world = createWorld(1337);
    const tarantula = need(world, "tarantula");
    const player = need(world, "player");
    player.x = tarantula.x - 200;
    run(world, 10);
    expect(tarantula.props.reactions ?? 0).toBe(0);

    step(world, input({ action: true }), MOVEMENT.fixedDt);
    expect(tarantula.state).toBe("react");
    expect(tarantula.anim).toBe("jump");
    expect(tarantula.facing).toBe(-1);

    run(world, Math.round((TARANTULA.jumpMs / 1000) * 60) + 2);
    expect(tarantula.anim).toBe("idle");
    run(world, 30);
    expect(tarantula.state).toBe("idle");
  });

  it("never reacts twice, however many shots are fired", () => {
    const world = createWorld(1337);
    const tarantula = need(world, "tarantula");
    run(world, 10);
    step(world, input({ action: true }), MOVEMENT.fixedDt);
    expect(tarantula.props.reactions).toBe(1);
    run(world, 120);
    step(world, input({ action: true }), MOVEMENT.fixedDt);
    step(world, input({ action: true }), MOVEMENT.fixedDt);
    expect(tarantula.props.reactions).toBe(1);
    expect(tarantula.state).toBe("idle");
  });
});
