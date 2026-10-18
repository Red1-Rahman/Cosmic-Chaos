import { describe, expect, it } from "vitest";

import { clampMove, createInput } from "../../../src/input/input.js";
import { FakeDomEvent, FakeGamepad, FakeWindow, asWindow, setGamepad } from "./fakes.js";

const NEUTRAL = { moveX: 0, moveY: 0, jump: false, action: false };

function setup(): { win: FakeWindow; input: ReturnType<typeof createInput>; pad: FakeGamepad } {
  const win = new FakeWindow();
  const pad = new FakeGamepad();
  setGamepad(win, pad);
  return { win, input: createInput(asWindow(win)), pad };
}

describe("clampMove", () => {
  it("leaves short vectors alone", () => {
    expect(clampMove(1, 0)).toEqual({ moveX: 1, moveY: 0 });
  });

  it("shortens a diagonal to unit length", () => {
    const result = clampMove(1, 1);
    expect(Math.hypot(result.moveX, result.moveY)).toBeCloseTo(1, 6);
    expect(result.moveX).toBeCloseTo(result.moveY, 6);
  });

  it("stays put for a zero vector", () => {
    expect(clampMove(0, 0)).toEqual({ moveX: 0, moveY: 0 });
  });

  it("keeps a full tilt stick at unit length", () => {
    const result = clampMove(1, -1);
    expect(Math.hypot(result.moveX, result.moveY)).toBeCloseTo(1, 6);
  });
});

describe("createInput merge", () => {
  it("starts neutral", () => {
    const { input } = setup();
    expect(input.poll()).toEqual(NEUTRAL);
  });

  it("reports keyboard movement", () => {
    const { win, input } = setup();
    win.dispatch(new FakeDomEvent("keydown", { code: "KeyD" }));

    expect(input.poll()).toEqual({ moveX: 1, moveY: 0, jump: false, action: false });
  });

  it("clamps a keyboard diagonal so speed never exceeds one", () => {
    const { win, input } = setup();
    win.dispatch(new FakeDomEvent("keydown", { code: "KeyD" }));
    win.dispatch(new FakeDomEvent("keydown", { code: "KeyW" }));

    const state = input.poll();
    expect(Math.hypot(state.moveX, state.moveY)).toBeCloseTo(1, 6);
  });

  it("lets a key pressed after a touch take priority", () => {
    const { win, input } = setup();
    const root = win.document.body.children[0];
    const rightKey = root?.children[0]?.children[2];
    rightKey?.dispatch(new FakeDomEvent("pointerdown", { pointerId: 1 }));
    expect(input.poll().moveX).toBe(1);

    win.dispatch(new FakeDomEvent("keydown", { code: "KeyW" }));

    expect(input.poll().moveY).toBe(-1);
  });

  it("gives priority back to a still held touch once the keys are idle", () => {
    const { win, input } = setup();
    const rightKey = win.document.body.children[0]?.children[0]?.children[2];
    rightKey?.dispatch(new FakeDomEvent("pointerdown", { pointerId: 1 }));
    win.dispatch(new FakeDomEvent("keydown", { code: "KeyW" }));

    expect(input.poll().moveY).toBe(-1);

    win.dispatch(new FakeDomEvent("keyup", { code: "KeyW" }));

    expect(input.poll().moveX).toBe(1);
  });

  it("lets a key pressed after a gamepad take priority", () => {
    const { win, input, pad } = setup();
    pad.setAxes(1, 0);
    expect(input.poll().moveX).toBe(1);

    win.dispatch(new FakeDomEvent("keydown", { code: "KeyW" }));

    expect(input.poll().moveY).toBe(-1);
  });

  it("ignores an idle gamepad while a touch direction is held", () => {
    const { win, input } = setup();
    const upKey = win.document.body.children[0]?.children[0]?.children[0];
    upKey?.dispatch(new FakeDomEvent("pointerdown", { pointerId: 3 }));

    expect(input.poll()).toEqual({ moveX: 0, moveY: -1, jump: false, action: false });
  });

  it("returns neutral when nothing is held", () => {
    const { win, input } = setup();
    win.dispatch(new FakeDomEvent("keydown", { code: "Space" }));
    win.dispatch(new FakeDomEvent("keyup", { code: "Space" }));

    expect(input.poll()).toEqual(NEUTRAL);
  });

  it("resets keyboard held keys on blur", () => {
    const { win, input } = setup();
    win.dispatch(new FakeDomEvent("keydown", { code: "KeyD" }));
    win.dispatch(new FakeDomEvent("blur"));

    expect(input.poll()).toEqual(NEUTRAL);
  });

  it("shows the overlay class for the current viewport", () => {
    const { win } = setup();
    const root = win.document.body.children[0];
    expect(root?.classList.contains("cc-touch-off")).toBe(true);

    win.innerWidth = 420;
    win.dispatch(new FakeDomEvent("resize"));

    expect(root?.classList.contains("cc-touch-on")).toBe(true);
  });

  it("detaches everything on dispose", () => {
    const { win, input } = setup();
    input.dispose();

    win.dispatch(new FakeDomEvent("keydown", { code: "KeyD" }));

    expect(input.poll()).toEqual(NEUTRAL);
    expect(win.listenerCount("keydown")).toBe(0);
    expect(win.listenerCount("resize")).toBe(0);
    expect(win.document.body.children).toHaveLength(0);
  });
});