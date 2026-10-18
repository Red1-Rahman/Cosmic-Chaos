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
function travel(world: World, entity: Entity, ticks: number, state: InputState = NEUTRAL): number {
  const x0 = entity.x;
  const y0 = entity.y;
  run(world, ticks, state);
  return Math.hypot(entity.x - x0, entity.y - y0);
}

/** Milliseconds to whole fixed steps, rounded up so a timer always expires. */
function ticks(ms: number): number {
  return Math.ceil((ms / 1000) * 60);
}

/** Put an Orca in a clean chasing setup with the player a fixed distance away. */
function setupChase(world: World, gap: number): { orca: Entity; player: Entity } {
  const orca = need(world, "orca");
  const player = need(world, "player");
  orca.state = "chase";
  orca.anim = "swim";
  orca.props.cooldown = 0;
  orca.x = world.arena.minX + 20;
  orca.y = world.arena.minY + 20;
  orca.props.dirX = 1;
  orca.props.dirY = 0;
  player.x = orca.x + gap;
  player.y = orca.y;
  player.props.vx = 0;
  player.props.vy = 0;
  return { orca, player };
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
    const still = createWorld(1337);
    const cutting = createWorld(1337);
    for (const world of [still, cutting]) {
      const orca = need(world, "orca");
      const player = need(world, "player");
      orca.state = "chase";
      orca.props.cooldown = 0;
      // Diagonal approach, so a lead along x visibly changes the heading.
      orca.x = player.x + 200;
      orca.y = player.y - 120;
      player.props.vx = 0;
      player.props.vy = 0;
    }
    run(still, 12, input({ moveX: 0 }));
    run(cutting, 12, input({ moveX: 1 }));
    const a = need(still, "orca");
    const b = need(cutting, "orca");
    const headingA = Math.abs(a.y - (need(still, "player").y - 120)) / Math.abs(a.x);
    const headingB = Math.abs(b.y - (need(cutting, "player").y - 120)) / Math.abs(b.x);
    // The lead pulled the cutting Orca onto a flatter, wider line.
    expect(headingB).toBeLessThan(headingA);
  });

  it("telegraphs with a fixed wind-up before the lunge", () => {
    const world = createWorld(1337);
    const orca = need(world, "orca");
    const player = need(world, "player");
    orca.x = player.x - ORCA.telegraphRange + 40;
    orca.y = player.y;
    run(world, 1);
    expect(orca.state).toBe("chase");
    run(world, 1);
    expect(orca.state).toBe("telegraph");
    expect(orca.anim).toBe("jump");
    const frozen = { x: orca.x, y: orca.y };
    run(world, 10);
    expect(orca.x).toBeCloseTo(frozen.x, 9);
    expect(orca.y).toBeCloseTo(frozen.y, 9);
    expect(orca.state).toBe("telegraph");
    run(world, ticks(ORCA.telegraphMs) + 1);
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
    run(world, ticks(ORCA.lungeMs) + 1);
    expect(orca.state).toBe("recover");
    expect(orca.anim).toBe("swim");
    run(world, ticks(ORCA.recoverMs) + 1);
    expect(orca.state).toBe("chase");
  });

  it("damages the player only on lunge contact", () => {
    const world = createWorld(1337);
    const orca = need(world, "orca");
    const player = need(world, "player");
    orca.state = "chase";
    orca.props.cooldown = 0;
    orca.x = player.x + 400;
    orca.y = player.y;
    run(world, 1);
    // Close the gap only after the chase has had a chance to telegraph.
    orca.state = "chase";
    orca.props.cooldown = 0;
    orca.x = player.x + 20;
    orca.y = player.y;
    run(world, 1);
    expect(player.hp).toBe(1);

    orca.state = "telegraph";
    orca.props.timer = 1;
    orca.x = player.x + 20;
    orca.y = player.y;
    drainEvents(world);
    run(world, 2);
    expect(player.hp).toBeLessThan(1);
    expect(drainEvents(world).some((e) => e.type === "hit")).toBe(true);
  });
});

describe("orca inside the snail time field", () => {
  it("covers less ground with the same scaled dt because its speed is per second", () => {
    const outside = createWorld(1337);
    const inside = createWorld(1337);
    const a = setupChase(outside, 500).orca;
    const b = setupChase(inside, 500).orca;
    // Park the snail in the middle of the band so the field has room both ways.
    const snail = need(inside, "snail");
    snail.x = (inside.arena.minX + inside.arena.maxX) / 2;
    snail.y = (inside.arena.minY + inside.arena.maxY) / 2;
    b.x = snail.x;
    b.y = snail.y;
    const playerB = need(inside, "player");
    playerB.x = b.x + 500;
    playerB.y = b.y;

    const movedOut = travel(outside, a, 10);
    const movedIn = travel(inside, b, 10);
    expect(b.timeScale).toBeCloseTo(inside.arena.timeScaleInside, 9);
    expect(a.timeScale).toBe(1);
    expect(movedIn / movedOut).toBeCloseTo(inside.arena.timeScaleInside, 2);
  });
});
