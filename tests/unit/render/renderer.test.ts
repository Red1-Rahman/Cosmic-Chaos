import { describe, expect, it } from "vitest";

import { createFakeCanvas } from "../../helpers/fake-canvas";
import type { RecordedCall } from "../../helpers/fake-canvas";
import {
  KIND_TO_CHARACTER,
  computeArenaView,
  coverFit,
  createRenderer,
  depthFactor,
  drawSprite,
} from "../../../src/render/renderer";
import {
  backgroundImages,
  fakeImage,
  fullRoster,
  layoutFor,
  makeEntity,
  makeWorld,
  testAtlas,
  testManifest,
} from "./fixtures";

const manifest = testManifest();

/** The background is the only 5 argument drawImage; sprites use 9. */
const isBackgroundDraw = (call: RecordedCall): boolean => call.args.length === 5;

const isSpriteDraw = (call: RecordedCall): boolean => call.args.length === 9;

interface SpriteAnchor {
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Every sprite draw with the anchor it was drawn at. `drawSprite` translates to
 * the anchor immediately before the drawImage, inside the same save/restore.
 */
function spriteAnchors(canvas: ReturnType<typeof createFakeCanvas>): SpriteAnchor[] {
  const out: SpriteAnchor[] = [];
  let anchor: { x: number; y: number } | undefined;
  for (const call of canvas.calls) {
    if (call.name === "save" || call.name === "restore") {
      anchor = undefined;
      continue;
    }
    if (call.name === "translate") {
      anchor = { x: call.args[0] as number, y: call.args[1] as number };
      continue;
    }
    if (isSpriteDraw(call) && anchor !== undefined) {
      out.push({ name: (call.args[0] as { name: string }).name, x: anchor.x, y: anchor.y });
    }
  }
  return out;
}

describe("computeArenaView", () => {
  it("contain fits the 1408x768 arena into a 1408x792 canvas", () => {
    const view = computeArenaView({ w: 1408, h: 768 }, { w: 1408, h: 792 });
    expect(view.scale).toBeCloseTo(1, 10);
    expect(view.offsetX).toBeCloseTo(0, 10);
    expect(view.offsetY).toBeCloseTo(12, 10);
  });

  it("keeps the whole arena on screen at the widest preset", () => {
    const view = computeArenaView({ w: 1408, h: 768 }, { w: 1770, h: 540 });
    expect(view.scale).toBeCloseTo(540 / 768, 10);
    expect(view.offsetX).toBeGreaterThanOrEqual(0);
    expect(view.offsetY).toBeCloseTo(0, 10);
    expect(view.offsetX + view.width).toBeLessThanOrEqual(1770 + 1e-6);
  });

  it("keeps the play band fully visible at the tallest preset", () => {
    const view = computeArenaView({ w: 1408, h: 768 }, { w: 810, h: 1800 });
    const band = manifest.arena.playBand;
    const top = view.offsetY + band.minY * view.scale;
    const bottom = view.offsetY + band.maxY * view.scale;
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeLessThanOrEqual(1800);
    expect(view.offsetX + band.minX * view.scale).toBeGreaterThanOrEqual(0);
    expect(view.offsetX + band.maxX * view.scale).toBeLessThanOrEqual(810 + 1e-6);
  });
});

describe("coverFit", () => {
  it("always covers the box and never shrinks below it", () => {
    const rect = coverFit(1408, 768, 810, 1800, 0.5, 0.5);
    expect(rect.w).toBeGreaterThanOrEqual(810);
    expect(rect.h).toBeGreaterThanOrEqual(1800);
  });

  it("centers when there is no overflow", () => {
    const rect = coverFit(1408, 768, 1408, 768, 0.5, 0.5);
    expect(rect).toEqual({ x: 0, y: 0, w: 1408, h: 768 });
  });
});

describe("depthFactor", () => {
  it("runs from 0 at the far edge of the band to 1 at the near edge", () => {
    const world = makeWorld([]);
    expect(depthFactor(world, world.arena.minY)).toBeCloseTo(0, 10);
    expect(depthFactor(world, world.arena.maxY)).toBeCloseTo(1, 10);
    expect(depthFactor(world, world.arena.minY - 500)).toBe(0);
    expect(depthFactor(world, world.arena.maxY + 500)).toBe(1);
  });
});

describe("drawSprite", () => {
  it("uses the manifest source rect and a destination sized by renderScale", () => {
    const fake = createFakeCanvas();
    const atlas = testAtlas();
    const entry = atlas.get("capybara-idle");
    drawSprite(fake.ctx, atlas, {
      spriteId: "capybara-idle",
      x: 400,
      y: 500,
      flipX: 1,
      sx: 1,
      sy: 1,
      rot: 0,
      alpha: 1,
      scale: 1,
    });
    const call = fake.findAll("drawImage")[0];
    expect(call?.args.slice(0, 5)).toEqual([entry.bitmap, 0, 0, entry.tile.w, entry.tile.h]);
    const w = call?.args[7];
    const h = call?.args[8];
    const ox = call?.args[5];
    const oy = call?.args[6];
    expect(w).toBeCloseTo(100 * 0.26, 10);
    expect(h).toBeCloseTo(200 * 0.26, 10);
    // The anchor places the sprite around the given point.
    expect(ox).toBeCloseTo(-0.5 * (100 * 0.26), 10);
    expect(oy).toBeCloseTo(-0.92 * (200 * 0.26), 10);
  });

  it("skips a sprite the atlas never loaded", () => {
    const fake = createFakeCanvas();
    drawSprite(fake.ctx, testAtlas(), {
      spriteId: "not-a-sprite",
      x: 0,
      y: 0,
      flipX: 1,
      sx: 1,
      sy: 1,
      rot: 0,
      alpha: 1,
      scale: 1,
    });
    expect(fake.countOf("drawImage")).toBe(0);
  });

  it("never paints a haze veil over the sprite box", () => {
    const fake = createFakeCanvas();
    drawSprite(fake.ctx, testAtlas(), {
      spriteId: "capybara-idle",
      x: 400,
      y: 500,
      flipX: 1,
      sx: 1,
      sy: 1,
      rot: 0,
      alpha: 1,
      scale: 1,
    });
    expect(fake.countOf("fillRect")).toBe(0);
    expect(fake.countOf("fill")).toBe(0);
  });
});

describe("createRenderer", () => {
  it("draws the background before any entity", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    renderer.render(fake.ctx, makeWorld(fullRoster()), layoutFor("16:9"), 0);
    const draws = fake.findAll("drawImage");
    expect(draws.length).toBeGreaterThan(1);
    const firstBackground = draws.findIndex(isBackgroundDraw);
    const firstSprite = draws.findIndex(isSpriteDraw);
    expect(firstBackground).toBeGreaterThanOrEqual(0);
    expect(firstBackground).toBeLessThan(firstSprite);
  });

  it("maps the arena into the canvas box before drawing entities", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    const layout = layoutFor("9:20", { w: 810, h: 1800 });
    renderer.render(fake.ctx, makeWorld(fullRoster()), layout, 0);
    const view = computeArenaView(manifest.arena.logical, layout.logical);
    expect(fake.find("translate")?.args).toEqual([view.offsetX, view.offsetY]);
    expect(fake.find("scale")?.args).toEqual([view.scale, view.scale]);
  });

  it("uses a different background image for a portrait preset than a landscape one", () => {
    const backgrounds = backgroundImages();
    const landscape = createFakeCanvas();
    const portrait = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds });

    renderer.render(landscape.ctx, makeWorld([]), layoutFor("16:9"), 0);
    renderer.render(portrait.ctx, makeWorld([]), layoutFor("9:20"), 0);

    const landscapeSrc = landscape.find("drawImage")?.args[0] as { name: string };
    const portraitSrc = portrait.find("drawImage")?.args[0] as { name: string };
    expect(landscapeSrc.name).toBe("canvas-03");
    expect(portraitSrc.name).toBe("canvas-03-mobile");
    expect(landscapeSrc.name).not.toBe(portraitSrc.name);
  });

  it("covers the whole canvas with the background image", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), {
      backgrounds: new Map([["canvas-03", fakeImage("canvas-03", 1408, 768)]]),
    });
    const layout = layoutFor("4:3", { w: 1024, h: 768 });
    renderer.render(fake.ctx, makeWorld([]), layout, 0);
    const call = fake.find("drawImage");
    const x = call?.args[1] as number;
    const y = call?.args[2] as number;
    const w = call?.args[3] as number;
    const h = call?.args[4] as number;
    expect(x).toBeLessThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(0);
    expect(x + w).toBeGreaterThanOrEqual(layout.logical.w);
    expect(y + h).toBeGreaterThanOrEqual(layout.logical.h);
  });

  it("falls back to a flat fill when no background art was supplied", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas());
    const layout = layoutFor("16:9");
    renderer.render(fake.ctx, makeWorld([]), layout, 0);
    expect(fake.countOf("drawImage")).toBe(0);
    expect(fake.find("fillRect")?.args).toEqual([0, 0, layout.logical.w, layout.logical.h]);
  });

  it("draws entities sorted by y so nearer things overlap further ones", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    const world = makeWorld([
      makeEntity("human", "far", { x: 300, y: 500 }),
      makeEntity("human", "near", { x: 300, y: 640 }),
      makeEntity("human", "mid", { x: 300, y: 570 }),
    ]);
    renderer.render(fake.ctx, world, layoutFor("16:9"), 0);
    const anchors = spriteAnchors(fake);
    expect(anchors.map((anchor) => anchor.y)).toEqual([500, 570, 640]);
    for (const anchor of anchors) expect(anchor.name).toBe("human-standing");
  });

  it("scales entities with depth", () => {
    const far = createFakeCanvas();
    const near = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    renderer.render(
      far.ctx,
      makeWorld([makeEntity("human", "a", { x: 400, y: manifest.arena.playBand.minY })]),
      layoutFor("16:9"),
      0,
    );
    renderer.render(
      near.ctx,
      makeWorld([makeEntity("human", "a", { x: 400, y: manifest.arena.playBand.maxY })]),
      layoutFor("16:9"),
      0,
    );
    const depthScale = (canvas: ReturnType<typeof createFakeCanvas>): number => {
      const draw = canvas.findAll("drawImage").find(isSpriteDraw);
      expect(draw).toBeDefined();
      const translate = canvas.findAll("translate").find((call) => call.args[0] === 400);
      expect(translate).toBeDefined();
      const index = canvas.calls.indexOf(translate as RecordedCall);
      const scale = canvas.calls.slice(index).find((call) => call.name === "scale");
      return scale?.args[0] as number;
    };
    const nearScale = depthScale(near);
    const farScale = depthScale(far);
    expect(nearScale).toBeGreaterThan(farScale);
    expect(nearScale).toBeCloseTo(manifest.arena.depth.scaleMax, 6);
  });

  it("mirrors the sprite with a negative horizontal scale when facing left", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    const world = makeWorld([
      makeEntity("orca", "orca-1", { x: 500, y: 550, anim: "swim", facing: -1 }),
    ]);
    renderer.render(fake.ctx, world, layoutFor("16:9"), 0);
    const index = fake.calls.findIndex((call) => call.name === "translate" && call.args[0] === 500);
    expect(index).toBeGreaterThanOrEqual(0);
    const scale = fake.calls.slice(index).find((call) => call.name === "scale");
    expect(scale?.args[0]).toBeLessThan(0);
    expect(scale?.args[1]).toBeGreaterThan(0);
  });

  it("leaves the horizontal scale positive when facing right", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    const world = makeWorld([
      makeEntity("orca", "orca-1", { x: 500, y: 550, anim: "swim", facing: 1 }),
    ]);
    renderer.render(fake.ctx, world, layoutFor("16:9"), 0);
    const index = fake.calls.findIndex((call) => call.name === "translate" && call.args[0] === 500);
    const scale = fake.calls.slice(index).find((call) => call.name === "scale");
    expect(scale?.args[0]).toBeGreaterThan(0);
  });

  it("draws the waterbike under the capybara and nothing under the others", () => {
    const withPlayer = createFakeCanvas();
    const withoutPlayer = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    renderer.render(withPlayer.ctx, makeWorld(fullRoster()), layoutFor("16:9"), 0);
    renderer.render(
      withoutPlayer.ctx,
      makeWorld([makeEntity("orca", "orca-1", { x: 500, y: 550 })]),
      layoutFor("16:9"),
      0,
    );
    const playerIndex = withPlayer.calls.findIndex(
      (call) => call.name === "translate" && call.args[0] === 700,
    );
    expect(playerIndex).toBeGreaterThanOrEqual(0);
    // The bike paths come after its translate and before the sprite drawImage.
    const spriteIndex = withPlayer.calls.findIndex(
      (call, index) => index > playerIndex && call.name === "drawImage" && isSpriteDraw(call),
    );
    const bikeFill = withPlayer.calls
      .slice(playerIndex, spriteIndex)
      .find((call) => call.name === "quadraticCurveTo");
    expect(bikeFill).toBeDefined();
    expect(spriteIndex).toBeGreaterThan(playerIndex);
    expect(withoutPlayer.countOf("quadraticCurveTo")).toBe(0);
  });

  it("resolves every roster kind to a manifest character", () => {
    for (const kind of ["player", "orca", "shark", "tarantula", "snail", "human"] as const) {
      expect(manifest.characters[KIND_TO_CHARACTER[kind]]).toBeDefined();
    }
  });

  it("emits a hit burst from a pushed event without touching the world queue", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    const world = makeWorld(fullRoster());
    renderer.pushEvent({ type: "hit", id: "orca-1", x: 500, y: 540, power: 1 });
    renderer.render(fake.ctx, world, layoutFor("16:9"), 0);
    expect(world.events).toEqual([]);
    expect(renderer.particleCount()).toBeGreaterThan(0);
    expect(fake.countOf("fillRect")).toBeGreaterThan(0);
  });

  it("spawns nothing for reduced motion", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), {
      backgrounds: backgroundImages(),
      reducedMotion: true,
    });
    for (let i = 0; i < 30; i += 1) {
      renderer.pushEvent({ type: "hit", id: "orca-1", x: 500, y: 540, power: 1 });
      renderer.render(fake.ctx, makeWorld(fullRoster()), layoutFor("16:9"), 0);
    }
    expect(renderer.particleCount()).toBe(0);
    expect(renderer.reducedMotion()).toBe(true);
  });

  it("can be switched into reduced motion at runtime", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    renderer.pushEvent({ type: "splash", id: "player", x: 700, y: 600, power: 1 });
    renderer.render(fake.ctx, makeWorld(fullRoster()), layoutFor("16:9"), 0);
    expect(renderer.particleCount()).toBeGreaterThan(0);
    renderer.setReducedMotion(true);
    renderer.render(fake.ctx, makeWorld(fullRoster()), layoutFor("16:9"), 0);
    expect(renderer.particleCount()).toBe(0);
  });

  it("interpolates positions between the previous and the current tick", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    renderer.render(
      fake.ctx,
      makeWorld([makeEntity("human", "a", { x: 100, y: 500 })], { tick: 0 }),
      layoutFor("16:9"),
      0,
    );
    fake.reset();
    renderer.render(
      fake.ctx,
      makeWorld([makeEntity("human", "a", { x: 200, y: 500 })], { tick: 1 }),
      layoutFor("16:9"),
      0.5,
    );
    const translate = fake
      .findAll("translate")
      .find((call) => typeof call.args[0] === "number" && call.args[0] > 90 && call.args[0] < 210);
    expect(translate?.args[0]).toBeCloseTo(150, 6);
  });

  it("never writes to the world", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    const world = makeWorld(fullRoster());
    const before = JSON.stringify(world);
    renderer.pushEvent({ type: "defeat", id: "orca-1", kind: "orca" });
    renderer.render(fake.ctx, world, layoutFor("16:9"), 0);
    expect(JSON.stringify(world)).toBe(before);
  });

  it("picks up a preset change on the next frame without an explicit resize", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    renderer.render(fake.ctx, makeWorld([]), layoutFor("16:9"), 0);
    fake.reset();
    const portrait = layoutFor("1:sqrt2", { w: 768, h: 1086 });
    renderer.render(fake.ctx, makeWorld([]), portrait, 0);
    const view = computeArenaView(manifest.arena.logical, portrait.logical);
    expect(fake.find("translate")?.args).toEqual([view.offsetX, view.offsetY]);
    expect(fake.find("scale")?.args).toEqual([view.scale, view.scale]);
  });

  it("accepts a layout through resize and keeps drawing", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    renderer.resize(layoutFor("16:9"));
    renderer.render(fake.ctx, makeWorld(fullRoster()), layoutFor("16:9"), 0);
    expect(fake.countOf("drawImage")).toBeGreaterThan(1);
  });

  it("drops cosmetic state on dispose", () => {
    const fake = createFakeCanvas();
    const renderer = createRenderer(manifest, testAtlas(), { backgrounds: backgroundImages() });
    renderer.pushEvent({ type: "hit", id: "orca-1", x: 500, y: 540, power: 1 });
    renderer.render(fake.ctx, makeWorld(fullRoster()), layoutFor("16:9"), 0);
    renderer.dispose();
    expect(renderer.particleCount()).toBe(0);
  });
});
