// The in-game HUD: hull meter, the Snail's time field readout, the seed, the viewport
// preset and the two always-reachable buttons. It reads a HudModel and never writes one.
// The overlay itself is pointer-transparent, so the touch D-pad below keeps every tap.
import type { HudModel, UiCallbacks } from "./types.js";
import {
  clamp,
  clamp01,
  createButton,
  cssVar,
  el,
  finite,
  formatCount,
  formatPercent,
  formatScale,
  px,
  text,
} from "./dom.js";

/**
 * Font size of the HUD, as a fraction of the letterboxed area's SHORT side. The short side
 * is the dimension that both layouts share: in landscape it is the height, in portrait the
 * width. Driving it off the height instead made every portrait preset render 9:20 text in a
 * 380 px wide frame, which wrapped the title panel to several lines per sentence and pushed
 * the start button off the bottom of the screen. Logged in docs/decisions.md.
 */
export const FONT_RATIO = 1 / 34;
export const FONT_MIN = 11;
export const FONT_MAX = 26;

/** The letterboxed area's short side, in CSS pixels. Degenerate rects collapse to zero. */
export function frameShortSide(frame: HudModel["frame"]): number {
  const w = finite(frame.w, 0);
  const h = finite(frame.h, 0);
  return Math.min(Math.max(0, w), Math.max(0, h));
}

/** The base type size for one letterboxed rect, clamped to the readable 11..26 px band. */
export function fontSizeFor(frame: HudModel["frame"]): number {
  return clamp(frameShortSide(frame) * FONT_RATIO, FONT_MIN, FONT_MAX);
}

/** Below this hull fraction the meter pulses. One slow pulse, never a strobe. */
export const LOW_HP = 0.34;

export interface HudHandle {
  readonly root: HTMLElement;
  update(model: HudModel): void;
}

/** Last frame written per node, so the 60 Hz update() does not touch the style every tick. */
const lastFrame = new WeakMap<HTMLElement, string>();

/**
 * Place the overlay on the letterboxed canvas rect and size the type off it, so the HUD
 * scales with the arena instead of sitting at fixed screen pixels. Letterboxes stay empty.
 */
export function applyFrame(root: HTMLElement, frame: HudModel["frame"]): void {
  const x = finite(frame.x, 0);
  const y = finite(frame.y, 0);
  const w = finite(frame.w, 0);
  const h = finite(frame.h, 0);
  const key = `${String(x)},${String(y)},${String(w)},${String(h)}`;
  if (lastFrame.get(root) === key) return;
  lastFrame.set(root, key);
  cssVar(root, "--cc-frame-x", px(x));
  cssVar(root, "--cc-frame-y", px(y));
  cssVar(root, "--cc-frame-w", px(w));
  cssVar(root, "--cc-frame-h", px(h));
  cssVar(
    root,
    "--cc-font-size",
    `${String(Number(fontSizeFor({ x, y, w, h }).toFixed(3)))}px`,
  );
}

interface Cached {
  hp: number;
  timeScale: number;
  inField: boolean;
  seed: number;
  presetId: string | null;
  muted: boolean;
  paused: boolean;
}

const NOTHING: Cached = {
  hp: Number.NaN,
  timeScale: Number.NaN,
  inField: false,
  seed: Number.NaN,
  presetId: null,
  muted: false,
  paused: false,
};

export function createHud(doc: Document, callbacks: UiCallbacks): HudHandle {
  const root = el(doc, "cc-hud");
  root.setAttribute("data-cc-overlay", "hud");

  // Hull meter. The vitals rows and the seed/preset chips share one top-left stack, laid
  // out in normal flow. An earlier version positioned the chip row with a fixed em
  // translate, which only cleared the vitals at one particular type size and overlapped
  // them on short frames. Flow cannot collide, whatever --cc-font-size works out to be.
  const stack = el(doc, "cc-hud-stack");
  root.append(stack);
  const vitals = el(doc, "cc-hud-block cc-hud-vitals");
  stack.append(vitals);

  const meter = el(doc, "cc-meter");
  meter.setAttribute("role", "progressbar");
  meter.setAttribute("aria-label", "Hull");
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", "100");
  const meterLabel = el(doc, "cc-meter-label");
  text(meterLabel, "Hull");
  const track = el(doc, "cc-meter-track");
  const fill = el(doc, "cc-meter-fill");
  track.append(fill);
  const meterValue = el(doc, "cc-meter-value");
  meterValue.setAttribute("data-cc-hp", "");
  text(meterValue, "100%");
  meter.append(meterLabel, track, meterValue);
  vitals.append(meter);

  // Snail time field readout.
  const field = el(doc, "cc-field");
  field.setAttribute("data-cc-field", "out");
  const fieldDot = el(doc, "cc-field-dot");
  const fieldName = el(doc, "cc-field-name");
  text(fieldName, "Time field");
  const fieldState = el(doc, "cc-field-state");
  fieldState.setAttribute("data-cc-time-field", "");
  text(fieldState, "NOMINAL");
  const fieldScale = el(doc, "cc-field-scale");
  fieldScale.setAttribute("data-cc-time-scale", "");
  text(fieldScale, formatScale(1));
  field.append(fieldDot, fieldName, fieldState, fieldScale);
  vitals.append(field);

  // Seed and viewport preset.
  const meta = el(doc, "cc-hud-block cc-hud-meta");
  const seed = el(doc, "cc-hud-chip");
  seed.setAttribute("data-cc-seed", "");
  const preset = el(doc, "cc-hud-chip");
  preset.setAttribute("data-cc-preset", "");
  meta.append(seed, preset);
  stack.append(meta);

  // Always-reachable controls. Top right, clear of the touch D-pad and the jump buttons.
  const actions = el(doc, "cc-hud-block cc-hud-actions");
  const pauseButton = createButton(doc, {
    action: "pause",
    label: "Pause",
    className: "cc-btn cc-btn-icon",
    onClick: (): void => {
      callbacks.onTogglePause();
    },
  });
  pauseButton.setAttribute("data-cc-paused", "false");
  const muteButton = createButton(doc, {
    action: "mute",
    label: "Sound on",
    className: "cc-btn cc-btn-icon",
    onClick: (): void => {
      callbacks.onToggleMute();
    },
  });
  muteButton.setAttribute("data-cc-muted", "false");
  actions.append(pauseButton, muteButton);
  root.append(actions);

  const last: Cached = { ...NOTHING };

  return {
    root,
    update(model: HudModel): void {
      const hp = clamp01(model.hp);
      const timeScale = finite(model.timeScale, 1);
      const inField = model.inTimeField;
      const seedValue = finite(model.seed, 0);
      const presetId = model.presetId;
      const muted = model.muted;
      const paused = model.paused;

      if (hp !== last.hp) {
        cssVar(fill, "width", formatPercent(hp));
        meter.setAttribute("aria-valuenow", formatPercent(hp));
        text(meterValue, formatPercent(hp));
        meter.classList.toggle("cc-meter-low", hp <= LOW_HP);
        last.hp = hp;
      }

      if (timeScale !== last.timeScale || inField !== last.inField) {
        text(fieldScale, formatScale(timeScale));
        text(fieldState, inField ? "INSIDE" : "NOMINAL");
        field.setAttribute("data-cc-field", inField ? "in" : "out");
        field.classList.toggle("cc-field-on", inField);
        last.timeScale = timeScale;
        last.inField = inField;
      }

      if (seedValue !== last.seed) {
        text(seed, `seed ${formatCount(seedValue)}`);
        last.seed = seedValue;
      }

      if (presetId !== last.presetId) {
        text(preset, presetId === "" ? "no preset" : presetId);
        last.presetId = presetId;
      }

      if (muted !== last.muted) {
        muteButton.setAttribute("data-cc-muted", muted ? "true" : "false");
        text(muteButton, muted ? "Muted" : "Sound on");
        last.muted = muted;
      }

      if (paused !== last.paused) {
        pauseButton.setAttribute("data-cc-paused", paused ? "true" : "false");
        text(pauseButton, paused ? "Paused" : "Pause");
        last.paused = paused;
      }
    },
  };
}
