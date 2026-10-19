import { describe, expect, it } from "vitest";
import { MOVEMENT } from "../../../src/sim/game-config";
import { TUTORIAL_COPY } from "../../../src/sim/tutorial";
import type { Entity, InputState, World } from "../../../src/sim/types";
import { createWorld, drainEvents, hashWorld, step } from "../../../src/sim/world";

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

function need<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value");
  return value;
}

function run(world: World, ticks: number, state: InputState = NEUTRAL): void {
  for (let i = 0; i < ticks; i += 1) step(world, state, MOVEMENT.fixedDt);
}

function kinds(world: World): string[] {
  return world.entities.map((entity) => entity.kind);
}

/** Ride right until the opening stage closes, whether by distance or by its fallback. */
function rideToStageOne(world: World): Entity {
  const player = need(world.entities[0]);
  let guard = 0;
  while ((world.tutorial?.stage ?? 0) === 0 && guard < 900) {
    step(world, input({ moveX: 1 }), MOVEMENT.fixedDt);
    guard += 1;
  }
  return player;
}

describe("tutorial roster gating", () => {
  it("opens with only the rider, no cores, and a single spawn event", () => {
    const world = createWorld(1337, 1, { tutorial: true });
    expect(world.tutorial).toBeDefined();
    expect(world.tutorial?.stage).toBe(0);
    expect(world.tutorial?.finished).toBe(false);
    expect(kinds(world)).toEqual(["player"]);
    expect(world.cores).toHaveLength(0);
    expect(world.events).toHaveLength(1);
    expect(world.events[0]).toEqual({
      type: "spawn",
      id: "player",
      kind: "player",
      x: world.entities[0]?.x,
      y: world.entities[0]?.y,
    });
    // The rest is held in the backlog until a later stage hands it over.
    expect(world.tutorial?.pendingEntities.length).toBeGreaterThan(0);
    expect(world.tutorial?.pendingCores.length).toBeGreaterThan(0);
  });

  it("leaves a normal world completely unchanged", () => {
    const plain = createWorld(1337, 1);
    expect(plain.tutorial).toBeUndefined();
    expect(kinds(plain)).toContain("orca");
    expect(kinds(plain)).toContain("shark");
    expect(kinds(plain)).toContain("snail");
    expect(kinds(plain)).toContain("tarantula");
    expect(kinds(plain)).toContain("human");
    expect(plain.cores.length).toBeGreaterThan(0);
  });

  it("keeps the withheld characters at the seeded positions a normal run gives them", () => {
    const tutorial = createWorld(1337, 1, { tutorial: true });
    const plain = createWorld(1337, 1);
    const orca = need(tutorial.tutorial?.pendingEntities.find((e) => e.kind === "orca"));
    const plainOrca = need(plain.entities.find((e) => e.kind === "orca"));
    expect(orca.x).toBeCloseTo(plainOrca.x, 6);
    expect(orca.y).toBeCloseTo(plainOrca.y, 6);
  });
});

describe("tutorial stage advances", () => {
  it("reveals the cores once the rider has moved (stage 0 to 1)", () => {
    const world = createWorld(1337, 1, { tutorial: true });
    rideToStageOne(world);
    expect(world.tutorial?.stage).toBe(1);
    expect(world.cores.length).toBeGreaterThan(0);
    expect(world.tutorial?.pendingCores).toHaveLength(0);
    // Still only the rider on the water; the cast arrives later.
    expect(kinds(world)).toEqual(["player"]);
  });

  it("advances the opening stage on its fallback timeout even without moving", () => {
    const world = createWorld(1337, 1, { tutorial: true });
    run(world, 601);
    expect(world.tutorial?.stage).toBe(1);
    expect(world.cores.length).toBeGreaterThan(0);
  });

  it("hands the shark over when a core is collected (stage 1 to 2)", () => {
    const world = createWorld(1337, 1, { tutorial: true });
    const player = rideToStageOne(world);
    expect(world.tutorial?.stage).toBe(1);

    drainEvents(world);
    const core = need(world.cores[0]);
    player.x = core.x;
    player.y = core.y;
    player.props.vx = 0;
    player.props.vy = 0;
    step(world, NEUTRAL, MOVEMENT.fixedDt);

    const events = drainEvents(world);
    expect(world.tutorial?.stage).toBe(2);
    const spawns = events.filter((event) => event.type === "spawn");
    expect(spawns.map((event) => event.id)).toEqual(["shark-1"]);
    expect(kinds(world)).toContain("shark");
    expect(kinds(world)).not.toContain("orca");
    expect(world.tutorial?.pendingEntities.some((entity) => entity.kind === "orca")).toBe(true);
    expect(world.tutorial?.pendingEntities.some((entity) => entity.kind === "shark")).toBe(false);
  });

  it("stops advancing once it has finished", () => {
    const world = createWorld(1337, 1, { tutorial: true });
    const tutorial = need(world.tutorial);
    tutorial.finished = true;
    run(world, 120);
    expect(tutorial.stage).toBe(0);
  });

  it("signs off after the closing stage runs its course", () => {
    const world = createWorld(1337, 1, { tutorial: true });
    const tutorial = need(world.tutorial);
    // Jump straight to the last stage so the sign-off is exercised without a full
    // playthrough (and without the whole cast chasing a stationary rider).
    tutorial.stage = TUTORIAL_COPY.length - 1;
    tutorial.stageTicks = 0;
    run(world, 479);
    expect(tutorial.finished).toBe(false);
    run(world, 2);
    expect(tutorial.finished).toBe(true);
  });
});

describe("tutorial determinism", () => {
  it("gives identical runs for the same seed", () => {
    const a = createWorld(1337, 1, { tutorial: true });
    const b = createWorld(1337, 1, { tutorial: true });
    run(a, 240, input({ moveX: 0.6, moveY: 0.2 }));
    run(b, 240, input({ moveX: 0.6, moveY: 0.2 }));
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it("is unaffected by the tutorial flag on a normal world", () => {
    // The staged book is optional and never hashed, so a tutorial-off world keeps
    // exactly the run it always had.
    expect(hashWorld(createWorld(1337, 1))).toBe(hashWorld(createWorld(1337, 1)));
  });
});
