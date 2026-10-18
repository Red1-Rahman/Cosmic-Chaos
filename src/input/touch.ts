// Virtual touch controls: a DOM overlay with a D-pad, a jump button and an action
// button. Pointer events and multi touch, so steering and jumping work at once.
// The pure state machine is separate from the DOM so it can be tested in node.
import type { InputState } from "./input.js";

export type TouchControl = "up" | "down" | "left" | "right" | "jump" | "action";

export const TOUCH_CONTROLS: readonly TouchControl[] = [
  "up",
  "down",
  "left",
  "right",
  "jump",
  "action",
];

export const TOUCH_DATA_ATTRIBUTE = "data-cc-control";

export interface TouchStateOptions {
  markActive?: () => void;
}

export interface TouchState {
  /** Bind a pointer id to a control. Re-binding moves the same finger. */
  press(pointerId: number, control: TouchControl): void;
  release(pointerId: number): void;
  releaseAll(): void;
  poll(): InputState;
}

/** Pure multi touch bookkeeping. One pointer id may hold exactly one control. */
export function createTouchState(options: TouchStateOptions = {}): TouchState {
  const markActive = options.markActive ?? ((): void => undefined);
  const held = new Map<number, TouchControl>();

  return {
    press(pointerId: number, control: TouchControl): void {
      const previous = held.get(pointerId);
      if (previous === control) return;
      held.set(pointerId, control);
      markActive();
    },
    release(pointerId: number): void {
      held.delete(pointerId);
    },
    releaseAll(): void {
      held.clear();
    },
    poll(): InputState {
      let moveX = 0;
      let moveY = 0;
      let jump = false;
      let action = false;
      for (const control of held.values()) {
        if (control === "left") moveX -= 1;
        if (control === "right") moveX += 1;
        if (control === "up") moveY -= 1;
        if (control === "down") moveY += 1;
        if (control === "jump") jump = true;
        if (control === "action") action = true;
      }
      return { moveX, moveY, jump, action };
    },
  };
}

// --- DOM overlay -------------------------------------------------------------

export interface TouchOverlay {
  readonly root: HTMLElement;
  dispose(): void;
}

export interface TouchOverlayOptions extends TouchStateOptions {
  /** Called after any pointer interaction, so the merge layer can rank devices. */
  onInteract?: () => void;
}

function bindControl(
  element: HTMLElement,
  control: TouchControl,
  state: TouchState,
  onInteract: (() => void) | undefined,
): void {
  const down = (event: Event): void => {
    const pointerId = (event as PointerEvent).pointerId;
    if (typeof pointerId !== "number") return;
    event.preventDefault();
    if (typeof element.setPointerCapture === "function") {
      element.setPointerCapture(pointerId);
    }
    element.dataset["pressed"] = "true";
    state.press(pointerId, control);
    onInteract?.();
  };
  const up = (event: Event): void => {
    const pointerId = (event as PointerEvent).pointerId;
    if (typeof pointerId !== "number") return;
    element.dataset["pressed"] = "false";
    state.release(pointerId);
  };

  element.addEventListener("pointerdown", down);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
  element.addEventListener("lostpointercapture", up);
  element.addEventListener("contextmenu", (event: Event) => {
    event.preventDefault();
  });
}

/**
 * Build the overlay into doc.body and wire every control to the shared state.
 * Returns null when there is no document, which is the case in node tests that
 * only exercise the pure state machine.
 */
export function mountTouchOverlay(
  doc: Document | undefined,
  state: TouchState,
  options: TouchOverlayOptions = {},
): TouchOverlay | null {
  if (doc === undefined) return null;
  const onInteract = options.onInteract;

  const root = doc.createElement("div");
  root.className = "cc-touch";
  root.setAttribute("data-cc-touch", "");

  const pad = doc.createElement("div");
  pad.className = "cc-touch-pad";
  for (const control of ["up", "left", "right", "down"] as const) {
    const key = doc.createElement("button");
    key.type = "button";
    key.className = `cc-touch-key cc-touch-${control}`;
    key.setAttribute(TOUCH_DATA_ATTRIBUTE, control);
    key.setAttribute("aria-label", `Move ${control}`);
    bindControl(key, control, state, onInteract);
    pad.append(key);
  }
  root.append(pad);

  for (const control of ["jump", "action"] as const) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = `cc-touch-button cc-touch-${control}`;
    button.setAttribute(TOUCH_DATA_ATTRIBUTE, control);
    button.setAttribute("aria-label", control);
    bindControl(button, control, state, onInteract);
    root.append(button);
  }

  doc.body.append(root);
  return {
    root,
    dispose(): void {
      state.releaseAll();
      root.remove();
    },
  };
}

/** Coarse pointers and small viewports get the overlay, everything else does not. */
export function shouldShowTouchControls(win: Window): boolean {
  const coarse = win.matchMedia("(pointer: coarse)").matches;
  const width = win.innerWidth > 0 ? win.innerWidth : 1024;
  const height = win.innerHeight > 0 ? win.innerHeight : 768;
  return coarse || width < 900 || height < 500;
}
