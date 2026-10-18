// The scripted replay the regression gate replays. Shared by the golden test and by
// the generator that produced tests/regression/golden/hashWorld-1337.json, so the two
// can never drift apart silently: if the script changes, the golden stops matching.
//
// The script deliberately exercises every behaviour that owns a constant: waterbike
// movement and the jump arc, wake splashes, the laser action, a crossing of the snail's
// time field in both directions, the shark dash loop, the tarantula reaction and the
// orca chase through telegraph into lunge.

import type { InputState } from "../../src/sim/types";
import { MOVEMENT } from "../../src/sim/game-config";

const NEUTRAL: InputState = Object.freeze({ moveX: 0, moveY: 0, jump: false, action: false });

export function input(patch: Partial<InputState>): InputState {
  return { ...NEUTRAL, ...patch };
}

export interface Phase {
  readonly name: string;
  readonly ticks: number;
  readonly input: InputState;
}

export const PHASES: readonly Phase[] = Object.freeze([
  { name: "idle on the water", ticks: 60, input: NEUTRAL },
  { name: "accelerate right", ticks: 90, input: input({ moveX: 1 }) },
  { name: "dive forward", ticks: 60, input: input({ moveY: 1 }) },
  { name: "waterbike hop", ticks: 45, input: input({ moveX: 1, jump: true }) },
  { name: "fire the laser", ticks: 45, input: input({ action: true, moveX: 0.5 }) },
  { name: "run left and up", ticks: 120, input: input({ moveX: -1, moveY: -0.5 }) },
  { name: "strafe across the field", ticks: 150, input: input({ moveY: -1, moveX: 0.4 }) },
  { name: "leave the field", ticks: 90, input: input({ moveX: -0.6 }) },
  { name: "settle", ticks: 60, input: input({ moveX: 1, moveY: 0.25 }) },
  { name: "coast", ticks: 120, input: NEUTRAL },
]);

/** The full input list, one entry per fixed step. */
export function scriptedInputs(): InputState[] {
  const out: InputState[] = [];
  for (const phase of PHASES) {
    for (let i = 0; i < phase.ticks; i += 1) out.push(phase.input);
  }
  return out;
}

/** Total number of fixed steps in the script. */
export const TOTAL_TICKS = PHASES.reduce((sum, phase) => sum + phase.ticks, 0);

/**
 * The fixed step every replay uses. Recorded in the golden file, and asserted against
 * MOVEMENT so a change to the timestep can never be mistaken for a determinism bug.
 */
export const FIXED_DT = MOVEMENT.fixedDt;

/** Tick counts at which hashWorld is captured, in golden file order. */
export const CHECKPOINTS: readonly number[] = Object.freeze(
  PHASES.reduce<number[]>((marks, phase, index) => {
    const soFar = PHASES.slice(0, index).reduce((sum, entry) => sum + entry.ticks, 0);
    return [...marks, soFar + phase.ticks];
  }, []),
);