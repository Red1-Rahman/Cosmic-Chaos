// One-off generator for tests/regression/golden/hashWorld-1337.json.
//
// It is NOT part of any gate: vitest only picks up *.test.ts, and the regression test
// never writes this file. Run it by hand when a change to the simulation is intended,
// then record the new hashes in docs/decisions.md. Never run it to make a red gate green.
//
//   npx vitest run tests/regression/generate-golden.ts
//
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
  const dir = fileURLToPath(new URL("./golden/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "hashWorld-1337.json"), `${JSON.stringify(golden, null, 2)}\n`, "utf8");
});