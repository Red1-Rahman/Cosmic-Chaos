import { describe, expect, it } from "vitest";

import {
  EASING_NAMES,
  ManifestError,
  findBackground,
  findPreset,
  findSprite,
  isManifestError,
  parseManifest,
} from "../../../src/assets/manifest-types";
import type { Dict } from "../../../src/assets/manifest-types";
import { draftManifest, manifest } from "./fixtures";

type Section = Dict[];

function sprites(draft: Dict): Section {
  return draft["sprites"] as Section;
}

function spriteAt(draft: Dict, index: number): Dict {
  const list = sprites(draft);
  const entry = list[index];
  if (entry === undefined) throw new Error(`no sprite at index ${String(index)}`);
  return entry;
}

function character(draft: Dict, id: string): Dict {
  const characters = draft["characters"] as Dict;
  const entry = characters[id];
  if (entry === undefined) throw new Error(`no character ${id}`);
  return entry;
}

function animation(draft: Dict, characterId: string, name: string): Dict {
  const animations = character(draft, characterId)["animations"] as Dict;
  const entry = animations[name];
  if (entry === undefined) throw new Error(`no animation ${name}`);
  return entry;
}

function keyframes(draft: Dict, characterId: string, name: string): Section {
  return animation(draft, characterId, name)["keyframes"] as Section;
}

function keyframeAt(draft: Dict, characterId: string, name: string, index: number): Dict {
  const list = keyframes(draft, characterId, name);
  const entry = list[index];
  if (entry === undefined) throw new Error(`no keyframe at index ${String(index)}`);
  return entry;
}

function presetAt(draft: Dict, index: number): Dict {
  const presets = (draft["viewport"] as Dict)["presets"] as Section;
  const entry = presets[index];
  if (entry === undefined) throw new Error(`no preset at index ${String(index)}`);
  return entry;
}

describe("parseManifest on the shipped manifest", () => {
  it("accepts public/assets/assets.json", () => {
    expect(() => parseManifest(draftManifest())).not.toThrow();
  });

  it("does not require locked, size, bytes or sha256", () => {
    const draft = draftManifest();
    const sprite = spriteAt(draft, 0);
    expect(sprite["locked"]).toBe(false);
    expect(sprite["size"]).toBeUndefined();
    expect(sprite["bytes"]).toBeUndefined();
    expect(sprite["sha256"]).toBeUndefined();

    const parsed = parseManifest(draft);
    expect(parsed.sprites[0]?.locked).toBe(false);
    expect(parsed.sprites[0]?.size).toBeUndefined();
  });

  it("keeps proceduralProps as an array", () => {
    expect(Array.isArray(manifest.proceduralProps)).toBe(true);
    expect(manifest.proceduralProps.map((prop) => prop.id)).toEqual([
      "waterbike",
      "time-field",
      "stardust",
      "crystal-glow",
    ]);
    expect(manifest.proceduralProps.find((prop) => prop.id === "crystal-glow")?.character).toBeNull();
  });

  it("reads arena, characters and viewport presets", () => {
    expect(manifest.arena.background).toBe("canvas-03");
    expect(manifest.arena.logical).toEqual({ w: 1408, h: 768 });
    expect(manifest.arena.playBand.minY).toBeLessThan(manifest.arena.playBand.maxY);
    expect(Object.keys(manifest.characters).sort()).toEqual([
      "capybara",
      "human",
      "orca",
      "shark",
      "snail",
      "tarantula",
    ]);
    expect(manifest.viewport.presets.map((preset) => preset.id)).toEqual([
      "16:9",
      "16:10",
      "4:3",
      "20:9",
      "29.5:9",
      "sqrt2:1",
      "1:sqrt2",
      "9:20",
    ]);
    expect(findPreset(manifest, "1:sqrt2").background).toBe("canvas-03-mobile");
  });

  it("exposes every animation keyframe channel", () => {
    const idle = manifest.characters["capybara"]?.animations["idle"];
    expect(idle?.loop).toBe(true);
    expect(idle?.keyframes).toHaveLength(3);
    expect(Object.keys(idle?.keyframes[1] ?? {}).sort()).toEqual([
      "alpha",
      "dx",
      "dy",
      "easing",
      "rot",
      "sprite",
      "sx",
      "sy",
      "t",
    ]);
  });

  it("supports the documented easing names", () => {
    expect([...EASING_NAMES]).toEqual(["linear", "ease-in", "ease-out", "ease-in-out", "step"]);
  });
});

describe("parseManifest rejections", () => {
  it("rejects a non-object root", () => {
    expect(() => parseManifest(null)).toThrow(ManifestError);
    expect(() => parseManifest([])).toThrow(ManifestError);
    expect(() => parseManifest("assets")).toThrow(/expected an object/);
  });

  it("rejects an unsupported schemaVersion", () => {
    const draft = draftManifest();
    draft["schemaVersion"] = 2;
    expect(() => parseManifest(draft)).toThrow(/only schemaVersion 1 is supported/);
  });

  it("rejects a sprite with no id or file", () => {
    const draft = draftManifest();
    delete spriteAt(draft, 0)["id"];
    expect(() => parseManifest(draft)).toThrow(/sprites\[0\]\.id/);
  });

  it("rejects a duplicate sprite id", () => {
    const draft = draftManifest();
    sprites(draft).push(structuredClone(spriteAt(draft, 0)));
    expect(() => parseManifest(draft)).toThrow(/duplicate sprite id "capybara-idle"/);
  });

  it("rejects a keyframe time that decreases", () => {
    const draft = draftManifest();
    keyframeAt(draft, "capybara", "idle", 2)["t"] = 0.1;
    expect(() => parseManifest(draft)).toThrow(/keyframes\[2\]\.t: keyframe times must not decrease/);
  });

  it("rejects a keyframe pointing at a sprite that does not exist", () => {
    const draft = draftManifest();
    keyframeAt(draft, "orca", "swim", 0)["sprite"] = "orca-moonwalk";
    expect(() => parseManifest(draft)).toThrow(/unknown sprite id "orca-moonwalk"/);
  });

  it("rejects an anchor outside the normalized unit square", () => {
    const draft = draftManifest();
    spriteAt(draft, 0)["anchor"] = { x: 0.5, y: 1.4 };
    expect(() => parseManifest(draft)).toThrow(/anchor is normalized/);
  });

  it("rejects an unknown background on a viewport preset", () => {
    const draft = draftManifest();
    presetAt(draft, 0)["background"] = "canvas-99";
    expect(() => parseManifest(draft)).toThrow(/unknown background id "canvas-99"/);
  });

  it("rejects an arena pointing at an unknown background", () => {
    const draft = draftManifest();
    (draft["arena"] as Dict)["background"] = "canvas-99";
    expect(() => parseManifest(draft)).toThrow(/arena.background: unknown background id/);
  });

  it("rejects an unknown easing name", () => {
    const draft = draftManifest();
    keyframeAt(draft, "snail", "idle", 1)["easing"] = "wobble";
    expect(() => parseManifest(draft)).toThrow(/expected one of linear, ease-in/);
  });

  it("rejects an alias that shadows a declared animation", () => {
    const draft = draftManifest();
    character(draft, "orca")["aliases"] = { idle: "swim" };
    expect(() => parseManifest(draft)).toThrow(/must not shadow a declared animation/);
  });

  it("rejects an alias that points nowhere", () => {
    const draft = draftManifest();
    character(draft, "orca")["aliases"] = { walk: "moonwalk" };
    expect(() => parseManifest(draft)).toThrow(/is neither an animation nor another alias/);
  });

  it("reports every problem in one error", () => {
    const draft = draftManifest();
    spriteAt(draft, 0)["renderScale"] = 0;
    spriteAt(draft, 1)["anchor"] = { x: 2, y: 0 };
    let caught: unknown;
    try {
      parseManifest(draft);
    } catch (error) {
      caught = error;
    }
    expect(isManifestError(caught)).toBe(true);
    const error = caught as ManifestError;
    expect(error.code).toBe("manifest-invalid");
    expect(error.issues.length).toBe(2);
    expect(error.message).toContain("assets.json is invalid");
  });

  it("accepts an authored easing on a keyframe", () => {
    const draft = draftManifest();
    keyframeAt(draft, "snail", "idle", 1)["easing"] = "ease-in-out";
    const parsed = parseManifest(draft);
    const sampled = parsed.characters["snail"]?.animations["idle"]?.keyframes[1];
    expect(sampled?.easing).toBe("ease-in-out");
  });
});

describe("narrowing helpers", () => {
  it("finds known ids", () => {
    expect(findSprite(manifest, "orca-swim").file).toBe("Orca-swim-right.png");
    expect(findBackground(manifest, "title").fit).toBe("contain");
    expect(findPreset(manifest, "20:9").logical).toEqual({ w: 1600, h: 720 });
  });

  it("throws on unknown ids", () => {
    expect(() => findSprite(manifest, "nope")).toThrow(/no sprite with id "nope"/);
    expect(() => findBackground(manifest, "nope")).toThrow(/no background with id "nope"/);
    expect(() => findPreset(manifest, "nope")).toThrow(/no preset with id "nope"/);
  });
});