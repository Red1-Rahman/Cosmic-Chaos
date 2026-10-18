// TEMPORARY generator, deleted immediately after it writes the golden file.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import { replay, GOLDEN_SEED } from "./replay";
import { CHECKPOINTS, FIXED_DT, PHASES, TOTAL_TICKS } from "./script";

it("writes the golden replay file", () => {
  const result = replay(GOLDEN_SEED);
  const golden = {
    readme:
      "Golden hashWorld checkpoints for the scripted replay in tests/regression/script.ts. " +
      "Regenerate only for an intended simulation change, and record why in docs/decisions.md.",
    seed: result.seed,
    fixedDt: FIXED_DT,
    totalTicks: TOTAL_TICKS,
    checkpoints: CHECKPOINTS,
    phases: PHASES.map((phase) => ({ name: phase.name, ticks: phase.ticks })),
    finalHash: result.finalHash,
    hashes: result.checkpoints,
    eventTypes: result.eventTypes,
  };
  mkdirSync(join(process.cwd(), "tests", "regression", "golden"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "tests", "regression", "golden", "hashWorld-1337.json"),
    `${JSON.stringify(golden, null, 2)}\n`,
    "utf8",
  );
});