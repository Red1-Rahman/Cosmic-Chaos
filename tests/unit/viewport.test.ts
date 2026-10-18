import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BAR_COLOR,
  computeLayout,
  computeLayoutForPreset,
  pickPreset,
  readViewportConfig,
  snapToDevicePixels,
  applyLayout,
  paintBars,
  type Layout,
  type ViewportPreset,
} from "../../src/render/viewport";
import { createFakeCanvas } from "../helpers/fake-canvas";

const manifest: unknown = JSON.parse(
  readFileSync(new URL("../../public/assets/assets.json", import.meta.url), "utf8"),
);

const config = readViewportConfig(manifest);
const presets = config.presets;

const WINDOWS: readonly { label: string; w: number; h: number }[] = [
  { label: "1920x1080 16:9 desktop", w: 1920, h: 1080 },
  { label: "2560x1440 wide desktop", w: 2560, h: 1440 },
  { label: "1440x900 laptop", w: 1440, h: 900 },
  { label: "1280x1024 5:4 tower", w: 1280, h: 1024 },
  { label: "1024x768 4:3 projector", w: 1024, h: 768 },
  { label: "1366x768 ultra wide laptop", w: 1366, h: 768 },
  { label: "3440x1440 43:9 ultrawide", w: 3440, h: 1440 },
  { label: "1170x2532 phone 19.5:9", w: 1170, h: 2532 },
  { label: "810x1800 phone 9:20", w: 810, h: 1800 },
  { label: "768x1366 tablet portrait", w: 768, h: 1366 },
  { label: "400x400 square", w: 400, h: 400 },
  { label: "1200x100 sliver", w: 1200, h: 100 },
  { label: "100x1200 sliver portrait", w: 100, h: 1200 },
  { label: "320x568 old phone", w: 320, h: 568 },
  { label: "1088x768 sqrt2:1 tablet", w: 1088, h: 768 },
  { label: "768x1086 1:sqrt2 tablet portrait", w: 768, h: 1086 },
  { label: "3840x600 cinema strip", w: 3840, h: 600 },
  { label: "1x1 degenerate", w: 1, h: 1 },
];

const assertLayoutIsSane = (layout: Layout, win: { w: number; h: number }): void => {
  expect(layout.css.w).toBeGreaterThan(0);
  expect(layout.css.h).toBeGreaterThan(0);
  expect(layout.css.w).toBeLessThanOrEqual(win.w + 1e-9);
  expect(layout.css.h).toBeLessThanOrEqual(win.h + 1e-9);
  for (const bar of [layout.bars.top, layout.bars.bottom, layout.bars.left, layout.bars.right]) {
    expect(bar.w).toBeGreaterThanOrEqual(0);
    expect(bar.h).toBeGreaterThanOrEqual(0);
    expect(bar.x).toBeGreaterThanOrEqual(0);
    expect(bar.y).toBeGreaterThanOrEqual(0);
  }
  // Bars and canvas tile the window exactly.
  expect(layout.bars.left.w + layout.css.w + layout.bars.right.w).toBeCloseTo(win.w, 6);
  expect(layout.bars.top.h + layout.css.h + layout.bars.bottom.h).toBeCloseTo(win.h, 6);
  // Contained, never stretched.
  if (layout.css.w >= 8 && layout.css.h >= 8) {
    const cssRatio = layout.css.w / layout.css.h;
    const logicalRatio = layout.preset.logical.w / layout.preset.logical.h;
    expect(Math.abs(cssRatio - logicalRatio) / logicalRatio).toBeLessThan(0.01);
  }
  expect(layout.logical).toEqual(layout.preset.logical);
  expect(layout.barColor).toBe(BAR_COLOR);
  expect(layout.imageRendering).toBe("pixelated");
  expect(layout.scale).toBeCloseTo(layout.css.w / layout.logical.w, 9);
};

describe("readViewportConfig", () => {
  it("reads all eight presets from the manifest", () => {
    expect(presets.map((p) => p.id)).toEqual([
      "16:9",
      "16:10",
      "4:3",
      "20:9",
      "29.5:9",
      "sqrt2:1",
      "1:sqrt2",
      "9:20",
    ]);
    expect(config.integerScalePreferred).toBe(true);
    expect(config.integerScaleMinFill).toBeCloseTo(0.9, 9);
  });

  it("gives the two portrait presets the mobile background", () => {
    const portrait = presets.filter((p) => p.logical.h > p.logical.w);
    expect(portrait.map((p) => p.id)).toEqual(["1:sqrt2", "9:20"]);
    for (const p of portrait) expect(p.background).toBe("canvas-03-mobile");
    for (const p of presets.filter((q) => q.logical.w >= q.logical.h)) {
      expect(p.background).toBe("canvas-03");
    }
  });

  it("rejects malformed input", () => {
    expect(() => readViewportConfig({})).toThrow(/viewport/);
    expect(() => readViewportConfig({ viewport: { presets: [] } })).toThrow(/non-empty/);
  });
});

describe("pickPreset", () => {
  it("picks by nearest ratio in log space", () => {
    const cases: readonly [number, number, string][] = [
      [1920, 1080, "16:9"],
      [1440, 900, "16:10"],
      [1024, 768, "4:3"],
      [1170, 2532, "9:20"],
      [768, 1086, "1:sqrt2"],
      [1088, 768, "sqrt2:1"],
      [3440, 1440, "20:9"],
      [3840, 600, "29.5:9"],
    ];
    for (const [w, h, id] of cases) {
      expect(pickPreset(w, h, presets).id).toBe(id);
    }
  });

  it("measures the gap in log space, so a factor k out scores the same as a factor k in", () => {
    const base: ViewportPreset = {
      id: "mid",
      ratio: 2,
      logical: { w: 200, h: 100 },
      background: "canvas-03",
    };
    const pair: ViewportPreset[] = [
      { ...base, id: "low", ratio: 1 },
      { ...base, id: "high", ratio: 4 },
    ];
    // 2 is the geometric mean of 1 and 4, so both sides of the midpoint pick the far preset.
    expect(pickPreset(2 * 300, 300, pair).id).toBe("low");
    expect(pickPreset(3 * 300, 300, pair).id).toBe("high");
    expect(pickPreset(0.6 * 300, 300, pair).id).toBe("low");
  });

  it("rejects a window with a zero side", () => {
    expect(() => pickPreset(0, 100, presets)).toThrow(/positive/);
    expect(() => pickPreset(100, 100, [])).toThrow(/empty/);
  });
});

describe("computeLayout over every window shape", () => {
  it("never stretches and never overflows", () => {
    for (const win of WINDOWS) {
      for (const dpr of [1, 1.5, 2, 3]) {
        const layout = computeLayout({ w: win.w, h: win.h }, presets, dpr);
        assertLayoutIsSane(layout, win);
        expect(layout.logical.w).toBe(layout.preset.logical.w);
        expect(layout.logical.h).toBe(layout.preset.logical.h);
      }
    }
  });

  it("reaches every preset at least once", () => {
    const seen = new Set(
      WINDOWS.map((win) => computeLayout({ w: win.w, h: win.h }, presets).preset.id),
    );
    expect([...seen].sort()).toEqual([...presets.map((p) => p.id)].sort());
  });

  it("hits each preset exactly on its own aspect ratio", () => {
    for (const preset of presets) {
      const win = { w: preset.logical.w * 3, h: preset.logical.h * 3 };
      expect(pickPreset(win.w, win.h, presets).id).toBe(preset.id);
    }
  });
});

describe("contain fit details", () => {
  it("pillarboxes a window wider than the preset", () => {
    const preset = presets[0];
    if (preset === undefined) throw new Error("no preset");
    const layout = computeLayoutForPreset({ w: 2000, h: 900 }, preset);
    expect(layout.css.h).toBeCloseTo(900, 6);
    expect(layout.bars.left.w).toBeGreaterThan(0);
    expect(layout.bars.left.w).toBeCloseTo(layout.bars.right.w, 9);
    expect(layout.bars.top.h).toBeCloseTo(0, 9);
  });

  it("letterboxes a window taller than the preset", () => {
    const preset = presets[0];
    if (preset === undefined) throw new Error("no preset");
    const layout = computeLayoutForPreset({ w: 1600, h: 1600 }, preset);
    expect(layout.css.w).toBeCloseTo(1600, 6);
    expect(layout.bars.top.h).toBeGreaterThan(0);
    expect(layout.bars.top.h).toBeCloseTo(layout.bars.bottom.h, 9);
    expect(layout.bars.left.w).toBeCloseTo(0, 9);
  });

  it("routes a tall phone window to the 9:20 preset and a short one to 20:9", () => {
    expect(computeLayout({ w: 810, h: 1800 }, presets).preset.id).toBe("9:20");
    expect(computeLayout({ w: 1170, h: 2532 }, presets).preset.id).toBe("9:20");
    expect(computeLayout({ w: 2400, h: 1080 }, presets).preset.id).toBe("20:9");
    expect(computeLayout({ w: 3440, h: 1440 }, presets).preset.id).toBe("20:9");
  });

  it("has no bars when the window matches the preset aspect", () => {
    const preset = presets[0];
    if (preset === undefined) throw new Error("no preset");
    const scale = 0.5;
    const layout = computeLayout(
      { w: preset.logical.w * scale, h: preset.logical.h * scale },
      presets,
    );
    expect(layout.css.w).toBeCloseTo(layout.css.h * (preset.logical.w / preset.logical.h), 6);
    expect(layout.bars.top.h).toBeCloseTo(0, 6);
    expect(layout.bars.left.w).toBeCloseTo(0, 6);
  });

  it("prefers an integer scale when it keeps at least 90 percent of the fit", () => {
    const preset = presets[0];
    if (preset === undefined) throw new Error("no preset");
    // fit scale 1.02 -> floor 1 is 98% of it, so integer wins.
    const good = computeLayoutForPreset({ w: 1436, h: 808 }, preset);
    expect(good.integerScale).toBe(true);
    expect(good.scale).toBe(1);
    // fit scale 1.05 -> floor 1 is only 95%, still accepted at the 0.9 threshold.
    const edge = computeLayoutForPreset({ w: 1478, h: 832 }, preset);
    expect(edge.integerScale).toBe(true);
    // fit scale 1.4 -> floor 1 keeps 71%, too small, so the exact fit is used.
    const bad = computeLayoutForPreset({ w: 1971, h: 1108 }, preset);
    expect(bad.integerScale).toBe(false);
    expect(bad.scale).toBeGreaterThan(1.35);
    expect(bad.css.w).toBeGreaterThan(1900);
  });

  it("never scales down to an integer when the window is tiny", () => {
    const preset = presets[2];
    if (preset === undefined) throw new Error("no preset");
    const layout = computeLayoutForPreset({ w: 120, h: 90 }, preset);
    expect(layout.integerScale).toBe(false);
    expect(layout.scale).toBeCloseTo(0.1171875, 6);
    expect(layout.css.w).toBeCloseTo(120, 6);
    expect(layout.css.h).toBeCloseTo(90, 6);
  });

  it("snaps CSS size to whole device pixels at high dpr", () => {
    expect(snapToDevicePixels(100.4, 2)).toBeCloseTo(100.5, 9);
    expect(snapToDevicePixels(100.4, 1)).toBeCloseTo(100, 9);
    expect(snapToDevicePixels(100.4, 0)).toBeCloseTo(100, 9);
    const preset = presets[0];
    if (preset === undefined) throw new Error("no preset");
    const layout = computeLayoutForPreset({ w: 1367, h: 769 }, preset, { devicePixelRatio: 2 });
    expect(layout.css.w * 2).toBe(Math.round(layout.css.w * 2));
    expect(layout.css.h * 2).toBe(Math.round(layout.css.h * 2));
  });
});

describe("applyLayout", () => {
  it("sets the internal size to the preset logical size and centres the canvas", () => {
    const fake = createFakeCanvas();
    const layout = computeLayout({ w: 1920, h: 1080 }, presets, 2);
    applyLayout(fake.canvas, layout);

    expect(fake.canvas.width).toBe(layout.preset.logical.w);
    expect(fake.canvas.height).toBe(layout.preset.logical.h);
    expect(parseFloat(fake.canvas.style.width)).toBeCloseTo(layout.css.w, 3);
    expect(parseFloat(fake.canvas.style.height)).toBeCloseTo(layout.css.h, 3);
    expect(parseFloat(fake.canvas.style.left)).toBeCloseTo(layout.offset.x, 3);
    expect(parseFloat(fake.canvas.style.top)).toBeCloseTo(layout.offset.y, 3);
    expect(fake.canvas.style.position).toBe("absolute");
    expect(fake.canvas.style.imageRendering).toBe("pixelated");
    expect(fake.ctx.imageSmoothingEnabled).toBe(false);
    expect(fake.ctx.imageSmoothingQuality).toBe("low");
    expect(fake.calls).toEqual([]);
  });

  it("keeps the canvas inside the window for every preset and window", () => {
    for (const win of WINDOWS) {
      const fake = createFakeCanvas();
      const layout = computeLayout({ w: win.w, h: win.h }, presets);
      applyLayout(fake.canvas, layout);
      expect(fake.canvas.width).toBeLessThanOrEqual(1770);
      expect(layout.offset.x * 2 + layout.css.w).toBeCloseTo(win.w, 6);
      expect(layout.offset.y * 2 + layout.css.h).toBeCloseTo(win.h, 6);
    }
  });

  it("paints only the bars it needs, in window coordinates", () => {
    const fake = createFakeCanvas();
    const layout = computeLayout({ w: 1920, h: 1400 }, presets);
    paintBars(fake.ctx, layout);
    const painted = fake.findAll("fillRect");
    expect(painted.length).toBeGreaterThan(0);
    expect(painted.length).toBeLessThanOrEqual(4);
    for (const call of painted) {
      const [x, y, w, h] = call.args as number[];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
    }
    expect(fake.ctx.fillStyle).toBe(BAR_COLOR);
  });

  it("paints no bars when the window matches the preset", () => {
    const fake = createFakeCanvas();
    const preset = presets[0];
    if (preset === undefined) throw new Error("no preset");
    const layout = computeLayoutForPreset(
      { w: preset.logical.w * 0.25, h: preset.logical.h * 0.25 },
      preset,
    );
    paintBars(fake.ctx, layout);
    expect(fake.countOf("fillRect")).toBe(0);
  });
});
