import { describe, expect, it } from "vitest";
import { clamp, createRng, mulberry32 } from "../../src/util/rng";

describe("mulberry32", () => {
  it("returns floats in [0, 1)", () => {
    const next = mulberry32(1337);
    for (let i = 0; i < 500; i += 1) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 50; i += 1) expect(a()).toBe(b());
  });

  it("differs between seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it("has a mean near 0.5", () => {
    const next = mulberry32(7);
    let sum = 0;
    for (let i = 0; i < 20000; i += 1) sum += next();
    expect(sum / 20000).toBeGreaterThan(0.48);
    expect(sum / 20000).toBeLessThan(0.52);
  });
});

describe("createRng", () => {
  it("int stays inside the inclusive range", () => {
    const rng = createRng(1337);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      const value = rng.int(3, 6);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it("int handles a reversed range and a single value", () => {
    const rng = createRng(9);
    expect(rng.int(6, 3)).toBeGreaterThanOrEqual(3);
    expect(rng.int(4, 4)).toBe(4);
  });

  it("range stays inside [min, max)", () => {
    const rng = createRng(5);
    for (let i = 0; i < 300; i += 1) {
      const value = rng.range(-2, 8);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThan(8);
    }
  });

  it("pick returns elements of the list and throws on an empty list", () => {
    const rng = createRng(11);
    const list = ["a", "b", "c"] as const;
    for (let i = 0; i < 100; i += 1) expect(list).toContain(rng.pick(list));
    expect(() => rng.pick([])).toThrow();
  });

  it("fork gives an independent, reproducible stream", () => {
    const parent = createRng(1337);
    const first = parent.fork("particles");
    const second = parent.fork("particles");
    const other = parent.fork("audio");
    const a = [first.next(), first.next(), first.next()];
    const b = [second.next(), second.next(), second.next()];
    expect(a).toEqual(b);
    const c = [other.next(), other.next(), other.next()];
    expect(a).not.toEqual(c);
  });

  it("forks do not consume the parent stream", () => {
    const withFork = createRng(77);
    withFork.fork("noise").next();
    const withoutFork = createRng(77);
    expect(withFork.next()).toBe(withoutFork.next());
  });
});

describe("clamp", () => {
  it("bounds a value", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});
