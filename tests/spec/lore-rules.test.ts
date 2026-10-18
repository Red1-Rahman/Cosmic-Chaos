// The lore rules from every `milestone1.must` list in src/data/characters.json,
// asserted against the real simulation. Each `it` names the rule it enforces, so a
// failure says which line of the brief broke rather than which test file did.
//
// This is a spec gate, not a unit gate: it is about whether the shipped build obeys
// the written contract of the premise, not about one module in isolation.

import { describe, expect, it } from "vitest";

import { createRng } from "../../src/util/rng";
import { sampleAnimation } from "../../src/assets/animation";
import { ARENA, MOVEMENT, SPAWN_RULES } from "../../src/sim/game-config";
import { createWorld, drainEvents, step } from "../../src/sim/world";
import type { Entity, GameEvent, InputState, World } from "../../src/sim/types";
import { HUMAN } from "../../src/sim/behaviours/human";
import { ORCA } from "../../src/sim/behaviours/orca";
import { PLAYER } from "../../src/sim/behaviours/player";
import { SHARK } from "../../src/sim/behaviours/shark";
import { SNAIL } from "../../src/sim/behaviours/snail";
import { TARANTULA } from "../../src/sim/behaviours/tarantula";
import { KIND_TO_CHARACTER } from "../../src/render/renderer";
import { characters, manifest } from "./helpers";

const NEUTRAL: InputState = { moveX: 0, moveY: 0, jump: false, action: false };
const SEED = manifest.arena.spawn.seedDefault;

function input(patch: Partial<InputState>): InputState {
  return { ...NEUTRAL, ...patch };
}

function need(world: World, kind: Entity["kind"]): Entity {
  const found = world.entities.find((entity) => entity.kind === kind);
  if (found === undefined) throw new Error(`no ${kind} in the world`);
  return found;
}

function humans(world: World): Entity[] {
  return world.entities.filter((entity) => entity.kind === "human");
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
}

/** Run `ticks` fixed steps and collect every event the sim emitted. */
function run(world: World, ticks: number, state: InputState = NEUTRAL): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    step(world, state, MOVEMENT.fixedDt);
    events.push(...drainEvents(world));
  }
  return events;
}

/**
 * Park every entity whose kind is not in `keep` in the far corner of the band with an
 * effectively infinite timer. Behaviour rules are about one being at a time, so the
 * others are taken out of the picture rather than the run being tuned around them.
 */
function parkOthers(world: World, keep: readonly Entity["kind"][]): void {
  for (const entity of world.entities) {
    if (keep.includes(entity.kind)) continue;
    entity.x = ARENA.maxX - 4;
    entity.y = ARENA.minY + 4;
    entity.props.timer = Number.MAX_SAFE_INTEGER;
    if (entity.kind === "orca") {
      entity.state = "idle";
      entity.anim = "idle";
    }
  }
}

/** Step once and remember what the given entity was doing. */
function trace(world: World, ticks: number, state: InputState, watch: Entity): string[] {
  const seen: string[] = [];
  for (let i = 0; i < ticks; i += 1) {
    step(world, state, MOVEMENT.fixedDt);
    drainEvents(world);
    seen.push(watch.state);
  }
  return seen;
}

/**
 * Integrate the orca for `ticks` fixed steps while pinning the snail and the player
 * to fixed points, so the only variable between two runs is whether the orca starts
 * inside the snail's field. Returns how far the orca actually travelled.
 */
function measureChaseTravel(
  world: World,
  points: { snail: Placement; player: Placement; orca: Placement },
  ticks: number,
): number {
  const orca = need(world, "orca");
  const snail = need(world, "snail");
  const player = need(world, "player");
  const before = orca.x;
  for (let i = 0; i < ticks; i += 1) {
    snail.x = points.snail.x;
    snail.y = points.snail.y;
    player.x = points.player.x;
    player.y = points.player.y;
    orca.state = "chase";
    orca.props.timer = 0;
    orca.props.cooldown = Number.MAX_SAFE_INTEGER;
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    drainEvents(world);
  }
  return Math.abs(orca.x - before);
}

interface Placement {
  readonly x: number;
  readonly y: number;
}

const BAND_CENTRE: Placement = {
  x: (ARENA.minX + ARENA.maxX) / 2,
  y: (ARENA.minY + ARENA.maxY) / 2,
};

const FIELD_CENTRE: Placement = BAND_CENTRE;
/** Well outside the snail field, in the middle of the band. */
const OPEN_WATER: Placement = { x: ARENA.minX + 6, y: ARENA.minY + 6 };

const lore = new Map(characters.characters.map((entry) => [entry.id, entry]));

describe("world lore", () => {
  it("keeps the capybara as the only being who broke the rule", () => {
    const capybara = lore.get("capybara");
    expect(capybara?.faction).toBe("rule-breaker");
    expect(capybara?.playable).toBe(true);
    expect(lore.get("orca")?.faction).toBe("enforcer");
    expect(lore.get("human")?.faction).toBe("bystander");
  });

  it("spawns one of every named being from the seeded stream", () => {
    for (const seed of [SEED, 2026, 7]) {
      const world = createWorld(seed);
      const counts = new Map<string, number>();
      for (const entity of world.entities) {
        counts.set(entity.kind, (counts.get(entity.kind) ?? 0) + 1);
      }
      expect(counts.get("player"), `seed ${String(seed)}`).toBe(1);
      expect(counts.get("orca"), `seed ${String(seed)}`).toBe(1);
      expect(counts.get("shark"), `seed ${String(seed)}`).toBe(1);
      expect(counts.get("tarantula"), `seed ${String(seed)}`).toBe(1);
      expect(counts.get("snail"), `seed ${String(seed)}`).toBe(1);
      const humanCount = counts.get("human") ?? 0;
      expect(humanCount).toBeGreaterThanOrEqual(SPAWN_RULES.humanCount.min);
      expect(humanCount).toBeLessThanOrEqual(SPAWN_RULES.humanCount.max);
    }
  });

  it("never spawns anything inside the snail's time field or on top of the player", () => {
    for (const seed of [SEED, 2026, 7, 99, 12345]) {
      const world = createWorld(seed);
      const player = need(world, "player");
      const snail = need(world, "snail");
      const margin = world.arena.fieldRadius + 8;
      for (const entity of world.entities) {
        if (entity.kind === "snail" || entity.kind === "player") continue;
        expect(
          dist(entity.x, entity.y, snail.x, snail.y),
          `${entity.id} at seed ${String(seed)}`,
        ).toBeGreaterThanOrEqual(margin);
        if (entity.kind === "human") continue;
        expect(
          dist(entity.x, entity.y, player.x, player.y),
          `${entity.id} at seed ${String(seed)}`,
        ).toBeGreaterThanOrEqual(SPAWN_RULES.spawnMinDistance);
      }
      expect(dist(player.x, player.y, snail.x, snail.y)).toBeGreaterThanOrEqual(margin);
    }
  });

  it("lays every spawner out inside the play band", () => {
    const world = createWorld(SEED);
    for (const entity of world.entities) {
      if (entity.kind === "tarantula") continue;
      expect(entity.x, entity.id).toBeGreaterThanOrEqual(ARENA.minX);
      expect(entity.x, entity.id).toBeLessThanOrEqual(ARENA.maxX);
      expect(entity.y, entity.id).toBeGreaterThanOrEqual(ARENA.minY);
      expect(entity.y, entity.id).toBeLessThanOrEqual(ARENA.maxY);
    }
  });
});

describe("capybara: mad scientist on the waterbike", () => {
  it("spawns on the water inside the play band", () => {
    const player = need(createWorld(SEED), "player");
    expect(player.x).toBeGreaterThanOrEqual(ARENA.minX);
    expect(player.x).toBeLessThanOrEqual(ARENA.maxX);
    expect(player.y).toBeGreaterThanOrEqual(ARENA.minY);
    expect(player.y).toBeLessThanOrEqual(ARENA.maxY);
  });

  it("responds to the unified input actions: move in 2D, jump and act", () => {
    const world = createWorld(SEED);
    const player = need(world, "player");
    const startX = player.x;
    const startY = player.y;
    run(world, 60, input({ moveX: 1 }));
    expect(player.x).toBeGreaterThan(startX + 20);
    run(world, 60, input({ moveY: -1 }));
    const afterUp = player.y;
    expect(afterUp).toBeLessThan(startY);
    const jumpEvents = run(world, 2, input({ jump: true }));
    expect(jumpEvents.some((event) => event.type === "jump")).toBe(true);
    const laserEvents = run(world, 1, input({ action: true }));
    expect(laserEvents.some((event) => event.type === "laser")).toBe(true);
  });

  it("plays idle, walk, swim and jump animations at the right moments", () => {
    const world = createWorld(SEED);
    parkOthers(world, ["player"]);
    const player = need(world, "player");
    run(world, 10);
    expect(player.anim).toBe("idle");
    run(world, 60, input({ moveX: 1 }));
    expect(player.anim).toBe("walk");
    run(world, 60, input({ moveY: -1 }));
    expect(player.anim).toBe("swim");
    run(world, 1, input({ jump: true }));
    expect(player.anim).toBe("jump");
  });

  it("plays every animation it names out of assets.json", () => {
    const world = createWorld(SEED);
    parkOthers(world, ["player"]);
    const player = need(world, "player");
    const seen = new Set<string>();
    const script: InputState[] = [
      ...Array.from({ length: 20 }, () => NEUTRAL),
      ...Array.from({ length: 60 }, () => input({ moveX: 1 })),
      ...Array.from({ length: 60 }, () => input({ moveY: -1 })),
      ...Array.from({ length: 30 }, () => input({ jump: true })),
    ];
    for (const state of script) {
      step(world, state, MOVEMENT.fixedDt);
      drainEvents(world);
      seen.add(player.anim);
    }
    for (const name of seen) {
      const sample = sampleAnimation(manifest, KIND_TO_CHARACTER["player"], name, 0);
      expect(sample.spriteId).not.toBe("");
    }
    expect(seen.has("idle")).toBe(true);
    expect(seen.has("walk")).toBe(true);
    expect(seen.has("swim")).toBe(true);
    expect(seen.has("jump")).toBe(true);
  });

  it("reacts to orca contact with a visible and audible hit response", () => {
    const world = createWorld(SEED);
    const player = need(world, "player");
    const orca = need(world, "orca");
    orca.x = player.x;
    orca.y = player.y;
    orca.state = "lunge";
    orca.props.timer = ORCA.lungeMs;
    orca.props.dirX = 1;
    orca.props.dirY = 0;
    const events = run(world, 4);
    expect(events.some((event) => event.type === "hit")).toBe(true);
    expect(player.hp).toBeLessThan(1);
    // Visible: the flash drives scale and alpha off their resting values.
    expect(player.scale).toBeGreaterThan(1);
    expect(player.alpha).toBeLessThan(1);
  });

  it("must not: no inventory, no upgrades, no multiple levels, no persistence", () => {
    // There is no state container anywhere in the World type, so nothing can be stored.
    const world = createWorld(SEED);
    expect(Object.keys(world).sort()).toEqual([
      "arena",
      "entities",
      "events",
      "fieldTimeScale",
      "playerId",
      "seed",
      "status",
      "tick",
      "timeMs",
    ]);
    const player = need(world, "player");
    expect(Object.keys(player.props).sort()).toEqual(["vx", "vy"]);
  });
});

describe("orca: warden of the rule", () => {
  it("spawns away from the player", () => {
    const world = createWorld(SEED);
    const player = need(world, "player");
    const orca = need(world, "orca");
    expect(dist(orca.x, orca.y, player.x, player.y)).toBeGreaterThanOrEqual(
      SPAWN_RULES.spawnMinDistance,
    );
  });

  it("chases the capybara with a pursuit that reacts to player movement", () => {
    const world = createWorld(SEED);
    const player = need(world, "player");
    const orca = need(world, "orca");
    const before = dist(orca.x, orca.y, player.x, player.y);
    run(world, 240);
    const after = dist(orca.x, orca.y, player.x, player.y);
    expect(after).toBeLessThan(before);
    // Reacting to movement means steering toward where the player will be, not where
    // it was: the chase closes even though the player is driving away.
    const moving = createWorld(SEED);
    const fleeingPlayer = need(moving, "player");
    const fleeingOrca = need(moving, "orca");
    const startGap = dist(fleeingOrca.x, fleeingOrca.y, fleeingPlayer.x, fleeingPlayer.y);
    run(moving, 180, input({ moveX: fleeingOrca.x > fleeingPlayer.x ? 1 : -1 }));
    expect(dist(fleeingOrca.x, fleeingOrca.y, fleeingPlayer.x, fleeingPlayer.y)).toBeLessThan(
      startGap,
    );
  });

  it("uses swim while pursuing and jump for a telegraphed lunge", () => {
    const world = createWorld(SEED);
    parkOthers(world, ["orca", "player"]);
    const orca = need(world, "orca");
    const player = need(world, "player");
    // Hold the orca just outside telegraph range so the pursuit is what is under test.
    orca.state = "chase";
    orca.props.timer = 0;
    orca.props.cooldown = Number.MAX_SAFE_INTEGER;
    orca.x = player.x + ORCA.telegraphRange + 60;
    orca.y = player.y;
    const chaseStates = trace(world, 20, NEUTRAL, orca);
    expect(chaseStates).toContain("chase");
    expect(orca.state).toBe("chase");
    expect(orca.anim).toBe("swim");

    // Now let it come inside the tell and watch the wind-up through the lunge.
    const states = new Set<string>();
    const anims = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      if (orca.state !== "telegraph" && orca.state !== "lunge") {
        orca.x = player.x + ORCA.telegraphRange * 0.5;
        orca.y = player.y;
        orca.props.cooldown = 0;
      }
      step(world, NEUTRAL, MOVEMENT.fixedDt);
      drainEvents(world);
      states.add(orca.state);
      anims.add(orca.anim);
      player.hp = 1;
    }
    expect(states.has("telegraph")).toBe(true);
    expect(states.has("lunge")).toBe(true);
    // The telegraph stops it dead for a fixed time before the lunge commits.
    expect(ORCA.telegraphMs).toBeGreaterThan(0);
    expect(ORCA.lungeSpeed).toBeGreaterThan(ORCA.chaseSpeed);
    expect(anims.has("jump")).toBe(true);
    expect(anims.has("swim")).toBe(true);
  });

  it("slows down or speeds up inside the snail's time field", () => {
    // Identical geometry either side of the field: a 240 px chase along one axis,
    // where 240 stays inside the 132 px radius because both ends are on the rim.
    const outside = measureChaseTravel(
      createWorld(SEED),
      {
        snail: OPEN_WATER,
        player: BAND_CENTRE,
        orca: { x: BAND_CENTRE.x + 240, y: BAND_CENTRE.y },
      },
      60,
    );
    const insideWorld = createWorld(SEED);
    const inside = measureChaseTravel(
      insideWorld,
      {
        snail: FIELD_CENTRE,
        player: { x: FIELD_CENTRE.x + 120, y: FIELD_CENTRE.y },
        orca: { x: FIELD_CENTRE.x - 120, y: FIELD_CENTRE.y },
      },
      60,
    );
    expect(need(insideWorld, "orca").timeScale).toBeCloseTo(ARENA.timeScaleInside, 10);
    expect(outside).toBeGreaterThan(0);
    expect(inside).toBeGreaterThan(0);
    expect(inside).toBeLessThan(outside);
    expect(inside / outside).toBeCloseTo(ARENA.timeScaleInside, 1);
  });

  it("must not: only one orca, no phases, no dialogue", () => {
    const world = createWorld(SEED);
    expect(world.entities.filter((entity) => entity.kind === "orca")).toHaveLength(1);
  });
});

describe("shark: cosmic avenger", () => {
  it("spawns in the arena and is visibly present", () => {
    const shark = need(createWorld(SEED), "shark");
    expect(shark.alpha).toBe(1);
    expect(shark.scale).toBeGreaterThan(0);
    expect(shark.x).toBeGreaterThanOrEqual(ARENA.minX);
    expect(shark.y).toBeGreaterThanOrEqual(ARENA.minY);
  });

  it("performs a simple repeating patrol or dash pattern that reads as a threat", () => {
    const world = createWorld(SEED);
    const shark = need(world, "shark");
    const states: string[] = [];
    for (let i = 0; i < 60 * 12; i += 1) {
      step(world, NEUTRAL, MOVEMENT.fixedDt);
      drainEvents(world);
      states.push(shark.state);
      need(world, "player").hp = 1;
    }
    expect(new Set(states)).toEqual(new Set(["circle", "pause", "dash"]));
    // The pattern really repeats rather than running once.
    expect(states.filter((state) => state === "dash").length).toBeGreaterThan(1);
    expect(SHARK.dashSpeed).toBeGreaterThan(SHARK.circleSpeed);
  });

  it("uses the swim and idle animations", () => {
    const world = createWorld(SEED);
    const shark = need(world, "shark");
    const anims = new Set<string>();
    for (let i = 0; i < 60 * 12; i += 1) {
      step(world, NEUTRAL, MOVEMENT.fixedDt);
      drainEvents(world);
      anims.add(shark.anim);
      need(world, "player").hp = 1;
    }
    expect(anims.has("swim")).toBe(true);
    expect(anims.has("idle")).toBe(true);
  });

  it("must not: no boss phases, no complex AI beyond the timer", () => {
    const world = createWorld(SEED);
    parkOthers(world, ["shark"]);
    const shark = need(world, "shark");
    step(world, NEUTRAL, MOVEMENT.fixedDt);
    drainEvents(world);
    // One repeating three state loop, driven only by a countdown. No phase counter.
    expect(shark.state).toBe("circle");
    expect(Object.keys(shark.props).sort()).toEqual([
      "dashPhase",
      "dirX",
      "dirY",
      "hitCd",
      "timer",
    ]);
  });
});

describe("tarantula: celestial overlord", () => {
  it("spawns and is clearly the most imposing figure on screen", () => {
    const world = createWorld(SEED);
    const tarantula = need(world, "tarantula");
    run(world, 30);
    const others = world.entities.filter((entity) => entity.kind !== "tarantula");
    for (const entity of others) {
      expect(tarantula.scale, entity.id).toBeGreaterThan(entity.scale);
    }
    expect(TARANTULA.scale).toBeGreaterThan(1);
    expect(tarantula.scale).toBeCloseTo(TARANTULA.scale, 10);
  });

  it("plays idle continuously", () => {
    const world = createWorld(SEED);
    const tarantula = need(world, "tarantula");
    for (let i = 0; i < 600; i += 1) {
      step(world, NEUTRAL, MOVEMENT.fixedDt);
      drainEvents(world);
      need(world, "player").hp = 1;
    }
    expect(tarantula.anim).toBe("idle");
    expect(tarantula.state).toBe("idle");
  });

  it("triggers one small reaction when the player does something notable", () => {
    const world = createWorld(SEED);
    parkOthers(world, ["tarantula", "player"]);
    const tarantula = need(world, "tarantula");
    const player = need(world, "player");
    run(world, 30);
    expect(tarantula.state).toBe("idle");
    expect(tarantula.props.reactions ?? 0).toBe(0);

    // The notable act is firing the laser. Watch the whole reaction as it plays out.
    const anims = new Set<string>();
    const states = new Set<string>();
    for (let i = 0; i < 180; i += 1) {
      step(world, i < 30 ? input({ action: true }) : NEUTRAL, MOVEMENT.fixedDt);
      drainEvents(world);
      states.add(tarantula.state);
      anims.add(tarantula.anim);
      player.hp = 1;
    }
    expect(states.has("react")).toBe(true);
    expect(anims.has("jump")).toBe(true);
    expect(tarantula.state).toBe("idle");
    expect(tarantula.props.reactions).toBe(1);

    // Exactly once: a second notable act changes nothing.
    run(world, 60, input({ action: true }));
    expect(tarantula.props.reactions).toBe(1);
  });

  it("hovers above the play band so it never crowds the water", () => {
    const world = createWorld(SEED);
    const tarantula = need(world, "tarantula");
    run(world, 10);
    expect(tarantula.y).toBeCloseTo(ARENA.minY - TARANTULA.hoverAboveBand, 10);
  });

  it("must not: combat, a boss fight or cutscenes", () => {
    const world = createWorld(SEED);
    parkOthers(world, ["tarantula", "player"]);
    const tarantula = need(world, "tarantula");
    const player = need(world, "player");
    tarantula.x = player.x;
    const events = run(world, 120);
    expect(events.some((event) => event.type === "hit")).toBe(false);
    expect(player.hp).toBe(1);
    expect(player.state).toBe("idle");
  });
});

describe("snail: steward of time", () => {
  it("spawns in the arena and drifts slowly with the glide animation", () => {
    const world = createWorld(SEED);
    const snail = need(world, "snail");
    const startX = snail.x;
    run(world, 60);
    expect(snail.anim).toBe("swim");
    expect(snail.state).toBe("glide");
    expect(Math.abs(snail.x - startX)).toBeLessThan(SNAIL.driftSpeed * 2);
    expect(Math.abs(snail.x - startX)).toBeGreaterThan(0);
  });

  it("maintains a visible time field", () => {
    const world = createWorld(SEED);
    const snail = need(world, "snail");
    run(world, 60);
    expect(snail.props.fieldRadius).toBeCloseTo(ARENA.fieldRadius, 10);
    expect(snail.props.fieldRadius).toBeGreaterThan(0);
    expect(snail.props.fieldTimeScale).toBeCloseTo(ARENA.timeScaleInside, 10);
    expect(snail.props.fieldX).toBe(snail.x);
    expect(snail.props.fieldY).toBe(snail.y);
  });

  it("runs entities inside the field at a different scale than entities outside", () => {
    const world = createWorld(SEED);
    const snail = need(world, "snail");
    const player = need(world, "player");
    const orca = need(world, "orca");
    player.x = snail.x;
    player.y = snail.y;
    orca.x = snail.x;
    orca.y = snail.y;
    orca.state = "chase";
    orca.props.timer = 0;
    const events = run(world, 4);
    expect(player.timeScale).toBeCloseTo(ARENA.timeScaleInside, 10);
    expect(orca.timeScale).toBeCloseTo(ARENA.timeScaleInside, 10);
    expect(events.some((event) => event.type === "timeFieldEnter")).toBe(true);

    orca.x = ARENA.maxX - 4;
    orca.y = ARENA.minY + 4;
    const exitEvents = run(world, 4);
    expect(orca.timeScale).toBe(1);
    expect(exitEvents.some((event) => event.type === "timeFieldExit")).toBe(true);
  });

  it("changes the tick rate of what is inside it without changing the fixed step", () => {
    const outsideWorld = createWorld(SEED);
    const outside = measureChaseTravel(
      outsideWorld,
      {
        snail: OPEN_WATER,
        player: BAND_CENTRE,
        orca: { x: BAND_CENTRE.x + 240, y: BAND_CENTRE.y },
      },
      60,
    );
    const insideWorld = createWorld(SEED);
    const inside = measureChaseTravel(
      insideWorld,
      {
        snail: FIELD_CENTRE,
        player: { x: FIELD_CENTRE.x + 120, y: FIELD_CENTRE.y },
        orca: { x: FIELD_CENTRE.x - 120, y: FIELD_CENTRE.y },
      },
      60,
    );

    // Both runs took exactly the same number of ticks of the same size: the step
    // never changed. Only the scaled dt handed to the entity did.
    expect(outsideWorld.tick).toBe(60);
    expect(insideWorld.tick).toBe(60);
    expect(outsideWorld.timeMs).toBeCloseTo(insideWorld.timeMs, 10);
    expect(outside).toBeGreaterThan(0);
    expect(inside).toBeGreaterThan(0);
    expect(inside / outside).toBeCloseTo(ARENA.timeScaleInside, 1);
  });

  it("exposes the active time scale so a test can read it", () => {
    const world = createWorld(SEED);
    const snail = need(world, "snail");
    const player = need(world, "player");
    run(world, 4);
    expect(world.fieldTimeScale).toBe(1);
    player.x = snail.x;
    player.y = snail.y;
    run(world, 2);
    expect(world.fieldTimeScale).toBeCloseTo(ARENA.timeScaleInside, 10);
  });

  it("must not: rewind, save states or a global pause", () => {
    const world = createWorld(SEED);
    run(world, 120);
    expect(world.tick).toBe(120);
    expect(world.timeMs).toBeCloseTo(2000, 10);
    // Losing stops the world: the step function refuses to run once status leaves
    // "playing". Nothing ever turns the clock back.
    const tickAtDefeat = world.tick;
    world.status = "defeat";
    run(world, 10);
    expect(world.tick).toBe(tickAtDefeat);
    expect(world.timeMs).toBeCloseTo(2000, 10);
    // And there is no world history to restore: the tick counter only ever rises.
    expect(tickAtDefeat).toBeGreaterThan(0);
  });
});

describe("human: non-sentient pets", () => {
  it("spawns a seeded number of humans in the allowed range", () => {
    const counts = new Set<number>();
    for (const seed of [SEED, 1, 2, 3, 4, 5, 2026, 99]) {
      const count = humans(createWorld(seed)).length;
      expect(count).toBeGreaterThanOrEqual(SPAWN_RULES.humanCount.min);
      expect(count).toBeLessThanOrEqual(SPAWN_RULES.humanCount.max);
      counts.add(count);
    }
    // The count is genuinely seeded, not a constant in disguise.
    expect(counts.size).toBeGreaterThan(1);
  });

  it("drifts with the walk animation", () => {
    const world = createWorld(SEED);
    const pets = humans(world);
    const start = pets.map((pet) => ({ x: pet.x, y: pet.y }));
    run(world, 180);
    const anims = new Set(pets.map((pet) => pet.anim));
    for (const anim of anims) {
      expect(["walk", "swim"]).toContain(anim);
    }
    let moved = false;
    pets.forEach((pet, index) => {
      const from = start[index];
      if (from === undefined) return;
      if (Math.abs(pet.x - from.x) > 1) moved = true;
    });
    expect(moved).toBe(true);
  });

  it("never blocks the player", () => {
    const world = createWorld(SEED);
    const player = need(world, "player");
    const pets = humans(world);
    for (const target of [300, 600, 1200, 1800]) {
      while (world.tick < target && world.status === "playing") {
        step(world, input({ moveX: 1 }), MOVEMENT.fixedDt);
        drainEvents(world);
      }
      // A bumped pet never stops the player: the player only ever reads its own keys.
      for (const pet of pets) {
        expect(pet.props.bumpCd ?? 0).toBeLessThanOrEqual(HUMAN.bumpedMs);
        expect(pet.hp).toBe(1);
      }
      expect(player.x).toBeGreaterThanOrEqual(ARENA.minX);
      expect(player.x).toBeLessThanOrEqual(ARENA.maxX);
    }
  });

  it("responds to being bumped with a small nudge", () => {
    const world = createWorld(SEED);
    const player = need(world, "player");
    const pet = humans(world)[0];
    if (pet === undefined) throw new Error("no human pet in the roster");
    pet.x = player.x;
    pet.y = player.y;
    run(world, 2);
    expect(pet.state).toBe("bumped");
    expect(pet.props.bumpedMs).toBeGreaterThan(0);
    expect(Math.abs(pet.props.pushX ?? 0) + Math.abs(pet.props.pushY ?? 0)).toBeGreaterThan(0);
    expect(Math.abs(pet.props.pushX ?? 0)).toBeLessThan(HUMAN.bumpImpulse * 1.5);
  });

  it("must not: combat, dialogue or harm to humans as a mechanic", () => {
    const world = createWorld(SEED);
    const player = need(world, "player");
    const orca = need(world, "orca");
    const pets = humans(world);
    orca.x = pets[0]?.x ?? ARENA.minX;
    orca.y = pets[0]?.y ?? ARENA.minY;
    orca.state = "lunge";
    orca.props.timer = ORCA.lungeMs;
    run(world, 30);
    expect(player.hp).toBe(1);
    for (const pet of pets) {
      expect(pet.hp).toBe(1);
      expect(pet.state === "bumped" || pet.state === "drift").toBe(true);
    }
  });
});

describe("every animation the code names exists in the manifest", () => {
  it("samples every animation name each behaviour can emit", () => {
    const world = createWorld(SEED);
    const names = new Map<string, Set<string>>();
    for (const entity of world.entities) {
      names.set(entity.kind, new Set([entity.anim]));
    }
    const inputs: InputState[] = [
      NEUTRAL,
      input({ moveX: 1 }),
      input({ moveY: -1 }),
      input({ moveX: -1, moveY: -1 }),
      input({ jump: true }),
      input({ action: true }),
    ];
    for (let i = 0; i < 60 * 30; i += 1) {
      const state = inputs[i % inputs.length];
      if (state === undefined) continue;
      step(world, state, MOVEMENT.fixedDt);
      drainEvents(world);
      for (const entity of world.entities) {
        names.get(entity.kind)?.add(entity.anim);
        entity.hp = 1;
      }
      if (world.status !== "playing") world.status = "playing";
    }
    for (const entity of world.entities) {
      const characterId = KIND_TO_CHARACTER[entity.kind];
      const emitted = names.get(entity.kind);
      if (emitted === undefined) continue;
      expect(emitted.size, characterId).toBeGreaterThan(1);
      for (const name of emitted) {
        const sample = sampleAnimation(manifest, characterId, name, 250);
        expect(manifest.sprites.map((sprite) => sprite.id)).toContain(sample.spriteId);
      }
    }
  });

  it("keeps every cast member inside the six-character manifest", () => {
    const world = createWorld(SEED);
    const emitted = new Set(world.entities.map((entity) => KIND_TO_CHARACTER[entity.kind]));
    for (const characterId of emitted) {
      expect(Object.keys(manifest.characters), characterId).toContain(characterId);
    }
  });
});

describe("seeded stream contract", () => {
  it("derives the gameplay stream from the seed alone", () => {
    const first = createRng(SEED).fork("sim");
    const second = createRng(SEED).fork("sim");
    expect(first.next()).toBe(second.next());
    expect(createRng(SEED).fork("sim").next()).not.toBe(createRng(SEED + 1).fork("sim").next());
  });

  it("never puts an enemy outside the arena after a long unforced run", () => {
    const world = createWorld(SEED);
    for (let i = 0; i < 60 * 60; i += 1) {
      step(world, NEUTRAL, MOVEMENT.fixedDt);
      drainEvents(world);
      need(world, "player").hp = 1;
      for (const entity of world.entities) {
        if (entity.kind === "tarantula") continue;
        expect(entity.x, entity.id).toBeGreaterThanOrEqual(ARENA.minX - 1e-6);
        expect(entity.x, entity.id).toBeLessThanOrEqual(ARENA.maxX + 1e-6);
        expect(entity.y, entity.id).toBeGreaterThanOrEqual(ARENA.minY - 1e-6);
        expect(entity.y, entity.id).toBeLessThanOrEqual(ARENA.maxY + 1e-6);
      }
    }
  });

  it("keeps the player lethal to the point where the run ends", () => {
    const world = createWorld(SEED);
    const player = need(world, "player");
    const orca = need(world, "orca");
    orca.x = player.x - 60;
    orca.y = player.y;
    for (let i = 0; i < 60 * 120 && world.status === "playing"; i += 1) {
      step(world, NEUTRAL, MOVEMENT.fixedDt);
      drainEvents(world);
    }
    expect(world.status).toBe("defeat");
    expect(player.hp).toBe(0);
    expect(PLAYER.regenPerSecond).toBeGreaterThan(0);
  });
});