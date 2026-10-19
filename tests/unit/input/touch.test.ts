import { describe, expect, it } from "vitest";

import {
  createTouchState,
  mountTouchOverlay,
  shouldShowTouchControls,
} from "../../../src/input/touch.js";
import { FakeDomEvent, FakeDocument, FakeWindow, asWindow } from "./fakes.js";

const NEUTRAL = { moveX: 0, moveY: 0, jump: false, action: false, dodge: false, parry: false };

describe("touch state", () => {
  it("is neutral with no pointers down", () => {
    expect(createTouchState().poll()).toEqual(NEUTRAL);
  });

  it("reads a direction from one finger", () => {
    const state = createTouchState();
    state.press(1, "right");

    expect(state.poll()).toEqual({
      moveX: 1,
      moveY: 0,
      jump: false,
      action: false,
      dodge: false,
      parry: false,
    });
  });

  it("holds direction and jump at the same time", () => {
    const state = createTouchState();
    state.press(1, "up");
    state.press(2, "jump");

    expect(state.poll()).toEqual({
      moveX: 0,
      moveY: -1,
      jump: true,
      action: false,
      dodge: false,
      parry: false,
    });
  });

  it("holds direction and action at the same time", () => {
    const state = createTouchState();
    state.press(3, "left");
    state.press(4, "action");

    expect(state.poll()).toEqual({
      moveX: -1,
      moveY: 0,
      jump: false,
      action: true,
      dodge: false,
      parry: false,
    });
  });

  it("keeps other fingers down when one is lifted", () => {
    const state = createTouchState();
    state.press(1, "down");
    state.press(2, "action");

    state.release(1);

    expect(state.poll()).toEqual({
      moveX: 0,
      moveY: 0,
      jump: false,
      action: true,
      dodge: false,
      parry: false,
    });
  });

  it("moves a finger from one control to another", () => {
    const state = createTouchState();
    state.press(1, "left");
    state.press(1, "right");

    expect(state.poll().moveX).toBe(1);
  });

  it("clears everything on releaseAll", () => {
    const state = createTouchState();
    state.press(1, "up");
    state.press(2, "jump");

    state.releaseAll();

    expect(state.poll()).toEqual(NEUTRAL);
  });

  it("ignores a release for an unknown pointer", () => {
    const state = createTouchState();
    state.press(1, "up");

    state.release(99);

    expect(state.poll().moveY).toBe(-1);
  });

  it("marks the device active once per new press", () => {
    let marks = 0;
    const state = createTouchState({
      markActive: () => {
        marks += 1;
      },
    });

    state.press(1, "up");
    state.press(1, "up");
    state.press(2, "jump");

    expect(marks).toBe(2);
  });
});

describe("touch overlay", () => {
  it("builds a pad plus a four button action cluster", () => {
    const doc = new FakeDocument();
    const overlay = mountTouchOverlay(doc as unknown as Document, createTouchState());

    expect(overlay).not.toBeNull();
    const root = doc.body.children[0];
    const pad = root?.children[0];
    expect(pad?.children.map((key) => key.getAttribute("data-cc-control"))).toEqual([
      "up",
      "left",
      "right",
      "down",
    ]);
    const cluster = root?.children[1];
    expect(cluster?.children.map((key) => key.getAttribute("data-cc-control"))).toEqual([
      "action",
      "jump",
      "dodge",
      "parry",
    ]);
  });

  it("reads the dodge and parry buttons", () => {
    const state = createTouchState();
    state.press(1, "dodge");
    state.press(2, "parry");

    const held = state.poll();
    expect(held.dodge).toBe(true);
    expect(held.parry).toBe(true);
  });

  it("drives the state from pointer events", () => {
    const doc = new FakeDocument();
    const state = createTouchState();
    mountTouchOverlay(doc as unknown as Document, state);

    const root = doc.body.children[0];
    const pad = root?.children[0];
    const rightKey = pad?.children[2];
    const cluster = root?.children[1];
    const jumpButton = cluster?.children[1];

    rightKey?.dispatch(new FakeDomEvent("pointerdown", { pointerId: 7 }));
    expect(state.poll().moveX).toBe(1);

    jumpButton?.dispatch(new FakeDomEvent("pointerdown", { pointerId: 8 }));
    expect(state.poll().jump).toBe(true);

    rightKey?.dispatch(new FakeDomEvent("pointerup", { pointerId: 7 }));
    expect(state.poll()).toEqual({
      moveX: 0,
      moveY: 0,
      jump: true,
      action: false,
      dodge: false,
      parry: false,
    });

    jumpButton?.dispatch(new FakeDomEvent("pointercancel", { pointerId: 8 }));
    expect(state.poll()).toEqual(NEUTRAL);
  });

  it("prevents default so the page never scrolls under a finger", () => {
    const doc = new FakeDocument();
    const state = createTouchState();
    mountTouchOverlay(doc as unknown as Document, state);
    const key = doc.body.children[0]?.children[0]?.children[0];

    const event = key?.dispatch(new FakeDomEvent("pointerdown", { pointerId: 1 }));

    expect(event?.defaultPrevented).toBe(true);
  });

  it("captures the pointer so a slide off the button still lifts", () => {
    const doc = new FakeDocument();
    mountTouchOverlay(doc as unknown as Document, createTouchState());
    const key = doc.body.children[0]?.children[0]?.children[0];

    key?.dispatch(new FakeDomEvent("pointerdown", { pointerId: 5 }));

    expect(key?.capturedPointers).toEqual([5]);
  });

  it("marks pressed state for styling", () => {
    const doc = new FakeDocument();
    mountTouchOverlay(doc as unknown as Document, createTouchState());
    const key = doc.body.children[0]?.children[0]?.children[1];

    key?.dispatch(new FakeDomEvent("pointerdown", { pointerId: 1 }));
    expect(key?.dataset["pressed"]).toBe("true");

    key?.dispatch(new FakeDomEvent("pointerup", { pointerId: 1 }));
    expect(key?.dataset["pressed"]).toBe("false");
  });

  it("removes itself from the document on dispose", () => {
    const doc = new FakeDocument();
    const overlay = mountTouchOverlay(doc as unknown as Document, createTouchState());
    expect(doc.body.children).toHaveLength(1);

    overlay?.dispose();

    expect(doc.body.children).toHaveLength(0);
  });

  it("declines to mount without a document", () => {
    expect(mountTouchOverlay(undefined, createTouchState())).toBeNull();
  });
});

describe("touch visibility", () => {
  it("shows on a coarse pointer", () => {
    const win = new FakeWindow();
    win.coarsePointer = true;
    expect(shouldShowTouchControls(asWindow(win))).toBe(true);
  });

  it("shows on a small viewport", () => {
    const win = new FakeWindow();
    win.innerWidth = 480;
    win.innerHeight = 900;
    expect(shouldShowTouchControls(asWindow(win))).toBe(true);
  });

  it("hides on a large fine pointer viewport", () => {
    const win = new FakeWindow();
    expect(shouldShowTouchControls(asWindow(win))).toBe(false);
  });
});
