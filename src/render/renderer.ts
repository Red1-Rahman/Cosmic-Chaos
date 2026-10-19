// Arena renderer. Reads the world, draws a frame, mutates nothing.
//
// The canvas internal buffer is the viewport preset's logical size, which is
// not the 1408x768 arena box. Every frame maps the arena box into the canvas
// with a camera transform (`computeArenaView`) and draws in arena coordinates
// inside it. The camera zooms onto the play band instead of contain fitting
// the whole arena: the scale never drops below cover (so the arena always
// fills the canvas, never a gap), the play band keeps at least 45% of the
// canvas height wherever the width allows it, and the focus follows the
// player horizontally, clamped so the art edges stay on screen. Without a
// player the focus rests on the band centre.
//
// The background is art rather than a coordinate space, but it is drawn inside
// the same transform, cover fitted to the arena box: it then pans with the
// camera, and the clamped offsets keep it full bleed at every preset.
//
// Rules: this file holds none. It reads positions, the animation name and the
// handful of `entity.props` scratch numbers the sim already publishes, and it
// never writes to the world or its entities.

import { sampleAnimation, isAnimationSampleError } from "../assets/animation";
import type { Atlas } from "../assets/atlas";
import { pickBackground } from "../assets/backgrounds";
import type { BackgroundChoice } from "../assets/backgrounds";
import type { DecodedImage } from "../assets/loader";
import type { Manifest, PlayBand, ProceduralProp } from "../assets/manifest-types";
import type { Entity, GameEvent, World } from "../sim/types";
import {
  clamp01,
  drawCores,
  drawCrystalGlows,
  drawDodgeEcho as drawDodgeEchoProp,
  drawObstacles,
  drawParryShield,
  drawPellets,
  drawTimeField,
  drawWaterbike,
  readCrystalGlow,
  readTimeField,
  readWaterbike,
} from "./props";
import type { CrystalSpec, TimeFieldSpec, WaterbikeSpec } from "./props";
import { CORE_COLORS, PARRY_COLORS } from "./props";
import { MAX_FLASH_HZ, createFlashLimiter, createParticleSystem, readStardust } from "./particles";
import type { ParticleSystem } from "./particles";
import { SPLASH_COLOR as SPLASH_TINT } from "./particles";
import { CORES, DODGE, PARRY } from "../sim/game-config";
import { levelById } from "../sim/levels";
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

/** Streak drawn behind a rider that is mid dodge. */
const drawDodgeEcho = (
  ctx: CanvasRenderingContext2D,
  player: Entity,
  reducedMotion: boolean,
): void => {
  if (reducedMotion) return;
  const burst = player.props["dodgeBurstMs"] ?? 0;
  if (burst <= 0) return;
  const scale = clamp01((player.props["speed"] ?? 0) / PROP_SPEED_REFERENCE) * 0.6 + 0.4;
  drawDodgeEchoProp(
    ctx,
    player.x,
    player.y,
    player.props["dodgeDirX"] ?? player.facing,
    player.props["dodgeDirY"] ?? 0,
    burst / DODGE.burstMs,
    scale,
  );
};

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

/** Share of the canvas height the play band fills, when the width cap allows it. */
export const BAND_HEIGHT_FILL = 0.45;

/** Share of the canvas width that stays on the band once the width cap bites. */
export const BAND_WIDTH_KEEP = 0.65;

/** Where the band centre sits on the canvas, as a share of the canvas height. */
export const BAND_ANCHOR_Y = 0.6;

/** Keep a value inside [min, max] whichever order the bounds arrive in. */
const clampTo = (value: number, min: number, max: number): number =>
  min <= max ? Math.min(Math.max(value, min), max) : Math.min(Math.max(value, max), min);

/**
 * The camera: arena box mapped into the canvas box, zoomed onto the play band.
 *
 * The scale never drops below cover, so the arena always fills the canvas and
 * the background can never leave a gap. Above cover it grows until the band
 * holds `BAND_HEIGHT_FILL` of the canvas height, capped so at least
 * `BAND_WIDTH_KEEP` of the band's width stays visible. Offsets are clamped to
 * the arena edges, which keeps coverage true at any scale: horizontal focus is
 * the player (`focusX`), or the band centre without one, vertical is fixed on
 * the band at `BAND_ANCHOR_Y`.
 */
export function computeArenaView(
  arena: Size,
  logical: Size,
  band: PlayBand,
  focusX?: number,
): ArenaView {
  const cover = Math.max(logical.w / arena.w, logical.h / arena.h);
  const bandW = Math.max(1, band.maxX - band.minX);
  const bandH = Math.max(1, band.maxY - band.minY);
  const desired = (BAND_HEIGHT_FILL * logical.h) / bandH;
  const widthCap = logical.w / (bandW * BAND_WIDTH_KEEP);
  const scale = Math.max(cover, Math.min(desired, widthCap));

  const focus = focusX ?? (band.minX + band.maxX) / 2;
  const bandMidY = (band.minY + band.maxY) / 2;
  const offsetX = clampTo(logical.w / 2 - focus * scale, logical.w - arena.w * scale, 0);
  const offsetY = clampTo(
    logical.h * BAND_ANCHOR_Y - bandMidY * scale,
    logical.h - arena.h * scale,
    0,
  );
  return {
    scale,
    offsetX,
    offsetY,
    width: arena.w * scale,
    height: arena.h * scale,
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
}

/**
 * Draw one sprite frame: anchored, rotated, flipped and depth scaled.
 *
 * The nine argument `drawImage` form keeps the source rect and the destination
 * rect declared, which is what the unit tests assert on. `scale` is applied
 * through the transform, never by resizing the destination rect, so the rect
 * stays exactly `drawSize` for every sprite at scale 1. Depth reads from that
 * scale alone: there is no per entity haze veil, because a fill over the sprite
 * bounding box shows up as a rectangle in the sky.
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
  ctx.drawImage(
    entry.bitmap,
    0,
    0,
    entry.tile.w,
    entry.tile.h,
    -entry.anchor.x * w,
    -entry.anchor.y * h,
    w,
    h,
  );
  ctx.restore();
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

  /**
   * The camera's horizontal focus: the player's x, interpolated between ticks
   * exactly like its sprite, or undefined so the view rests on the band centre.
   */
  const focusXFor = (
    player: Entity | undefined,
    t: number,
    interpolate: boolean,
  ): number | undefined => {
    if (player === undefined) return undefined;
    if (!interpolate || previous === undefined) return player.x;
    const cached = previous.positions.get(player.id);
    return cached === undefined ? player.x : lerp(cached.x, player.x, t);
  };

  const ensureSeed = (world: World): void => {
    if (seedKnown && world.seed === seed) return;
    seed = world.seed;
    seedKnown = true;
    particles = createParticleSystem(seed, { stardust, reducedMotion });
    dustCarry = 0;
  };

  const backgroundFor = (backgroundId: string, presetId: string): BackgroundSlot => {
    const cacheKey = `${backgroundId}|${presetId}`;
    const cached = backgroundSlots.get(cacheKey);
    if (cached !== undefined) return cached;
    const choice = pickBackground(manifest, backgroundId, presetId);
    const slot: BackgroundSlot = { choice, image: options.backgrounds?.get(choice.id) };
    backgroundSlots.set(cacheKey, slot);
    return slot;
  };

  const paintBackground = (ctx: CanvasRenderingContext2D, world: World, layout: Layout): void => {
    // Minimal renderer fixture worlds have no objective book and represent the
    // manifest default rather than a playable campaign level.
    const backgroundId =
      world.objectives.length === 0
        ? manifest.arena.background
        : levelById(world.levelId).backgroundId;
    const slot = backgroundFor(backgroundId, layout.preset.id);
    const arena = manifest.arena.logical;
    const image = slot.image;
    // Painted inside the camera transform, in arena coordinates: the rect
    // cover fits the arena box, and the clamped camera offsets keep that box
    // over the whole canvas at every preset, so there is never a gap.
    if (image === undefined) {
      ctx.fillStyle = FALLBACK_BACKGROUND_COLOR;
      ctx.fillRect(0, 0, arena.w, arena.h);
      return;
    }
    const rect = coverFit(
      image.width,
      image.height,
      arena.w,
      arena.h,
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

  /** Hull tilt: a declared `drift` prop wins, else it follows vx. */
  const tiltFor = (entity: Entity): number => {
    const drift = entity.props["drift"];
    if (typeof drift === "number" && Number.isFinite(drift)) return clampTilt(drift);
    const vx = entity.props["vx"] ?? 0;
    return clampTilt(
      (clamp01((vx + PROP_SPEED_REFERENCE) / (PROP_SPEED_REFERENCE * 2)) * 2 - 1) * MAX_TILT_RAD,
    );
  };

  const emitStardustTrail = (world: World, entity: Entity, x: number, y: number): void => {
    const intensity = clamp01(
      (entity.props["speed"] ?? PROP_SPEED_REFERENCE * 0.6) / PROP_SPEED_REFERENCE,
    );
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
        case "collect":
          particles.emitRing(event.x, event.y, 26, CORE_COLORS.glow, 380);
          particles.emitSparks(event.x, event.y, 8, 0.5);
          break;
        case "stagger":
          particles.emitSparks(event.x, event.y, 20, 0.9);
          particles.emitRing(event.x, event.y, 44, CORE_COLORS.edge, 460);
          break;
        case "parrySuccess":
          particles.emitRing(event.x, event.y, 62, PARRY_COLORS.ring, 420);
          particles.emitSparks(event.x, event.y, 16, 0.7);
          flash = Math.max(flash, 0.35);
          flashX = event.x;
          flashY = event.y;
          break;
        case "dodge":
          particles.emitRing(event.x, event.y, 34, SPLASH_TINT, 300);
          break;
        case "blocked":
          particles.emitSparks(event.x, event.y, 5, 0.3);
          break;
        case "victory":
          particles.emitRing(event.x, event.y, 120, CORE_COLORS.body, 900);
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

  const render = (
    ctx: CanvasRenderingContext2D,
    world: World,
    layout: Layout,
    alpha: number,
  ): void => {
    ensureSeed(world);

    const t = Number.isFinite(alpha) ? (alpha < 0 ? 0 : alpha > 1 ? 1 : alpha) : 1;
    const interpolate = previous !== undefined && previous.tick === world.tick - 1;
    const player = world.entities.find((entity) => entity.kind === "player");
    // The camera is rebuilt every frame: its focus moves with the player, and
    // a preset change lands on the very next frame even without a resize.
    const arenaView = computeArenaView(
      manifest.arena.logical,
      layout.logical,
      manifest.arena.playBand,
      focusXFor(player, t, interpolate),
    );

    ctx.save();
    ctx.translate(arenaView.offsetX, arenaView.offsetY);
    ctx.scale(arenaView.scale, arenaView.scale);

    paintBackground(ctx, world, layout);

    // Shore props sit behind everything: they are on the shore, not in the water.
    drawCrystalGlows(ctx, crystals, world.timeMs, reducedMotion);

    // Level geometry sits in the water, behind everything that swims in it.
    drawObstacles(ctx, world.obstacles, world.timeMs, reducedMotion);

    const snail = world.entities.find((entity) => entity.kind === "snail");
    if (snail !== undefined) {
      drawTimeField(ctx, timeField, snail.x, snail.y, world.timeMs, reducedMotion);
    }

    drawCores(ctx, world.cores, CORES.radius, world.timeMs, reducedMotion);

    if (player !== undefined) {
      const window = player.props["parryWindowMs"] ?? 0;
      if (window > 0) {
        drawParryShield(ctx, player.x, player.y, window, PARRY.windowMs, PARRY.radius);
      }
      drawDodgeEcho(ctx, player, reducedMotion);
    }

    const ordered = world.entities
      .map((entity, index) => ({ entity, index }))
      .sort((a, b) => (a.entity.y === b.entity.y ? a.index - b.index : a.entity.y - b.entity.y));
    for (const entry of ordered) drawEntity(ctx, world, entry.entity, t, interpolate);

    drawPellets(ctx, world.pellets);
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
    resize: (_layout: Layout): void => {
      // Nothing to cache: the camera view is rebuilt every frame because its
      // focus follows the player, and the viewport owns the canvas buffer.
      // The hook stays so the app has one clear layout signal.
    },
    pushEvent: (event: GameEvent): void => {
      if (queued.length < 64) queued.push(event);
    },
    setReducedMotion: (value: boolean): void => {
      reducedMotion = value;
      particles.setReducedMotion(value);
      // Reduced motion means near zero motion, so anything already in flight
      // is dropped rather than animated out.
      if (value) particles.clear();
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
