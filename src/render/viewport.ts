// Viewport math. Pure functions, no DOM access, no clocks, no randomness.
// The only impure parts are applyLayout (writes to a canvas) and createViewport (adds listeners).

/** Colour of the letterbox / pillarbox bars. Logged in docs/decisions.md. */
export const BAR_COLOR = "#05060f";

/** CSS value of the canvas `image-rendering` property. Mirrors assets.json. */
export const IMAGE_RENDERING = "pixelated";

/** Prefer whole-number upscaling. Mirrors assets.json `viewport.integerScalePreferred`. */
export const PREFER_INTEGER_SCALE = true;

/** Minimum fill ratio an integer scale must keep. Mirrors `viewport.integerScaleMinFill`. */
export const INTEGER_SCALE_MIN_FILL = 0.9;

export interface Size {
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Bars {
  readonly top: Rect;
  readonly bottom: Rect;
  readonly left: Rect;
  readonly right: Rect;
}

export interface ViewportPreset {
  readonly id: string;
  readonly ratio: number;
  readonly logical: Size;
  readonly background: string;
}

export interface ViewportConfig {
  readonly imageRendering: string;
  readonly integerScalePreferred: boolean;
  readonly integerScaleMinFill: number;
  readonly presets: ViewportPreset[];
}

export interface Layout {
  /** Window (or supplied container) size in CSS pixels. */
  readonly window: Size;
  readonly preset: ViewportPreset;
  /** Canvas internal size. Always the preset logical size, never the window size. */
  readonly logical: Size;
  /** CSS size of the canvas, in CSS pixels. */
  readonly css: Size;
  /** Distance from the window origin to the canvas origin, in CSS pixels. */
  readonly offset: Point;
  /** css.w / logical.w. */
  readonly scale: number;
  /** True when the integer scale preference was applied. */
  readonly integerScale: boolean;
  /** Bars are in window coordinates. Width or height is zero when there is no gap. */
  readonly bars: Bars;
  readonly barColor: string;
  readonly imageRendering: string;
}

const fail = (message: string): never => {
  throw new Error(`viewport: ${message}`);
};

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const record = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return fail(`${path} must be an object.`);
};

const readSize = (value: unknown, path: string): Size => {
  const raw = record(value, path);
  const w = raw["w"];
  const h = raw["h"];
  if (isPositiveNumber(w) && isPositiveNumber(h)) return { w, h };
  return fail(`${path}.w and ${path}.h must be positive finite numbers.`);
};

const readPositiveNumber = (value: unknown, path: string): number =>
  isPositiveNumber(value) ? value : fail(`${path} must be a positive finite number.`);

const readString = (value: unknown, path: string): string =>
  typeof value === "string" && value !== ""
    ? value
    : fail(`${path} must be a non-empty string.`);

const readBoolean = (value: unknown, path: string): boolean =>
  typeof value === "boolean" ? value : fail(`${path} must be a boolean.`);

const presetPath = (index: number, field: string): string =>
  `manifest.viewport.presets[${String(index)}].${field}`;

const readPreset = (value: unknown, index: number): ViewportPreset => {
  const p = record(value, presetPath(index, "<entry>"));
  return {
    id: readString(p["id"], presetPath(index, "id")),
    ratio: readPositiveNumber(p["ratio"], presetPath(index, "ratio")),
    logical: readSize(p["logical"], presetPath(index, "logical")),
    background: readString(p["background"], presetPath(index, "background")),
  };
};

/** Read `viewport` out of the asset manifest. Throws on anything malformed. */
export function readViewportConfig(manifest: unknown): ViewportConfig {
  const root = record(manifest, "manifest");
  const raw = record(root["viewport"], "manifest.viewport");
  const rawPresets = raw["presets"];
  if (!Array.isArray(rawPresets) || rawPresets.length === 0) {
    fail("manifest.viewport.presets must be a non-empty array.");
  }
  const list: readonly unknown[] = rawPresets as readonly unknown[];
  return {
    imageRendering: readString(raw["imageRendering"], "viewport.imageRendering"),
    integerScalePreferred: readBoolean(
      raw["integerScalePreferred"],
      "viewport.integerScalePreferred",
    ),
    integerScaleMinFill: readPositiveNumber(
      raw["integerScaleMinFill"],
      "viewport.integerScaleMinFill",
    ),
    presets: list.map((entry, index) => readPreset(entry, index)),
  };
}

/**
 * Nearest preset by ratio. Distance is |ln(window aspect) - ln(preset ratio)|,
 * which is symmetric in log space and therefore treats wide and narrow equally.
 * Ties keep the earlier preset in manifest order.
 */
export function pickPreset(
  windowW: number,
  windowH: number,
  presets: readonly ViewportPreset[],
): ViewportPreset {
  if (!isPositiveNumber(windowW) || !isPositiveNumber(windowH)) {
    fail("window size must be positive finite numbers.");
  }
  const first = presets[0];
  if (first === undefined) return fail("preset list is empty.");
  const windowLogAspect = Math.log(windowW / windowH);
  let best: ViewportPreset = first;
  let bestDistance = Math.abs(windowLogAspect - Math.log(first.ratio));
  for (let i = 1; i < presets.length; i += 1) {
    const candidate = presets[i];
    if (candidate === undefined) continue;
    if (!isPositiveNumber(candidate.ratio)) fail(`preset ${candidate.id} has a bad ratio.`);
    const distance = Math.abs(windowLogAspect - Math.log(candidate.ratio));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/** Snap to a whole device pixel so the pixelated upscale stays crisp on HiDPI screens. */
export function snapToDevicePixels(value: number, devicePixelRatio: number): number {
  const dpr = isPositiveNumber(devicePixelRatio) ? devicePixelRatio : 1;
  return clamp(Math.round(value * dpr) / dpr, 0, Number.MAX_SAFE_INTEGER);
}

/** CSS length. Trailing zeros are trimmed so the style attribute stays readable. */
const px = (value: number): string => `${String(Number(value.toFixed(4)))}px`;

const pickScale = (
  fit: number,
  integerScalePreferred: boolean,
  integerScaleMinFill: number,
): { scale: number; integerScale: boolean } => {
  const whole = Math.floor(fit);
  if (integerScalePreferred && whole >= 1 && whole >= fit * integerScaleMinFill) {
    return { scale: whole, integerScale: true };
  }
  return { scale: fit, integerScale: false };
};

/** Bars tile the window: the leftover width and height, split in half. Never negative. */
const splitBars = (win: Size, css: Size): Bars => {
  const gapX = Math.max(0, win.w - css.w);
  const gapY = Math.max(0, win.h - css.h);
  const left = gapX / 2;
  const top = gapY / 2;
  return {
    top: { x: 0, y: 0, w: win.w, h: top },
    bottom: { x: 0, y: top + css.h, w: win.w, h: win.h - top - css.h },
    left: { x: 0, y: 0, w: left, h: win.h },
    right: { x: left + css.w, y: 0, w: win.w - left - css.w, h: win.h },
  };
};

/**
 * Contain-fit layout for one exact preset. Never stretches: the canvas keeps the preset
 * aspect and the remainder becomes bars.
 */
export function computeLayoutForPreset(
  win: Size,
  preset: ViewportPreset,
  options: { devicePixelRatio?: number; integerScalePreferred?: boolean; minFill?: number } = {},
): Layout {
  if (!isPositiveNumber(win.w) || !isPositiveNumber(win.h)) {
    fail("window size must be positive finite numbers.");
  }
  if (!isPositiveNumber(preset.logical.w) || !isPositiveNumber(preset.logical.h)) {
    fail(`preset ${preset.id} has an invalid logical size.`);
  }
  const dpr = options.devicePixelRatio ?? 1;
  const preferInteger = options.integerScalePreferred ?? PREFER_INTEGER_SCALE;
  const minFill = options.minFill ?? INTEGER_SCALE_MIN_FILL;

  const fit = Math.min(win.w / preset.logical.w, win.h / preset.logical.h);
  const chosen = pickScale(fit, preferInteger, minFill);
  const cssW = clamp(snapToDevicePixels(preset.logical.w * chosen.scale, dpr), 0, win.w);
  const cssH = clamp(snapToDevicePixels(preset.logical.h * chosen.scale, dpr), 0, win.h);

  return {
    window: { w: win.w, h: win.h },
    preset,
    logical: { w: preset.logical.w, h: preset.logical.h },
    css: { w: cssW, h: cssH },
    offset: { x: (win.w - cssW) / 2, y: (win.h - cssH) / 2 },
    scale: cssW / preset.logical.w,
    integerScale: chosen.integerScale,
    bars: splitBars({ w: win.w, h: win.h }, { w: cssW, h: cssH }),
    barColor: BAR_COLOR,
    imageRendering: IMAGE_RENDERING,
  };
}

/**
 * Contain-fit layout for the preset that best matches the window aspect.
 * Pure: the same inputs always give the same layout.
 */
export function computeLayout(
  win: Size,
  presets: readonly ViewportPreset[],
  devicePixelRatio = 1,
): Layout {
  return computeLayoutForPreset(win, pickPreset(win.w, win.h, presets), {
    devicePixelRatio,
  });
}

/** Paint the bars, in window coordinates. Used by the debug overlay and by tests. */
export function paintBars(ctx: CanvasRenderingContext2D, layout: Layout): void {
  const bars = [layout.bars.top, layout.bars.bottom, layout.bars.left, layout.bars.right];
  for (const bar of bars) {
    if (bar.w <= 0 || bar.h <= 0) continue;
    ctx.fillStyle = layout.barColor;
    ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
  }
}

/**
 * Apply a layout to a real canvas. The internal buffer is the preset logical size,
 * so devicePixelRatio never changes the render resolution. Smoothing is off because
 * the sprite upscale is nearest-neighbour.
 */
export function applyLayout(canvas: HTMLCanvasElement, layout: Layout): void {
  canvas.width = layout.logical.w;
  canvas.height = layout.logical.h;
  canvas.style.width = px(layout.css.w);
  canvas.style.height = px(layout.css.h);
  canvas.style.left = px(layout.offset.x);
  canvas.style.top = px(layout.offset.y);
  canvas.style.position = "absolute";
  canvas.style.imageRendering = layout.imageRendering;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.imageSmoothingEnabled = false;
    ctx.imageSmoothingQuality = "low";
  }
}

export interface ViewportHandle {
  /** The layout currently applied. */
  layout(): Layout;
  /** Recompute from the current window size and re-apply. */
  update(): Layout;
  dispose(): void;
}

/** Minimal window shape, so this module stays testable in Node without a DOM. */
export interface ViewportSource {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly devicePixelRatio: number;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/**
 * Live viewport for resize and rotation. The caller owns the Window, so the app layer
 * keeps its only real-time surface and this module stays free of DOM globals.
 */
export function createViewport(
  canvas: HTMLCanvasElement,
  presets: readonly ViewportPreset[],
  view: ViewportSource,
): ViewportHandle {
  const update = (): Layout => {
    const layout = computeLayout(
      { w: view.innerWidth, h: view.innerHeight },
      presets,
      view.devicePixelRatio,
    );
    applyLayout(canvas, layout);
    return layout;
  };
  let current = update();
  const onChange = (): void => {
    current = update();
  };
  view.addEventListener("resize", onChange);
  view.addEventListener("orientationchange", onChange);
  return {
    layout: () => current,
    update,
    dispose: () => {
      view.removeEventListener("resize", onChange);
      view.removeEventListener("orientationchange", onChange);
    },
  };
}