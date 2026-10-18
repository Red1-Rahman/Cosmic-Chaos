import { describe, expect, it } from "vitest";

import { FONT_MAX, FONT_MIN, LOW_HP, applyFrame, createHud } from "../../../src/ui/hud.js";
import type { HudModel, UiCallbacks } from "../../../src/ui/types.js";
import { asDocument, FakeDocument, type FakeElement } from "./fake-dom.js";

const NO_CALLBACKS: UiCallbacks = {
  onStart: (): void => undefined,
  onRestart: (): void => undefined,
  onTogglePause: (): void => undefined,
  onToggleMute: (): void => undefined,
};

function model(overrides: Partial<HudModel> = {}): HudModel {
  return {
    hp: 1,
    timeScale: 1,
    inTimeField: false,
    seed: 1337,
    tick: 0,
    presetId: "16:9",
    muted: false,
    paused: false,
    status: "playing",
    counts: { player: 1, orca: 1, human: 5 },
    frame: { x: 0, y: 0, w: 1408, h: 792 },
    ...overrides,
  };
}

function build(callbacks: UiCallbacks = NO_CALLBACKS): { root: FakeElement } {
  const doc = new FakeDocument();
  const handle = createHud(asDocument(doc), callbacks);
  handle.update(model());
  return { root: handle.root as unknown as FakeElement };
}

const read = (root: FakeElement, attribute: string): string =>
  root.find(attribute)?.textContent ?? "";

describe("hull meter", () => {
  it("follows the health in the model", () => {
    const { root } = build();
    expect(read(root, "data-cc-hp")).toBe("100%");
    expect(root.find("data-cc-hp")?.parentElement?.getAttribute("aria-valuenow")).toBe("100%");
    expect(root.findByClass("cc-meter-fill")?.style.getPropertyValue("width")).toBe("100%");

    // A changed HudModel changes the displayed health.
    const handle = createHud(asDocument(new FakeDocument()), NO_CALLBACKS);
    handle.update(model({ hp: 0.42 }));
    const node = handle.root as unknown as FakeElement;
    expect(read(node, "data-cc-hp")).toBe("42%");
    expect(node.find("data-cc-hp")?.parentElement?.getAttribute("aria-valuenow")).toBe("42%");
    expect(node.findByClass("cc-meter-fill")?.style.getPropertyValue("width")).toBe("42%");
  });

  it("clamps nonsense and marks a low hull", () => {
    const handle = createHud(asDocument(new FakeDocument()), NO_CALLBACKS);
    const root = handle.root as unknown as FakeElement;

    handle.update(model({ hp: -4 }));
    expect(read(root, "data-cc-hp")).toBe("0%");
    expect(root.findByClass("cc-meter")?.classList.contains("cc-meter-low")).toBe(true);

    handle.update(model({ hp: 0.5 }));
    expect(root.findByClass("cc-meter")?.classList.contains("cc-meter-low")).toBe(false);

    handle.update(model({ hp: LOW_HP }));
    expect(root.findByClass("cc-meter")?.classList.contains("cc-meter-low")).toBe(true);

    handle.update(model({ hp: Number.NaN }));
    expect(read(root, "data-cc-hp")).toBe("0%");
    expect(root.textDump).not.toContain("NaN");
  });
});

describe("time field readout", () => {
  it("shows the active time scale and whether the player is inside the field", () => {
    const handle = createHud(asDocument(new FakeDocument()), NO_CALLBACKS);
    handle.update(model());
    const root = handle.root as unknown as FakeElement;

    expect(read(root, "data-cc-time-scale")).toBe("1.00x");
    expect(read(root, "data-cc-time-field")).toBe("NOMINAL");
    expect(root.findByClass("cc-field")?.getAttribute("data-cc-field")).toBe("out");

    // A changed HudModel changes the displayed time scale.
    handle.update(model({ timeScale: 0.35, inTimeField: true }));
    expect(read(root, "data-cc-time-scale")).toBe("0.35x");
    expect(read(root, "data-cc-time-field")).toBe("INSIDE");
    expect(root.findByClass("cc-field")?.getAttribute("data-cc-field")).toBe("in");
    expect(root.findByClass("cc-field")?.classList.contains("cc-field-on")).toBe(true);

    handle.update(model({ timeScale: 2.5, inTimeField: false }));
    expect(read(root, "data-cc-time-scale")).toBe("2.50x");
    expect(read(root, "data-cc-time-field")).toBe("NOMINAL");
    expect(root.findByClass("cc-field")?.classList.contains("cc-field-on")).toBe(false);
  });

  it("never prints NaN when the model is malformed", () => {
    const handle = createHud(asDocument(new FakeDocument()), NO_CALLBACKS);
    handle.update(model({ timeScale: Number.NaN, seed: Number.NaN, presetId: "" }));
    const root = handle.root as unknown as FakeElement;
    expect(read(root, "data-cc-time-scale")).toBe("1.00x");
    expect(read(root, "data-cc-seed")).toBe("seed 0");
    expect(read(root, "data-cc-preset")).toBe("no preset");
    expect(root.textDump).not.toContain("NaN");
  });
});

describe("seed, preset and buttons", () => {
  it("reads the seed and the viewport preset from the model", () => {
    const handle = createHud(asDocument(new FakeDocument()), NO_CALLBACKS);
    handle.update(model({ seed: 1337, presetId: "16:9" }));
    const root = handle.root as unknown as FakeElement;
    expect(read(root, "data-cc-seed")).toBe("seed 1337");
    expect(read(root, "data-cc-preset")).toBe("16:9");

    handle.update(model({ seed: 2026, presetId: "9:20" }));
    expect(read(root, "data-cc-seed")).toBe("seed 2026");
    expect(read(root, "data-cc-preset")).toBe("9:20");
  });

  it("routes the two buttons to the callbacks and never to audio", () => {
    let paused = 0;
    let muted = 0;
    const { root } = build({
      ...NO_CALLBACKS,
      onTogglePause: (): void => {
        paused += 1;
      },
      onToggleMute: (): void => {
        muted += 1;
      },
    });

    root.findByAttribute("data-cc-action", "pause")?.click();
    root.findByAttribute("data-cc-action", "mute")?.click();
    expect(paused).toBe(1);
    expect(muted).toBe(1);
  });

  it("mirrors the paused and muted state on the buttons", () => {
    const handle = createHud(asDocument(new FakeDocument()), NO_CALLBACKS);
    handle.update(model({ paused: true, muted: true }));
    const root = handle.root as unknown as FakeElement;
    expect(root.findByAttribute("data-cc-action", "pause")?.getAttribute("data-cc-paused")).toBe(
      "true",
    );
    expect(root.findByAttribute("data-cc-action", "pause")?.textContent).toBe("Paused");
    expect(root.findByAttribute("data-cc-action", "mute")?.getAttribute("data-cc-muted")).toBe(
      "true",
    );
    expect(root.findByAttribute("data-cc-action", "mute")?.textContent).toBe("Muted");
  });
});

describe("applyFrame", () => {
  it("sizes the type off the letterboxed height and clamps both ends", () => {
    const doc = new FakeDocument();
    const root = doc.createElement("div");

    applyFrame(root as unknown as HTMLElement, { x: 10, y: 20, w: 1000, h: 900 });
    expect(root.style.getPropertyValue("--cc-frame-x")).toBe("10px");
    expect(root.style.getPropertyValue("--cc-font-size")).toBe(`${String(FONT_MAX)}px`);

    applyFrame(root as unknown as HTMLElement, { x: 0, y: 0, w: 100, h: 100 });
    expect(root.style.getPropertyValue("--cc-font-size")).toBe(`${String(FONT_MIN)}px`);

    applyFrame(root as unknown as HTMLElement, { x: 0, y: 0, w: 1408, h: 792 });
    const fraction = Number(root.style.getPropertyValue("--cc-font-size").replace("px", ""));
    expect(fraction).toBeGreaterThan(FONT_MIN);
    expect(fraction).toBeLessThan(FONT_MAX);
    expect(fraction).toBeCloseTo(Number((792 * (1 / 34)).toFixed(3)), 6);

    applyFrame(root as unknown as HTMLElement, { x: Number.NaN, y: 0, w: 100, h: 100 });
    expect(root.style.getPropertyValue("--cc-frame-x")).toBe("0px");
  });
});
