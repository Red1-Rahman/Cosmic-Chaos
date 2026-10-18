// Keyboard source: WASD and arrows move, Space jumps, J or Shift acts.
// Axes are raw diagonal sums in [-1, 1]; the merge layer in input.ts clamps them.
import type { InputState } from "./input.js";

export interface KeyboardOptions {
  /** Called whenever a game key goes down, so the merge layer can rank devices. */
  markActive?: () => void;
  /** Document used for the visibilitychange listener. Defaults to target.document. */
  doc?: Document | undefined;
}

export interface KeyboardSource {
  poll(): InputState;
  dispose(): void;
}

type Direction = "left" | "right" | "up" | "down";

const DIRECTION_CODES: Readonly<Record<Direction, readonly string[]>> = {
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
};

const JUMP_CODES: readonly string[] = ["Space"];
const ACTION_CODES: readonly string[] = ["KeyJ", "ShiftLeft", "ShiftRight"];

/** Every key this source reacts to, so default scrolling can be suppressed for them only. */
export function isGameKeyCode(code: string): boolean {
  return (
    DIRECTION_CODES.left.includes(code) ||
    DIRECTION_CODES.right.includes(code) ||
    DIRECTION_CODES.up.includes(code) ||
    DIRECTION_CODES.down.includes(code) ||
    JUMP_CODES.includes(code) ||
    ACTION_CODES.includes(code)
  );
}

function directionOf(code: string): Direction | null {
  for (const [direction, codes] of Object.entries(DIRECTION_CODES) as [
    Direction,
    readonly string[],
  ][]) {
    if (codes.includes(code)) return direction;
  }
  return null;
}

export function createKeyboard(target: Window, options: KeyboardOptions = {}): KeyboardSource {
  const markActive = options.markActive ?? ((): void => undefined);
  const pressed = new Set<string>();

  const readCode = (event: Event): string => {
    const code = (event as KeyboardEvent).code;
    return typeof code === "string" ? code : "";
  };

  const onKeyDown = (event: Event): void => {
    const code = readCode(event);
    if (code === "" || !isGameKeyCode(code)) return;
    event.preventDefault();
    if (!pressed.has(code)) {
      pressed.add(code);
      markActive();
    }
  };

  const onKeyUp = (event: Event): void => {
    const code = readCode(event);
    if (!isGameKeyCode(code)) return;
    event.preventDefault();
    pressed.delete(code);
  };

  const reset = (): void => {
    pressed.clear();
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", reset);
  // The cast keeps a bare fake window legal in node tests, where document may be absent.
  const doc: Document | undefined =
    options.doc ?? (target as { readonly document?: Document }).document;
  doc?.addEventListener("visibilitychange", reset);

  return {
    poll(): InputState {
      let moveX = 0;
      let moveY = 0;
      let jump = false;
      let action = false;
      for (const code of pressed) {
        const direction = directionOf(code);
        if (direction !== null) {
          if (direction === "left") moveX -= 1;
          if (direction === "right") moveX += 1;
          if (direction === "up") moveY -= 1;
          if (direction === "down") moveY += 1;
        } else if (JUMP_CODES.includes(code)) {
          jump = true;
        } else if (ACTION_CODES.includes(code)) {
          action = true;
        }
      }
      return { moveX, moveY, jump, action };
    },
    dispose(): void {
      pressed.clear();
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", reset);
      doc?.removeEventListener("visibilitychange", reset);
    },
  };
}
