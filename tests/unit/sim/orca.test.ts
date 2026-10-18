// Orca: chase, telegraph, lunge, recover, and the snail field slow down.

import { describe, expect, it } from "vitest";
import { createWorld, drainEvents, step } from "../../../src/sim/world";
import { MOVEMENT } from "../../../src/sim/game-config";
import { ORCA } from "../../../src/sim/behaviours/orca";
import { dist2 } from "../../../src/sim/behaviours/shared";
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

/** Distance travelled by an entity over `ticks` steps. */
function travel(entity: Entity, ticks: number, state: InputState = NEUTRAL): number {
  const world = entity.props.__world as World;
  const x0 = entity.x;
  const y0 = entity.y;
  run(world, ticks, state);
  return Math.hypot(entity.x - x0, entity.y - y0);
}

function attach(world: World, entity: Entity): Entity {
  // Tests are allowed to reach into props; the sim never reads this key.
  entity.props.__world = world;
  return entity;
}

describe("orca state machine", () => {
  it("leaves idle and pursues the player", () => {
    const world = createWorld(1337);
    const orca = need(world, "orca");
    const player = need(world, "player");
    run(world, Math.round(ORCA.idleMs / 1000) + 2);
    expect(orca.state).toBe("chase");
    expect(orca.anim).toBe("swim");
    const before = dist2(orca.x, orca.y, player.x, player.y);
    run(world, 40);
    expect(dist2(orca.x, orca.y, player.x, player.y)).toBeLessThan(before);
  });

  it("biases the approach by the player velocity so a lateral cut pulls it wide", () => {
    const straight = createWorld(1337);
    const cut = createWorld(1337);
    const a = need(straight, "orca");
    const b = need(cut, "orca");
    // Both worlds place the Orca identically, only the input differs.
    run(straight, 90, input({ moveX: 0 }));
    run(cut, 90, input({ moveX: 1 }));
    const playerA = need(straight, "player");
    const playerB = need(cut, "player");
    // The Orca aims at a predicted point, so it does not simply follow x.
    expect(dist2(b.x, b.y, playerB.x, playerB.y)).toBeGreaterThan(
      dist2(a.x, a.y, playerA.x, playerA.y) - 1e-6,
    );
  });

  it("telegraphs with a fixed wind-up before the lunge", () => {
    const world = createWorld(1337);
    const orca = need(world, "orca");
    const player = need(world, "player");
    orca.x = player.x - ORCA.telegraphRange + 40;
    orca.y = player.y;
    run(world, Math.round(ORCA.idleMs / 1000) + 2);
    expect(orca.state).toBe("telegraph");
    expect(orca.anim).toBe("jump");
    const frozen = { x: orca.x, y: orca.y };
    run(world, 10);
    expect(orca.x).toBeCloseTo(frozen.x, 9);
    expect(orca.y).toBeCloseTo(frozen.y, 9);
    expect(orca.state).toBe("telegraph");
    run(world, Math.round(ORCA.telegraphMs / 1000));
    expect(orca.state).toBe("lunge");
  });

  it("dashes along a committed facing during the lunge, then recovers slower", () => {
    const world = createWorld(1337);
    const orca = need(world, "orca");
    const player = need(world, "player");
    orca.state = "lunge";
    orca.props.timer = ORCA.lungeMs;
    const dir = Math.hypot(player.x - orca.x, player.y - orca.y) || 1;
    orca.props.dirX = (player.x - orca.x) / dir;
    orca.props.dirY = (player.y - orca.y) / dir;
    const before = Math.hypot(player.x - orca.x, player.y - orca.y);
    run(world, 10);
    expect(orca.state).toBe("lunge");
    expect(orca.anim).toBe("jump");
    expect(before - Math.hypot(player.x - orca.x, player.y - orca.y)).toBeGreaterThan(0);
    run(world, Math.round(ORCA.lungeMs / 1000));
    expect(orca.state).toBe("recover");
    expect(orca.anim).toBe("swim");
    run(world, Math.round(ORCA.recoverMs / 1000));
    expect(orca.state).toBe("chase");
  });

  it("damages the player only on lunge contact", () => {
    const world = createWorld(1337);
    const orca = need(world, "orca");
    const player = need(world, "player");
    orca.state = "chase";
    orca.x = player.x + 20;
    orca.y = player.y;
    run(world, 1);
    expect(player.hp).toBe(1);

    orca.state = "telegraph";
    orca.props.timer = 1;
    run(world, 2);
    orca.x = player.x + 20;
    orca.y = player.y;
    drainEvents(world);
    run(world, 1);
    expect(player.hp).toBeLessThan(1);
    expect(drainEvents(world).some((e) => e.type === "hit")).toBe(true);
  });
});

describe("orca inside the snail time field", () => {
  it("covers less ground with the same scaled dt because its speed is per second", () => {
    const outside = createWorld(1337);
    const inside = createWorld(1337);
    const a = attach(outside, need(outside, "orca"));
    const b = attach(inside, need(inside, "orca"));
    const snail = need(inside, "snail");
    b.x = snail.x;
    b.y = snail.y;
    a.x = outside.arena.minX + 10;
    a.y = outside.arena.minY + 10;
    const playerA = need(outside, "player");
    playerA.x = a.x + 400;
    playerA.y = a.y;
    const playerB = need(inside, "player");
    playerB.x = b.x + 400;
    playerB.y = b.y;
    a.state = "chase";
    b.state = "chase";

    const movedOut = travel(a, 10);
    const movedIn = travel(b, 10);
    expect(b.timeScale).toBeCloseTo(inside.arena.timeScaleInside, 9);
    expect(a.timeScale).toBe(1);
    expect(movedIn / movedOut).toBeCloseTo(inside.arena.timeScaleInside, 2);
  });
});