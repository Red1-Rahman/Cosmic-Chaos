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
    const [r = 0, g = 0, b = 0, a = 1] = parts;
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

const colorMap = (
  colors: ProceduralProp["colors"],
): Readonly<Record<string, string>> | undefined => {
  if (colors === undefined || Array.isArray(colors)) return undefined;
  return colors as Readonly<Record<string, string>>;
};

const colorFrom = (colors: ProceduralProp["colors"], key: string, fallback: string): string => {
  const record = colorMap(colors);
  if (record === undefined) return fallback;
  const value = record[key];
  return typeof value === "string" && value !== "" ? value : fallback;
};

const dict = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/** Read the `waterbike` prop. Falls back to the shipped defaults per field. */
export function readWaterbike(prop: ProceduralProp | undefined): WaterbikeSpec {
  if (prop === undefined) return DEFAULT_WATERBIKE;
  const colors = prop.colors;
  const jets = dict(prop.jets);
  const wake = dict(prop.wake);
  const shape = dict(prop.shape);
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
  ctx.ellipse(
    -halfHull - spec.wakeLength / 2 + 6,
    0,
    spec.wakeLength / 2,
    spec.wakeWidth / 2,
    0,
    0,
    TAU,
  );
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
  roundRectPath(
    ctx,
    -spec.deck.w / 2,
    -hullH / 2 - spec.deck.h,
    spec.deck.w,
    spec.deck.h,
    spec.deck.radius,
  );
  ctx.fill();

  // Rail.
  ctx.fillStyle = spec.railColor;
  roundRectPath(
    ctx,
    -spec.rail.w / 2,
    -hullH / 2 - spec.deck.h - spec.rail.h,
    spec.rail.w,
    spec.rail.h,
    spec.rail.radius,
  );
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
export function crystalRadius(
  spec: CrystalSpec,
  timeMs: number,
  index: number,
  reduced: boolean,
): number {
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

// ---------------------------------------------------------------------------
// Level geometry and pickups (procedural: no art exists for any of these)
// ---------------------------------------------------------------------------

/** Palette for reefs and pillars. Mirrors the arena art: cold rock, warm kelp. */
export const OBSTACLE_COLORS = {
  reefBody: "#2c3550",
  reefShade: "#171d31",
  reefEdge: "#6d86b8",
  reefMoss: "#4d8f8a",
  pillarBody: "#2f6b5e",
  pillarEdge: "#8fe0c4",
} as const;

/** Loose cosmic cores: the collect half of every objective. */
export const CORE_COLORS = {
  glow: "#7fe8ff",
  body: "#dff6ff",
  edge: "#3aa8ff",
} as const;

/** Water cannon pellets. */
export const PELLET_COLORS = {
  core: "#ffffff",
  trail: "#7fe8ff",
} as const;

/**
 * A speed streak trailing the rider while a dodge burst is running. Three
 * chevrons fading out behind the hull, drawn in the direction the dodge went.
 */
export function drawDodgeEcho(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  strength: number,
  scale: number,
): void {
  const power = clamp01(strength);
  if (power <= 0) return;
  const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
  const ux = dirX / len;
  const uy = dirY / len;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < 3; i += 1) {
    const offset = (18 + i * 20) * scale;
    const fade = power * (1 - i / 3);
    const halfWidth = (10 - i * 2) * scale;
    ctx.globalAlpha = fade * 0.55;
    ctx.strokeStyle = DODGE_TINT;
    ctx.lineWidth = Math.max(1, 3 * scale);
    ctx.beginPath();
    ctx.moveTo(ux * offset - uy * halfWidth, uy * offset + ux * halfWidth);
    ctx.lineTo(ux * (offset - 16 * scale), uy * (offset - 16 * scale));
    ctx.lineTo(ux * offset + uy * halfWidth, uy * offset - ux * halfWidth);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Colour of the dodge streak. */
export const DODGE_TINT = "#9fe8ff";

/** Parry shield ring. */
export const PARRY_COLORS = {
  ring: "#ffd27f",
  glow: "#fff3d0",
} as const;

/**
 * Deterministic lumpiness for a reef outline. `phase` is a stable 0..1 value from
 * the level data, so the same rock always has the same silhouette.
 */
function reefShape(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  phase: number,
): void {
  const lobes = 7;
  ctx.beginPath();
  for (let i = 0; i <= lobes; i += 1) {
    const t = i / lobes;
    const angle = t * TAU;
    // Three fixed harmonics of the phase: no randomness, no clock.
    const bump =
      1 +
      0.12 * Math.sin(angle * 3 + phase * TAU) +
      0.07 * Math.sin(angle * 5 - phase * TAU * 2) +
      0.04 * Math.sin(angle * 2 + phase * TAU * 3);
    const radius = r * bump;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius * 0.86;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** One reef rock: a lump silhouette, a shaded underside and a mossy crown. */
export function drawReef(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  phase: number,
): void {
  ctx.save();
  // A flat contact shadow sells the rock as sitting on the water, not floating.
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = OBSTACLE_COLORS.reefShade;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.5, r * 1.05, r * 0.34, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  reefShape(ctx, x, y, r, phase);
  ctx.fillStyle = OBSTACLE_COLORS.reefBody;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OBSTACLE_COLORS.reefEdge;
  ctx.stroke();

  // Shaded lower half.
  ctx.save();
  reefShape(ctx, x, y, r, phase);
  ctx.clip();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = OBSTACLE_COLORS.reefShade;
  ctx.fillRect(x - r * 1.4, y + r * 0.1, r * 2.8, r * 1.6);
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = OBSTACLE_COLORS.reefMoss;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.15, y - r * 0.5, r * 0.55, r * 0.2, phase, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** One kelp pillar: a stalk with two fronds and a sway that reads as underwater. */
export function drawPillar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  phase: number,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const sway = reducedMotion ? 0 : Math.sin((timeMs / 1000) * 0.9 + phase * TAU) * r * 0.4;
  const height = r * 4.2;
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = OBSTACLE_COLORS.reefShade;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.4, r * 0.9, r * 0.28, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.lineCap = "round";
  ctx.lineWidth = r * 0.9;
  ctx.strokeStyle = OBSTACLE_COLORS.pillarBody;
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.3);
  ctx.quadraticCurveTo(x + sway * 0.4, y - height * 0.5, x + sway, y - height);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, r * 0.24);
  ctx.strokeStyle = OBSTACLE_COLORS.pillarEdge;
  ctx.stroke();

  for (let i = 0; i < 2; i += 1) {
    const t = 0.42 + i * 0.3;
    const side = i === 0 ? -1 : 1;
    const bx = x + sway * t;
    const by = y - height * t;
    ctx.lineWidth = Math.max(1, r * 0.2);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + side * r * 1.3, by - r * 0.6, bx + side * r * 1.7, by + r * 0.5);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Draw the level's static geometry, farthest first so near rocks overlap. */
export function drawObstacles(
  ctx: CanvasRenderingContext2D,
  obstacles: readonly {
    readonly id: string;
    readonly kind: string;
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly phase: number;
  }[],
  timeMs: number,
  reducedMotion: boolean,
): void {
  const ordered = [...obstacles].sort((a, b) => a.y - b.y);
  for (const obstacle of ordered) {
    if (obstacle.kind === "pillar") {
      drawPillar(ctx, obstacle.x, obstacle.y, obstacle.r, obstacle.phase, timeMs, reducedMotion);
    } else {
      drawReef(ctx, obstacle.x, obstacle.y, obstacle.r, obstacle.phase);
    }
  }
}

/** One loose cosmic core: a bobbing diamond inside a soft halo. */
export function drawCore(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  timeMs: number,
  reducedMotion: boolean,
): void {
  const beat = pulse(timeMs * 1.4, 0.9, reducedMotion);
  const bob = reducedMotion ? 0 : Math.sin((timeMs / 1000) * 2.2) * r * 0.18;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.globalAlpha = 0.25 + 0.2 * beat;
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
  gradient.addColorStop(0, CORE_COLORS.glow);
  gradient.addColorStop(1, "rgba(127, 232, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, r * 3, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.rotate((timeMs / 1000) * 1.4);
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(r * 0.72, 0);
  ctx.lineTo(0, r);
  ctx.lineTo(-r * 0.72, 0);
  ctx.closePath();
  ctx.fillStyle = CORE_COLORS.body;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = CORE_COLORS.edge;
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Every core still floating. */
export function drawCores(
  ctx: CanvasRenderingContext2D,
  cores: readonly { readonly x: number; readonly y: number; readonly taken: boolean }[],
  radius: number,
  timeMs: number,
  reducedMotion: boolean,
): void {
  for (const core of cores) {
    if (core.taken) continue;
    drawCore(ctx, core.x, core.y, radius, timeMs, reducedMotion);
  }
}

/**
 * A water-cannon pellet: a bright head with a short tail pointing back along its
 * own velocity, so a stream of shots reads as a line rather than as dots.
 */
export function drawPellet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  vy: number,
): void {
  const len = Math.sqrt(vx * vx + vy * vy) || 1;
  const ux = vx / len;
  const uy = vy / len;
  ctx.save();
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = PELLET_COLORS.trail;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - ux * 22, y - uy * 22);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = PELLET_COLORS.core;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - ux * 9, y - uy * 9);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = PELLET_COLORS.core;
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Every live pellet. */
export function drawPellets(
  ctx: CanvasRenderingContext2D,
  pellets: readonly {
    readonly x: number;
    readonly y: number;
    readonly vx: number;
    readonly vy: number;
  }[],
): void {
  for (const pellet of pellets) {
    drawPellet(ctx, pellet.x, pellet.y, pellet.vx, pellet.vy);
  }
}

/**
 * The parry shield: a ring that closes from wide to the deflect radius over the
 * window, so the player can see exactly how long they have left.
 */
export function drawParryShield(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  windowMs: number,
  totalMs: number,
  radius: number,
): void {
  const ratio = clamp01(1 - windowMs / totalMs);
  const current = radius * (1.35 - 0.35 * ratio);
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.35 * (1 - ratio);
  ctx.strokeStyle = PARRY_COLORS.ring;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, current, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = PARRY_COLORS.glow;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = PARRY_COLORS.glow;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}
