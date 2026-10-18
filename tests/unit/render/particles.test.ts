import { describe, expect, it } from "vitest";

import { createFakeCanvas } from "../../helpers/fake-canvas";
import {
  DEFAULT_STARDUST,
  FLASH_STEP_MS,
  MAX_FLASH_HZ,
  createFlashLimiter,
  createParticleSystem,
  flashStep,
  quantizeFlash,
  readStardust,
} from "../../../src/render/particles";
import { testManifest } from "./fixtures";

const manifest = testManifest();
const prop = (id: string) => manifest.proceduralProps.find((entry) => entry.id === id);

/** Signature of every particle position, so two runs can be compared. */
function signature(count: () => number): number[] {
  const values: number[] = [];
  for (let i = 0; i < count(); i += 1) values.push(i);
  return values;
}

describe("readStardust", () => {
  it("reads the shark trail spec out of the manifest", () => {
    const spec = readStardust(prop("stardust"));
    expect(spec.count).toBe(26);
    expect(spec.lifeMs).toBe(520);
    expect(spec.size).toBe(3);
    expect(spec.colors).toEqual(["#b98bff", "#7fe8ff", "#ffffff"]);
  });

  it("falls back to the shipped defaults", () => {
    expect(readStardust(undefined)).toEqual(DEFAULT_STARDUST);
  });
});

describe("flash rate limit", () => {
  it("allows three changes per second at most", () => {
    expect(MAX_FLASH_HZ).toBe(3);
    expect(flashStep(0)).toBe(0);
    expect(flashStep(FLASH_STEP_MS - 1)).toBe(0);
    expect(flashStep(FLASH_STEP_MS)).toBe(1);
    expect(flashStep(1000)).toBe(3);
  });

  it("quantizes a flash into a handful of levels", () => {
    expect(quantizeFlash(0.1)).toBeCloseTo(0, 6);
    expect(quantizeFlash(1)).toBeCloseTo(1, 6);
    expect(quantizeFlash(2)).toBe(1);
    expect(quantizeFlash(-1)).toBe(0);
  });

  it("holds the level for a whole flash step", () => {
    const limiter = createFlashLimiter();
    const first = limiter.push(0.9, 0);
    expect(limiter.push(0.2, 100)).toBe(first);
    expect(limiter.push(0.2, FLASH_STEP_MS - 1)).toBe(first);
    expect(limiter.push(0.2, FLASH_STEP_MS)).not.toBe(first);
  });

  it("cannot change more than three times a second as time moves", () => {
    const limiter = createFlashLimiter();
    let changes = 0;
    let previous = limiter.push(0.9, 0);
    for (let ms = 1; ms <= 1000; ms += 1) {
      const value = limiter.push(0.9, ms);
      if (value !== previous) changes += 1;
      previous = value;
    }
    expect(changes).toBeLessThanOrEqual(MAX_FLASH_HZ);
  });

  it("forgets its level on reset", () => {
    const limiter = createFlashLimiter();
    limiter.push(1, 0);
    limiter.reset();
    expect(limiter.push(0, 0)).toBe(0);
  });
});

describe("createParticleSystem", () => {
  it("emits stardust and ages it out", () => {
    const system = createParticleSystem(1337);
    system.emitStardust(700, 600, 10, 1);
    expect(system.count()).toBe(10);
    system.update(200);
    expect(system.count()).toBe(10);
    system.update(600);
    expect(system.count()).toBe(0);
  });

  it("is reproducible for the same seed and call order", () => {
    const a = createFakeCanvas();
    const b = createFakeCanvas();
    const first = createParticleSystem(4242);
    const second = createParticleSystem(4242);
    first.emitSparks(500, 540, 12, 1);
    second.emitSparks(500, 540, 12, 1);
    first.update(120);
    second.update(120);
    first.draw(a.ctx);
    second.draw(b.ctx);
    expect(signature(first.count)).toEqual(signature(second.count));
    expect(a.findAll("fillRect").map((call) => call.args)).toEqual(
      b.findAll("fillRect").map((call) => call.args),
    );
  });

  it("draws different particles for different seeds", () => {
    const a = createFakeCanvas();
    const b = createFakeCanvas();
    const first = createParticleSystem(1);
    const second = createParticleSystem(2);
    first.emitSparks(500, 540, 12, 1);
    second.emitSparks(500, 540, 12, 1);
    first.draw(a.ctx);
    second.draw(b.ctx);
    expect(a.findAll("fillRect").map((call) => call.args)).not.toEqual(
      b.findAll("fillRect").map((call) => call.args),
    );
  });

  it("emits a splash ring as an expanding stroke", () => {
    const fake = createFakeCanvas();
    const system = createParticleSystem(7);
    system.emitSplashRing(700, 600, 1);
    system.draw(fake.ctx);
    const arc = fake.find("arc");
    const startRadius = arc?.args[2] as number;
    system.update(160);
    fake.reset();
    system.draw(fake.ctx);
    const grown = fake.find("arc")?.args[2] as number;
    expect(grown).toBeGreaterThan(startRadius);
  });

  it("emits a forward laser ping", () => {
    const system = createParticleSystem(7);
    system.emitPing(700, 600, 1, 0);
    expect(system.count()).toBe(3);
  });

  it("spawns nothing at all under reduced motion", () => {
    const system = createParticleSystem(7, { reducedMotion: true });
    system.emitStardust(700, 600, 20, 1);
    system.emitSparks(700, 600, 20, 1);
    system.emitSplashRing(700, 600, 1);
    system.emitPing(700, 600, 1, 0);
    expect(system.count()).toBe(0);
  });

  it("can switch into reduced motion after construction", () => {
    const system = createParticleSystem(7);
    system.emitSparks(700, 600, 20, 1);
    expect(system.count()).toBeGreaterThan(0);
    system.setReducedMotion(true);
    expect(system.reducedMotion()).toBe(true);
    system.clear();
    system.emitSparks(700, 600, 20, 1);
    expect(system.count()).toBe(0);
  });

  it("ignores a non positive or non finite delta", () => {
    const system = createParticleSystem(7);
    system.emitSparks(700, 600, 4, 1);
    system.update(0);
    system.update(-10);
    system.update(Number.NaN);
    expect(system.count()).toBe(4);
  });

  it("never grows past the particle cap", () => {
    const system = createParticleSystem(7, { maxParticles: 10 });
    for (let i = 0; i < 50; i += 1) system.emitStardust(700, 600, 8, 1);
    expect(system.count()).toBe(10);
  });
});