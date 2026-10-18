import { describe, expect, it } from "vitest";

import {
  FONT_MAX,
  FONT_MIN,
  FONT_RATIO,
  LOW_HP,
  applyFrame,
  createHud,
  fontSizeFor,
  frameShortSide,
} from "../../../src/ui/hud.js";
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

describe("frameShortSide", () => {
  it("is the smaller of the two sides, and collapses on junk", () => {
    expect(frameShortSide({ x: 0, y: 0, w: 1408, h: 792 })).toBe(792);
    expect(frameShortSide({ x: 0, y: 0, w: 792, h: 1408 })).toBe(792);
    expect(frameShortSide({ x: 0, y: 0, w: 900, h: 900 })).toBe(900);
    // Non-finite and negative sides must not produce a negative divisor.
    expect(frameShortSide({ x: 0, y: 0, w: Number.NaN, h: 1408 })).toBe(0);
    expect(frameShortSide({ x: 0, y: 0, w: -5, h: 1408 })).toBe(0);
    expect(frameShortSide({ x: 0, y: 0, w: Number.POSITIVE_INFINITY, h: 792 })).toBe(792);
  });
});

describe("fontSizeFor", () => {
  it("divides the SHORT side by the divisor, not the height", () => {
    // The landscape 16:9 frame and the portrait 9:20 frame of the same window class.
    const landscape = fontSizeFor({ x: 0, y: 0, w: 1280, h: 720 });
    expect(landscape).toBeCloseTo(Number((720 * FONT_RATIO).toFixed(3)), 6);

    // 380x844 is the 9:20 contain-fit of a 390x844 phone. Driving this off the height gave
    // roughly 24.8 px, which overflowed the title panel and hid the start button.
    const portrait = fontSizeFor({ x: 0, y: 0, w: 380, h: 844 });
    expect(portrait).toBeCloseTo(Number((380 * FONT_RATIO).toFixed(3)), 6);
    expect(portrait).toBeGreaterThanOrEqual(11);
    expect(portrait).toBeLessThanOrEqual(14);
    // The old height-driven size, for the record, so the regression cannot come back.
    expect(844 * FONT_RATIO).toBeGreaterThan(23);
  });

  it("is orientation-agnostic: the same short side gives the same type size", () => {
    expect(fontSizeFor({ x: 0, y: 0, w: 380, h: 844 })).toBe(fontSizeFor({ x: 0, y: 0, w: 844, h: 380 }));
  });

  it("clamps both ends", () => {
    expect(fontSizeFor({ x: 0, y: 0, w: 4000, h: 4000 })).toBe(FONT_MAX);
    expect(fontSizeFor({ x: 0, y: 0, w: 0, h: 0 })).toBe(FONT_MIN);
    expect(fontSizeFor({ x: 0, y: 0, w: 100, h: 4000 })).toBe(FONT_MIN);
  });

  it("never grows when a portrait frame gets taller", () => {
    const narrow = fontSizeFor({ x: 0, y: 0, w: 380, h: 844 });
    const taller = fontSizeFor({ x: 0, y: 0, w: 380, h: 1800 });
    expect(taller).toBe(narrow);
  });
});

describe("applyFrame", () => {
  it("sizes the type off the letterboxed short side and clamps both ends", () => {
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
    expect(fraction).toBeCloseTo(Number((792 * FONT_RATIO).toFixed(3)), 6);

    // The portrait bug: a tall, narrow letterbox must land near the floor, not near the cap.
    applyFrame(root as unknown as HTMLElement, { x: 0, y: 0, w: 380, h: 844 });
    const portrait = Number(root.style.getPropertyValue("--cc-font-size").replace("px", ""));
    expect(portrait).toBeCloseTo(Number((380 * FONT_RATIO).toFixed(3)), 6);
    expect(portrait).toBeLessThanOrEqual(14);

    applyFrame(root as unknown as HTMLElement, { x: Number.NaN, y: 0, w: 100, h: 100 });
    expect(root.style.getPropertyValue("--cc-frame-x")).toBe("0px");

    // Re-applying the same rect writes nothing new, and a different one does.
    applyFrame(root as unknown as HTMLElement, { x: 5, y: 5, w: 200, h: 200 });
    applyFrame(root as unknown as HTMLElement, { x: 5, y: 5, w: 200, h: 200 });
    expect(root.style.getPropertyValue("--cc-frame-x")).toBe("5px");
    applyFrame(root as unknown as HTMLElement, { x: 6, y: 5, w: 200, h: 200 });
    expect(root.style.getPropertyValue("--cc-frame-x")).toBe("6px");
  });
});
