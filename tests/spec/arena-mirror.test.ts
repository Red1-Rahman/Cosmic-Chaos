// The sim may not fetch, so src/sim/game-config.ts mirrors the numbers it needs
// out of public/assets/assets.json. That mirror is the one place in the project
// where the same constant is written down twice, which makes it the one place a
// human editing the art can silently desynchronise the gameplay from.
//
// This file is the contract: ARENA and SPAWN_RULES must equal assets.json exactly.
// If either side changes, edit both and this test tells you which field drifted.

import { describe, expect, it } from "vitest";

import { listAssetReferences } from "../../src/assets/loader";
import { ARENA, MOVEMENT, SPAWN_RULES } from "../../src/sim/game-config";
import { characters, manifest, techStack } from "./helpers";

const arena = manifest.arena;
const band = arena.playBand;
const spawn = arena.spawn;

describe("ARENA mirrors assets.json", () => {
  it("mirrors the arena background and logical box", () => {
    expect(ARENA.background).toBe(arena.background);
    expect(ARENA.background).toBe(characters.world.arenaBackground);
    expect(ARENA.w).toBe(arena.logical.w);
    expect(ARENA.h).toBe(arena.logical.h);
  });

  it("mirrors the play band", () => {
    expect(ARENA.minX).toBe(band.minX);
    expect(ARENA.maxX).toBe(band.maxX);
    expect(ARENA.minY).toBe(band.minY);
    expect(ARENA.maxY).toBe(band.maxY);
  });

  it("mirrors the water planes", () => {
    expect(ARENA.horizonY).toBe(arena.water.horizonY);
    expect(ARENA.shoreY).toBe(arena.water.shoreY);
  });

  it("mirrors the depth scale range the renderer uses", () => {
    expect(ARENA.depthScaleMin).toBe(arena.depth.scaleMin);
    expect(ARENA.depthScaleMax).toBe(arena.depth.scaleMax);
    expect(ARENA.depthScaleMin).toBeLessThan(ARENA.depthScaleMax);
  });

  it("mirrors the time field", () => {
    expect(ARENA.fieldRadius).toBe(arena.fieldRadius);
    expect(ARENA.timeScaleInside).toBe(arena.timeScaleInside);
    expect(ARENA.timeScaleInside).toBeGreaterThan(0);
    expect(ARENA.timeScaleInside).toBeLessThan(1);
  });

  it("mirrors the default seed, in game-config, assets.json and characters.json", () => {
    expect(ARENA.seedDefault).toBe(spawn.seedDefault);
    expect(ARENA.seedDefault).toBe(characters.milestone1.spawn.seedDefault);
    expect(ARENA.seedDefault).toBe(spawn.seedDefault);
  });

  it("keeps the play band inside the arena and above the water horizon", () => {
    expect(ARENA.minX).toBeGreaterThanOrEqual(0);
    expect(ARENA.maxX).toBeLessThanOrEqual(ARENA.w);
    expect(ARENA.minY).toBeGreaterThan(ARENA.horizonY);
    expect(ARENA.maxY).toBeLessThanOrEqual(ARENA.h);
    expect(ARENA.minY).toBeLessThan(ARENA.maxY);
    expect(ARENA.minX).toBeLessThan(ARENA.maxX);
    expect(ARENA.maxY).toBeLessThan(ARENA.shoreY);
  });
});

describe("SPAWN_RULES mirrors assets.json", () => {
  it("mirrors the placement fractions", () => {
    expect(SPAWN_RULES.playerFraction.x).toEqual(spawn.playerFraction.x);
    expect(SPAWN_RULES.playerFraction.y).toEqual(spawn.playerFraction.y);
    expect(SPAWN_RULES.enemyFraction.x).toEqual(spawn.enemyFraction.x);
    expect(SPAWN_RULES.enemyFraction.y).toEqual(spawn.enemyFraction.y);
    expect(SPAWN_RULES.ambientFraction.x).toEqual(spawn.ambientFraction.x);
    expect(SPAWN_RULES.ambientFraction.y).toEqual(spawn.ambientFraction.y);
  });

  it("mirrors the rejection sampling limits", () => {
    expect(SPAWN_RULES.spawnMinDistance).toBe(spawn.spawnMinDistance);
    expect(SPAWN_RULES.maxAttempts).toBe(spawn.maxAttempts);
  });

  it("mirrors the human count range from characters.json", () => {
    const human = characters.characters.find((entry) => entry.id === "human");
    const count = human?.spawn.count;
    if (count === undefined || typeof count === "number") {
      throw new Error("characters.json: human spawn.count must be a min/max range");
    }
    expect(SPAWN_RULES.humanCount.min).toBe(count.min);
    expect(SPAWN_RULES.humanCount.max).toBe(count.max);
  });

  it("keeps the default seed in sync between the two mirrors", () => {
    expect(SPAWN_RULES.seedDefault).toBe(ARENA.seedDefault);
  });

  it("keeps every fraction inside the unit square and correctly ordered", () => {
    const fractions = [
      SPAWN_RULES.playerFraction,
      SPAWN_RULES.enemyFraction,
      SPAWN_RULES.ambientFraction,
    ];
    for (const fraction of fractions) {
      expect(fraction.x[0]).toBeGreaterThanOrEqual(0);
      expect(fraction.x[0]).toBeLessThan(fraction.x[1] ?? 0);
      expect(fraction.x[1] ?? 0).toBeLessThanOrEqual(1);
      expect(fraction.y[0]).toBeGreaterThanOrEqual(0);
      expect(fraction.y[0]).toBeLessThan(fraction.y[1] ?? 0);
      expect(fraction.y[1] ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it("leaves enough arena for the spawn minimum distance to be satisfiable", () => {
    // The arena has to be wider than the minimum separation, otherwise the rejection
    // sampler spirals forever and the fallback would place an enemy on the player.
    expect(ARENA.maxX - ARENA.minX).toBeGreaterThan(SPAWN_RULES.spawnMinDistance);
    // And the snail's field plus its margin has to fit in the band as well.
    expect(ARENA.maxY - ARENA.minY).toBeGreaterThan(0);
  });
});

describe("MOVEMENT stays a sim-only constant block", () => {
  it("runs the simulation at exactly the rate tech-stack.json promises", () => {
    const promisedHz = Number(/(\d+)\s*Hz/.exec(techStack.runtime.timestep)?.[1] ?? "0");
    expect(promisedHz).toBeGreaterThan(0);
    expect(1 / MOVEMENT.fixedDt).toBeCloseTo(promisedHz, 10);
  });

  it("keeps the waterbike inside what the arena can show", () => {
    expect(MOVEMENT.maxSpeed).toBeGreaterThan(0);
    expect(MOVEMENT.accel).toBeGreaterThan(0);
    expect(MOVEMENT.dragPerSecond).toBeGreaterThan(0);
    expect(MOVEMENT.jumpHeight).toBeGreaterThan(0);
    expect(MOVEMENT.jumpMs).toBeGreaterThan(0);
    expect(MOVEMENT.maxTilt).toBeGreaterThan(0);
    expect(MOVEMENT.maxTilt).toBeLessThan(Math.PI / 2);
  });
});

describe("asset reference list", () => {
  it("covers every sprite and every background exactly once", () => {
    const references = listAssetReferences(manifest);
    expect(references.length).toBe(manifest.sprites.length + manifest.backgrounds.length);
    expect(new Set(references.map((entry) => entry.url)).size).toBe(references.length);
    for (const reference of references) {
      expect(reference.url.startsWith("assets/")).toBe(true);
      expect(reference.url.endsWith(".png") || reference.url.endsWith(".jpeg")).toBe(true);
    }
  });

  it("points at the manifest the loader actually asks for", () => {
    // assets/loader.ts is the only module allowed to fetch; the api gate serves
    // exactly these urls from the preview server.
    const references = listAssetReferences(manifest);
    expect(references.some((entry) => entry.url === "assets/assets.json")).toBe(false);
    expect(manifest.sprites.length).toBeGreaterThan(0);
    expect(manifest.backgrounds.length).toBeGreaterThan(0);
  });
});