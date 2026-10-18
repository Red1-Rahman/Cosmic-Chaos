import { describe, expect, it } from "vitest";

import { createFakeCanvas } from "../../helpers/fake-canvas";
import {
  DEFAULT_TIME_FIELD,
  crystalRadius,
  drawCrystalGlows,
  drawTimeField,
  drawWaterbike,
  jetFlameLength,
  mixColor,
  parseColor,
  pulse,
  readCrystalGlow,
  readTimeField,
  readWaterbike,
  roundRectPath,
  timeFieldRadius,
  withAlpha,
} from "../../../src/render/props";
import { testManifest } from "./fixtures";

const manifest = testManifest();

const prop = (id: string) => manifest.proceduralProps.find((entry) => entry.id === id);

describe("prop readers", () => {
  it("reads the waterbike shape and colors out of the manifest", () => {
    const spec = readWaterbike(prop("waterbike"));
    expect(spec.hull).toEqual({ w: 78, h: 16, radius: 8 });
    expect(spec.hullColor).toBe("#d8d2c4");
    expect(spec.jetColor).toBe("#7fe8ff");
    expect(spec.jetCount).toBe(2);
    expect(spec.jetOffsetX).toEqual([-20, 20]);
    expect(spec.wakeColor).toBe("#bfe9ff");
  });

  it("reads the time field radius and breath out of the manifest", () => {
    const spec = readTimeField(prop("time-field"));
    expect(spec.radius).toBe(132);
    expect(spec.breathHz).toBe(0.35);
    expect(spec.breathAmount).toBe(14);
    expect(spec.ringColor).toBe("#8fb8ff");
  });

  it("falls back to the shipped defaults for an unknown prop", () => {
    expect(readTimeField(undefined)).toEqual(DEFAULT_TIME_FIELD);
    expect(readWaterbike(undefined).hull.w).toBe(78);
    expect(readCrystalGlow(undefined).anchors).toEqual([]);
  });

  it("reads the shore crystal anchors", () => {
    const spec = readCrystalGlow(prop("crystal-glow"));
    expect(spec.anchors).toHaveLength(3);
    expect(spec.radius).toBe(54);
    expect(spec.pulseHz).toBe(0.22);
  });
});

describe("colors", () => {
  it("parses hex, short hex and rgba", () => {
    expect(parseColor("#d8d2c4")).toEqual({ r: 216, g: 210, b: 196, a: 1 });
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("rgba(120, 150, 220, 0.35)")).toEqual({ r: 120, g: 150, b: 220, a: 0.35 });
  });

  it("replaces alpha and mixes two colors", () => {
    expect(withAlpha({ r: 1, g: 2, b: 3, a: 0.5 }, 0.25)).toBe("rgba(1, 2, 3, 0.25)");
    const mixed = mixColor({ r: 0, g: 0, b: 0, a: 0 }, { r: 100, g: 200, b: 0, a: 1 }, 0.5);
    expect(mixed.r).toBeCloseTo(50, 10);
    expect(mixed.g).toBeCloseTo(100, 10);
  });
});

describe("pulse", () => {
  it("runs at the manifest frequency", () => {
    expect(pulse(0, 0.25, false)).toBeCloseTo(0.5, 6);
    expect(pulse(500, 0.5, false)).toBeCloseTo(1, 6);
    expect(pulse(1000, 0.5, false)).toBeCloseTo(0.5, 6);
  });

  it("pins to the midpoint under reduced motion", () => {
    expect(pulse(500, 0.5, true)).toBeCloseTo(0.5, 6);
    expect(pulse(900, 2.4, true)).toBeCloseTo(0.5, 6);
  });
});

describe("time field", () => {
  it("keeps the manifest radius at the start of a breath", () => {
    const spec = readTimeField(prop("time-field"));
    expect(timeFieldRadius(spec, 0)).toBeCloseTo(132, 6);
  });

  it("breathes by breathAmount at a quarter cycle", () => {
    const spec = readTimeField(prop("time-field"));
    const quarter = 1000 / (4 * spec.breathHz);
    expect(timeFieldRadius(spec, quarter)).toBeCloseTo(146, 6);
  });

  it("holds the manifest radius under reduced motion", () => {
    const spec = readTimeField(prop("time-field"));
    const quarter = 1000 / (4 * spec.breathHz);
    expect(timeFieldRadius(spec, quarter, true)).toBeCloseTo(132, 6);
  });

  it("draws a disc and a ring at the breathing radius", () => {
    const fake = createFakeCanvas();
    const spec = readTimeField(prop("time-field"));
    drawTimeField(fake.ctx, spec, 320, 520, 0);
    const arcs = fake.findAll("arc").map((call) => call.args[2]);
    expect(arcs[0]).toBeCloseTo(132, 6);
    // The disc, the ring stroke and three drifting edge arcs.
    expect(fake.countOf("arc")).toBe(5);
    expect(fake.countOf("fill")).toBe(1);
    expect(fake.countOf("stroke")).toBe(4);
  });
});

describe("waterbike", () => {
  const spec = () => readWaterbike(prop("waterbike"));

  it("lengthens the jet flames with speed", () => {
    const slow = jetFlameLength(spec(), {
      x: 0,
      y: 0,
      tilt: 0,
      speed: 0,
      facing: 1,
      scale: 1,
      timeMs: 0,
      reducedMotion: true,
    });
    const fast = jetFlameLength(spec(), {
      x: 0,
      y: 0,
      tilt: 0,
      speed: 1,
      facing: 1,
      scale: 1,
      timeMs: 0,
      reducedMotion: true,
    });
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBeLessThanOrEqual(spec().jetLength);
  });

  it("draws the wake, both jets and three rounded boxes", () => {
    const fake = createFakeCanvas();
    drawWaterbike(fake.ctx, spec(), {
      x: 700,
      y: 600,
      tilt: 0.2,
      speed: 1,
      facing: 1,
      scale: 1,
      timeMs: 0,
      reducedMotion: false,
    });
    expect(fake.find("rotate")?.args).toEqual([0.2]);
    expect(fake.countOf("ellipse")).toBe(1);
    expect(fake.countOf("quadraticCurveTo")).toBeGreaterThanOrEqual(3 * 8);
    const lines = fake.findAll("lineTo").length;
    // Two jet flames at three points each, plus the rounded box corners.
    expect(lines).toBeGreaterThanOrEqual(6);
  });

  it("mirrors the hull with the facing direction", () => {
    const fake = createFakeCanvas();
    drawWaterbike(fake.ctx, spec(), {
      x: 700,
      y: 600,
      tilt: 0,
      speed: 0,
      facing: -1,
      scale: 1,
      timeMs: 0,
      reducedMotion: true,
    });
    const scale = fake.find("scale");
    expect(scale?.args[0]).toBeLessThan(0);
  });

  it("scales every part with the depth multiplier", () => {
    const fake = createFakeCanvas();
    drawWaterbike(fake.ctx, spec(), {
      x: 0,
      y: 0,
      tilt: 0,
      speed: 1,
      facing: 1,
      scale: 0.82,
      timeMs: 0,
      reducedMotion: true,
    });
    expect(fake.find("scale")?.args).toEqual([0.82, 0.82]);
  });
});

describe("crystal glows", () => {
  it("breathes the radius around the manifest radius", () => {
    const spec = readCrystalGlow(prop("crystal-glow"));
    expect(crystalRadius(spec, 0, 0, false)).toBeCloseTo(54 * 1.275, 4);
    expect(crystalRadius(spec, 0, 0, false)).toBeGreaterThanOrEqual(spec.radius * 0.8);
  });

  it("draws one halo gradient per anchor", () => {
    const fake = createFakeCanvas();
    const spec = readCrystalGlow(prop("crystal-glow"));
    drawCrystalGlows(fake.ctx, spec, 0, false);
    expect(fake.countOf("createRadialGradient")).toBe(spec.anchors.length);
    expect(fake.gradients).toHaveLength(spec.anchors.length);
  });
});

describe("roundRectPath", () => {
  it("closes the path and clamps the radius to the box", () => {
    const fake = createFakeCanvas();
    roundRectPath(fake.ctx, 0, 0, 10, 4, 99);
    expect(fake.countOf("closePath")).toBe(1);
    const first = fake.find("moveTo")?.args;
    expect(first?.[0]).toBeCloseTo(5, 6);
    expect(first?.[1]).toBeCloseTo(0, 6);
  });
});