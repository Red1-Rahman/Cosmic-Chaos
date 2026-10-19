// Keyboard source: WASD and arrows move, Space jumps, J or Shift acts,
// K dodges, L or Q parries.
// Axes are raw diagonal sums in [-1, 1]; the merge layer in input.ts clamps them.
//
// A focused text field owns its keystrokes: while one has focus this source
// neither reads nor prevents default, so a rider name typed with WASD letters
// and Spaces lands in the field instead of steering the waterbike.
import type { InputState } from "./input.js";

export interface KeyboardOptions {
  /** Called whenever a game key goes down, so the merge layer can rank devices. */
  markActive?: () => void;
  /** Document used for the visibilitychange and focusin listeners. Defaults to target.document. */
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
const DODGE_CODES: readonly string[] = ["KeyK"];
const PARRY_CODES: readonly string[] = ["KeyL", "KeyQ"];
/** Escape is handled by the app, which owns the screen stack, not by this source. */
export const ESCAPE_CODE = "Escape";

/** Input kinds that take text, and so take the keyboard with them. */
const TEXT_INPUT_TYPES = new Set(["", "text", "email", "number", "password", "search", "tel", "url"]);

/** Every key this source reacts to, so default scrolling can be suppressed for them only. */
export function isGameKeyCode(code: string): boolean {
  return (
    DIRECTION_CODES.left.includes(code) ||
    DIRECTION_CODES.right.includes(code) ||
    DIRECTION_CODES.up.includes(code) ||
    DIRECTION_CODES.down.includes(code) ||
    JUMP_CODES.includes(code) ||
    ACTION_CODES.includes(code) ||
    DODGE_CODES.includes(code) ||
    PARRY_CODES.includes(code)
  );
}

/**
 * True when the keystroke belongs to a text field. Duck-typed on purpose: the
 * unit tests dispatch plain objects as event targets, and the app only needs
 * tagName, type and isContentEditable to make the call.
 */
export function isEditableTarget(target: unknown): boolean {
  if (target === null || typeof target !== "object") return false;
  const node = target as { tagName?: unknown; type?: unknown; isContentEditable?: unknown };
  if (node.isContentEditable === true) return true;
  const tag = typeof node.tagName === "string" ? node.tagName.toUpperCase() : "";
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  return TEXT_INPUT_TYPES.has(typeof node.type === "string" ? node.type.toLowerCase() : "");
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
    if (isEditableTarget(event.target)) {
      // The field is typing, not the pilot. Anything still held from before
      // the focus change goes too, so no steer survives into the field.
      pressed.clear();
      return;
    }
    event.preventDefault();
    if (!pressed.has(code)) {
      pressed.add(code);
      markActive();
    }
  };

  const onKeyUp = (event: Event): void => {
    const code = readCode(event);
    if (!isGameKeyCode(code)) return;
    pressed.delete(code);
    // Same rule on the way out: never swallow a key the field may still want.
    if (isEditableTarget(event.target)) return;
    event.preventDefault();
  };

  const reset = (): void => {
    pressed.clear();
  };

  // Focus landing in a field means the pilot is typing, not piloting.
  const onFocusIn = (event: Event): void => {
    if (isEditableTarget(event.target)) pressed.clear();
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", reset);
  // The cast keeps a bare fake window legal in node tests, where document may be absent.
  const doc: Document | undefined =
    options.doc ?? (target as { readonly document?: Document }).document;
  doc?.addEventListener("visibilitychange", reset);
  doc?.addEventListener("focusin", onFocusIn);

  return {
    poll(): InputState {
      let moveX = 0;
      let moveY = 0;
      let jump = false;
      let action = false;
      let dodge = false;
      let parry = false;
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
        } else if (DODGE_CODES.includes(code)) {
          dodge = true;
        } else if (PARRY_CODES.includes(code)) {
          parry = true;
        }
      }
      return { moveX, moveY, jump, action, dodge, parry };
    },
    dispose(): void {
      pressed.clear();
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", reset);
      doc?.removeEventListener("visibilitychange", reset);
      doc?.removeEventListener("focusin", onFocusIn);
    },
  };
}
