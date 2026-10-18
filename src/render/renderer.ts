// Arena renderer. Reads the world, draws a frame, mutates nothing.
//
// The canvas internal buffer is the viewport preset's logical size, which is
// not the 1408x768 arena box. So every frame maps the arena box into the canvas
// with a contain fit (`computeArenaView`) and draws in arena coordinates inside
// that transform. Because the fit is always contain, the whole arena is on
// screen at every preset, and the play band is therefore always fully visible.
//
// Rules: this file holds none. It reads positions, the animation name and the
// handful of `entity.props` scratch numbers the sim already publishes, and it
// never writes to the world or its entities.

import { sampleAnimation, isAnimationSampleError } from "../assets/animation";
import type { Atlas } from "../assets/atlas";
import { pickBackground } from "../assets/backgrounds";
import type { BackgroundChoice } from "../assets/backgrounds";
import type { DecodedImage } from "../assets/loader";
import type { Manifest, ProceduralProp } from "../assets/manifest-types";
import type { Entity, GameEvent, World } from "../sim/types";
import {
  clamp01,
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
import { MAX_FLASH_HZ, createFlashLimiter, createParticleSystem, readStardust } from "./particles";
import type { ParticleSystem } from "./particles";
import type { Layout, Size } from "./viewport";

/** Which manifest character draws a given sim entity kind. */
export const KIND_TO_CHARACTER: Readonly<Record<Entity["kind"], string>> = {
  player: "capybara",
  orca: "orca",
  shark: "shark",
  tarantula: "tarantula",
  snail: "snail",
  human: "human",
};

/** Pixels per 0.1 of jump lift. `y` is depth, so a jump is drawn as a lift. */
export const LIFT_PIXELS = 44;

/**
 * Reference speed for prop effects, in the units of `entity.props.vx`.
 * Display only: the renderer never reads the sim movement constants.
 */
export const PROP_SPEED_REFERENCE = 260;

/** Maximum hull tilt in radians, so the bike never looks broken. */
export const MAX_TILT_RAD = 0.28;

/** Radius of the localized hit flash, in arena pixels. */
export const HIT_FLASH_RADIUS = 64;

/** Flat fill used when no background image is available. */
export const FALLBACK_BACKGROUND_COLOR = "#0b1024";

/** Longest cosmetic delta a single frame may advance the particle pool. */
const MAX_PARTICLE_STEP_MS = 50;

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
 * Cover is fine here because the background is art, not a coordinate space: it
 * must never leave a gap, and nothing is positioned in canvas coordinates.
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
  return { x: (boxW - w) * clamp01(focalX), y: (boxH - h) * clamp01(focalY), w, h };
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
  /** Uniform depth multiplier, applied through the context transform. */
  readonly scale: number;
  /** Haze alpha in [0, 1]. Zero means no haze. */
  readonly tintAlpha: number;
  readonly tintColor: string;
}

/**
 * Draw one sprite frame: anchored, rotated, flipped and hazed.
 *
 * The nine argument `drawImage` form keeps the source rect and the destination
 * rect explicit, which is what the unit tests assert on. `scale` is applied
 * through the transform, never by resizing the destination rect, so the rect
 * stays exactly `drawSize` for every sprite at scale 1.
 */
export function drawSprite(ctx: CanvasRenderingContext2D, atlas: Atlas, draw: SpriteDraw): void {
  if (!atlas.has(draw.spriteId)) return;
  const entry = atlas.get(draw.spriteId);
  const w = entry.drawSize.w;
  const h = entry.drawSize.h;
  const kx = draw.flipX * draw.sx * draw.scale;
  const ky = draw.sy * draw.scale;

  ctx.save();
  ctx.translate(draw.x, draw.y);
  ctx.scale(kx, ky);
  ctx.rotate(draw.rot);
  ctx.globalAlpha = clamp01(draw.alpha);
  ctx.drawImage(entry.bitmap, 0, 0, entry.tile.w, entry.tile.h, -entry.anchor.x * w, -entry.anchor.y * h, w, h);
  ctx.restore();

  // Haze veil over the drawn box. Every pose rotates only slightly, so an axis
  // aligned rect keeps the veil cheap and free of transform bookkeeping.
  if (draw.tintAlpha > 0.002) {
    const boxW = Math.abs(w * kx);
    const boxH = Math.abs(h * ky);
    const left = kx < 0 ? draw.x + (1 - entry.anchor.x) * w * kx : draw.x - entry.anchor.x * w * kx;
    const top = ky < 0 ? draw.y + (1 - entry.anchor.y) * h * ky : draw.y - entry.anchor.y * h * ky;
    ctx.save();
    ctx.globalAlpha = clamp01(draw.tintAlpha);
    ctx.fillStyle = draw.tintColor;
    ctx.fillRect(left, top, boxW, boxH);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export interface RendererOptions {
  /**
   * Decoded background images keyed by manifest background id. Optional so the
   * two argument `createRenderer(manifest, atlas)` call still works; without it
   * the renderer paints a flat colour instead of the arena art.
   */
  readonly backgrounds?: ReadonlyMap<string, DecodedImage> | undefined;
  /** Initial reduced motion state. `setReducedMotion` changes it later. */
  readonly reducedMotion?: boolean | undefined;
  /** Cosmetic seed. The first rendered world seed overrides it. */
  readonly seed?: number | undefined;
}

export interface Renderer {
  render(ctx: CanvasRenderingContext2D, world: World, layout: Layout, alpha: number): void;
  resize(layout: Layout): void;
  /** Queue one cosmetic one shot. The app drains `world.events`, not this. */
  pushEvent(event: GameEvent): void;
  setReducedMotion(reduced: boolean): void;
  reducedMotion(): boolean;
  /** Live particle count, for the debug overlay and the tests. */
  particleCount(): number;
  dispose(): void;
}

const findProp = (manifest: Manifest, id: string): ProceduralProp | undefined =>
  manifest.proceduralProps.find((prop) => prop.id === id);

interface BackgroundSlot {
  readonly choice: BackgroundChoice;
  readonly image: DecodedImage | undefined;
}

interface PreviousFrame {
  readonly tick: number;
  readonly positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>;
}

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

const clampTilt = (value: number): number =>
  value < -MAX_TILT_RAD ? -MAX_TILT_RAD : value > MAX_TILT_RAD ? MAX_TILT_RAD : value;

export function createRenderer(
  manifest: Manifest,
  atlas: Atlas,
  options: RendererOptions = {},
): Renderer {
  const waterbike: WaterbikeSpec = readWaterbike(findProp(manifest, "waterbike"));
  const timeField: TimeFieldSpec = readTimeField(findProp(manifest, "time-field"));
  const crystals: CrystalSpec = readCrystalGlow(findProp(manifest, "crystal-glow"));
  const stardust = readStardust(findProp(manifest, "stardust"));
  const farTint = parseColor(manifest.arena.depth.tintFar);
  const nearTint = parseColor(manifest.arena.depth.tintNear);

  let view: ArenaView | undefined;
  let reducedMotion = options.reducedMotion ?? false;
  let seed = options.seed ?? 0;
  let seedKnown = options.seed !== undefined;
  let particles: ParticleSystem = createParticleSystem(seed, { stardust, reducedMotion });

  const backgroundSlots = new Map<string, BackgroundSlot>();
  const queued: GameEvent[] = [];
  let previous: PreviousFrame | undefined;
  let lastTimeMs = 0;
  let dustCarry = 0;
  let flash = 0;
  let flashX = 0;
  let flashY = 0;
  const flashLimiter = createFlashLimiter();

  const applyLayout = (layout: Layout): void => {
    view = computeArenaView(manifest.arena.logical, layout.logical);
  };

  const ensureSeed = (world: World): void => {
    if (seedKnown && world.seed === seed) return;
    seed = world.seed;
    seedKnown = true;
    particles = createParticleSystem(seed, { stardust, reducedMotion });
    dustCarry = 0;
  };

  const backgroundFor = (presetId: string): BackgroundSlot => {
    const cached = backgroundSlots.get(presetId);
    if (cached !== undefined) return cached;
    const choice = pickBackground(manifest, manifest.arena.background, presetId);
    const slot: BackgroundSlot = { choice, image: options.backgrounds?.get(choice.id) };
    backgroundSlots.set(presetId, slot);
    return slot;
  };

  const paintBackground = (ctx: CanvasRenderingContext2D, layout: Layout): void => {
    const slot = backgroundFor(layout.preset.id);
    const image = slot.image;
    if (image === undefined) {
      ctx.fillStyle = FALLBACK_BACKGROUND_COLOR;
      ctx.fillRect(0, 0, layout.logical.w, layout.logical.h);
      return;
    }
    const rect = coverFit(
      image.width,
      image.height,
      layout.logical.w,
      layout.logical.h,
      slot.choice.focalX,
      slot.choice.focalY,
    );
    ctx.drawImage(image.source, rect.x, rect.y, rect.w, rect.h);
  };

  /** Sample the entity animation, falling back to `idle` on a bad name. */
  const sampleSafely = (
    entity: Entity,
    characterId: string,
  ): ReturnType<typeof sampleAnimation> | undefined => {
    try {
      return sampleAnimation(manifest, characterId, entity.anim, entity.animMs);
    } catch (error) {
      if (!isAnimationSampleError(error) || entity.anim === "idle") return undefined;
      try {
        return sampleAnimation(manifest, characterId, "idle", entity.animMs);
      } catch {
        return undefined;
      }
    }
  };

  /** -1 when the art has to be mirrored to match the entity facing. */
  const flipFor = (spriteId: string, facing: number): number => {
    const authored = atlas.has(spriteId) ? atlas.get(spriteId).facing : "right";
    const artFacesLeft = authored.includes("left");
    return artFacesLeft === facing < 0 ? 1 : -1;
  };

  /** Hull tilt: an explicit `drift` prop wins, else it follows vx. */
  const tiltFor = (entity: Entity): number => {
    const drift = entity.props["drift"];
    if (typeof drift === "number" && Number.isFinite(drift)) return clampTilt(drift);
    const vx = entity.props["vx"] ?? 0;
    return clampTilt((clamp01((vx + PROP_SPEED_REFERENCE) / (PROP_SPEED_REFERENCE * 2)) * 2 - 1) * MAX_TILT_RAD);
  };

  const emitStardustTrail = (world: World, entity: Entity, x: number, y: number): void => {
    const intensity = clamp01((entity.props["speed"] ?? PROP_SPEED_REFERENCE * 0.6) / PROP_SPEED_REFERENCE);
    const rate = reducedMotion ? 0 : 26 * intensity;
    const step = Math.min(MAX_PARTICLE_STEP_MS, Math.max(0, world.timeMs - lastTimeMs));
    dustCarry = Math.min(dustCarry + (rate * step) / 1000, 24);
    const whole = Math.floor(dustCarry);
    dustCarry -= whole;
    if (whole > 0) particles.emitStardust(x, y, whole, intensity);
  };

  const drawEntity = (
    ctx: CanvasRenderingContext2D,
    world: World,
    entity: Entity,
    alpha: number,
    interpolate: boolean,
  ): void => {
    const characterId = KIND_TO_CHARACTER[entity.kind];
    const sample = sampleSafely(entity, characterId);
    if (sample === undefined) return;

    const cached = previous?.positions.get(entity.id);
    const px = interpolate && cached !== undefined ? lerp(cached.x, entity.x, alpha) : entity.x;
    const py = interpolate && cached !== undefined ? lerp(cached.y, entity.y, alpha) : entity.y;

    const depth = depthFactor(world, py);
    const depthScale = lerp(manifest.arena.depth.scaleMin, manifest.arena.depth.scaleMax, depth);
    const haze = mixColor(farTint, nearTint, depth);

    if (entity.kind === "player") {
      drawWaterbike(ctx, waterbike, {
        x: px,
        y: py,
        tilt: tiltFor(entity),
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
      y: py - (entity.props["lift"] ?? 0) * LIFT_PIXELS + sample.dy,
      flipX: flipFor(sample.spriteId, entity.facing),
      sx: sample.sx * entity.scale,
      sy: sample.sy * entity.scale,
      rot: sample.rot,
      alpha: sample.alpha * entity.alpha,
      scale: depthScale,
      tintAlpha: reducedMotion ? 0 : haze.a,
      tintColor: withAlpha(haze, 1),
    });

    if (entity.kind === "shark") emitStardustTrail(world, entity, px, py);
  };

  const drainEvents = (): void => {
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

  /** Localized flash, rate limited to MAX_FLASH_HZ changes per second. */
  const paintFlash = (ctx: CanvasRenderingContext2D, timeMs: number): void => {
    if (flash <= 0.02) return;
    const level = flashLimiter.push(flash, timeMs);
    if (level <= 0) return;
    ctx.globalAlpha = level * 0.28;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(flashX, flashY, HIT_FLASH_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  const render = (ctx: CanvasRenderingContext2D, world: World, layout: Layout, alpha: number): void => {
    ensureSeed(world);
    if (view === undefined) applyLayout(layout);
    const arenaView = view;
    if (arenaView === undefined) return;

    const t = Number.isFinite(alpha) ? (alpha < 0 ? 0 : alpha > 1 ? 1 : alpha) : 1;
    const interpolate = previous !== undefined && previous.tick === world.tick - 1;

    paintBackground(ctx, layout);

    ctx.save();
    ctx.translate(arenaView.offsetX, arenaView.offsetY);
    ctx.scale(arenaView.scale, arenaView.scale);

    // Shore props sit behind everything: they are on the shore, not in the water.
    drawCrystalGlows(ctx, crystals, world.timeMs, reducedMotion);

    const snail = world.entities.find((entity) => entity.kind === "snail");
    if (snail !== undefined) {
      drawTimeField(ctx, timeField, snail.x, snail.y, world.timeMs, reducedMotion);
    }

    const ordered = world.entities
      .map((entity, index) => ({ entity, index }))
      .sort((a, b) => (a.entity.y === b.entity.y ? a.index - b.index : a.entity.y - b.entity.y));
    for (const entry of ordered) drawEntity(ctx, world, entry.entity, t, interpolate);

    drainEvents();
    particles.draw(ctx);
    paintFlash(ctx, world.timeMs);
    ctx.restore();

    const step = Math.min(MAX_PARTICLE_STEP_MS, Math.max(0, world.timeMs - lastTimeMs));
    particles.update(step);
    lastTimeMs = world.timeMs;
    flash = flash > 0 ? flash * 0.82 : 0;
    previous = {
      tick: world.tick,
      positions: new Map(world.entities.map((entity) => [entity.id, { x: entity.x, y: entity.y }])),
    };
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

export { MAX_FLASH_HZ };