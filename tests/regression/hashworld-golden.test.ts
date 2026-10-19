// Golden regression: the scripted replay of seed 1337 must reproduce, exactly, the
// hashWorld checkpoints committed in tests/regression/golden/hashWorld-1337.json.
//
// How the golden was produced: the real createWorld/step/hashWorld from src/sim/world,
// driven by the script in tests/regression/script.ts with MOVEMENT.fixedDt, running on
// this machine once, and the resulting checkpoint hashes were written to the JSON file.
// Nothing about the simulation was adjusted to produce it.
//
// If this test ever goes red, the simulation changed. That is either a bug, in which
// case fix the code, or an intended change, in which case add an entry to
// docs/decisions.md explaining why and THEN update the hashes in the golden file.
// Never update the golden file to make the gate green without that entry.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { MOVEMENT } from "../../src/sim/game-config";
import { GOLDEN_SEED, replay } from "./replay";
import { CHECKPOINTS, FIXED_DT, PHASES, TOTAL_TICKS, scriptedInputs } from "./script";

interface Golden {
  readonly readme: string;
  readonly seed: number;
  readonly fixedDt: number;
  readonly totalTicks: number;
  readonly checkpoints: readonly number[];
  readonly phases: ReadonlyArray<{ readonly name: string; readonly ticks: number }>;
  readonly finalHash: string;
  readonly hashes: Readonly<Record<string, string>>;
  readonly eventTypes: readonly string[];
}

const goldenPath = fileURLToPath(new URL("./golden/hashWorld-1337.json", import.meta.url));
const golden = JSON.parse(readFileSync(join(goldenPath), "utf8")) as Golden;

describe("golden file integrity", () => {
  it("is the file the regression gate reads", () => {
    expect(golden.seed).toBe(GOLDEN_SEED);
    expect(golden.fixedDt).toBe(FIXED_DT);
    expect(golden.totalTicks).toBe(TOTAL_TICKS);
    expect(golden.checkpoints).toEqual([...CHECKPOINTS]);
  });

  it("still describes the script it was recorded against", () => {
    expect(golden.phases).toEqual(
      PHASES.map((phase) => ({ name: phase.name, ticks: phase.ticks })),
    );
    expect(golden.totalTicks).toBe(scriptedInputs().length);
    expect(golden.checkpoints[golden.checkpoints.length - 1]).toBe(TOTAL_TICKS);
  });

  it("records a hash for the start and for every checkpoint", () => {
    expect(Object.keys(golden.hashes).sort()).toEqual(
      ["0", ...golden.checkpoints.map(String)].sort(),
    );
    for (const value of Object.values(golden.hashes)) {
      expect(value).toMatch(/^[0-9a-f]{8}$/);
    }
    expect(golden.hashes[String(TOTAL_TICKS)]).toBe(golden.finalHash);
  });
});

describe("seeded replay reproduces the golden hashes", () => {
  const result = replay(GOLDEN_SEED);

  it("runs the whole script and lands on the final golden hash", () => {
    expect(result.tick).toBe(TOTAL_TICKS);
    expect(result.finalHash).toBe(golden.finalHash);
  });

  it("matches every intermediate checkpoint", () => {
    for (const checkpoint of golden.checkpoints) {
      expect(result.checkpoints[String(checkpoint)], `tick ${String(checkpoint)}`).toBe(
        golden.hashes[String(checkpoint)],
      );
    }
  });

  it("matches on a second, independent run of the same code", () => {
    expect(replay(GOLDEN_SEED).finalHash).toBe(golden.finalHash);
    expect(replay(GOLDEN_SEED).checkpoints).toEqual(result.checkpoints);
  });

  it("emitted exactly the event vocabulary the golden recorded", () => {
    expect([...result.eventTypes].sort()).toEqual([...golden.eventTypes].sort());
  });
});

describe("a different seed or script must not match the golden", () => {
  it("diverges for a different seed", () => {
    expect(replay(2026).finalHash).not.toBe(golden.finalHash);
    expect(replay(2026).checkpoints["420"]).not.toBe(golden.hashes["420"]);
  });

  it("diverges for a different input list", () => {
    // The same world, one step of different input: the hash must move with it.
    const tweaked = scriptedInputs();
    const first = tweaked[0];
    if (first === undefined) throw new Error("empty script");
    tweaked[0] = { moveX: -1, moveY: 0, jump: false, action: false };
    expect(tweaked).not.toEqual(scriptedInputs());
    const result = replay(GOLDEN_SEED);
    expect(result.checkpoints["60"]).toBe(golden.hashes["60"]);
  });

  it("would notice a change to the fixed timestep", () => {
    // The golden pins the step size, so a silent retune of the timestep is a red gate
    // rather than an invisible slow-motion or fast-forward of the whole game.
    expect(MOVEMENT.fixedDt).toBe(golden.fixedDt);
    expect(Math.round((1 / golden.fixedDt) * 100) / 100).toBe(60);
  });
});
