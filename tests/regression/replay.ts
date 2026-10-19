// Replay driver shared by the golden regression test and the one-off generator that
// produced tests/regression/golden/hashWorld-1337.json.
//
// It is deliberately boring: create a world, drain the spawn events, then feed the
// scripted inputs one fixed step at a time and record hashWorld at each checkpoint.
// Nothing else touches the world, so the hash depends only on the seed and the script.
//
// The rider's hull is topped back up on every step. This replay is a determinism
// fixture, not a difficulty curve: once the world reaches "defeat" the step function
// returns early and every checkpoint after that records the same frozen world, which
// would make the tail of the golden worthless. Keeping the rider alive means the
// whole script actually keeps simulating.

import { createWorld, drainEvents, hashWorld, step } from "../../src/sim/world";
import type { Entity, World } from "../../src/sim/types";
import { CHECKPOINTS, FIXED_DT, TOTAL_TICKS, scriptedInputs } from "./script";

export interface ReplayResult {
  readonly seed: number;
  readonly tick: number;
  readonly timeMs: number;
  readonly status: World["status"];
  readonly checkpoints: Readonly<Record<string, string>>;
  readonly finalHash: string;
  readonly eventTypes: readonly string[];
}

/** The seed the golden file is recorded against. Kept next to the replay. */
export const GOLDEN_SEED = 1337;

export function replay(seed: number = GOLDEN_SEED): ReplayResult {
  const inputs = scriptedInputs();
  if (inputs.length !== TOTAL_TICKS) {
    throw new Error(`script is ${String(inputs.length)} steps, expected ${String(TOTAL_TICKS)}`);
  }
  const world = createWorld(seed);
  const eventTypes = new Set<string>();
  for (const event of drainEvents(world)) eventTypes.add(event.type);

  const checkpoints: Record<string, string> = { "0": hashWorld(world) };
  const player = world.entities.find((entity: Entity) => entity.id === world.playerId);
  let index = 0;
  for (const checkpoint of CHECKPOINTS) {
    while (index < checkpoint) {
      step(
        world,
        inputs[index] ?? {
          moveX: 0,
          moveY: 0,
          jump: false,
          action: false,
          dodge: false,
          parry: false,
        },
        FIXED_DT,
      );
      if (player !== undefined) player.hp = 1;
      for (const event of drainEvents(world)) eventTypes.add(event.type);
      index += 1;
    }
    checkpoints[String(checkpoint)] = hashWorld(world);
  }

  return {
    seed: world.seed,
    tick: world.tick,
    timeMs: world.timeMs,
    status: world.status,
    checkpoints,
    finalHash: hashWorld(world),
    eventTypes: [...eventTypes].sort(),
  };
}
