import { describe, expect, it } from "vitest";

import { STAGE_ID, createPointer, isStageTarget } from "../../../src/input/pointer.js";
import { FakeDomEvent, FakeWindow, asWindow } from "./fakes.js";

interface Fixture {
  win: FakeWindow;
  target: Window;
  stage: { id: string };
  water: { id: string };
}

function setup(): Fixture {
  const win = new FakeWindow();
  return {
    win,
    target: asWindow(win),
    stage: { id: STAGE_ID },
    water: { id: "water" },
  };
}

describe("pointer", () => {
  it("recognises only the stage as the firing surface", () => {
    expect(isStageTarget({ id: STAGE_ID })).toBe(true);
    expect(isStageTarget({ id: "water" })).toBe(false);
    expect(isStageTarget({})).toBe(false);
    expect(isStageTarget(null)).toBe(false);
    expect(isStageTarget(undefined)).toBe(false);
  });

  it("reports a neutral state when nothing is held", () => {
    const { target } = setup();
    expect(createPointer(target).poll()).toEqual({
      moveX: 0,
      moveY: 0,
      jump: false,
      action: false,
      dodge: false,
      parry: false,
    });
  });

  it("fires on a primary press over the stage and stops on release", () => {
    const { win, target, stage } = setup();
    const pointer = createPointer(target);

    win.dispatch(new FakeDomEvent("pointerdown", { pointerId: 1, button: 0, target: stage }));
    expect(pointer.poll().action).toBe(true);

    win.dispatch(new FakeDomEvent("pointerup", { pointerId: 1, button: 0, target: stage }));
    expect(pointer.poll().action).toBe(false);
  });

  it("ignores presses over anything that is not the stage", () => {
    const { win, target, water } = setup();
    const pointer = createPointer(target);

    win.dispatch(new FakeDomEvent("pointerdown", { pointerId: 1, button: 0, target: water }));
    expect(pointer.poll().action).toBe(false);

    win.dispatch(new FakeDomEvent("pointerdown", { pointerId: 2, button: 0 }));
    expect(pointer.poll().action).toBe(false);
  });

  it("ignores the secondary button and presses without a pointer id", () => {
    const { win, target, stage } = setup();
    const pointer = createPointer(target);

    win.dispatch(new FakeDomEvent("pointerdown", { pointerId: 1, button: 2, target: stage }));
    expect(pointer.poll().action).toBe(false);

    win.dispatch(new FakeDomEvent("pointerdown", { button: 0, target: stage }));
    expect(pointer.poll().action).toBe(false);
  });

  it("keeps firing when a different pointer lifts", () => {
    const { win, target, stage } = setup();
    const pointer = createPointer(target);

    win.dispatch(new FakeDomEvent("pointerdown", { pointerId: 1, button: 0, target: stage }));
    win.dispatch(new FakeDomEvent("pointerup", { pointerId: 2, button: 0, target: stage }));
    expect(pointer.poll().action).toBe(true);

    win.dispatch(new FakeDomEvent("pointerup", { pointerId: 1, button: 0, target: stage }));
    expect(pointer.poll().action).toBe(false);
  });

  it("releases on cancel and on window blur", () => {
    const { win, target, stage } = setup();
    const pointer = createPointer(target);

    win.dispatch(new FakeDomEvent("pointerdown", { pointerId: 1, button: 0, target: stage }));
    win.dispatch(new FakeDomEvent("pointercancel", { pointerId: 1, target: stage }));
    expect(pointer.poll().action).toBe(false);

    win.dispatch(new FakeDomEvent("pointerdown", { pointerId: 1, button: 0, target: stage }));
    win.dispatch(new FakeDomEvent("blur"));
    expect(pointer.poll().action).toBe(false);
  });

  it("releases when the mask shows the button came up outside", () => {
    const { win, target, stage } = setup();
    const pointer = createPointer(target);

    win.dispatch(new FakeDomEvent("pointerdown", { pointerId: 1, button: 0, target: stage }));
    win.dispatch(new FakeDomEvent("pointermove", { pointerId: 1, buttons: 1, target: stage }));
    expect(pointer.poll().action).toBe(true);

    win.dispatch(new FakeDomEvent("pointermove", { pointerId: 1, buttons: 0, target: stage }));
    expect(pointer.poll().action).toBe(false);
  });

  it("stops reading pointers after dispose", () => {
    const { win, target, stage } = setup();
    const pointer = createPointer(target);
    expect(win.listenerCount("pointerdown")).toBe(1);

    pointer.dispose();
    win.dispatch(new FakeDomEvent("pointerdown", { pointerId: 1, button: 0, target: stage }));

    expect(pointer.poll().action).toBe(false);
    expect(win.listenerCount("pointerdown")).toBe(0);
    expect(win.listenerCount("pointerup")).toBe(0);
  });
});
