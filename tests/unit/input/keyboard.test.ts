import { describe, expect, it } from "vitest";

import { createKeyboard, isGameKeyCode } from "../../../src/input/keyboard.js";
import { FakeDomEvent, FakeWindow, asWindow } from "./fakes.js";

function setup(): { win: FakeWindow; target: Window; press: (code: string) => FakeDomEvent } {
  const win = new FakeWindow();
  return {
    win,
    target: asWindow(win),
    press: (code: string): FakeDomEvent => win.dispatch(new FakeDomEvent("keydown", { code })),
  };
}

describe("keyboard", () => {
  it("maps WASD and arrows to movement axes", () => {
    const { win, target, press } = setup();
    const keys = createKeyboard(target);

    press("KeyD");
    expect(keys.poll()).toEqual({ moveX: 1, moveY: 0, jump: false, action: false });
    win.dispatch(new FakeDomEvent("keyup", { code: "KeyD" }));

    press("KeyW");
    expect(keys.poll()).toEqual({ moveX: 0, moveY: -1, jump: false, action: false });
    win.dispatch(new FakeDomEvent("keyup", { code: "KeyW" }));

    press("ArrowLeft");
    expect(keys.poll()).toEqual({ moveX: -1, moveY: 0, jump: false, action: false });
  });

  it("releases on keyup", () => {
    const { win, target, press } = setup();
    const keys = createKeyboard(target);
    press("Space");

    expect(keys.poll().jump).toBe(true);
    win.dispatch(new FakeDomEvent("keyup", { code: "Space" }));
    expect(keys.poll()).toEqual({ moveX: 0, moveY: 0, jump: false, action: false });
  });

  it("combines a held diagonal into both axes", () => {
    const { target, press } = setup();
    const keys = createKeyboard(target);
    press("KeyD");
    press("KeyS");

    expect(keys.poll()).toEqual({ moveX: 1, moveY: 1, jump: false, action: false });
  });

  it("reads jump and action keys", () => {
    const { target, press } = setup();
    const keys = createKeyboard(target);
    press("Space");
    press("KeyJ");
    expect(keys.poll()).toEqual({ moveX: 0, moveY: 0, jump: true, action: true });
  });

  it("resets every held key on blur", () => {
    const { win, target, press } = setup();
    const keys = createKeyboard(target);
    press("KeyD");
    press("Space");

    win.dispatch(new FakeDomEvent("blur"));

    expect(keys.poll()).toEqual({ moveX: 0, moveY: 0, jump: false, action: false });
  });

  it("resets every held key when the document hides", () => {
    const { win, target, press } = setup();
    const keys = createKeyboard(target, { doc: win.document as unknown as Document });
    press("KeyA");

    win.document.dispatch(new FakeDomEvent("visibilitychange"));

    expect(keys.poll().moveX).toBe(0);
  });

  it("prevents default for game keys only", () => {
    const { win, target } = setup();
    createKeyboard(target);

    const game = win.dispatch(new FakeDomEvent("keydown", { code: "Space" }));
    const other = win.dispatch(new FakeDomEvent("keydown", { code: "KeyR" }));

    expect(game.defaultPrevented).toBe(true);
    expect(other.defaultPrevented).toBe(false);
  });

  it("ignores keys that are not in the game key set", () => {
    expect(isGameKeyCode("KeyQ")).toBe(false);
    expect(isGameKeyCode("Space")).toBe(true);
    expect(isGameKeyCode("ShiftLeft")).toBe(true);
  });

  it("marks the device active once per key down", () => {
    const { target, press } = setup();
    let marks = 0;
    const keys = createKeyboard(target, {
      markActive: () => {
        marks += 1;
      },
    });

    press("KeyD");
    press("KeyD");
    press("KeyW");

    expect(marks).toBe(2);
    expect(keys.poll().moveY).toBe(-1);
  });

  it("stops reading keys after dispose", () => {
    const { win, target, press } = setup();
    const keys = createKeyboard(target);
    keys.dispose();

    press("KeyD");

    expect(keys.poll()).toEqual({ moveX: 0, moveY: 0, jump: false, action: false });
    expect(win.listenerCount("keydown")).toBe(0);
  });
});