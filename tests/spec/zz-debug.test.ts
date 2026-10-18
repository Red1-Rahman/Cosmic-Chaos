import { describe, expect, it } from "vitest";
import { createWorld, drainEvents, step } from "../../src/sim/world";
import { MOVEMENT, ARENA } from "../../src/sim/game-config";

const N = { moveX: 0, moveY: 0, jump: false, action: false };
const C = { x: (ARENA.minX + ARENA.maxX) / 2, y: (ARENA.minY + ARENA.maxY) / 2 };

function meas(sx: number, sy: number, px: number, py: number, ox: number, oy: number) {
  const w = createWorld(1337);
  const get = (k: string) => w.entities.find((e) => e.kind === k)!;
  const o = get("orca");
  const s = get("snail");
  const p = get("player");
  o.x = ox;
  o.y = oy;
  const b = o.x;
  const scales: number[] = [];
  for (let i = 0; i < 60; i += 1) {
    s.x = sx;
    s.y = sy;
    p.x = px;
    p.y = py;
    o.state = "chase";
    o.props.timer = 0;
    o.props.cooldown = 1e9;
    step(w, N, MOVEMENT.fixedDt);
    drainEvents(w);
    scales.push(o.timeScale);
  }
  return {
    travel: Math.abs(o.x - b),
    min: Math.min(...scales),
    max: Math.max(...scales),
    endX: o.x,
  };
}

describe("dbg", () => {
  it("prints", () => {
    const outside = meas(ARENA.minX + 6, ARENA.minY + 6, C.x, C.y, C.x + 240, C.y);
    const inside = meas(C.x, C.y, C.x + 120, C.y, C.x - 120, C.y);
    process.stdout.write(`OUTSIDE ${JSON.stringify(outside)}\n`);
    process.stdout.write(`INSIDE ${JSON.stringify(inside)}\n`);
    expect(true).toBe(true);
  });
});