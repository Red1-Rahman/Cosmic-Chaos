import { describe, expect, it } from "vitest";

import { createKeyboard, isEditableTarget, isGameKeyCode } from "../../../src/input/keyboard.js";
import { FakeDomEvent, FakeElement, FakeWindow, asWindow } from "./fakes.js";

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
    expect(keys.poll()).toEqual({
      moveX: 1,
      moveY: 0,
      jump: false,
      action: false,
      dodge: false,
      parry: false,
    });
    win.dispatch(new FakeDomEvent("keyup", { code: "KeyD" }));

    press("KeyW");
    expect(keys.poll()).toEqual({
      moveX: 0,
      moveY: -1,
      jump: false,
      action: false,
      dodge: false,
      parry: false,
    });
    win.dispatch(new FakeDomEvent("keyup", { code: "KeyW" }));

    press("ArrowLeft");
    expect(keys.poll()).toEqual({
      moveX: -1,
      moveY: 0,
      jump: false,
      action: false,
      dodge: false,
      parry: false,
    });
  });

  it("releases on keyup", () => {
    const { win, target, press } = setup();
    const keys = createKeyboard(target);
    press("Space");

    expect(keys.poll().jump).toBe(true);
    win.dispatch(new FakeDomEvent("keyup", { code: "Space" }));
    expect(keys.poll()).toEqual({
      moveX: 0,
      moveY: 0,
      jump: false,
      action: false,
      dodge: false,
      parry: false,
    });
  });

  it("combines a held diagonal into both axes", () => {
    const { target, press } = setup();
    const keys = createKeyboard(target);
    press("KeyD");
    press("KeyS");

    expect(keys.poll()).toEqual({
      moveX: 1,
      moveY: 1,
      jump: false,
      action: false,
      dodge: false,
      parry: false,
    });
  });

  it("reads jump and action keys", () => {
    const { target, press } = setup();
    const keys = createKeyboard(target);
    press("Space");
    press("KeyJ");
    expect(keys.poll()).toEqual({
      moveX: 0,
      moveY: 0,
      jump: true,
      action: true,
      dodge: false,
      parry: false,
    });
  });

  it("resets every held key on blur", () => {
    const { win, target, press } = setup();
    const keys = createKeyboard(target);
    press("KeyD");
    press("Space");

    win.dispatch(new FakeDomEvent("blur"));

    expect(keys.poll()).toEqual({
      moveX: 0,
      moveY: 0,
      jump: false,
      action: false,
      dodge: false,
      parry: false,
    });
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
    expect(isGameKeyCode("KeyX")).toBe(false);
    expect(isGameKeyCode("Space")).toBe(true);
    expect(isGameKeyCode("ShiftLeft")).toBe(true);
    expect(isGameKeyCode("KeyK")).toBe(true);
    expect(isGameKeyCode("KeyL")).toBe(true);
    // Escape belongs to the app's screen stack, not to the input layer.
    expect(isGameKeyCode("Escape")).toBe(false);
  });

  it("prevents default for game keys only", () => {
    const { win, target } = setup();
    createKeyboard(target);

    const game = win.dispatch(new FakeDomEvent("keydown", { code: "Space" }));
    const other = win.dispatch(new FakeDomEvent("keydown", { code: "KeyX" }));

    expect(game.defaultPrevented).toBe(true);
    expect(other.defaultPrevented).toBe(false);
  });

  it("reads the dodge and parry keys", () => {
    const { win, target, press } = setup();
    const keys = createKeyboard(target);
    press("KeyK");
    press("KeyL");

    const state = keys.poll();
    expect(state.dodge).toBe(true);
    expect(state.parry).toBe(true);

    win.dispatch(new FakeDomEvent("keyup", { code: "KeyL" }));
    expect(keys.poll().parry).toBe(false);
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

    expect(keys.poll()).toEqual({
      moveX: 0,
      moveY: 0,
      jump: false,
      action: false,
      dodge: false,
      parry: false,
    });
    expect(win.listenerCount("keydown")).toBe(0);
  });

  it("recognises editable targets by duck type", () => {
    expect(isEditableTarget(new FakeElement("input"))).toBe(true);
    expect(isEditableTarget(new FakeElement("textarea"))).toBe(true);
    expect(isEditableTarget(new FakeElement("select"))).toBe(true);
    expect(isEditableTarget({ isContentEditable: true })).toBe(true);
    expect(isEditableTarget(new FakeElement("button"))).toBe(false);
    expect(isEditableTarget({ tagName: "input", type: "checkbox" })).toBe(false);
    expect(isEditableTarget({ tagName: "input", type: "range" })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });

  it("leaves keystrokes to a focused text field", () => {
    const { win, target } = setup();
    let marks = 0;
    const keys = createKeyboard(target, {
      markActive: () => {
        marks += 1;
      },
    });
    const field = new FakeElement("input");

    const steer = win.dispatch(new FakeDomEvent("keydown", { code: "KeyW", target: field }));
    const hop = win.dispatch(new FakeDomEvent("keydown", { code: "Space", target: field }));

    expect(steer.defaultPrevented).toBe(false);
    expect(hop.defaultPrevented).toBe(false);
    expect(marks).toBe(0);
    expect(keys.poll()).toEqual({
      moveX: 0,
      moveY: 0,
      jump: false,
      action: false,
      dodge: false,
      parry: false,
    });
  });

  it("drops held keys when focus lands in a field", () => {
    const { win, target, press } = setup();
    const keys = createKeyboard(target);
    press("KeyD");
    expect(keys.poll().moveX).toBe(1);

    win.document.dispatch(new FakeDomEvent("focusin", { target: new FakeElement("input") }));

    expect(keys.poll().moveX).toBe(0);
  });

  it("keeps focus outside a field steering", () => {
    const { win, target, press } = setup();
    const keys = createKeyboard(target);

    win.document.dispatch(new FakeDomEvent("focusin", { target: new FakeElement("button") }));
    press("KeyD");

    expect(keys.poll().moveX).toBe(1);
  });

  it("releases without preventing default when the keyup lands in a field", () => {
    const { win, target, press } = setup();
    const keys = createKeyboard(target);
    press("KeyD");
    expect(keys.poll().moveX).toBe(1);

    const up = win.dispatch(
      new FakeDomEvent("keyup", { code: "KeyD", target: new FakeElement("input") }),
    );

    expect(up.defaultPrevented).toBe(false);
    expect(keys.poll().moveX).toBe(0);
  });

  it("treats a contenteditable node as a field", () => {
    const { win, target } = setup();
    const keys = createKeyboard(target);

    const event = win.dispatch(
      new FakeDomEvent("keydown", { code: "KeyA", target: { isContentEditable: true } }),
    );

    expect(event.defaultPrevented).toBe(false);
    expect(keys.poll().moveX).toBe(0);
  });
});
