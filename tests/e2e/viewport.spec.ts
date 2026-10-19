// The viewport handler, in a real browser, at every preset assets.json declares.
//
// AGENTS.md milestone 1 requires letterboxing or pillarboxing for 16:9, 16:10, 4:3,
// 20:9, 29.5:9, sqrt2:1 and 1:sqrt2 (the manifest adds 9:20), with
// image-rendering: pixelated and the right background art for the orientation.
//
// One navigation per preset: each test loads the whole art manifest into a real
// browser, so every assertion about that preset shares the same page.

import { expect, test } from "./fixtures";
import { canvasBox, manifest, openGame, reportedPreset, windowForRatio } from "./helpers";
import type { ViewportSize } from "./helpers";

const BAR_COLOR = "#05060f";
const PIXELATED = manifest.viewport.imageRendering;

function toHex(color: string): string {
  const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color);
  if (rgb === null) return color.trim().toLowerCase();
  const parts = [rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, "0"));
  return `#${parts.join("")}`;
}

/** Nearest preset by ratio, computed the way src/render/viewport.ts computes it. */
function nearestPreset(width: number, height: number): string {
  const windowLogAspect = Math.log(width / height);
  const presets = manifest.viewport.presets;
  let best = presets[0];
  let bestDistance = Math.abs(windowLogAspect - Math.log(best?.ratio ?? 1));
  for (const preset of presets.slice(1)) {
    const distance = Math.abs(windowLogAspect - Math.log(preset.ratio));
    if (distance < bestDistance) {
      best = preset;
      bestDistance = distance;
    }
  }
  if (best === undefined) throw new Error("the manifest has no viewport presets");
  return best.id;
}

test.describe("every viewport preset", () => {
  test("the manifest still offers the presets the brief names", () => {
    for (const id of ["16:9", "16:10", "4:3", "20:9", "29.5:9", "sqrt2:1", "1:sqrt2"]) {
      expect(manifest.viewport.presets.map((preset) => preset.id), id).toContain(id);
    }
    expect(manifest.viewport.presets.map((preset) => preset.id)).toContain("9:20");
  });

  for (const preset of manifest.viewport.presets) {
    const size: ViewportSize = windowForRatio(preset.ratio);
    const portrait = preset.logical.h > preset.logical.w;

    test(`${preset.id} fits, centres, bars and upscales pixelated at ${String(size.width)}x${String(size.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await openGame(page);

      // The window ratio has to be exact enough that this preset is the one chosen.
      expect(nearestPreset(size.width, size.height)).toBe(preset.id);
      await expect.poll(async () => reportedPreset(page), { timeout: 20_000 }).toBe(preset.id);

      const box = await canvasBox(page);
      const gapX = size.width - box.width;
      const gapY = size.height - box.height;

      // Fits inside the window, and never overflows on either axis.
      expect(box.width).toBeLessThanOrEqual(size.width + 1);
      expect(box.height).toBeLessThanOrEqual(size.height + 1);
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.y).toBeGreaterThanOrEqual(-1);

      // Contain fit: the canvas keeps the preset aspect, never stretched.
      const boxAspect = box.width / box.height;
      const logicalAspect = preset.logical.w / preset.logical.h;
      expect(Math.abs(boxAspect - logicalAspect) / logicalAspect).toBeLessThan(0.01);

      // The bars are whatever the contain fit leaves over, split evenly, so the canvas
      // stays centred on both axes.
      expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.y + box.height / 2 - size.height / 2)).toBeLessThanOrEqual(1);

      // assets.json asks for an integer upscale whenever that keeps at least 90 per
      // cent of the fit, which is what stops the bars becoming a wide gutter on both
      // axes. One device pixel of slack covers the rounding the layout snaps to.
      const fit = Math.min(size.width / preset.logical.w, size.height / preset.logical.h);
      const scaleX = box.width / preset.logical.w;
      const scaleY = box.height / preset.logical.h;
      expect(Math.abs(scaleX - scaleY)).toBeLessThan(0.01);
      const scale = Math.max(scaleX, scaleY);
      const isInteger = Number.isInteger(Math.round(scale * 1e6) / 1e6);
      const keepsFill = scale >= fit * manifest.viewport.integerScaleMinFill - 1e-6;
      expect(isInteger || keepsFill, `${preset.id} scale ${String(scale)}`).toBe(true);
      expect(box.width).toBeLessThanOrEqual(preset.logical.w * fit + 1);
      expect(box.height).toBeLessThanOrEqual(preset.logical.h * fit + 1);
      expect(scale).toBeGreaterThan(0);

      // The bars are the page itself, painted with the documented colour.
      if (gapX > 1 || gapY > 1) {
        const bodyBackground = await page.evaluate(
          () => getComputedStyle(document.body).backgroundColor,
        );
        expect(toHex(bodyBackground), `${preset.id} bar colour`).toBe(BAR_COLOR);
      }

      // The internal buffer stays the preset logical size whatever the window is, and
      // the context is a plain 2D one with smoothing off: no WebGL anywhere.
      const canvasState = await page.evaluate(() => {
        const canvas = document.getElementById("stage");
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error("no canvas");
        const ctx = canvas.getContext("2d");
        const computed = getComputedStyle(canvas);
        return {
          width: canvas.width,
          height: canvas.height,
          imageRendering: computed.imageRendering,
          has2d: ctx !== null,
          smoothing: ctx === null ? null : ctx.imageSmoothingEnabled,
        };
      });
      expect(canvasState.width).toBe(preset.logical.w);
      expect(canvasState.height).toBe(preset.logical.h);
      expect(canvasState.has2d).toBe(true);
      expect(canvasState.smoothing).toBe(false);
      expect(canvasState.imageRendering).toBe(PIXELATED);

      // The orientation split is exactly two images, so a portrait window can never
      // reach for the landscape art and vice versa.
      expect(preset.background, `${preset.id} background`).toBe(
        portrait ? "canvas-03-mobile" : "canvas-03",
      );
      for (const entry of manifest.viewport.presets) {
        const isPortrait = entry.logical.h > entry.logical.w;
        expect(entry.background, entry.id).toBe(isPortrait ? "canvas-03-mobile" : "canvas-03");
      }
    });
  }
});

test.describe("resizing", () => {
  test("re-fits the arena when the window changes orientation", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openGame(page);
    expect(nearestPreset(1280, 720)).toBe("16:9");
    await expect.poll(async () => reportedPreset(page), { timeout: 20_000 }).toBe("16:9");
    const landscape = await canvasBox(page);

    const phone: ViewportSize = windowForRatio(0.45);
    await page.setViewportSize(phone);
    await expect.poll(async () => reportedPreset(page), { timeout: 20_000 }).toBe("9:20");
    const portrait = await canvasBox(page);
    expect(portrait.width).toBeLessThanOrEqual(phone.width + 1);
    expect(portrait.height).toBeLessThanOrEqual(phone.height + 1);
    expect(portrait.width).not.toBeCloseTo(landscape.width, 0);
  });

  test("keeps the letterbox bars even at an awkward window size", async ({ page }) => {
    await page.setViewportSize({ width: 1001, height: 999 });
    await openGame(page);
    const expected = nearestPreset(1001, 999);
    await expect.poll(async () => reportedPreset(page), { timeout: 20_000 }).toBe(expected);
    const preset = manifest.viewport.presets.find((entry) => entry.id === expected);
    if (preset === undefined) throw new Error(`no preset ${expected}`);
    const box = await canvasBox(page);
    expect(box.width).toBeLessThanOrEqual(1001 + 1);
    expect(box.height).toBeLessThanOrEqual(999 + 1);
    expect((1001 - box.width > 1) && (999 - box.height > 1)).toBe(false);
    const bodyBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(toHex(bodyBackground)).toBe(BAR_COLOR);
  });
});