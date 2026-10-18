// Runs every CI gate in the order defined by tech-stack.json.
// Usage: node scripts/run-gates.mjs [--only lint,spec] [--keep-going]
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const stack = JSON.parse(readFileSync("tech-stack.json", "utf8"));
const args = process.argv.slice(2);
const keepGoing = args.includes("--keep-going");
const onlyArg = args.indexOf("--only");
const only = onlyArg >= 0 ? new Set((args[onlyArg + 1] ?? "").split(",")) : null;

const gates = [
  ["harness", stack.ci.preGate],
  ...stack.ci.stageOrder.map((s) => [s, stack.ci.stageCommands[s]]),
];
const results = [];

for (const [name, command] of gates) {
  if (only && !only.has(name) && name !== "harness") continue;
  console.log(`\n=== gate: ${name} (${command}) ===`);
  const started = Date.now();
  const run = spawnSync(command, { stdio: "inherit", shell: true });
  const ok = run.status === 0;
  results.push({ name, ok, seconds: ((Date.now() - started) / 1000).toFixed(1) });
  if (!ok && !keepGoing) break;
}

console.log("\n=== summary ===");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  ${r.seconds}s`);
const failed = results.some((r) => !r.ok);
console.log(failed ? "\ntest:ci FAILED" : "\ntest:ci PASSED");
process.exit(failed ? 1 : 0);
