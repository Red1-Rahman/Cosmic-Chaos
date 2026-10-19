// Pointer source: a primary press on the arena canvas is the water cannon
// trigger. A mouse click, a pen stroke or a tap on open water all fire; the
// touch overlay's own buttons keep working because only presses whose target
// is the stage count here.
//
// The trigger is shared rather than ranked. Directions still follow the merge
// layer's recency rule, but action is OR-ed in from this source, so holding
// W A S D and clicking fire at the same time does not drop either one.
import type { InputState } from "./input.js";

/** The arena canvas in index.html. */
export const STAGE_ID = "stage";

export interface PointerSource {
  poll(): InputState;
  dispose(): void;
}

/** Duck-typed on the element id, so plain objects work as targets in node tests. */
export function isStageTarget(target: unknown): boolean {
  if (target === null || typeof target !== "object") return false;
  return (target as { id?: unknown }).id === STAGE_ID;
}

const readPointerId = (event: Event): number | null => {
  const id = (event as PointerEvent).pointerId;
  return typeof id === "number" ? id : null;
};

const readButton = (event: Event): number => {
  const button = (event as PointerEvent).button;
  return typeof button === "number" ? button : 0;
};

export function createPointer(target: Window): PointerSource {
  let pressing = false;
  let pressId: number | null = null;

  const release = (): void => {
    pressing = false;
    pressId = null;
  };

  const onDown = (event: Event): void => {
    if (!isStageTarget(event.target)) return;
    if (readButton(event) !== 0) return;
    const id = readPointerId(event);
    if (id === null) return;
    pressing = true;
    pressId = id;
  };

  const onUp = (event: Event): void => {
    // A release from some other pointer (a second finger leaving the screen)
    // must not stop a trigger this pointer is still holding.
    if (pressId !== null && readPointerId(event) !== pressId) return;
    release();
  };

  // A release outside the window never delivers a pointerup; the buttons mask
  // on the next move tells the truth instead of leaving the cannon stuck on.
  const onMove = (event: Event): void => {
    if (!pressing) return;
    const buttons = (event as PointerEvent).buttons;
    if (typeof buttons === "number" && (buttons & 1) === 0) release();
  };

  target.addEventListener("pointerdown", onDown);
  target.addEventListener("pointerup", onUp);
  target.addEventListener("pointercancel", onUp);
  target.addEventListener("pointermove", onMove);
  target.addEventListener("blur", release);

  return {
    poll(): InputState {
      return {
        moveX: 0,
        moveY: 0,
        jump: false,
        action: pressing,
        dodge: false,
        parry: false,
      };
    },
    dispose(): void {
      release();
      target.removeEventListener("pointerdown", onDown);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("blur", release);
    },
  };
}
