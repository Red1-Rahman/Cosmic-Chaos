// Gamepad source, standard mapping only. Left stick and D-pad move,
// south button jumps, west button acts. Connect and disconnect are silent.
import type { InputState } from "./input.js";

export const GAMEPAD_DEADZONE = 0.2;

const BUTTON_SOUTH = 0;
const BUTTON_WEST = 2;
const BUTTON_DPAD_UP = 12;
const BUTTON_DPAD_DOWN = 13;
const BUTTON_DPAD_LEFT = 14;
const BUTTON_DPAD_RIGHT = 15;

export interface GamepadButtonLike {
  readonly pressed: boolean;
}

export interface GamepadLike {
  readonly axes: ArrayLike<number>;
  readonly buttons: ArrayLike<GamepadButtonLike>;
  readonly connected?: boolean;
  readonly mapping?: string;
}

export interface GamepadHost {
  readonly navigator?: { readonly getGamepads?: () => ArrayLike<GamepadLike | null> } | undefined;
}

export interface GamepadOptions {
  markActive?: () => void;
}

export interface GamepadSource {
  poll(): InputState;
  dispose(): void;
}

/** Radial deadzone with rescaling, so the stick still reaches full tilt at the stops. */
export function applyDeadzone(x: number, y: number, deadzone = GAMEPAD_DEADZONE): {
  x: number;
  y: number;
} {
  const magnitude = Math.sqrt(x * x + y * y);
  if (magnitude <= deadzone) return { x: 0, y: 0 };
  // A diagonal push reports a magnitude above 1, so cap it before rescaling.
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  return { x: (x / magnitude) * scaled, y: (y / magnitude) * scaled };
}

function axisValue(gamepad: GamepadLike, index: number): number {
  const value = gamepad.axes[index];
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}

function buttonDown(gamepad: GamepadLike, index: number): boolean {
  const button = gamepad.buttons[index];
  return button?.pressed === true;
}

function firstGamepad(host: GamepadHost): GamepadLike | null {
  const getGamepads = host.navigator?.getGamepads;
  if (typeof getGamepads !== "function") return null;
  const pads = getGamepads.call(host.navigator);
  for (let index = 0; index < pads.length; index += 1) {
    const pad = pads[index];
    if (pad === null || pad === undefined) continue;
    if (pad.connected !== false) return pad;
  }
  return null;
}

// Connect and disconnect need no bookkeeping: every poll re-reads
// navigator.getGamepads(), so a pad that vanishes simply reads as null and the
// previous frame's state stops being produced.
export function createGamepad(target: GamepadHost, options: GamepadOptions = {}): GamepadSource {
  const markActive = options.markActive ?? ((): void => undefined);
  // Only the transition from idle to active counts as activity, so holding a
  // stick does not keep stealing priority from a key pressed later.
  let wasActive = false;

  return {
    poll(): InputState {
      const gamepad = firstGamepad(target);
      if (gamepad === null) return { moveX: 0, moveY: 0, jump: false, action: false };
      if (gamepad.mapping !== undefined && gamepad.mapping !== "standard") {
        return { moveX: 0, moveY: 0, jump: false, action: false };
      }

      const stick = applyDeadzone(axisValue(gamepad, 0), axisValue(gamepad, 1));
      let moveX = stick.x;
      let moveY = stick.y;
      if (buttonDown(gamepad, BUTTON_DPAD_LEFT)) moveX = -1;
      if (buttonDown(gamepad, BUTTON_DPAD_RIGHT)) moveX = 1;
      if (buttonDown(gamepad, BUTTON_DPAD_UP)) moveY = -1;
      if (buttonDown(gamepad, BUTTON_DPAD_DOWN)) moveY = 1;

      const state: InputState = {
        moveX,
        moveY,
        jump: buttonDown(gamepad, BUTTON_SOUTH),
        action: buttonDown(gamepad, BUTTON_WEST),
      };
      const active = state.moveX !== 0 || state.moveY !== 0 || state.jump || state.action;
      if (active && !wasActive) markActive();
      wasActive = active;
      return state;
    },
    dispose(): void {
      wasActive = false;
    },
  };
}