// Data contract for public/assets/assets.json.
//
// assets.json is a source of truth file: a human locks it with `npm run assets:lock`,
// which stamps every image entry with its real pixel size, byte count and sha256.
// These tests assert the contract that makes the rest of the pipeline safe: the
// fingerprint still matches what is on disk, ids are unique and resolvable, and the
// viewport block is exactly the preset list tech-stack.json promises.

import { describe, expect, it } from "vitest";

import { byteSize, manifest, sha256Of, techStack } from "./helpers";

const spriteIds = manifest.sprites.map((sprite) => sprite.id);
const backgroundIds = manifest.backgrounds.map((background) => background.id);

describe("assets.json shape", () => {
  it("declares only the supported schema version", () => {
    expect(manifest.schemaVersion).toBe(1);
  });

  it("gives every sprite a unique id and an existing file", () => {
    expect(new Set(spriteIds).size).toBe(spriteIds.length);
    for (const sprite of manifest.sprites) {
      expect(sprite.id).not.toBe("");
      expect(sprite.file).not.toBe("");
      expect(() => byteSize(sprite.file)).not.toThrow();
    }
  });

  it("gives every background a unique id and an existing file", () => {
    expect(new Set(backgroundIds).size).toBe(backgroundIds.length);
    for (const background of manifest.backgrounds) {
      expect(background.id).not.toBe("");
      expect(() => byteSize(background.file)).not.toThrow();
    }
  });

  it("resolves every sprite character, keyframe sprite and preset background", () => {
    const characterIds = Object.keys(manifest.characters);
    for (const sprite of manifest.sprites) {
      expect(characterIds, `${sprite.id} character`).toContain(sprite.character);
    }
    for (const [characterId, character] of Object.entries(manifest.characters)) {
      // The record key is the character id; the definition carries no id of its own.
      for (const animation of Object.values(character.animations)) {
        for (const keyframe of animation.keyframes) {
          expect(spriteIds, `${characterId} ${keyframe.sprite}`).toContain(keyframe.sprite);
        }
      }
    }
    for (const preset of manifest.viewport.presets) {
      expect(backgroundIds, `${preset.id} background`).toContain(preset.background);
    }
    expect(backgroundIds).toContain(manifest.arena.background);
  });

  it("keeps renderScale positive and the anchor inside the normalized unit square", () => {
    for (const sprite of manifest.sprites) {
      expect(sprite.renderScale, sprite.id).toBeGreaterThan(0);
      expect(Number.isFinite(sprite.renderScale), sprite.id).toBe(true);
      expect(sprite.anchor.x, sprite.id).toBeGreaterThanOrEqual(0);
      expect(sprite.anchor.x, sprite.id).toBeLessThanOrEqual(1);
      expect(sprite.anchor.y, sprite.id).toBeGreaterThanOrEqual(0);
      expect(sprite.anchor.y, sprite.id).toBeLessThanOrEqual(1);
    }
  });

  it("keeps every procedural prop id unique and free of orphans", () => {
    const ids = manifest.proceduralProps.map((prop) => prop.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const prop of manifest.proceduralProps) {
      if (prop.character === null) continue;
      expect(Object.keys(manifest.characters), prop.id).toContain(prop.character);
    }
  });
});

describe("assets.json lock fingerprint", () => {
  it("records locked: true on every image entry", () => {
    for (const sprite of manifest.sprites) {
      expect(sprite.locked, sprite.id).toBe(true);
    }
    for (const background of manifest.backgrounds) {
      expect(background.locked, background.id).toBe(true);
    }
  });

  it("records a byte count that matches the file on disk", () => {
    for (const sprite of manifest.sprites) {
      expect(sprite.bytes, sprite.id).toBe(byteSize(sprite.file));
    }
    for (const background of manifest.backgrounds) {
      expect(background.bytes, background.id).toBe(byteSize(background.file));
    }
  });

  it("records a sha256 that matches the file on disk", () => {
    for (const sprite of manifest.sprites) {
      expect(sprite.sha256, sprite.id).toBe(sha256Of(sprite.file));
    }
    for (const background of manifest.backgrounds) {
      expect(background.sha256, background.id).toBe(sha256Of(background.file));
    }
  });

  it("records a pixel size for every image", () => {
    for (const sprite of manifest.sprites) {
      expect(sprite.size?.w, sprite.id).toBeGreaterThan(0);
      expect(sprite.size?.h, sprite.id).toBeGreaterThan(0);
    }
    for (const background of manifest.backgrounds) {
      expect(background.size?.w, background.id).toBeGreaterThan(0);
      expect(background.size?.h, background.id).toBeGreaterThan(0);
    }
  });

  it("uses unique files, so no two entries describe the same bytes", () => {
    const files = [...manifest.sprites, ...manifest.backgrounds].map((entry) => entry.file);
    expect(new Set(files).size).toBe(files.length);
  });
});

describe("viewport contract", () => {
  it("offers exactly the presets tech-stack.json promises", () => {
    expect(manifest.viewport.presets.map((preset) => preset.id)).toEqual(
      techStack.viewport.presets,
    );
  });

  it("keeps the documented pixelated upscale settings", () => {
    expect(manifest.viewport.imageRendering).toBe("pixelated");
    expect(techStack.viewport.behavior).toContain("image-rendering: pixelated");
    expect(manifest.viewport.integerScalePreferred).toBe(true);
    expect(manifest.viewport.integerScaleMinFill).toBeGreaterThan(0);
    expect(manifest.viewport.integerScaleMinFill).toBeLessThanOrEqual(1);
  });

  it("spells every preset ratio out from its id", () => {
    // "sqrt2:1" and "1:sqrt2" are irrational, so the authored ratio field is the truth.
    for (const preset of manifest.viewport.presets) {
      const [aText, bText] = preset.id.split(":");
      const a = aText === "sqrt2" ? Math.SQRT2 : Number(aText);
      const b = bText === "sqrt2" ? Math.SQRT2 : Number(bText);
      expect(Number.isFinite(a), preset.id).toBe(true);
      expect(Number.isFinite(b), preset.id).toBe(true);
      expect(Math.abs(preset.ratio - a / b), preset.id).toBeLessThan(1e-6);
    }
  });

  it("keeps the logical box inside rounding of the authored ratio", () => {
    // The logical box is a whole pixel size chosen for the layout, so it can only be
    // an approximation of an irrational aspect. One percent is the contract.
    for (const preset of manifest.viewport.presets) {
      const computed = preset.logical.w / preset.logical.h;
      expect(Math.abs(computed - preset.ratio) / preset.ratio, preset.id).toBeLessThan(0.01);
      expect(preset.logical.w, preset.id).toBeGreaterThan(0);
      expect(preset.logical.h, preset.id).toBeGreaterThan(0);
    }
  });

  it("gives every preset a distinct id", () => {
    const ids = manifest.viewport.presets.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("splits the presets into the portrait and landscape art the manifest ships", () => {
    // canvas-03 and canvas-03-mobile are the only two Milestone 1 backgrounds.
    for (const preset of manifest.viewport.presets) {
      const portrait = preset.logical.h > preset.logical.w;
      const expected = portrait ? "canvas-03-mobile" : "canvas-03";
      expect(preset.background, preset.id).toBe(expected);
      expect(backgroundIds, preset.id).toContain(expected);
    }
  });
});
