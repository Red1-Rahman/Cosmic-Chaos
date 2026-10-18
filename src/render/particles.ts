// Cosmetic particle system. Presentation only: it owns short lived sparks,
// stardust and splash rings, and nothing else.
//
// Randomness comes exclusively from `createRng(seed).fork("cosmetic")`, so the
// whole system is reproducible for a given seed and never touches the gameplay
// stream. Math.random is banned by the lint config and is not used here.
//
// The system never reads a clock and never mutates the world. The renderer hands
// it a delta in milliseconds per frame.

import type { ProceduralProp } from "../assets/manifest-types";
import { createRng } from "../util/rng";
import type { Rng } from "../util/rng";

/** Hard cap on how fast any full screen flash may change. WCAG style. */
export const MAX_FLASH_HZ = 3;

/** Length of one flash step in milliseconds. */
export const FLASH_STEP_MS = 1000 / MAX_FLASH_HZ;

export const TAU = Math.PI * 2;

/** Discrete bucket of `timeMs`. Changes at most `MAX_FLASH_HZ` times a second. */
export function flashStep(timeMs: number): number {
  if (!Number.isFinite(timeMs)) return 0;
  return Math.floor(Math.max(0, timeMs) / FLASH_STEP_MS);
}

/**
 * Snap a flash strength to a small set of levels. A flash therefore only takes
 * `MAX_FLASH_HZ + 1` distinct values, and `createFlashLimiter` holds each one
 * for a whole flash step, so the value can change at most `MAX_FLASH_HZ` times
 * per second no matter how the underlying signal moves.
 */
export function quantizeFlash(alpha: number): number {
  const clamped = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  const step = Math.round(clamped * MAX_FLASH_HZ) / MAX_FLASH_HZ;
  return step < 0 ? 0 : step;
}

export interface FlashLimiter {
  /** Level to draw this frame. Constant inside a flash step. */
  push(alpha: number, timeMs: number): number;
  reset(): void;
}

/**
 * Rate limiter for flashes. Holds the previous quantized level until the next
 * flash step begins, which caps the change rate at `MAX_FLASH_HZ` per second.
 */
export function createFlashLimiter(): FlashLimiter {
  let step = -1;
  let level = 0;
  return {
    push(alpha: number, timeMs: number): number {
      const next = flashStep(timeMs);
      if (next !== step) {
        step = next;
        level = quantizeFlash(alpha);
      }
      return level;
    },
    reset(): void {
      step = -1;
      level = 0;
    },
  };
}

/** Colours used for hit sparks. Cosmetic only, no manifest entry exists. */
export const SPARK_COLORS = ["#ffffff", "#9fe8ff", "#ffd27f"] as const;

/** Colour of the expanding splash ring. Mirrors the waterbike wake hue. */
export const SPLASH_COLOR = "#bfe9ff";

export type ParticleKind = "spark" | "dust" | "ring";

export interface Particle {
  readonly kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Remaining life in milliseconds. */
  life: number;
  readonly maxLife: number;
  readonly size: number;
  readonly color: string;
  /** Exponential velocity damping per second. */
  readonly drag: number;
}

export interface StardustSpec {
  readonly count: number;
  readonly lifeMs: number;
  readonly size: number;
  readonly colors: readonly string[];
}

/** Used when the manifest has no stardust prop. Mirrors the shipped values. */
export const DEFAULT_STARDUST: StardustSpec = {
  count: 26,
  lifeMs: 520,
  size: 3,
  colors: ["#b98bff", "#7fe8ff", "#ffffff"],
};

/** Read the `stardust` prop out of the manifest, with a safe fallback. */
export function readStardust(prop: ProceduralProp | undefined): StardustSpec {
  if (prop === undefined) return DEFAULT_STARDUST;
  const colors = Array.isArray(prop.colors) ? prop.colors : DEFAULT_STARDUST.colors;
  return {
    count: prop.count ?? DEFAULT_STARDUST.count,
    lifeMs: prop.lifeMs ?? DEFAULT_STARDUST.lifeMs,
    size: prop.size ?? DEFAULT_STARDUST.size,
    colors: colors.length > 0 ? colors : DEFAULT_STARDUST.colors,
  };
}

export interface ParticleSystemOptions {
  readonly stardust?: StardustSpec;
  readonly reducedMotion?: boolean;
  /** Safety valve so a burst storm cannot grow the pool forever. */
  readonly maxParticles?: number;
}

export interface ParticleSystem {
  /** Trail dust behind the shark. `count` is damped by reduced motion. */
  emitStardust(x: number, y: number, count: number, intensity: number): void;
  /** One shot burst from a `hit` event. */
  emitSparks(x: number, y: number, count: number, power: number): void;
  /** Expanding ring from a `splash` event. */
  emitSplashRing(x: number, y: number, power: number): void;
  /** Small forward ping from a `laser` event. */
  emitPing(x: number, y: number, dirX: number, dirY: number): void;
  /** Advance every particle by `dtMs`. */
  update(dtMs: number): void;
  /** Draw in arena coordinates. The caller owns the transform. */
  draw(ctx: CanvasRenderingContext2D): void;
  clear(): void;
  /** Live particle count. Cheap enough to call from the debug overlay. */
  count(): number;
  setReducedMotion(reduced: boolean): void;
  reducedMotion(): boolean;
}

const DEFAULT_MAX_PARTICLES = 480;

export function createParticleSystem(
  seed: number,
  options: ParticleSystemOptions = {},
): ParticleSystem {
  // Cosmetic stream. Forked from the caller seed so gameplay draws are
  // unaffected by how many particles the presentation layer happens to spawn.
  const rng: Rng = createRng(seed).fork("cosmetic");
  const stardust = options.stardust ?? DEFAULT_STARDUST;
  const maxParticles = options.maxParticles ?? DEFAULT_MAX_PARTICLES;
  const particles: Particle[] = [];
  let reduced = options.reducedMotion ?? false;

  const motion = (): number => (reduced ? 0 : 1);
  const scaleCount = (count: number): number => Math.max(0, Math.round(count * motion()));

  const push = (particle: Particle): void => {
    if (particles.length >= maxParticles) return;
    particles.push(particle);
  };

  const emitStardust = (x: number, y: number, count: number, intensity: number): void => {
    const total = scaleCount(count);
    const power = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
    for (let i = 0; i < total; i += 1) {
      const angle = rng.range(0, TAU);
      const speed = rng.range(6, 46) * (0.4 + power);
      push({
        kind: "dust",
        x: x + rng.range(-4, 4),
        y: y + rng.range(-4, 4),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.5,
        life: stardust.lifeMs * rng.range(0.7, 1),
        maxLife: stardust.lifeMs,
        size: stardust.size,
        color: rng.pick(stardust.colors),
        drag: 2.6,
      });
    }
  };

  const emitSparks = (x: number, y: number, count: number, power: number): void => {
    const total = scaleCount(count);
    const strength = power < 0 ? 0 : power > 1 ? 1 : power;
    for (let i = 0; i < total; i += 1) {
      const angle = rng.range(0, TAU);
      const speed = rng.range(60, 210) * (0.4 + strength);
      push({
        kind: "spark",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.7,
        life: rng.range(180, 420),
        maxLife: 420,
        size: rng.range(2, 4),
        color: rng.pick(SPARK_COLORS),
        drag: 4.2,
      });
    }
  };

  const emitSplashRing = (x: number, y: number, power: number): void => {
    if (motion() === 0) return;
    const strength = power < 0 ? 0 : power > 1 ? 1 : power;
    const life = 320 + strength * 260;
    push({
      kind: "ring",
      x,
      y,
      vx: 0,
      vy: 0,
      life,
      maxLife: life,
      size: 6 + strength * 8,
      color: SPLASH_COLOR,
      drag: 0,
    });
    emitSparks(x, y, Math.round(4 + strength * 6), strength * 0.6);
  };

  const emitPing = (x: number, y: number, dirX: number, dirY: number): void => {
    const total = scaleCount(3);
    const len = Math.sqrt(dirX * dirX + dirY * dirY);
    const ux = len > 0 ? dirX / len : 1;
    const uy = len > 0 ? dirY / len : 0;
    for (let i = 0; i < total; i += 1) {
      push({
        kind: "spark",
        x: x + ux * 10,
        y: y + uy * 10,
        vx: ux * rng.range(120, 260),
        vy: uy * rng.range(120, 260) - 20,
        life: rng.range(120, 260),
        maxLife: 260,
        size: rng.range(2, 3),
        color: rng.pick(SPARK_COLORS),
        drag: 5,
      });
    }
  };

  const update = (dtMs: number): void => {
    if (!Number.isFinite(dtMs) || dtMs <= 0) return;
    const seconds = dtMs / 1000;
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      if (particle === undefined) continue;
      particle.life -= dtMs;
      if (particle.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      if (particle.drag > 0) {
        const damp = Math.exp(-particle.drag * seconds);
        particle.vx *= damp;
        particle.vy *= damp;
      }
      particle.x += particle.vx * seconds;
      particle.y += particle.vy * seconds;
    }
  };

  const draw = (ctx: CanvasRenderingContext2D): void => {
    for (const particle of particles) {
      const ratio = particle.maxLife > 0 ? particle.life / particle.maxLife : 0;
      if (ratio <= 0) continue;
      if (particle.kind === "ring") {
        const radius = particle.size * (1 + (1 - ratio) * 2.4);
        ctx.globalAlpha = ratio * 0.8;
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius, 0, TAU);
        ctx.stroke();
        continue;
      }
      ctx.globalAlpha = ratio;
      ctx.fillStyle = particle.color;
      const size = Math.max(1, particle.size * ratio);
      ctx.fillRect(particle.x - size / 2, particle.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  };

  return {
    emitStardust,
    emitSparks,
    emitSplashRing,
    emitPing,
    update,
    draw,
    clear: (): void => {
      particles.length = 0;
    },
    count: (): number => particles.length,
    setReducedMotion: (value: boolean): void => {
      reduced = value;
    },
    reducedMotion: (): boolean => reduced,
  };
}
