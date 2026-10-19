import type { AudioCue } from "../audio";
import type { GameEvent } from "../sim/types";

/**
 * The only place where sim events become sound. Rendering and audio never read the sim
 * directly, so this mapping is the whole contract between gameplay and the speakers.
 *
 * `spawn` is deliberately silent: six spawns at boot would be noise, not feedback.
 */
export function cueForEvent(event: GameEvent): AudioCue | undefined {
  switch (event.type) {
    case "hit":
      return "hit";
    case "jump":
      return "jump";
    case "splash":
      return "splash";
    case "laser":
      return "laser";
    case "timeFieldEnter":
      return "timeFieldEnter";
    case "timeFieldExit":
      return "timeFieldExit";
    case "defeat":
      return "defeat";
    case "victory":
      return "victory";
    case "ui":
      return "ui";
    case "dodge":
      return "dodge";
    case "parry":
      return "parry";
    case "parrySuccess":
      return "parry";
    case "collect":
      return "collect";
    case "stagger":
      return "stagger";
    case "blocked":
      return "block";
    case "objective":
      return "collect";
    case "dialogue":
      return undefined;
    case "spawn":
      return undefined;
    default:
      return undefined;
  }
}

export interface EngineState {
  readonly speed01: number;
  readonly timeScale: number;
}

/** Engine throttle and pitch follow the player's speed and the active time scale. */
export function engineForState(
  speed: number,
  timeScale: number,
  speedReference: number,
): EngineState {
  const throttle = speedReference > 0 ? Math.min(1, Math.max(0, speed / speedReference)) : 0;
  return { speed01: throttle, timeScale };
}
