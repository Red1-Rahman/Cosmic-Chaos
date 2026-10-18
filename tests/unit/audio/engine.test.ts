import { describe, expect, it } from "vitest";
import {
  engineFilterHz,
  engineFrequency,
  engineGain,
  engineSpec,
} from "../../../src/audio/voices/engine";

describe("cosmic engine hum", () => {
  it("rises with throttle", () => {
    const idle = engineFrequency(engineSpec, 0, 1);
    const fast = engineFrequency(engineSpec, 1, 1);
    expect(fast).toBeGreaterThan(idle);
    expect(engineFilterHz(engineSpec, 1)).toBeGreaterThan(engineFilterHz(engineSpec, 0));
    expect(engineGain(engineSpec, 1, 1)).toBeGreaterThan(engineGain(engineSpec, 0, 1));
  });

  it("pitches down inside the Snail's time field", () => {
    const outside = engineFrequency(engineSpec, 0.5, 1);
    const inside = engineFrequency(engineSpec, 0.5, 0.5);
    expect(inside).toBeLessThan(outside);
    expect(engineGain(engineSpec, 0.5, 0.5)).toBeLessThan(engineGain(engineSpec, 0.5, 1));
  });

  it("pitches up, but gently, when time is fast forwarded", () => {
    const normal = engineFrequency(engineSpec, 0.5, 1);
    const fast = engineFrequency(engineSpec, 0.5, 2);
    expect(fast).toBeGreaterThan(normal);
    expect(fast).toBeLessThan(normal * 1.5);
  });

  it("clamps junk input instead of producing NaN", () => {
    for (const bad of [Number.NaN, -3, 12]) {
      const hz = engineFrequency(engineSpec, bad, 1);
      expect(Number.isFinite(hz)).toBe(true);
      expect(engineGain(engineSpec, bad, bad)).toBeGreaterThan(0);
    }
  });

  it("returns stable rounded values so replays hash the same", () => {
    const a = engineFrequency(engineSpec, 0.317, 0.812);
    const b = engineFrequency(engineSpec, 0.317, 0.812);
    expect(a).toBe(b);
    expect(Number.isInteger(a * 1000)).toBe(true);
  });
});
