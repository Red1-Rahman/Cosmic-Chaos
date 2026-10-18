// The viewport handler, in a real browser, at every preset assets.json declares.
//
// AGENTS.md milestone 1 requires letterboxing or pillarboxing for 16:9, 16:10, 4:3,
// 20:9, 29.5:9, sqrt2:1 and 1:sqrt2 (and the manifest adds 9:20), with
// image-rendering: pixelated and the right background art for the orientation.

import { expect, test } from "./fixtures";
import { canvasBox, manifest, openGame, reportedPreset, windowForRatio } from "./helpers";
import type { ViewportSize } from "./helpers";

const BAR_COLOR = "#05060f";

function toHex(color: string): string {
  const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color);
  if (rgb === null) return color.trim().toLowerCase();
  const parts = [rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, "0"));
  return `#${parts.join("")}`;
}

/** Nearest preset by ratio, computed the way src/render/viewport.ts computes it. */
function nearestPreset(width: number, height: number): string {
  const windowLogAspect = Math.log(width / height);
  let best = manifest.viewport.presets[0];
  let bestDistance = Math.abs(windowLogAspect - Math.log(best?.ratio ?? 1));
  for (const preset of manifest.viewport.presets.slice(1)) {
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
  });

  for (const preset of manifest.viewport.presets) {
    const size: ViewportSize = windowForRatio(preset.ratio);

    test(`${preset.id} contain fits inside the window with bars on the right axis`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await openGame(page);

      // The window ratio has to be exact enough that this preset is the one chosen.
      expect(nearestPreset(size.width, size.height)).toBe(preset.id);
      await expect.poll(async () => reportedPreset(page), { timeout: 15_000 }).toBe(preset.id);

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

      // Exactly one axis can be letterboxed by a contain fit, never both.
      expect(gapX > 1 && gapY > 1, `${preset.id} bars on both axes`).toBe(false);

      // Bars split the leftover evenly, so the canvas stays centred in the window.
      expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.y + box.height / 2 - size.height / 2)).toBeLessThanOrEqual(1);

      // The bars are the page itself, painted with the documented colour.
      const bodyBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      if (gapX > 1 || gapY > 1) {
        expect(toHex(bodyBackground), `${preset.id} bar colour`).toBe(BAR_COLOR);
      }

      // The internal buffer stays the preset logical size whatever the window is.
      const internal = await page.evaluate(() => {
        const canvas = document.getElementById("stage");
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error("no canvas");
        return { width: canvas.width, height: canvas.height };
      });
      expect(internal).toEqual({ width: preset.logical.w, height: preset.logical.h });
    });

    test(`${preset.id} upscales with image-rendering: pixelated`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page);
      await expect.poll(async () => reportedPreset(page), { timeout: 15_000 }).toBe(preset.id);

      const rendering = await page.evaluate(() => {
        const canvas = document.getElementById("stage");
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error("no canvas");
        return getComputedStyle(canvas).imageRendering;
      });
      expect(rendering).toBe("pixelated");

      // The canvas is a plain 2D context with smoothing off: no WebGL anywhere.
      const context = await page.evaluate(() => {
        const canvas = document.getElementById("stage");
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error("no canvas");
        const ctx = canvas.getContext("2d");
        return {
          has2d: ctx !== null,
          smoothing: ctx === null ? null : ctx.imageSmoothingEnabled,
        };
      });
      expect(context.has2d).toBe(true);
      expect(context.smoothing).toBe(false);
    });

    test(`${preset.id} picks the background art for its orientation`, async ({ page }) => {
      await page.setViewportSize(size);
      await openGame(page);
      await expect.poll(async () => reportedPreset(page), { timeout: 15_000 }).toBe(preset.id);

      const portrait = preset.logical.h > preset.logical.w;
      const expected = portrait ? "canvas-03-mobile" : "canvas-03";
      expect(preset.background, `${preset.id} background`).toBe(expected);

      // The chosen background really is what the frame is painted with: the arena
      // renders differently at the two orientations, which cannot happen if the same
      // image were used twice.
      const fingerprint = await page.evaluate(() => {
        const canvas = document.getElementById("stage");
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error("no canvas");
        const ctx = canvas.getContext("2d");
        if (ctx === null) throw new Error("no 2d context");
        const probe = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        // Sample a coarse grid: enough to tell two different paintings apart.
        for (let i = 0; i < probe.length; i += 4 * 997) sum = (sum * 31 + probe[i] ?? 0) >>> 0;
        return sum;
      });
      expect(fingerprint).toBeGreaterThan(0);

      const other = manifest.viewport.presets.find((entry) =>
        (entry.logical.h > entry.logical.w) !== portrait,
      );
      if (other !== undefined) {
        await page.setViewportSize(windowForRatio(other.ratio));
        await expect.poll(async () => reportedPreset(page), { timeout: 15_000 }).toBe(other.id);
        const otherFingerprint = await page.evaluate(() => {
          const canvas = document.getElementById("stage");
          if (!(canvas instanceof HTMLCanvasElement)) throw new Error("no canvas");
          const ctx = canvas.getContext("2d");
          if (ctx === null) throw new Error("no 2d context");
          const probe = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0;
          for (let i = 0; i < probe.length; i += 4 * 997) sum = (sum * 31 + probe[i] ?? 0) >>> 0;
          return sum;
        });
        expect(otherFingerprint, `${preset.id} vs ${other.id} painted the same image`).not.toBe(
          fingerprint,
        );
      }
    });
  }
});

test.describe("resizing", () => {
  test("re-fits the arena when the window changes orientation", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openGame(page);
    await expect.poll(async () => reportedPreset(page), { timeout: 15_000 }).toBe("16:9");
    const landscape = await canvasBox(page);

    await page.setViewportSize({ width: 405, height: 900 });
    await expect.poll(async () => reportedPreset(page), { timeout: 15_000 }).toBe("9:20");
    const portrait = await canvasBox(page);
    expect(portrait.width).toBeLessThanOrEqual(405 + 1);
    expect(portrait.height).toBeLessThanOrEqual(900 + 1);
    expect(portrait.width).not.toBeCloseTo(landscape.width, 0);
  });

  test("keeps the letterbox bars even at an awkward window size", async ({ page }) => {
    await page.setViewportSize({ width: 1001, height: 999 });
    await openGame(page);
    const expected = nearestPreset(1001, 999);
    await expect.poll(async () => reportedPreset(page), { timeout: 15_000 }).toBe(expected);
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