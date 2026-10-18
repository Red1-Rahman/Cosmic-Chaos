import { Atlas } from "../../../src/assets/atlas";
import type { DecodedImage } from "../../../src/assets/loader";
import type { Manifest } from "../../../src/assets/manifest-types";
import type { Entity, EntityKind, World } from "../../../src/sim/types";
import { computeLayoutForPreset } from "../../../src/render/viewport";
import type { Layout } from "../../../src/render/viewport";
import { manifest } from "../assets/fixtures";

/** Sprite file sizes. Anything works: the renderer only reads width and height. */
const SPRITE_SIZES: Record<string, { readonly w: number; readonly h: number }> = {
  "capybara-idle": { w: 100, h: 200 },
  "orca-idle": { w: 120, h: 120 },
  "orca-swim": { w: 240, h: 120 },
  "orca-jump": { w: 120, h: 140 },
  "shark-slide": { w: 1095, h: 976 },
  "tarantula-idle": { w: 150, h: 150 },
  "snail-idle": { w: 130, h: 130 },
  "human-standing": { w: 90, h: 180 },
};

export interface NamedImage extends DecodedImage {
  readonly name: string;
}

/** A decoded image whose source is a plain object, so tests can compare identity. */
export function fakeImage(name: string, w: number, h: number): NamedImage {
  const source = { name } as unknown as CanvasImageSource;
  return { name, source, width: w, height: h };
}

/** Every sprite in the manifest, sized from SPRITE_SIZES (default 100x100). */
export function spriteImages(): Map<string, DecodedImage> {
  const images = new Map<string, DecodedImage>();
  for (const sprite of manifest.sprites) {
    const size = SPRITE_SIZES[sprite.id] ?? { w: 100, h: 100 };
    images.set(sprite.id, fakeImage(sprite.id, size.w, size.h));
  }
  return images;
}

/** Landscape and portrait background art, with distinguishable sources. */
export function backgroundImages(): Map<string, DecodedImage> {
  const images = new Map<string, DecodedImage>();
  for (const background of manifest.backgrounds) {
    images.set(background.id, fakeImage(background.id, 1408, 768));
  }
  return images;
}

export function testAtlas(): Atlas {
  return Atlas.create(manifest, spriteImages());
}

export function testManifest(): Manifest {
  return manifest;
}

/** Layout for one preset id at a window that contains it exactly. */
export function layoutFor(presetId: string, windowSize = { w: 1408, h: 800 }): Layout {
  const preset = manifest.viewport.presets.find((entry) => entry.id === presetId);
  if (preset === undefined) throw new Error(`no preset ${presetId}`);
  return computeLayoutForPreset(windowSize, preset);
}

export interface EntityOptions {
  readonly x?: number;
  readonly y?: number;
  readonly facing?: 1 | -1;
  readonly anim?: string;
  readonly animMs?: number;
  readonly scale?: number;
  readonly alpha?: number;
  readonly props?: Record<string, number>;
}

export function makeEntity(kind: EntityKind, id: string, options: EntityOptions = {}): Entity {
  return {
    id,
    kind,
    x: options.x ?? manifest.arena.playBand.minX + 40,
    y: options.y ?? manifest.arena.playBand.minY + 20,
    facing: options.facing ?? 1,
    anim: options.anim ?? "idle",
    animMs: options.animMs ?? 0,
    scale: options.scale ?? 1,
    alpha: options.alpha ?? 1,
    timeScale: 1,
    hp: 1,
    state: "idle",
    props: options.props ?? {},
  };
}

/** A world with exactly the entities a test passes in. */
export function makeWorld(entities: Entity[], overrides: Partial<World> = {}): World {
  return {
    seed: 1337,
    tick: 0,
    timeMs: 0,
    arena: {
      w: manifest.arena.logical.w,
      h: manifest.arena.logical.h,
      minX: manifest.arena.playBand.minX,
      maxX: manifest.arena.playBand.maxX,
      minY: manifest.arena.playBand.minY,
      maxY: manifest.arena.playBand.maxY,
      fieldRadius: manifest.arena.fieldRadius,
      timeScaleInside: manifest.arena.timeScaleInside,
    },
    entities,
    playerId: "player",
    fieldTimeScale: 1,
    status: "playing",
    events: [],
    ...overrides,
  };
}

/** The stock roster from createWorld, without running the sim. */
export function fullRoster(): Entity[] {
  return [
    makeEntity("player", "player", {
      x: 700,
      y: 600,
      props: { vx: 40, vy: 0, speed: 40, lift: 0 },
    }),
    makeEntity("snail", "snail", { x: 320, y: 520 }),
    makeEntity("orca", "orca-1", { x: 900, y: 540, anim: "swim" }),
    makeEntity("shark", "shark-1", { x: 640, y: 560, anim: "swim", props: { speed: 180 } }),
    makeEntity("tarantula", "tarantula-1", { x: 500, y: 500 }),
    makeEntity("human", "human-1", { x: 400, y: 630, anim: "swim" }),
  ];
}

/** Two argument shape for arena sizes used by the view math. */
export const arenaSize = { w: manifest.arena.logical.w, h: manifest.arena.logical.h };