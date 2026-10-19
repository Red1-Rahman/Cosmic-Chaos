// The in-game HUD: hull meter, the Snail's time field readout, the level and
// objective board, the three action readiness meters, the dialogue box and the
// two always-reachable buttons. It reads a HudModel and never writes one.
//
// The overlay itself is pointer-transparent, so the touch D-pad below it keeps
// every tap.
import type { DialogueView, HudModel, ObjectiveView, TutorialView, UiCallbacks } from "./types.js";
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
import { objectiveProgressText } from "./title.js";

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
  cssVar(root, "--cc-font-size", `${String(Number(fontSizeFor({ x, y, w, h }).toFixed(3)))}px`);
}

/** One of the three readiness meters: dodge, parry and the water cannon. */
interface Meter {
  readonly root: HTMLElement;
  readonly fill: HTMLElement;
  value: number;
}

function createReadyMeter(doc: Document, label: string, key: string, attribute: string): Meter {
  const root = el(doc, "cc-ready");
  root.setAttribute(attribute, "");
  const name = el(doc, "cc-ready-label");
  text(name, label);
  const track = el(doc, "cc-ready-track");
  const fill = el(doc, "cc-ready-fill");
  track.append(fill);
  const keyNode = el(doc, "cc-ready-key");
  text(keyNode, key);
  root.append(name, track, keyNode);
  return { root, fill, value: Number.NaN };
}

function updateReadyMeter(meter: Meter, value: number): void {
  if (value === meter.value) return;
  meter.value = value;
  const percent = `${String(Math.round(clamp01(value) * 100))}%`;
  cssVar(meter.fill, "width", percent);
  meter.root.classList.toggle("cc-ready--cooling", clamp01(value) < 1);
}

interface Cached {
  hp: number;
  timeScale: number;
  inField: boolean;
  seed: number;
  presetId: string | null;
  muted: boolean;
  paused: boolean;
  levelName: string;
  riderName: string;
  objectives: string;
  dialogue: string;
  tutorial: string;
  elapsed: number;
  dodge: number;
  parry: number;
  cannon: number;
}

const NOTHING: Cached = {
  hp: Number.NaN,
  timeScale: Number.NaN,
  inField: false,
  seed: Number.NaN,
  presetId: null,
  muted: false,
  paused: false,
  levelName: "",
  riderName: "",
  objectives: "",
  dialogue: "",
  tutorial: "",
  elapsed: Number.NaN,
  dodge: Number.NaN,
  parry: Number.NaN,
  cannon: Number.NaN,
};

function objectiveSignature(objectives: readonly ObjectiveView[]): string {
  return objectives.map((objective) => `${objective.id}:${String(objective.count)}`).join("|");
}

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

  // Level chip and clock, on the same row as the seed and preset chips.
  const meta = el(doc, "cc-hud-block cc-hud-meta");
  const levelChip = el(doc, "cc-hud-chip cc-hud-level");
  levelChip.setAttribute("data-cc-level-chip", "");
  const clock = el(doc, "cc-hud-chip");
  clock.setAttribute("data-cc-clock", "");
  const seed = el(doc, "cc-hud-chip");
  seed.setAttribute("data-cc-seed", "");
  const preset = el(doc, "cc-hud-chip");
  preset.setAttribute("data-cc-preset", "");
  meta.append(levelChip, clock, seed, preset);
  stack.append(meta);

  // The three readiness meters. They sit on the left so they never collide with the
  // touch cluster on the right.
  const ready = el(doc, "cc-hud-block cc-hud-ready");
  const dodgeMeter = createReadyMeter(doc, "Dodge", "K", "data-cc-dodge-ready");
  const parryMeter = createReadyMeter(doc, "Parry", "L", "data-cc-parry-ready");
  const cannonMeter = createReadyMeter(doc, "Cannon", "J", "data-cc-cannon-ready");
  ready.append(dodgeMeter.root, parryMeter.root, cannonMeter.root);
  stack.append(ready);

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

  // The objective board, bottom left: what has to happen and how far along it is.
  const board = el(doc, "cc-objective-board");
  const boardTitle = el(doc, "cc-board-title");
  const boardList = el(doc, "cc-board-list");
  const boardRider = el(doc, "cc-board-rider");
  boardRider.setAttribute("data-cc-rider", "");
  board.append(boardTitle, boardList, boardRider);
  root.append(board);

  // Dialogue, centred over the waterline so it never covers the rider.
  const dialogue = el(doc, "cc-dialogue");
  dialogue.setAttribute("data-cc-dialogue", "");
  dialogue.setAttribute("role", "status");
  const speakerNode = el(doc, "cc-dialogue-speaker");
  const lineNode = el(doc, "cc-dialogue-line");
  dialogue.append(speakerNode, lineNode);
  root.append(dialogue);

  // Staged onboarding card, top-centre: clear of the left stack, the right-hand buttons
  // and the dialogue over the waterline. Hidden unless a tutorial stage is showing; the
  // data-cc-tutorial attribute only exists while a card is up, so tests can count it.
  const tutorialCard = el(doc, "cc-tutorial");
  tutorialCard.setAttribute("role", "status");
  const tutorialTitle = el(doc, "cc-tutorial-title");
  const tutorialBody = el(doc, "cc-tutorial-body");
  tutorialCard.append(tutorialTitle, tutorialBody);
  root.append(tutorialCard);

  const last: Cached = { ...NOTHING };

  const renderObjectives = (objectives: readonly ObjectiveView[]): void => {
    const signature = objectiveSignature(objectives);
    if (signature === last.objectives) return;
    last.objectives = signature;
    text(boardTitle, "Objectives");
    while (boardList.children.length > 0) boardList.children[0]?.remove();
    for (const objective of objectives) {
      const row = el(doc, "cc-board-row");
      row.setAttribute("data-cc-board", objective.id);
      row.classList.toggle("cc-board-row--done", objective.done);
      const label = el(doc, "cc-board-label");
      text(label, objectiveProgressText(objective));
      row.append(label);
      boardList.append(row);
    }
  };

  const renderDialogue = (line: DialogueView | null, riderName: string): void => {
    const body = line === null ? "" : line.line.split("{rider}").join(riderName);
    const shown = line === null ? "" : `${line.speaker}: ${body}`;
    if (shown === last.dialogue) return;
    last.dialogue = shown;
    dialogue.classList.toggle("cc-dialogue--on", shown !== "");
    text(speakerNode, line?.speaker ?? "");
    text(lineNode, body);
  };

  const renderTutorial = (card: TutorialView | null | undefined): void => {
    const active = card ?? null;
    const signature =
      active === null ? "" : `${String(active.stage)}|${active.title}|${active.body}`;
    if (signature === last.tutorial) return;
    last.tutorial = signature;
    const on = active !== null;
    tutorialCard.classList.toggle("cc-tutorial--on", on);
    if (active === null) {
      tutorialCard.removeAttribute("data-cc-tutorial");
      text(tutorialTitle, "");
      text(tutorialBody, "");
      return;
    }
    tutorialCard.setAttribute("data-cc-tutorial", String(active.stage));
    text(tutorialTitle, active.title);
    text(tutorialBody, active.body);
  };

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

      const levelName = `${String(model.levelId)}. ${model.levelName}`;
      if (levelName !== last.levelName) {
        text(levelChip, levelName);
        last.levelName = levelName;
      }
      // The rider name is editable on the home screen, so it gets its own cache key:
      // sharing the level chip's would freeze it at whatever it was on the first frame.
      if (model.riderName !== last.riderName) {
        text(boardRider, model.riderName);
        last.riderName = model.riderName;
      }

      const elapsed = finite(model.elapsedSec, 0);
      if (elapsed !== last.elapsed) {
        const minutes = Math.floor(elapsed / 60);
        const seconds = Math.floor(elapsed % 60);
        text(clock, `${String(minutes)}:${String(seconds).padStart(2, "0")}`);
        last.elapsed = elapsed;
      }

      renderObjectives(model.objectives);
      renderDialogue(model.dialogue, model.riderName);
      renderTutorial(model.tutorial);

      if (model.dodgeReady !== last.dodge) {
        updateReadyMeter(dodgeMeter, model.dodgeReady);
        last.dodge = model.dodgeReady;
      }
      if (model.parryReady !== last.parry) {
        updateReadyMeter(parryMeter, model.parryReady);
        last.parry = model.parryReady;
      }
      if (model.cannonReady !== last.cannon) {
        updateReadyMeter(cannonMeter, model.cannonReady);
        last.cannon = model.cannonReady;
      }
    },
  };
}
