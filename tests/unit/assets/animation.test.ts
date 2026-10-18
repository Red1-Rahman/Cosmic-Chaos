import { describe, expect, it } from "vitest";

import {
  AnimationSampleError,
  ease,
  isAnimationSampleError,
  normalizeTime,
  resolveAnimation,
  resolveAnimationName,
  sampleAnimation,
} from "../../../src/assets/animation";
import { parseManifest } from "../../../src/assets/manifest-types";
import type { Dict } from "../../../src/assets/manifest-types";
import { draftManifest, manifest } from "./fixtures";

interface TinyOptions {
  readonly loop?: boolean;
  readonly aliases?: Dict;
}

function tinyManifest(options: TinyOptions = {}): ReturnType<typeof parseManifest> {
  const draft = draftManifest();
  const arena = draft["arena"];
  if (typeof arena !== "object" || arena === null) throw new Error("fixture lost its arena");
  (arena as Dict)["background"] = "bg";
  draft["arena"] = arena;
  draft["sprites"] = [
    { id: "critter-a", file: "a.png", renderScale: 1, anchor: { x: 0.5, y: 0.5 } },
    { id: "critter-b", file: "b.png", renderScale: 1, anchor: { x: 0.5, y: 0.5 } },
  ];
  draft["backgrounds"] = [{ id: "bg", file: "bg.png", fit: "contain" }];
  draft["proceduralProps"] = [];
  draft["characters"] = {
    critter: {
      sprites: ["critter-a", "critter-b"],
      animations: {
        bob: {
          loop: options.loop ?? true,
          durationMs: 1000,
          keyframes: [
            { t: 0, sprite: "critter-a", dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, alpha: 1 },
            { t: 0.5, sprite: "critter-b", dx: 10, dy: -4, rot: 0.5, sx: 2, sy: 0.5, alpha: 0.5 },
            { t: 1, sprite: "critter-a", dx: 20, dy: 8, rot: 1, sx: 3, sy: 3, alpha: 0 },
          ],
        },
        held: {
          loop: false,
          durationMs: 400,
          keyframes: [
            { t: 0, sprite: "critter-a", dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, alpha: 1 },
            { t: 1, sprite: "critter-a", dx: 4, dy: 0, rot: 0, sx: 1, sy: 1, alpha: 0 },
          ],
        },
      },
      aliases: options.aliases ?? { walk: "bob", stroll: "walk", hop: "held" },
    },
  };
  draft["viewport"] = {
    imageRendering: "pixelated",
    integerScalePreferred: true,
    integerScaleMinFill: 0.9,
    select: "nearest-ratio",
    presets: [{ id: "16:9", ratio: 1.7777777778, logical: { w: 1408, h: 792 }, background: "bg" }],
  };
  return parseManifest(draft);
}

describe("sampleAnimation on the shipped manifest", () => {
  it("returns every channel the render layer needs", () => {
    expect(sampleAnimation(manifest, "capybara", "idle", 0)).toEqual({
      spriteId: "capybara-idle",
      dx: 0,
      dy: 0,
      rot: 0,
      sx: 1,
      sy: 1,
      alpha: 1,
    });
  });

  it("interpolates halfway to the middle keyframe", () => {
    // capybara idle runs 1700 ms and its first segment spans 0 to 850 ms.
    const sample = sampleAnimation(manifest, "capybara", "idle", 425);
    expect(sample.dy).toBeCloseTo(-1.5, 10);
    expect(sample.rot).toBeCloseTo(0.005, 10);
    expect(sample.sx).toBeCloseTo(1.005, 10);
    expect(sample.sy).toBeCloseTo(0.995, 10);
  });

  it("samples every declared animation at t = 0", () => {
    for (const id of Object.keys(manifest.characters)) {
      const character = manifest.characters[id];
      if (character === undefined) throw new Error(`no character ${id}`);
      for (const name of Object.keys(character.animations)) {
        expect(sampleAnimation(manifest, id, name, 0).spriteId.length).toBeGreaterThan(0);
      }
    }
  });

  it("resolves walk to swim on the orca", () => {
    expect(sampleAnimation(manifest, "orca", "walk", 300)).toEqual(
      sampleAnimation(manifest, "orca", "swim", 300),
    );
    expect(resolveAnimationName(manifest, "orca", "walk")).toBe("swim");
    expect(resolveAnimation(manifest, "orca", "walk")).toBe(
      resolveAnimation(manifest, "orca", "swim"),
    );
  });

  it("resolves the snail jump alias to its glide", () => {
    expect(resolveAnimationName(manifest, "snail", "jump")).toBe("swim");
    expect(sampleAnimation(manifest, "snail", "jump", 0).spriteId).toBe("snail-glide");
  });
});

describe("alias resolution", () => {
  it("follows a chain of aliases", () => {
    const m = tinyManifest();
    expect(resolveAnimationName(m, "critter", "stroll")).toBe("bob");
    expect(sampleAnimation(m, "critter", "stroll", 0)).toEqual(sampleAnimation(m, "critter", "bob", 0));
  });

  it("throws a typed error on an unknown character", () => {
    let caught: unknown;
    try {
      sampleAnimation(manifest, "axolotl", "idle", 0);
    } catch (error) {
      caught = error;
    }
    expect(isAnimationSampleError(caught)).toBe(true);
    const error = caught as AnimationSampleError;
    expect(error.code).toBe("unknown-character");
    expect(error.characterId).toBe("axolotl");
  });

  it("throws a typed error on an unresolvable animation name", () => {
    let caught: unknown;
    try {
      sampleAnimation(manifest, "orca", "moonwalk", 0);
    } catch (error) {
      caught = error;
    }
    expect(isAnimationSampleError(caught)).toBe(true);
    const error = caught as AnimationSampleError;
    expect(error.code).toBe("unknown-animation");
    expect(error.animationName).toBe("moonwalk");
  });

  it("throws a typed error on an alias cycle", () => {
    const cycle: Dict = {};
    const names = ["a", "b", "c", "d", "e", "f", "g", "h"];
    names.forEach((name, i) => {
      const next = names[(i + 1) % names.length];
      cycle[name] = next ?? name;
    });
    cycle["walk"] = "a";
    const m = tinyManifest({ aliases: cycle });
    let caught: unknown;
    try {
      resolveAnimationName(m, "critter", "walk");
    } catch (error) {
      caught = error;
    }
    expect(isAnimationSampleError(caught)).toBe(true);
    expect((caught as AnimationSampleError).code).toBe("alias-cycle");
  });
});

describe("loop and hold", () => {
  it("wraps a looping animation", () => {
    const m = tinyManifest({ loop: true });
    const bob = m.characters["critter"]?.animations["bob"];
    if (bob === undefined) throw new Error("fixture lost its bob animation");
    expect(normalizeTime(bob, 1250)).toBeCloseTo(0.25, 10);
    expect(sampleAnimation(m, "critter", "bob", 1250)).toEqual(
      sampleAnimation(m, "critter", "bob", 250),
    );
  });

  it("returns to the first frame exactly one period in", () => {
    expect(sampleAnimation(manifest, "orca", "swim", 780)).toEqual(
      sampleAnimation(manifest, "orca", "swim", 0),
    );
  });

  it("holds the last frame once a non looping animation ends", () => {
    const m = tinyManifest({ loop: false });
    const atEnd = sampleAnimation(m, "critter", "held", 400);
    expect(atEnd).toEqual({ spriteId: "critter-a", dx: 4, dy: 0, rot: 0, sx: 1, sy: 1, alpha: 0 });
    expect(sampleAnimation(m, "critter", "held", 4000.5)).toEqual(atEnd);
    expect(sampleAnimation(m, "critter", "held", 99999)).toEqual(atEnd);
  });

  it("clamps negative and non finite times to the first keyframe", () => {
    const first = sampleAnimation(manifest, "shark", "jump", 0);
    expect(sampleAnimation(manifest, "shark", "jump", -100)).toEqual(first);
    expect(sampleAnimation(manifest, "shark", "jump", Number.NaN)).toEqual(first);
  });
});

describe("interpolation details", () => {
  it("hits the keyframe endpoints exactly", () => {
    const m = tinyManifest();
    expect(sampleAnimation(m, "critter", "bob", 0)).toEqual({
      spriteId: "critter-a",
      dx: 0,
      dy: 0,
      rot: 0,
      sx: 1,
      sy: 1,
      alpha: 1,
    });
    expect(sampleAnimation(m, "critter", "bob", 1000)).toEqual({
      spriteId: "critter-a",
      dx: 20,
      dy: 8,
      rot: 1,
      sx: 3,
      sy: 3,
      alpha: 0,
    });
  });

  it("cuts sprite ids midway through a segment", () => {
    const m = tinyManifest();
    expect(sampleAnimation(m, "critter", "bob", 200).spriteId).toBe("critter-a");
    expect(sampleAnimation(m, "critter", "bob", 300).spriteId).toBe("critter-b");
  });

  it("swaps art at the keyframe boundary for a real sprite change", () => {
    // human swim alternates float-slight and float-high on a 1500 ms cycle.
    expect(sampleAnimation(manifest, "human", "swim", 0).spriteId).toBe("human-float-slight");
    expect(sampleAnimation(manifest, "human", "swim", 375).spriteId).toBe("human-float-slight");
    expect(sampleAnimation(manifest, "human", "swim", 800).spriteId).toBe("human-float-high");
  });

  it("evaluates the authored easing curves", () => {
    expect(ease(0.25, "linear")).toBe(0.25);
    expect(ease(0.5, "ease-in")).toBe(0.25);
    expect(ease(0.5, "ease-out")).toBe(0.75);
    expect(ease(0.5, "ease-in-out")).toBe(0.5);
    expect(ease(0.9, "step")).toBe(0);
  });

  it("is deterministic", () => {
    expect(sampleAnimation(manifest, "tarantula", "jump", 613)).toEqual(
      sampleAnimation(manifest, "tarantula", "jump", 613),
    );
  });
});