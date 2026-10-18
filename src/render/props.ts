// Procedural props. Every shape in `manifest.proceduralProps` that has no art
// is drawn here with plain Canvas 2D paths, using only the values the manifest
// declares. Nothing in this file reads a clock, uses randomness or imports the
// sim: the caller passes positions, timings and reduced motion in.
//
// Geometry helpers are pure so the renderer and the unit tests share one
// implementation of, say, the time field radius.

import type { ProceduralProp, Vec2 } from "../assets/manifest-types";
import { TAU } from "./particles";

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_FN = /^rgba?\(([^)]+)\)$/i;

/** Parse `#rgb`, `#rrggbb`, `rgb(...)` and `rgba(...)`. Opaque black if invalid. */
export function parseColor(color: string): Rgba {
  const hex6 = HEX6.exec(color);
  if (hex6 !== null) {
    return {
      r: Number.parseInt(hex6[1] ?? "0", 16),
      g: Number.parseInt(hex6[2] ?? "0", 16),
      b: Number.parseInt(hex6[3] ?? "0", 16),
      a: 1,
    };
  }
  const hex3 = HEX3.exec(color);
  if (hex3 !== null) {
    const r = Number.parseInt(hex3[1] ?? "0", 16) * 17;
    const g = Number.parseInt(hex3[2] ?? "0", 16) * 17;
    const b = Number.parseInt(hex3[3] ?? "0", 16) * 17;
    return { r, g, b, a: 1 };
  }
  const fn = RGB_FN.exec(color);
  if (fn !== null) {
    const parts = (fn[1] ?? "").split(",").map((part) => Number.parseFloat(part.trim()));
    const r = parts[0];
    const g = parts[1];
    const b = parts[2];
    const a = parts[3];
    return {
      r: Number.isFinite(r) ? r : 0,
      g: Number.isFinite(g) ? g : 0,
      b: Number.isFinite(b) ? b : 0,
      a: Number.isFinite(a) ? a : 1,
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

/** Same color with a replaced alpha. */
export function withAlpha(color: Rgba, alpha: number): string {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  return `rgba(${String(Math.round(color.r))}, ${String(Math.round(color.g))}, ${String(
    Math.round(color.b),
  )}, ${String(Number(a.toFixed(3)))})`;
}

/** Blend two colors. Used for the depth haze. */
export function mixColor(from: Rgba, to: Rgba, t: number): Rgba {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return {
    r: from.r + (to.r - from.r) * u,
    g: from.g + (to.g - from.g) * u,
    b: from.b + (to.b - from.b) * u,
    a: from.a + (to.a - from.a) * u,
  };
}

// ---------------------------------------------------------------------------
// Shared math
// ---------------------------------------------------------------------------

export const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Smooth 0..1 oscillator at `hz`. Reduced motion pins it to the midpoint so a
 * pulse reads as a steady glow instead of a loop.
 */
export function pulse(timeMs: number, hz: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0.5;
  const t = Number.isFinite(timeMs) ? timeMs : 0;
  return 0.5 + 0.5 * Math.sin(TAU * hz * (t / 1000));
}

/** Rounded rectangle path, written by hand so no ctx.roundRect polyfill is needed. */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, Math.min(Math.abs(w), Math.abs(h)) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Waterbike (proceduralProps "waterbike", character capybara)
// ---------------------------------------------------------------------------

export interface BoxSpec {
  readonly w: number;
  readonly h: number;
  readonly radius: number;
}

export interface WaterbikeSpec {
  readonly hull: BoxSpec;
  readonly deck: BoxSpec;
  readonly rail: BoxSpec;
  readonly hullColor: string;
  readonly hullShade: string;
  readonly deckColor: string;
  readonly railColor: string;
  readonly jetColor: string;
  readonly jetCount: number;
  readonly jetOffsetX: readonly number[];
  readonly jetLength: number;
  readonly jetWidth: number;
  readonly jetSpreadDeg: number;
  readonly jetPulseHz: number;
  readonly wakeLength: number;
  readonly wakeWidth: number;
  readonly wakeFade: number;
  readonly wakeColor: string;
}

const box = (value: unknown, fallback: BoxSpec): BoxSpec => {
  if (typeof value !== "object" || value === null) return fallback;
  const raw = value as Record<string, unknown>;
  const w = raw["w"];
  const h = raw["h"];
  const radius = raw["radius"];
  return {
    w: typeof w === "number" && Number.isFinite(w) ? w : fallback.w,
    h: typeof h === "number" && Number.isFinite(h) ? h : fallback.h,
    radius: typeof radius === "number" && Number.isFinite(radius) ? radius : fallback.radius,
  };
};

const num = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Mirrors the shipped manifest values, used when a prop is missing. */
export const DEFAULT_WATERBIKE: WaterbikeSpec = {
  hull: { w: 78, h: 16, radius: 8 },
  deck: { w: 60, h: 6, radius: 3 },
  rail: { w: 44, h: 4, radius: 2 },
  hullColor: "#d8d2c4",
  hullShade: "#8f9bb0",
  deckColor: "#2f9fb5",
  railColor: "#c9d4e4",
  jetColor: "#7fe8ff",
  jetCount: 2,
  jetOffsetX: [-20, 20],
  jetLength: 26,
  jetWidth: 7,
  jetSpreadDeg: 12,
  jetPulseHz: 2.4,
  wakeLength: 46,
  wakeWidth: 10,
  wakeFade: 0.55,
  wakeColor: "#bfe9ff",
};

const colorFrom = (colors: ProceduralProp["colors"], key: string, fallback: string): string => {
  if (colors === undefined || Array.isArray(colors)) return fallback;
  const value = colors[key];
  return typeof value === "string" && value !== "" ? value : fallback;
};

/** Read the `waterbike` prop. Falls back to the shipped defaults per field. */
export function readWaterbike(prop: ProceduralProp | undefined): WaterbikeSpec {
  if (prop === undefined) return DEFAULT_WATERBIKE;
  const colors = prop.colors;
  const jets = typeof prop.jets === "object" && prop.jets !== null ? prop.jets : {};
  const wake = typeof prop.wake === "object" && prop.wake !== null ? prop.wake : {};
  const shape = typeof prop.shape === "object" && prop.shape !== null ? prop.shape : {};
  const offsets = jets["offsetX"];
  return {
    hull: box(shape["hull"], DEFAULT_WATERBIKE.hull),
    deck: box(shape["deck"], DEFAULT_WATERBIKE.deck),
    rail: box(shape["rail"], DEFAULT_WATERBIKE.rail),
    hullColor: colorFrom(colors, "hull", DEFAULT_WATERBIKE.hullColor),
    hullShade: colorFrom(colors, "hullShade", DEFAULT_WATERBIKE.hullShade),
    deckColor: colorFrom(colors, "deck", DEFAULT_WATERBIKE.deckColor),
    railColor: colorFrom(colors, "rail", DEFAULT_WATERBIKE.railColor),
    jetColor: colorFrom(colors, "jet", DEFAULT_WATERBIKE.jetColor),
    jetCount: num(jets["count"], DEFAULT_WATERBIKE.jetCount),
    jetOffsetX: Array.isArray(offsets)
      ? offsets.filter((value): value is number => typeof value === "number")
      : DEFAULT_WATERBIKE.jetOffsetX,
    jetLength: num(jets["length"], DEFAULT_WATERBIKE.jetLength),
    jetWidth: num(jets["width"], DEFAULT_WATERBIKE.jetWidth),
    jetSpreadDeg: num(jets["spreadDeg"], DEFAULT_WATERBIKE.jetSpreadDeg),
    jetPulseHz: num(jets["pulseHz"], DEFAULT_WATERBIKE.jetPulseHz),
    wakeLength: num(wake["trailLen"], DEFAULT_WATERBIKE.wakeLength),
    wakeWidth: num(wake["width"], DEFAULT_WATERBIKE.wakeWidth),
    wakeFade: num(wake["fade"], DEFAULT_WATERBIKE.wakeFade),
    wakeColor: colorFrom(colors, "wake", DEFAULT_WATERBIKE.wakeColor),
  };
}

export interface WaterbikeState {
  /** Ride point in arena pixels: the capybara sprite bottom anchor. */
  readonly x: number;
  readonly y: number;
  /** Hull tilt in radians, already clamped by the caller. */
  readonly tilt: number;
  /** Normalized speed in [0, 1]. Drives the jet length. */
  readonly speed: number;
  /** 1 or -1. */
  readonly facing: number;
  /** Depth multiplier from the arena depth band. */
  readonly scale: number;
  readonly timeMs: number;
  readonly reducedMotion: boolean;
}

/** Jet flame length in arena pixels for a given normalized speed. */
export function jetFlameLength(spec: WaterbikeSpec, state: WaterbikeState): number {
  const speed = clamp01(state.speed);
  const beat = pulse(state.timeMs, spec.jetPulseHz, state.reducedMotion);
  const throttle = 0.3 + 0.7 * speed;
  const flutter = state.reducedMotion ? 1 : 0.85 + 0.15 * (beat * 2);
  return spec.jetLength * throttle * flutter * state.scale;
}

/**
 * Draw the waterbike: wake, jet flames, hull, deck and rail. The hull is a
 * rounded box centred on `(x, y)`, tilted by `state.tilt` and mirrored by
 * `state.facing`. Callers draw this before the capybara sprite.
 */
export function drawWaterbike(
  ctx: CanvasRenderingContext2D,
  spec: WaterbikeSpec,
  state: WaterbikeState,
): void {
  const facing = state.facing < 0 ? -1 : 1;
  const scale = state.scale > 0 ? state.scale : 1;
  const speed = clamp01(state.speed);

  ctx.save();
  ctx.translate(state.x, state.y);
  ctx.rotate(state.tilt);
  ctx.scale(facing * scale, scale);

  const hullW = spec.hull.w;
  const hullH = spec.hull.h;
  const halfHull = hullW / 2;

  // Wake: a flattened ellipse trailing behind the hull.
  ctx.globalAlpha = spec.wakeFade * (0.35 + 0.65 * speed);
  ctx.fillStyle = spec.wakeColor;
  ctx.beginPath();
  ctx.ellipse(-halfHull - spec.wakeLength / 2 + 6, 0, spec.wakeLength / 2, spec.wakeWidth / 2, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Jet flames, drawn behind the hull so the deck reads in front.
  const flame = jetFlameLength(spec, state);
  const spread = (spec.jetSpreadDeg * Math.PI) / 180;
  const offsets = spec.jetOffsetX.length > 0 ? spec.jetOffsetX : [0];
  for (let i = 0; i < Math.max(1, spec.jetCount); i += 1) {
    const ox = offsets[i % offsets.length] ?? 0;
    const oy = (i % 2 === 0 ? -1 : 1) * (spec.jetWidth / 2);
    const dx = -halfHull + ox;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = spec.jetColor;
    ctx.beginPath();
    ctx.moveTo(dx, oy - spec.jetWidth / 2);
    ctx.lineTo(dx - flame, oy - spread * flame * 0.5);
    ctx.lineTo(dx - flame, oy + spread * flame * 0.5);
    ctx.lineTo(dx, oy + spec.jetWidth / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Hull shade underneath, hull on top.
  ctx.fillStyle = spec.hullShade;
  roundRectPath(ctx, -halfHull, -hullH / 2 + 3, hullW, hullH, spec.hull.radius);
  ctx.fill();

  ctx.fillStyle = spec.hullColor;
  roundRectPath(ctx, -halfHull, -hullH / 2, hullW, hullH, spec.hull.radius);
  ctx.fill();

  // Deck.
  ctx.fillStyle = spec.deckColor;
  roundRectPath(ctx, -spec.deck.w / 2, -hullH / 2 - spec.deck.h, spec.deck.w, spec.deck.h, spec.deck.radius);
  ctx.fill();

  // Rail.
  ctx.fillStyle = spec.railColor;
  roundRectPath(ctx, -spec.rail.w / 2, -hullH / 2 - spec.deck.h - spec.rail.h, spec.rail.w, spec.rail.h, spec.rail.radius);
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Time field (proceduralProps "time-field", character snail)
// ---------------------------------------------------------------------------

export interface TimeFieldSpec {
  readonly radius: number;
  readonly breathHz: number;
  readonly breathAmount: number;
  readonly ringColor: string;
  readonly fillColor: string;
  readonly edgeColor: string;
}

export const DEFAULT_TIME_FIELD: TimeFieldSpec = {
  radius: 132,
  breathHz: 0.35,
  breathAmount: 14,
  ringColor: "#8fb8ff",
  fillColor: "#3a5cff",
  edgeColor: "#d7e6ff",
};

/** Read the `time-field` prop, field by field. */
export function readTimeField(prop: ProceduralProp | undefined): TimeFieldSpec {
  if (prop === undefined) return DEFAULT_TIME_FIELD;
  return {
    radius: prop.radius ?? DEFAULT_TIME_FIELD.radius,
    breathHz: prop.breathHz ?? DEFAULT_TIME_FIELD.breathHz,
    breathAmount: prop.breathAmount ?? DEFAULT_TIME_FIELD.breathAmount,
    ringColor: colorFrom(prop.colors, "ring", DEFAULT_TIME_FIELD.ringColor),
    fillColor: colorFrom(prop.colors, "fill", DEFAULT_TIME_FIELD.fillColor),
    edgeColor: colorFrom(prop.colors, "edge", DEFAULT_TIME_FIELD.edgeColor),
  };
}

/**
 * Current ring radius in arena pixels. Pure: the manifest radius plus one
 * breath cycle at `breathHz`, damped to a constant radius under reduced motion.
 */
export function timeFieldRadius(
  spec: TimeFieldSpec,
  timeMs: number,
  reducedMotion = false,
): number {
  if (reducedMotion) return spec.radius;
  const t = Number.isFinite(timeMs) ? timeMs : 0;
  return spec.radius + Math.sin(TAU * spec.breathHz * (t / 1000)) * spec.breathAmount;
}

/**
 * Filled disc plus a breathing ring, and a few edge arcs that drift to the
 * circumference so the inward pull reads without a label.
 */
export function drawTimeField(
  ctx: CanvasRenderingContext2D,
  spec: TimeFieldSpec,
  cx: number,
  cy: number,
  timeMs: number,
  reducedMotion = false,
): void {
  const radius = timeFieldRadius(spec, timeMs, reducedMotion);
  const amount = spec.breathAmount > 0 ? spec.breathAmount : 1;
  const breath = reducedMotion ? 0 : (radius - spec.radius) / amount;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = spec.fillColor;
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = spec.ringColor;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.globalAlpha = 0.5 + 0.3 * breath;
  ctx.strokeStyle = spec.edgeColor;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i += 1) {
    const start = (i / 3) * TAU + breath * 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + 0.5);
    ctx.stroke();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Shore crystal glows (proceduralProps "crystal-glow")
// ---------------------------------------------------------------------------

export interface CrystalSpec {
  readonly anchors: readonly Vec2[];
  readonly radius: number;
  readonly pulseHz: number;
  readonly coreColor: string;
  readonly haloColor: string;
}

export const DEFAULT_CRYSTAL: CrystalSpec = {
  anchors: [],
  radius: 54,
  pulseHz: 0.22,
  coreColor: "#9fe8ff",
  haloColor: "#2f6cff",
};

/** Read the `crystal-glow` prop. */
export function readCrystalGlow(prop: ProceduralProp | undefined): CrystalSpec {
  if (prop === undefined) return DEFAULT_CRYSTAL;
  return {
    anchors: prop.anchors ?? DEFAULT_CRYSTAL.anchors,
    radius: prop.radius ?? DEFAULT_CRYSTAL.radius,
    pulseHz: prop.pulseHz ?? DEFAULT_CRYSTAL.pulseHz,
    coreColor: colorFrom(prop.colors, "core", DEFAULT_CRYSTAL.coreColor),
    haloColor: colorFrom(prop.colors, "halo", DEFAULT_CRYSTAL.haloColor),
  };
}

/** Glow radius for one anchor at a given time. Pure, so tests can assert it. */
export function crystalRadius(spec: CrystalSpec, timeMs: number, index: number, reduced: boolean): number {
  const beat = pulse(timeMs + index * 917, spec.pulseHz, reduced);
  return spec.radius * (0.8 + 0.35 * beat);
}

/** Paint every shore crystal. Drawn before the entities: they sit on the shore. */
export function drawCrystalGlows(
  ctx: CanvasRenderingContext2D,
  spec: CrystalSpec,
  timeMs: number,
  reducedMotion = false,
): void {
  for (const [index, anchor] of spec.anchors.entries()) {
    const radius = crystalRadius(spec, timeMs, index, reducedMotion);
    const beat = pulse(timeMs + index * 917, spec.pulseHz, reducedMotion);
    const gradient = ctx.createRadialGradient(anchor.x, anchor.y, 0, anchor.x, anchor.y, radius);
    gradient.addColorStop(0, withAlpha(parseColor(spec.coreColor), 0.5 + 0.3 * beat));
    gradient.addColorStop(1, withAlpha(parseColor(spec.haloColor), 0));
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, radius, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}