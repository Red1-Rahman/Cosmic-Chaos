import { describe, expect, it } from "vitest";

import {
  DEFAULT_FOCAL_POINT,
  backgroundFamily,
  declaredRatiosFor,
  isBackgroundError,
  pickBackground,
} from "../../../src/assets/backgrounds";
import type { BackgroundError } from "../../../src/assets/backgrounds";
import type { Dict } from "../../../src/assets/manifest-types";
import type { Manifest } from "../../../src/assets/manifest-types";
import { manifest } from "./fixtures";

/**
 * Build a manifest whose listed presets declare no background at all.
 *
 * `parseManifest` rejects a preset without a `background`, so this bypasses
 * the guard on purpose: it models the defensive path pickBackground has to take
 * when a preset is incomplete, and it is how the nearest-ratio fallback gets
 * exercised without inventing fields the real manifest does not have.
 */
function withoutDeclaredBackgrounds(presetIds: readonly string[]): Manifest {
  const draft = structuredClone(manifest) as unknown as Dict;
  const presets = (draft["viewport"] as Dict)["presets"] as Dict[];
  for (const preset of presets) {
    const id = preset["id"];
    if (typeof id === "string" && presetIds.includes(id)) delete preset["background"];
  }
  return draft as unknown as Manifest;
}

describe("pickBackground on the shipped manifest", () => {
  it("uses the background the preset declares", () => {
    const choice = pickBackground(manifest, "canvas-03", "16:9");
    expect(choice.id).toBe("canvas-03");
    expect(choice.file).toBe("canvas-03.jpeg");
    expect(choice.fit).toBe("contain");
    expect(choice.rule).toBe("preset-declared");
    expect(choice.variantOf).toBeNull();
    expect(choice.declaredRatio).toBeCloseTo(1.7777777778, 10);
  });

  it("follows the preset to the mobile crop for portrait presets", () => {
    expect(pickBackground(manifest, "canvas-03", "1:sqrt2").id).toBe("canvas-03-mobile");
    expect(pickBackground(manifest, "canvas-03", "9:20").id).toBe("canvas-03-mobile");
    expect(pickBackground(manifest, "canvas-03", "9:20").orientation).toBe("portrait");
  });

  it("covers every viewport preset the arena must support", () => {
    const ids = manifest.viewport.presets.map((preset) => preset.id);
    expect(ids).toEqual([
      "16:9",
      "16:10",
      "4:3",
      "20:9",
      "29.5:9",
      "sqrt2:1",
      "1:sqrt2",
      "9:20",
    ]);
    for (const id of ids) {
      expect(pickBackground(manifest, manifest.arena.background, id).id.startsWith("canvas-03")).toBe(
        true,
      );
    }
  });

  it("returns a centered focal point because no background declares one", () => {
    const choice = pickBackground(manifest, "canvas-03", "16:9");
    expect(choice.focalX).toBe(0.5);
    expect(choice.focalY).toBe(0.5);
    expect(choice).toMatchObject({
      focalX: DEFAULT_FOCAL_POINT.x,
      focalY: DEFAULT_FOCAL_POINT.y,
    });
  });

  it("resolves the title background too", () => {
    expect(pickBackground(manifest, "title", "16:9").id).toBe("title");
  });

  it("throws a typed error for an unknown preset", () => {
    let caught: unknown;
    try {
      pickBackground(manifest, "canvas-03", "5:4");
    } catch (error) {
      caught = error;
    }
    expect(isBackgroundError(caught)).toBe(true);
    const error = caught as BackgroundError;
    expect(error.code).toBe("unknown-preset");
    expect(error.presetId).toBe("5:4");
    expect(error.backgroundId).toBe("canvas-03");
  });

  it("throws a typed error for an unknown background", () => {
    let caught: unknown;
    try {
      pickBackground(manifest, "canvas-77", "16:9");
    } catch (error) {
      caught = error;
    }
    expect(isBackgroundError(caught)).toBe(true);
    expect((caught as BackgroundError).code).toBe("unknown-background");
  });
});

describe("background families", () => {
  it("groups a background with its variants in manifest order", () => {
    expect(backgroundFamily(manifest, "canvas-03").map((entry) => entry.id)).toEqual([
      "canvas-03",
      "canvas-03-mobile",
    ]);
    expect(backgroundFamily(manifest, "title").map((entry) => entry.id)).toEqual(["title"]);
    expect(backgroundFamily(manifest, "canvas-77")).toEqual([]);
  });

  it("reads a candidate's declared ratio back from the presets that use it", () => {
    expect(declaredRatiosFor(manifest, "canvas-03-mobile")).toEqual([0.7071067812, 0.45]);
    expect(declaredRatiosFor(manifest, "canvas-03")).toHaveLength(6);
    expect(declaredRatiosFor(manifest, "title")).toEqual([]);
  });
});

describe("nearest-ratio fallback", () => {
  it("picks the family member whose declared ratio is nearest by log distance", () => {
    // 4:3 declares nothing, so the search measures the family against 1.333.
    // canvas-03 declares sqrt2:1 = 1.414 (distance 0.059), canvas-03-mobile
    // declares 1:sqrt2 = 0.707 (distance 0.635).
    const m = withoutDeclaredBackgrounds(["4:3"]);
    const choice = pickBackground(m, "canvas-03", "4:3");
    expect(choice.rule).toBe("nearest-ratio");
    expect(choice.id).toBe("canvas-03");
    expect(choice.declaredRatio).toBeCloseTo(1.4142135624, 10);
    expect(choice.logDistance).toBeCloseTo(Math.abs(Math.log(1.4142135624 / 1.3333333333)), 10);
  });

  it("can pick the portrait variant when the target ratio is portrait", () => {
    const m = withoutDeclaredBackgrounds(["1:sqrt2"]);
    const choice = pickBackground(m, "canvas-03", "1:sqrt2");
    expect(choice.rule).toBe("nearest-ratio");
    expect(choice.id).toBe("canvas-03-mobile");
    expect(choice.declaredRatio).toBeCloseTo(0.45, 10);
    expect(choice.logDistance).toBeCloseTo(Math.abs(Math.log(0.45 / 0.7071067812)), 10);
  });

  it("falls back to the base art when no candidate declares a ratio", () => {
    const everyPreset = manifest.viewport.presets.map((preset) => preset.id);
    const m = withoutDeclaredBackgrounds(everyPreset);
    const choice = pickBackground(m, "canvas-03", "9:20");
    expect(choice.rule).toBe("fallback-base");
    expect(choice.id).toBe("canvas-03");
    expect(choice.declaredRatio).toBeNull();
  });

  it("handles a family with a single member", () => {
    const m = withoutDeclaredBackgrounds(["16:9"]);
    const choice = pickBackground(m, "title", "16:9");
    expect(choice.rule).toBe("fallback-base");
    expect(choice.id).toBe("title");
    expect(choice.variantOf).toBeNull();
  });

  it("reports the variant relationship for a crop", () => {
    const m = withoutDeclaredBackgrounds(["9:20"]);
    const choice = pickBackground(m, "canvas-03", "9:20");
    expect(choice.id).toBe("canvas-03-mobile");
    expect(choice.variantOf).toBe("canvas-03");
  });
});

describe("manifest cross references", () => {
  it("keeps every variantOf pointing at a real background", () => {
    for (const background of manifest.backgrounds) {
      if (background.variantOf === undefined) continue;
      expect(manifest.backgrounds.some((entry) => entry.id === background.variantOf)).toBe(true);
    }
  });
});