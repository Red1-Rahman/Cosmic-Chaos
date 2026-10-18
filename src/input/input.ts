// Merged input: keyboard, gamepad and virtual touch, one InputState per frame.
// Merge rule: the most recently active device wins, and diagonal movement is
// clamped so the Capybara never moves faster on a diagonal.
//
// InputState is imported from src/sim/types.ts. Nothing here imports the sim
// for anything but that type, and nothing here touches the simulation itself.
import type { InputState } from "../sim/types.js";
import { createGamepad } from "./gamepad.js";
import { createKeyboard } from "./keyboard.js";
import { createTouchState, mountTouchOverlay, shouldShowTouchControls } from "./touch.js";

export type { InputState };

export interface InputSource {
  poll(): InputState;
  dispose(): void;
}

export const NEUTRAL_INPUT: InputState = Object.freeze({
  moveX: 0,
  moveY: 0,
  jump: false,
  action: false,
});

/** Shorten any move vector to length 1, so a diagonal is not faster than a straight run. */
export function clampMove(x: number, y: number): { moveX: number; moveY: number } {
  const magnitude = Math.sqrt(x * x + y * y);
  if (magnitude <= 1 || magnitude === 0) return { moveX: x, moveY: y };
  return { moveX: x / magnitude, moveY: y / magnitude };
}

function isActive(state: InputState): boolean {
  return state.moveX !== 0 || state.moveY !== 0 || state.jump || state.action;
}

function toState(source: InputState): InputState {
  const { moveX, moveY } = clampMove(source.moveX, source.moveY);
  return { moveX, moveY, jump: source.jump, action: source.action };
}

export function createInput(target: Window): InputSource {
  // A monotonic counter, not a clock: it only ranks devices by recency.
  let recency = 0;
  let keyboardAt = 0;
  let gamepadAt = 0;
  let touchAt = 0;
  const ranker =
    (assign: (value: number) => void): (() => void) =>
    () => {
      recency += 1;
      assign(recency);
    };

  const keyboard = createKeyboard(target, {
    doc: target.document,
    markActive: ranker((value) => {
      keyboardAt = value;
    }),
  });
  const gamepad = createGamepad(target, {
    markActive: ranker((value) => {
      gamepadAt = value;
    }),
  });
  const touchState = createTouchState({
    markActive: ranker((value) => {
      touchAt = value;
    }),
  });
  const overlay = mountTouchOverlay(target.document, touchState);
  const touch: InputSource = {
    poll: () => touchState.poll(),
    dispose: (): void => {
      overlay?.dispose();
    },
  };

  const applyVisibility = (): void => {
    const overlayRoot = overlay?.root;
    if (overlayRoot === undefined) return;
    const visible = shouldShowTouchControls(target);
    overlayRoot.classList.toggle("cc-touch-on", visible);
    overlayRoot.classList.toggle("cc-touch-off", !visible);
  };
  applyVisibility();
  target.addEventListener("resize", applyVisibility);
  target.addEventListener("orientationchange", applyVisibility);

  return {
    poll(): InputState {
      // A device that is still held but idle never outranks one that just moved.
      const best = (state: InputState, at: number, current: InputState | null, bestAt: number) => {
        if (!isActive(state)) return { state: current, at: bestAt };
        // Ties keep the source considered first, so keyboard leads by default.
        return at > bestAt ? { state, at } : { state: current, at: bestAt };
      };

      const afterKeyboard = best(keyboard.poll(), keyboardAt, null, -1);
      const afterGamepad = best(gamepad.poll(), gamepadAt, afterKeyboard.state, afterKeyboard.at);
      const afterTouch = best(touch.poll(), touchAt, afterGamepad.state, afterGamepad.at);

      return afterTouch.state === null ? NEUTRAL_INPUT : toState(afterTouch.state);
    },
    dispose(): void {
      target.removeEventListener("resize", applyVisibility);
      target.removeEventListener("orientationchange", applyVisibility);
      keyboard.dispose();
      gamepad.dispose();
      touch.dispose();
    },
  };
}
