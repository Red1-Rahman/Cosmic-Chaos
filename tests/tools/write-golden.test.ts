// Regenerates tests/regression/golden/hashWorld-1337.json from the real simulation.
//
// This is a maintenance tool, not a gate. It runs exactly the replay the regression
// gate runs and writes exactly the fields the gate reads, so a regeneration is
// reviewable rather than a copy and paste. It lives outside tests/regression so no
// CI stage picks it up: run it explicitly.
//
//   npx vitest run tests/tools/write-golden.test.ts
//
// Only ever run this for an intended simulation change, and record the reason in
// docs/decisions.md first.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { it } from "vitest";

import { GOLDEN_SEED, replay } from "../regression/replay";
import { CHECKPOINTS, FIXED_DT, PHASES, TOTAL_TICKS } from "../regression/script";

it("writes the golden file from the current simulation", () => {
  const result = replay(GOLDEN_SEED);
  const golden = {
    readme:
      "Golden hashWorld checkpoints for the scripted replay in tests/regression/script.ts. Regenerate only for an intended simulation change, and record why in docs/decisions.md.",
    seed: GOLDEN_SEED,
    fixedDt: FIXED_DT,
    totalTicks: TOTAL_TICKS,
    checkpoints: [...CHECKPOINTS],
    phases: PHASES.map((phase) => ({ name: phase.name, ticks: phase.ticks })),
    finalHash: result.finalHash,
    hashes: result.checkpoints,
    eventTypes: result.eventTypes,
  };
  const path = fileURLToPath(new URL("../regression/golden/hashWorld-1337.json", import.meta.url));
  writeFileSync(path, `${JSON.stringify(golden, null, 2)}\n`);
});
