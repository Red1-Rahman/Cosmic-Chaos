// Capybara: animations, wake splashes, hit reaction, regen and defeat.

import { describe, expect, it } from "vitest";
import { createWorld, drainEvents, step } from "../../../src/sim/world";
import { MOVEMENT } from "../../../src/sim/game-config";
import { PLAYER } from "../../../src/sim/behaviours/player";
import { ORCA } from "../../../src/sim/behaviours/orca";
import type { Entity, InputState, World } from "../../../src/sim/types";

const NEUTRAL: InputState = { moveX: 0, moveY: 0, jump: false, action: false };

function input(patch: Partial<InputState> = {}): InputState {
  return { ...NEUTRAL, ...patch };
}

function player(world: World): Entity {
  const p = world.entities[0];
  if (!p) throw new Error("no player");
  return p;
}

function run(world: World, ticks: number, state: InputState = NEUTRAL): void {
  for (let i = 0; i < ticks; i += 1) step(world, state, MOVEMENT.fixedDt);
}

describe("capybara animations", () => {
  it("plays idle when parked", () => {
    const world = createWorld(1337);
    run(world, 10);
    expect(player(world).anim).toBe("idle");
  });

  it("plays walk on a horizontal skim and swim when driving into depth", () => {
    const world = createWorld(1337);
    run(world, 30, input({ moveX: 1 }));
    expect(player(world).anim).toBe("walk");
    const deep = createWorld(1337);
    run(deep, 30, input({ moveX: 0.2, moveY: 1 }));
    expect(player(deep).anim).toBe("swim");
  });

  it("plays jump for the whole hop arc and returns to idle after it", () => {
    const world = createWorld(1337);
    step(world, input({ jump: true }), MOVEMENT.fixedDt);
    expect(player(world).anim).toBe("jump");
    run(world, Math.round((MOVEMENT.jumpMs / 1000) * 60) - 2);
    expect(player(world).anim).toBe("jump");
    run(world, 4);
    expect(player(world).anim).not.toBe("jump");
  });
});

describe("capybara wake splashes", () => {
  it("splashes once on landing", () => {
    const world = createWorld(1337);
    drainEvents(world);
    step(world, input({ jump: true }), MOVEMENT.fixedDt);
    drainEvents(world);
    run(world, Math.round((MOVEMENT.jumpMs / 1000) * 60) + 1);
    const splashes = drainEvents(world).filter((e) => e.type === "splash");
    expect(splashes).toHaveLength(1);
    expect(splashes[0]).toMatchObject({ id: "player", power: PLAYER.landSplashPower });
  });

  it("throttles the wake splash so a fast player cannot stack one per step", () => {
    const world = createWorld(1337);
    run(world, 60, input({ moveX: 1 }));
    drainEvents(world);
    run(world, 60, input({ moveX: 1 }));
    const splashes = drainEvents(world).filter((e) => e.type === "splash");
    expect(splashes.length).toBeGreaterThan(0);
    expect(splashes.length).toBeLessThanOrEqual(Math.ceil(1000 / PLAYER.splashCooldownMs));
  });
});

describe("capybara hit response", () => {
  function lungeInto(world: World): void {
    const p = player(world);
    const orca = world.entities.find((e) => e.kind === "orca");
    if (!orca) throw new Error("no orca");
    orca.state = "telegraph";
    orca.props.timer = 1;
    p.x = orca.x + 20;
    p.y = orca.y;
  }

  it("loses hp, emits a hit and knocks the player back", () => {
    const world = createWorld(1337);
    lungeInto(world);
    drainEvents(world);
    const p = player(world);
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    const events = drainEvents(world);
    expect(events.some((e) => e.type === "hit")).toBe(true);
    expect(p.hp).toBeLessThan(1);
    expect(Math.abs(p.props.vx ?? 0) + Math.abs(p.props.vy ?? 0)).toBeGreaterThan(0);
  });

  it("shows the hit through scale and alpha, then relaxes back", () => {
    const world = createWorld(1337);
    lungeInto(world);
    const p = player(world);
    run(world, 2);
    expect(p.scale).toBeGreaterThan(1);
    expect(p.alpha).toBeLessThan(1);
    const cooldown = Math.round((PLAYER.regenDelayMs / 1000) * 60) + 40;
    run(world, cooldown);
    expect(p.scale).toBeCloseTo(1, 6);
    expect(p.alpha).toBeCloseTo(1, 6);
  });

  it("regenerates health slowly, and only after the out-of-combat delay", () => {
    const world = createWorld(1337);
    const p = player(world);
    const orca = world.entities.find((e) => e.kind === "orca");
    if (!orca) throw new Error("no orca");
    orca.x = world.arena.maxX - 4;
    orca.y = world.arena.minY + 4;
    orca.state = "idle";
    orca.props.timer = 100000;

    p.hp = 0.5;
    const before = p.hp;
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    // One step of regen is at most regenPerSecond of a second.
    expect(p.hp - before).toBeLessThanOrEqual(PLAYER.regenPerSecond * MOVEMENT.fixedDt + 1e-9);
    run(world, 240);
    expect(p.hp).toBeGreaterThan(before);
    expect(p.hp).toBeLessThanOrEqual(before + PLAYER.regenPerSecond * 8);

    // A fresh hit restarts the delay, so health does not tick back yet.
    p.hp = 0.5;
    p.props.hurtMs = PLAYER.regenDelayMs;
    const hit = p.hp;
    run(world, Math.ceil((PLAYER.regenDelayMs / 1000) * 60) - 10);
    expect(p.hp).toBe(hit);
  });

  it("goes to defeat at zero hp and emits a defeat event once", () => {
    const world = createWorld(1337);
    const p = player(world);
    const orca = world.entities.find((e) => e.kind === "orca");
    if (!orca) throw new Error("no orca");
    orca.state = "lunge";
    orca.x = 5;
    orca.y = 0;
    orca.props.dirX = 1;
    orca.props.dirY = 0;
    orca.props.timer = ORCA.lungeMs;
    p.x = 0;
    p.y = 0;
    p.hp = 0.01;
    drainEvents(world);
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    expect(p.hp).toBe(0);
    expect(world.status).toBe("defeat");
    expect(p.anim).toBe("defeat");
    expect(drainEvents(world).some((e) => e.type === "defeat")).toBe(true);
    // The world freezes, so nothing else is emitted afterwards.
    run(world, 5);
    expect(drainEvents(world)).toHaveLength(0);
  });
});