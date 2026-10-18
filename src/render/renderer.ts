// Arena renderer. Reads the world, draws a frame, mutates nothing.
//
// The canvas internal buffer is the viewport preset's logical size, which is
// not the 1408x768 arena box. So every frame maps the arena box into the canvas
// with a contain fit (`computeArenaView`) and draws in arena coordinates inside
// that transform. Because the fit is always contain, the whole arena is on
// screen at every preset, and the play band is therefore always fully visible.
//
// Rules: this file holds none. It reads positions, the animation name and a
// handful of `entity.props` scratch numbers the sim publishes for the HUD, and
// it never writes to the world or its entities.

import { Atlas } from "../assets/atlas";
import { sampleAnimation, isAnimationSampleError } from "../assets/animation";
import { pickBackground } from "../assets/backgrounds";
import type { BackgroundChoice } from "../assets/backgrounds";
import type { DecodedImage } from "../assets/loader";
import type { Manifest, ProceduralProp } from "../assets/manifest-types";
import type { Entity, GameEvent, World } from "../sim/types";
import type { Layout, Size } from "./viewport";
import {
  clamp01,
  crystalRadius,
  drawCrystalGlows,
  drawTimeField,
  drawWaterbike,
  mixColor,
  parseColor,
  readCrystalGlow,
  readTimeField,
  readWaterbike,
  withAlpha,
} from "./props";
import type { CrystalSpec, TimeFieldSpec, WaterbikeSpec } from "./props";
import { MAX_FLASH_HZ, createParticleSystem, quantizeFlash } from "./particles";
import type { ParticleSystem } from "./particles";

/** Which manifest character draws a given sim entity kind. */
export const KIND_TO_CHARACTER: Readonly<Record<Entity["kind"], string>> = {
  player: "capybara",
  orca: "orca",
  shark: "shark",
  tarantula: "tarantula",
  snail: "snail",
  human: "human",
};

/** Pixels per 0..1 lift. `y` is depth, so a jump is drawn as a vertical lift. */
export const LIFT_PIXELS = 44;

/**
 * Reference speed for prop effects, in the same units as `entity.props.vx`.
 * Display only: the renderer never reads the sim movement constants.
 */
export const PROP_SPEED_REFERENCE = 260;

/** Maximum hull tilt in radians, so the bike never looks broken. */
export const MAX_TILT_RAD = 0.28;

/** Entities further away than this fraction of the play band are fully hazed. */
const HALF_LIFT_ALPHA = 0.9;

export interface ArenaView {
  /** Arena box mapped into the canvas box. */
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Contain fit of the arena box into the canvas box. Always contain, never cover
 * and never stretch, so no preset can push the play band off screen.
 */
export function computeArenaView(arena: Size, logical: Size): ArenaView {
  const scale = Math.min(logical.w / arena.w, logical.h / arena.h);
  const width = arena.w * scale;
  const height = arena.h * scale;
  return {
    scale,
    offsetX: (logical.w - width) / 2,
    offsetY: (logical.h - height) / 2,
    width,
    height,
  };
}

export interface CoverRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Cover fit of a source image into a box, anchored on a normalized focal point.
 * Cover is fine here because the background is art, not a coordinate space.
 */
export function coverFit(
  imageW: number,
  imageH: number,
  boxW: number,
  boxH: number,
  focalX: number,
  focalY: number,
): CoverRect {
  if (imageW <= 0 || imageH <= 0 || boxW <= 0 || boxH <= 0) {
    return { x: 0, y: 0, w: Math.max(0, boxW), h: Math.max(0, boxH) };
  }
  const scale = Math.max(boxW / imageW, boxH / imageH);
  const w = imageW * scale;
  const h = imageH * scale;
  const fx = clamp01(focalX);
  const fy = clamp01(focalY);
  return {
    x: (boxW - w) * fx,
    y: (boxH - h) * fy,
    w,
    h,
  };
}

/** Depth factor in [0, 1] for a y position: 0 at the far edge, 1 at the near. */
export function depthFactor(world: World, y: number): number {
  const span = world.arena.maxY - world.arena.minY;
  if (span <= 0) return 1;
  return clamp01((y - world.arena.minY) / span);
}

export interface SpriteDraw {
  readonly spriteId: string;
  /** Anchor point in arena pixels. */
  readonly x: number;
  readonly y: number;
  /** -1 flips the art about the anchor. */
  readonly flipX: number;
  readonly sx: number;
  readonly sy: number;
  readonly rot: number;
  readonly alpha: number;
  /** Depth multiplier from the arena depth band. */
  readonly scale: number;
  /** Haze alpha in [0, 1]. 0 means no haze. */
  readonly tintAlpha: number;
  readonly tintColor: string;
}

/**
 * Draw one sprite frame, anchored, rotated, flipped and hazed.
 *
 * The nine argument `drawImage` form keeps the source rect and the destination
 * rect explicit, which is what the unit tests assert on.
 */
export function drawSprite(ctx: CanvasRenderingContext2D, atlas: Atlas, draw: SpriteDraw): void {
  if (!atlas.has(draw.spriteId)) return;
  const entry = atlas.get(draw.spriteId);
  const w = entry.drawSize.w * draw.scale;
  const h = entry.drawSize.h * draw.scale;
  const ox = -entry.anchor.x * w;
  const oy = -entry.anchor.y * h;

  ctx.save();
  ctx.translate(draw.x, draw.y);
  ctx.scale(draw.flipX * draw.sx * draw.scale, draw.sy * draw.scale);
  ctx.rotate(draw.rot);
  ctx.globalAlpha = clamp01(draw.alpha);
  ctx.drawImage(
    entry.bitmap,
    0,
    0,
    entry.tile.w,
    entry.tile.h,
    ox,
    oy,
    w,
    h,
  );
  ctx.restore();

  // Haze: an axis aligned veil over the drawn box. Rotation is tiny for every
  // pose in the manifest, so an unrotated rect keeps the veil cheap and stable.
  if (draw.tintAlpha > 0.002) {
    const halfScale = draw.scale;
    const signedW = w * draw.flipX * draw.sx;
    const boxX = draw.x - entry.anchor.x * signedW;
    const boxY = draw.y - entry.anchor.y * h * draw.sy;
    ctx.save();
    ctx.globalAlpha = clamp01(draw.tintAlpha);
    ctx.fillStyle = draw.tintColor;
    ctx.fillRect(boxX, boxY, Math.abs(signedW) * halfScale, Math.abs(h * draw.sy * halfScale));
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export interface RendererOptions {
  /**
   * Decoded background images keyed by manifest background id. Optional so the
   * two argument `createRenderer(manifest, atlas)` call still works; without it
   * the renderer paints a flat water colour instead of the art.
   */
  readonly backgrounds?: ReadonlyMap<string, DecodedImage> | undefined;
  /** Initial reduced motion state. `setReducedMotion` can change it later. */
  readonly reducedMotion?: boolean | undefined;
  /** Cosmetic seed fallback before the first world is seen. */
  readonly seed?: number | undefined;
}

export interface Renderer {
  render(ctx: CanvasRenderingContext2D, world: World, layout: Layout, alpha: number): void;
  resize(layout: Layout): void;
  /** Queue one cosmetic one-shot. The app drains `world.events`, not this. */
  pushEvent(event: GameEvent): void;
  setReducedMotion(reduced: boolean): void;
  reducedMotion(): boolean;
  /** Live particle count, for the debug overlay and the tests. */
  particleCount(): number;
  dispose(): void;
}

/** Flat fill used when no background image is available. */
export const FALLBACK_BACKGROUND_COLOR = "#0b1024";

const findProp = (manifest: Manifest, id: string): ProceduralProp | undefined =>
  manifest.proceduralProps.find((prop) => prop.id === id);

interface PreviousFrame {
  readonly tick: number;
  readonly positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>;
}

export function createRenderer(manifest: Manifest, atlas: Atlas, options: RendererOptions = {}): Renderer {
  const waterbike: WaterbikeSpec = readWaterbike(findProp(manifest, "waterbike"));
  const timeField: TimeFieldSpec = readTimeField(findProp(manifest, "time-field"));
  const crystals: CrystalSpec = readCrystalGlow(findProp(manifest, "crystal-glow"));
  const stardustProp = findProp(manifest, "stardust");

  let layout: Layout | undefined;
  let view: ArenaView | undefined;
  let reducedMotion = options.reducedMotion ?? false;
  let seed = options.seed ?? 0;
  let seedKnown = options.seed !== undefined;
  let particles: ParticleSystem = createParticleSystem(seed, {
    stardust: stardustProp === undefined ? undefined : readStardustSpec(stardustProp),
    reducedMotion,
  });

  const backgrounds = new Map<string, { readonly choice: BackgroundChoice; readonly image: DecodedImage | undefined }>();
  const queued: GameEvent[] = [];

  let previous: PreviousFrame | undefined;
  let dustCarry = 0;
  let flash = 0;
  let flashX = 0;
  let flashY = 0;

  const choiceFor = (presetId: string): { readonly choice: BackgroundChoice; readonly image: DecodedImage | undefined } => {
    const cached = backgrounds.get(presetId);
    if (cached !== undefined) return cached;
    const choice = pickBackground(manifest, manifest.arena.background, presetId);
    const image = options.backgrounds?.get(choice.id);
    const entry = { choice, image };
    backgrounds.set(presetId, entry);
    return entry;
  };

  const applyLayout = (next: Layout): void => {
    layout = next;
    view = computeArenaView(manifest.arena.logical, next.logical);
  };

  const ensureSeed = (world: World): void => {
    if (seedKnown && world.seed === seed) return;
    seed = world.seed;
    seedKnown = true;
    particles = createParticleSystem(seed, {
      stardust: stardustProp === undefined ? undefined : readStardustSpec(stardustProp),
      reducedMotion,
    });
    dustCarry = 0;
  };

  const paintBackground = (ctx: CanvasRenderingContext2D, current: Layout): void => {
    const { choice, image } = choiceFor(current.preset.id);
    if (image === undefined) {
      ctx.fillStyle = FALLBACK_BACKGROUND_COLOR;
      ctx.fillRect(0, 0, current.logical.w, current.logical.h);
      return;
    }
    const rect = coverFit(
      image.width,
      image.height,
      current.logical.w,
      current.logical.h,
      choice.focalX,
      choice.focalY,
    );
    ctx.drawImage(image.source, rect.x, rect.y, rect.w, rect.h);
  };

  const emitForEvents = (): void => {
    for (const event of queued) {
      switch (event.type) {
        case "hit":
          particles.emitSparks(event.x, event.y, 14, event.power);
          flash = Math.max(flash, 0.55);
          flashX = event.x;
          flashY = event.y;
          break;
        case "splash":
          particles.emitSplashRing(event.x, event.y, event.power);
          break;
        case "laser":
          particles.emitPing(event.x, event.y, event.x >= flashX ? 1 : -1, 0);
          break;
        default:
          break;
      }
    }
    queued.length = 0;
  };

  const render = (ctx: CanvasRenderingContext2D, world: World, current: Layout, alpha: number): void => {
    ensureSeed(world);
    if (layout === undefined || layout.preset.id !== current.preset.id || layout.logical.w !== current.logical.w || layout.logical.h !== current.logical.h) {
      applyLayout(current);
    }
    const arenaView = view;
    if (arenaView === undefined) return;

    const t = Number.isFinite(alpha) ? (alpha < 0 ? 0 : alpha > 1 ? 1 : alpha) : 1;
    const currentTick = world.tick;
    const previousTick = previous?.tick;
    const interpolate = previousTick === currentTick - 1;

    // Background first, over the whole canvas, using this preset's variant.
    paintBackground(ctx, current);

    ctx.save();
    ctx.translate(arenaView.offsetX, arenaView.offsetY);
    ctx.scale(arenaView.scale, arenaView.scale);

    // Shore props sit behind everything because they are on the shore.
    drawCrystalGlows(ctx, crystals, world.timeMs, reducedMotion);

    const snail = world.entities.find((entity) => entity.kind === "snail");
    if (snail !== undefined) {
      drawTimeField(ctx, timeField, snail.x, snail.y, world.timeMs, reducedMotion);
    }

    // Sort by depth, stable on the world's entity order.
    const ordered = world.entities
      .map((entity, index) => ({ entity, index }))
      .sort((a, b) => (a.entity.y === b.entity.y ? a.index - b.index : a.entity.y - b.entity.y));

    for (const { entity } of ordered) {
      const drawOne = drawEntity(ctx, world, entity, t, interpolate);
      if (drawOne) dustCarry += drawOne;
    }
    emitCosmeticBursts(world, t);
    particles.draw(ctx);

    paintFlash(ctx, world.timeMs);
    ctx.restore();

    previous = {
      tick: currentTick,
      positions: new Map(world.entities.map((e) => [e.id, { x: e.x, y: e.y }])),
    };
    particles.update(0);
  };

  const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

  const drawEntity = (
    ctx: CanvasRenderingContext2D,
    world: World,
    entity: Entity,
    alpha: number,
    interpolate: boolean,
  ): number => {
    const characterId = KIND_TO_CHARACTER[entity.kind];
    const cached = previous?.positions.get(entity.id);
    const px = interpolate && cached !== undefined ? lerp(cached.x, entity.x, alpha) : entity.x;
    const py = interpolate && cached !== undefined ? lerp(cached.y, entity.y, alpha) : entity.y;

    const depth = depthFactor(world, py);
    const depthScale = lerp(manifest.arena.depth.scaleMin, manifest.arena.depth.scaleMax, depth);

    const sample = sampleSafely(entity, characterId);
    if (sample === undefined) return 0;

    const lift = (entity.props["lift"] ?? 0) * LIFT_PIXELS;
    const drawY = py - lift;
    const haze = mixColor(parseColor(manifest.arena.depth.tintFar), parseColor(manifest.arena.depth.tintNear), depth);
    const tintAlpha = haze.a * (reducedMotion ? 0 : 1);
    const tintColor = withAlpha({ r: haze.r, g: haze.g, b: haze.b }, 1);

    if (entity.kind === "player") {
      drawWaterbike(ctx, waterbike, {
        x: px,
        y: py,
        tilt: clampTilt(entity),
        speed: clamp01((entity.props["speed"] ?? 0) / PROP_SPEED_REFERENCE),
        facing: entity.facing,
        scale: depthScale,
        timeMs: world.timeMs,
        reducedMotion,
      });
    }

    drawSprite(ctx, atlas, {
      spriteId: sample.spriteId,
      x: px + sample.dx,
      y: drawY + sample.dy,
      flipX: flipFor(sample.spriteId, entity.facing),
      sx: sample.sx * entity.scale,
      sy: sample.sy * entity.scale,
      rot: sample.rot,
      alpha: sample.alpha * entity.alpha * HALF_LIFT_ALPHA + entity.alpha * (1 - HALF_LIFT_ALPHA),
      scale: depthScale,
      tintAlpha,
      tintColor,
    });

    return entity.kind === "shark" ? sharkDust(world, entity, px, py) : 0;
  };

  const sampleSafely = (entity: Entity, characterId: string) => {
    try {
      return sampleAnimation(manifest, characterId, entity.anim, entity.animMs);
    } catch (error) {
      if (isAnimationSampleError(error)) {
        if (entity.anim === "idle") return undefined;
        try {
          return sampleAnimation(manifest, characterId, "idle", entity.animMs);
        } catch {
          return undefined;
        }
      }
      throw error;
    }
  };

  const flipFor = (spriteId: string, facing: number): number => {
    const entry = atlas.has(spriteId) ? atlas.get(spriteId) : undefined;
    const authored = entry?.facing ?? "right";
    const artFacesLeft = authored.includes("left");
    const wantsLeft = facing < 0;
    return artFacesLeft === wantsLeft ? 1 : -1;
  };

  const clampTilt = (entity: Entity): number => {
    const drift = entity.props["drift"];
    if (typeof drift === "number" && Number.isFinite(drift)) {
      return drift < -MAX_TILT_RAD ? -MAX_TILT_RAD : drift > MAX_TILT_RAD ? MAX_TILT_RAD : drift;
    }
    const vx = entity.props["vx"] ?? 0;
    return clamp01((vx + PROP_SPEED_REFERENCE) / (PROP_SPEED_REFERENCE * 2)) * MAX_TILT_RAD * 2 - MAX_TILT_RAD;
  };

  const sharkDust = (world: World, entity: Entity, px: number, py: number): number => {
    const speed = entity.props["speed"] ?? PROP_SPEED_REFERENCE * 0.6;
    const intensity = clamp01(speed / PROP_SPEED_REFERENCE);
    const rate = intensity * (reducedMotion ? 0 : 26);
    const dt = world.timeMs - lastTimeMs;
    lastTimeMs = world.timeMs;
    if (dt <= 0) return rate;
    dustCarry = Math.min(dustCarry + (rate * dt) / 1000, 24);
    const whole = Math.floor(dustCarry);
    dustCarry -= whole;
    if (whole > 0) particles.emitStardust(px, py, whole, intensity);
    return 0;
  };

  let lastTimeMs = 0;

  const emitCosmeticBursts = (world: World, alpha: number): void => {
    emitForEvents();
    const stepped = world.timeMs + alpha;
    flash = flash > 0 ? flash * 0.86 : 0;
    if (stepped > lastTimeMs) lastTimeMs = stepped;
  };

  const paintFlash = (ctx: CanvasRenderingContext2D, timeMs: number): void => {
    if (flash <= 0.01) return;
    const level = quantizeFlash(flash, timeMs);
    if (level <= 0) return;
    const viewNow = view;
    if (viewNow === undefined) return;
    ctx.globalAlpha = level * 0.28;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(flashX, flashY, 46 * manifest.arena.fieldRadius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  return {
    render,
    resize: applyLayout,
    pushEvent: (event: GameEvent): void => {
      if (queued.length < 64) queued.push(event);
    },
    setReducedMotion: (value: boolean): void => {
      reducedMotion = value;
      particles.setReducedMotion(value);
    },
    reducedMotion: (): boolean => reducedMotion,
    particleCount: (): number => particles.count(),
    dispose: (): void => {
      particles.clear();
      queued.length = 0;
      previous = undefined;
    },
  };
}

/** Re-exported so the app can keep the flash rate in one place. */
export { MAX_FLASH_HZ };

function readStardustSpec(prop: ProceduralProp) {
  // Local import kept at the call site to avoid a cycle with particles.ts.
  return readStardustFromProp(prop);
}

import { readStardust as readStardustFromProp } from "./particles";