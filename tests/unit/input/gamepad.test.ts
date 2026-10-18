import { describe, expect, it } from "vitest";

import { GAMEPAD_DEADZONE, applyDeadzone, createGamepad } from "../../../src/input/gamepad.js";
import { FakeGamepad, setGamepad } from "./fakes.js";

const SOUTH = 0;
const WEST = 2;
const DPAD_DOWN = 13;
const DPAD_LEFT = 14;
const DPAD_RIGHT = 15;

describe("gamepad deadzone", () => {
  it("kills tiny stick drift", () => {
    expect(applyDeadzone(0.1, 0.05)).toEqual({ x: 0, y: 0 });
  });

  it("keeps a diagonal inside the deadzone dead", () => {
    // 0.13 per axis is a magnitude of about 0.18, comfortably under 0.2.
    expect(applyDeadzone(0.13, 0.13)).toEqual({ x: 0, y: 0 });
  });

  it("rescales beyond the deadzone up to full tilt", () => {
    expect(applyDeadzone(1, 0).x).toBeCloseTo(1, 6);
    expect(applyDeadzone(0, -1).y).toBeCloseTo(-1, 6);
    const half = applyDeadzone(GAMEPAD_DEADZONE, 0);
    expect(half.x).toBeCloseTo(0, 6);
  });

  it("keeps the stick direction while rescaling", () => {
    const result = applyDeadzone(1, 1);
    expect(result.x).toBeCloseTo(result.y, 6);
    expect(result.x).toBeGreaterThan(0);
  });
});

describe("gamepad", () => {
  it("reads the left stick", () => {
    const pad = new FakeGamepad();
    pad.setAxes(1, -0.6);
    const gamepad = createGamepad({ navigator: { getGamepads: () => [pad] } });

    const state = gamepad.poll();
    // A diagonal push is longer than one, so the deadzone scale caps it at full tilt.
    const magnitude = Math.hypot(state.moveX, state.moveY);
    expect(magnitude).toBeCloseTo(1, 6);
    expect(state.moveX).toBeGreaterThan(0);
    expect(state.moveY).toBeLessThan(0);
  });

  it("ignores stick motion inside the deadzone", () => {
    const pad = new FakeGamepad();
    pad.setAxes(0.15, 0);
    const gamepad = createGamepad({ navigator: { getGamepads: () => [pad] } });

    expect(gamepad.poll()).toEqual({ moveX: 0, moveY: 0, jump: false, action: false });
  });

  it("uses the D-pad for full speed movement", () => {
    const pad = new FakeGamepad();
    pad.press(DPAD_LEFT);
    pad.press(DPAD_DOWN);
    const gamepad = createGamepad({ navigator: { getGamepads: () => [pad] } });

    expect(gamepad.poll()).toEqual({ moveX: -1, moveY: 1, jump: false, action: false });
  });

  it("overrides the stick with the D-pad", () => {
    const pad = new FakeGamepad();
    pad.setAxes(-1, 0);
    pad.press(DPAD_RIGHT);
    const gamepad = createGamepad({ navigator: { getGamepads: () => [pad] } });

    expect(gamepad.poll().moveX).toBe(1);
  });

  it("maps south to jump and west to action", () => {
    const pad = new FakeGamepad();
    const gamepad = createGamepad({ navigator: { getGamepads: () => [pad] } });
    expect(gamepad.poll().jump).toBe(false);

    pad.press(SOUTH);
    expect(gamepad.poll().jump).toBe(true);

    pad.press(WEST);
    expect(gamepad.poll().action).toBe(true);
  });

  it("is quiet with no pad attached", () => {
    const gamepad = createGamepad({ navigator: { getGamepads: () => [null] } });

    expect(gamepad.poll()).toEqual({ moveX: 0, moveY: 0, jump: false, action: false });
  });

  it("is quiet when the browser has no Gamepad API", () => {
    const gamepad = createGamepad({});

    expect(gamepad.poll()).toEqual({ moveX: 0, moveY: 0, jump: false, action: false });
  });

  it("stops reading a disconnected pad without complaining", () => {
    const pad = new FakeGamepad();
    pad.connected = false;
    const gamepad = createGamepad({ navigator: { getGamepads: () => [pad] } });

    expect(gamepad.poll()).toEqual({ moveX: 0, moveY: 0, jump: false, action: false });
  });

  it("ignores non standard mappings", () => {
    const pad = new FakeGamepad();
    pad.mapping = "dragon-box";
    pad.press(SOUTH);
    const gamepad = createGamepad({ navigator: { getGamepads: () => [pad] } });

    expect(gamepad.poll()).toEqual({ moveX: 0, moveY: 0, jump: false, action: false });
  });

  it("marks the device active while the pad is used", () => {
    const pad = new FakeGamepad();
    const setGamepads = (): (() => Array<FakeGamepad | null>) => {
      return () => [pad];
    };
    let marks = 0;
    const gamepad = createGamepad(
      { navigator: { getGamepads: setGamepads() } },
      {
        markActive: () => {
          marks += 1;
        },
      },
    );

    gamepad.poll();
    expect(marks).toBe(0);

    pad.press(WEST);
    gamepad.poll();
    gamepad.poll();
    expect(marks).toBe(1);

    pad.release(WEST);
    gamepad.poll();
    expect(marks).toBe(1);

    pad.press(WEST);
    gamepad.poll();
    expect(marks).toBe(2);
  });

  it("skips a disconnected slot and uses the next pad", () => {
    const pad = new FakeGamepad();
    pad.press(SOUTH);
    const host = { navigator: { getGamepads: () => [null, pad] } };
    const gamepad = createGamepad(host);

    expect(gamepad.poll().jump).toBe(true);
  });

  it("disposes without touching the pad", () => {
    const pad = new FakeGamepad();
    const gamepad = createGamepad({ navigator: { getGamepads: () => [pad] } });

    expect(() => {
      gamepad.dispose();
    }).not.toThrow();
  });
});

describe("gamepad host helper", () => {
  it("replaces the pad list used by the fake window", () => {
    const pad = new FakeGamepad();
    pad.setAxes(0, -1);
    const host = { navigator: {} as { getGamepads?: () => Array<FakeGamepad | null> } };
    setGamepad(host, pad);
    const gamepad = createGamepad(host);

    expect(gamepad.poll().moveY).toBeLessThan(0);
  });
});
