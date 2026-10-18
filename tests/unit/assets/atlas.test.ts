import { describe, expect, it } from "vitest";

import { Atlas, anchorPoint, frameRect, isAtlasError } from "../../../src/assets/atlas";
import type { AtlasError } from "../../../src/assets/atlas";
import type { DecodedImage } from "../../../src/assets/loader";
import { parseManifest } from "../../../src/assets/manifest-types";
import type { Dict } from "../../../src/assets/manifest-types";
import { draftManifest, manifest } from "./fixtures";

function decoded(width: number, height: number): DecodedImage {
  return { source: {} as CanvasImageSource, width, height };
}

function fullAtlas(): Atlas {
  const images = new Map<string, DecodedImage>();
  manifest.sprites.forEach((sprite, i) => {
    images.set(sprite.id, decoded(100 + i, 200 + i));
  });
  return Atlas.create(manifest, images);
}

describe("Atlas.create", () => {
  it("indexes every sprite id in manifest order", () => {
    const atlas = fullAtlas();
    expect(atlas.ids()).toEqual(manifest.sprites.map((sprite) => sprite.id));
    expect(atlas.missing(manifest)).toEqual([]);
    for (const sprite of manifest.sprites) expect(atlas.has(sprite.id)).toBe(true);
  });

  it("carries anchor, renderScale and facing from the manifest", () => {
    const atlas = fullAtlas();
    const entry = atlas.get("orca-jump");
    expect(entry.facing).toBe("up-right");
    expect(entry.renderScale).toBe(0.26);
    expect(entry.anchor).toEqual({ x: 0.45, y: 0.9 });
  });

  it("derives drawSize from the decoded size and renderScale", () => {
    const entry = fullAtlas().get("capybara-idle");
    expect(entry.sourceSize.w).toBe(100);
    expect(entry.sourceSize.h).toBe(200);
    expect(entry.drawSize.w).toBeCloseTo(100 * 0.26, 10);
    expect(entry.drawSize.h).toBeCloseTo(200 * 0.26, 10);
  });

  it("skips sprites with no decoded image and reports them", () => {
    const images = new Map<string, DecodedImage>([["orca-idle", decoded(10, 10)]]);
    const atlas = Atlas.create(manifest, images);
    expect(atlas.ids()).toEqual(["orca-idle"]);
    expect(atlas.has("orca-swim")).toBe(false);
    expect(atlas.missing(manifest)).toContain("orca-swim");
  });

  it("throws a typed error for an unknown sprite id", () => {
    let caught: unknown;
    try {
      fullAtlas().get("orca-moonwalk");
    } catch (error) {
      caught = error;
    }
    expect(isAtlasError(caught)).toBe(true);
    expect((caught as AtlasError).spriteId).toBe("orca-moonwalk");
  });
});

describe("frames", () => {
  it("treats every shipped sprite as a single full size frame", () => {
    const atlas = fullAtlas();
    for (const id of atlas.ids()) {
      const entry = atlas.get(id);
      expect(entry.frameCount).toBe(1);
      expect(entry.grid).toEqual({ cols: 1, rows: 1 });
      expect(entry.tile).toEqual(entry.sourceSize);
      expect(frameRect(entry, 0)).toEqual({
        x: 0,
        y: 0,
        w: entry.sourceSize.w,
        h: entry.sourceSize.h,
      });
    }
  });

  it("honors frame.grid and frame.tile for a future sprite sheet", () => {
    const draft = draftManifest();
    const sprites = draft["sprites"] as Dict[];
    (sprites[0] as Dict)["frame"] = { grid: { cols: 4, rows: 2 }, tile: { w: 32, h: 48 } };
    const m = parseManifest(draft);
    const images = new Map<string, DecodedImage>();
    m.sprites.forEach((sprite) => images.set(sprite.id, decoded(128, 96)));
    const entry = Atlas.create(m, images).get("capybara-idle");
    expect(entry.frameCount).toBe(8);
    expect(frameRect(entry, 0)).toEqual({ x: 0, y: 0, w: 32, h: 48 });
    expect(frameRect(entry, 3)).toEqual({ x: 96, y: 0, w: 32, h: 48 });
    expect(frameRect(entry, 4)).toEqual({ x: 0, y: 48, w: 32, h: 48 });
    expect(frameRect(entry, 7)).toEqual({ x: 96, y: 48, w: 32, h: 48 });
  });

  it("clamps an out of range frame index to the last frame", () => {
    const draft = draftManifest();
    const sprites = draft["sprites"] as Dict[];
    (sprites[0] as Dict)["frame"] = { grid: { cols: 2, rows: 1 }, tile: { w: 10, h: 10 } };
    const m = parseManifest(draft);
    const images = new Map<string, DecodedImage>();
    m.sprites.forEach((sprite) => images.set(sprite.id, decoded(20, 10)));
    const entry = Atlas.create(m, images).get("capybara-idle");
    expect(frameRect(entry, 99)).toEqual({ x: 10, y: 0, w: 10, h: 10 });
    expect(frameRect(entry, -3)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(frameRect(entry, Number.NaN)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
  });
});

describe("anchorPoint", () => {
  it("places the anchor inside the frame using the normalized anchor", () => {
    const atlas = fullAtlas();
    const grounded = atlas.get("capybara-idle");
    const rect = frameRect(grounded);
    const point = anchorPoint(grounded, rect);
    expect(point.x).toBeCloseTo(rect.x + rect.w * 0.5, 10);
    expect(point.y).toBeCloseTo(rect.y + rect.h * 0.92, 10);
  });

  it("defaults to frame zero", () => {
    const entry = fullAtlas().get("snail-idle");
    expect(anchorPoint(entry)).toEqual(anchorPoint(entry, frameRect(entry, 0)));
  });
});
