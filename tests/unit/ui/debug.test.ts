import { describe, expect, it } from "vitest";

import { createDebugOverlay, formatCounts, formatEntityScales } from "../../../src/ui/debug.js";
import type { HudModel } from "../../../src/ui/types.js";
import { asDocument, FakeDocument, type FakeElement } from "./fake-dom.js";

function model(overrides: Partial<HudModel> = {}): HudModel {
  return {
    hp: 1,
    timeScale: 1,
    inTimeField: false,
    seed: 1337,
    tick: 0,
    presetId: "16:9",
    muted: false,
    paused: false,
    status: "playing",
    counts: { orca: 1, human: 5 },
    frame: { x: 0, y: 0, w: 1408, h: 792 },
    ...overrides,
  };
}

function build(overrides: Partial<HudModel> = {}): FakeElement {
  const doc = new FakeDocument();
  const handle = createDebugOverlay(asDocument(doc));
  handle.update(model(overrides));
  return handle.root as unknown as FakeElement;
}

const read = (root: FakeElement, attribute: string): string =>
  root.find(attribute)?.textContent ?? "";

describe("debug overlay", () => {
  it("reads tick, seed, preset and canvas scale", () => {
    const root = build({ tick: 420, seed: 90210, presetId: "9:20", canvasScale: 1.25 });

    expect(read(root, "data-cc-debug-tick")).toBe("420");
    expect(read(root, "data-cc-debug-seed")).toBe("90210");
    expect(read(root, "data-cc-debug-preset")).toBe("9:20");
    expect(read(root, "data-cc-debug-scale")).toBe("1.25x");
    expect(read(root, "data-cc-debug-status")).toBe("playing");
  });

  it("lists per-entity counts and per-entity time scales in a stable order", () => {
    const root = build({
      counts: { human: 5, orca: 1, snail: 1, player: 1 },
      entityTimeScales: { player: 0.35, snail: 1, orca: 0.35 },
    });

    expect(read(root, "data-cc-debug-counts")).toBe("human 5  orca 1  player 1  snail 1");
    expect(read(root, "data-cc-debug-timescales")).toBe("orca 0.35x  player 0.35x  snail 1.00x");
  });

  it("says n/a when the app sends no extras and no NaN leaks into the text", () => {
    const root = build();
    expect(read(root, "data-cc-debug-scale")).toBe("n/a");
    expect(read(root, "data-cc-debug-timescales")).toBe("none");
    expect(root.textDump).not.toContain("NaN");
    expect(root.textDump).not.toContain("undefined");
  });

  it("follows the model as it changes", () => {
    const doc = new FakeDocument();
    const handle = createDebugOverlay(asDocument(doc));
    const root = handle.root as unknown as FakeElement;

    handle.update(model({ tick: 1 }));
    handle.update(model({ tick: 2, inTimeField: true, paused: true }));
    expect(read(root, "data-cc-debug-tick")).toBe("2");
    expect(read(root, "data-cc-debug-status")).toBe("playing / paused / in field");

    handle.update(model({ tick: 2, status: "defeat", paused: true, inTimeField: true }));
    expect(read(root, "data-cc-debug-status")).toBe("defeat / paused / in field");
  });
});

describe("formatters", () => {
  it("formats counts and scales, sorted, with an explicit empty case", () => {
    expect(formatCounts({})).toBe("none");
    expect(formatCounts({ human: 0 })).toBe("human 0");
    expect(formatCounts({ snail: 1.4 })).toBe("snail 1");
    expect(formatEntityScales({})).toBe("none");
    expect(formatEntityScales({ b: 2, a: 0.5 })).toBe("a 0.50x  b 2.00x");
    expect(formatEntityScales({ a: Number.NaN })).toBe("a 1.00x");
  });
});