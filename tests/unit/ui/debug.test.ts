import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createDebugOverlay,
  entityKind,
  formatCounts,
  formatEntityScales,
} from "../../../src/ui/debug.js";
import { FONT_RATIO } from "../../../src/ui/hud.js";
import type { HudModel } from "../../../src/ui/types.js";
import { asDocument, FakeDocument, type FakeElement } from "./fake-dom.js";

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
    counts: { orca: 1, human: 5 },
    frame: { x: 0, y: 0, w: 1408, h: 792 },
    ...overrides,
  };
}

function build(overrides: Partial<HudModel> = {}): FakeElement {
  const doc = new FakeDocument();
  const handle = createDebugOverlay(asDocument(doc));
  handle.update(model(overrides));
  return handle.root as unknown as FakeElement;
}

const read = (root: FakeElement, attribute: string): string =>
  root.find(attribute)?.textContent ?? "";

describe("debug overlay", () => {
  it("reads tick, seed, preset and canvas scale", () => {
    const root = build({ tick: 420, seed: 90210, presetId: "9:20", canvasScale: 1.25 });

    expect(read(root, "data-cc-debug-tick")).toBe("420");
    expect(read(root, "data-cc-debug-seed")).toBe("90210");
    expect(read(root, "data-cc-debug-preset")).toBe("9:20");
    expect(read(root, "data-cc-debug-scale")).toBe("1.25x");
    expect(read(root, "data-cc-debug-status")).toBe("playing");
  });

  it("lists per-entity counts in a stable order", () => {
    const root = build({
      counts: { human: 5, orca: 1, snail: 1, player: 1 },
      entityTimeScales: { player: 0.35, snail: 1, orca: 0.35 },
    });

    expect(read(root, "data-cc-debug-counts")).toBe("human 5  orca 1  player 1  snail 1");
  });

  it("collapses time scales to one line per kind while the whole kind agrees", () => {
    const root = build({
      counts: { human: 5, orca: 1, snail: 1, player: 1 },
      entityTimeScales: {
        player: 1,
        snail: 1,
        "orca-1": 1,
        "human-1": 1,
        "human-2": 1,
        "human-3": 1,
        "human-4": 1,
        "human-5": 1,
      },
    });

    expect(read(root, "data-cc-debug-timescales")).toBe(
      ["human 1.00x", "orca 1.00x", "player 1.00x", "snail 1.00x"].join("\n"),
    );
  });

  it("falls back to per-entity lines and names the ids when a kind is split", () => {
    const root = build({
      entityTimeScales: {
        "human-1": 1,
        "human-2": 0.35,
        "human-3": 1,
        "orca-1": 0.35,
        "orca-2": 0.35,
        snail: 1,
      },
    });

    // human is split, so it names its ids. orca's two members agree with each other, so
    // orca stays on one line; snail has a single member and always does.
    expect(read(root, "data-cc-debug-timescales")).toBe(
      ["human-1 1.00x", "human-2 0.35x", "human-3 1.00x", "orca 0.35x", "snail 1.00x"].join("\n"),
    );
  });

  it("marks the time scale value as the one row that renders line by line", () => {
    const root = build();
    const list = root.find("data-cc-debug-timescales");
    expect(list?.classList.contains("cc-debug-list")).toBe(true);
    expect(read(root, "data-cc-debug-tick").length).toBeGreaterThan(0);
    expect(root.find("data-cc-debug-tick")?.classList.contains("cc-debug-list")).toBe(false);
  });

  it("says n/a when the app sends no extras and no NaN leaks into the text", () => {
    const root = build();
    expect(read(root, "data-cc-debug-scale")).toBe("n/a");
    expect(read(root, "data-cc-debug-timescales")).toBe("none");
    expect(root.textDump).not.toContain("NaN");
    expect(root.textDump).not.toContain("undefined");
  });

  it("follows the model as it changes", () => {
    const doc = new FakeDocument();
    const handle = createDebugOverlay(asDocument(doc));
    const root = handle.root as unknown as FakeElement;

    handle.update(model({ tick: 1 }));
    handle.update(model({ tick: 2, inTimeField: true, paused: true }));
    expect(read(root, "data-cc-debug-tick")).toBe("2");
    expect(read(root, "data-cc-debug-status")).toBe("playing / paused / in field");

    handle.update(model({ tick: 2, status: "defeat", paused: true, inTimeField: true }));
    expect(read(root, "data-cc-debug-status")).toBe("defeat / paused / in field");
  });
});

describe("placement", () => {
  const css = readFileSync(new URL("../../../src/styles/ui.css", import.meta.url), "utf8");

  /** The body of one top level rule, comments stripped. */
  function rule(selector: string): string {
    const start = css.indexOf(`\n${selector} {`);
    expect(start).toBeGreaterThan(-1);
    const end = css.indexOf("}", start);
    expect(end).toBeGreaterThan(start);
    return css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
  }

  const panel = rule(".cc-debug");

  it("anchors the panel to the top centre, never the bottom", () => {
    expect(panel).toContain("position: absolute");
    expect(panel).toMatch(/top: [\d.]+em/);
    expect(panel).not.toContain("bottom:");
    expect(panel).toContain("left: 50%");
    expect(panel).toContain("transform: translateX(-50%)");
  });

  it("sits below the top-left HUD stack and clear of the top-right buttons", () => {
    // The panel's em is its own 0.8em font, the HUD blocks are in frame em.
    const topEm = Number(/top: ([\d.]+)em/.exec(panel)?.[1] ?? "0");
    const topFrameEm = topEm * 0.8;

    // The vitals rows and the chip row are one flow column, so their total height is
    // whatever it is at the current type size. The panel has to clear the whole stack.
    const stack = rule(".cc-hud-stack");
    expect(stack).toContain("position: absolute");
    expect(stack).toContain("flex-direction: column");
    const stackTopEm = Number(/top: ([\d.]+)em/.exec(stack)?.[1] ?? "0");
    // Three rows at roughly 2.1em each plus the two 0.35em gaps is about 7em, which is the
    // worst case at the type floor. The panel must start below all of it.
    expect(topFrameEm).toBeGreaterThan(stackTopEm + 7);

    // The panel is centred and capped at half the frame width, so it cannot reach the
    // right-hand pause and mute row, which is anchored to the frame's right edge.
    expect(panel).toContain("max-width: 50%");
    expect(rule(".cc-hud-actions")).toContain("right: 0.9em");
  });

  it("keeps the vitals rows and the chip row in flow, so they cannot collide", () => {
    // The chip row used to be offset from the frame by a fixed em translate, which only
    // cleared the vitals at one type size. Both are now children of one flex column.
    const stack = rule(".cc-hud-stack");
    const vitals = rule(".cc-hud-vitals");
    const meta = rule(".cc-hud-meta");
    for (const body of [stack, vitals, meta]) {
      expect(body).not.toContain("position: absolute");
      expect(body).not.toContain("translateY");
      expect(body).not.toContain("top:");
    }
    expect(stack).toContain("gap:");
  });

  it("keeps the HUD stack clear of the pause and mute row at the narrowest preset", () => {
    // The actions row is about 10.5em wide at every size, because its font scales off the
    // same base, so an em right-inset on the stack tracks it exactly.
    const stack = rule(".cc-hud-stack");
    const rightEm = Number(/right: ([\d.]+)em/.exec(stack)?.[1] ?? "0");
    expect(rightEm).toBeGreaterThan(11.5);
    expect(rule(".cc-meter-track")).toContain("flex: 0 1 7.5em");
  });

  it("never grows past a third of the frame height and cannot overflow it", () => {
    const frame = rule(".cc-frame");
    expect(frame).toContain("position: absolute");
    expect(panel).toContain("max-height: 33%");
    expect(panel).toContain("overflow: auto");

    // Top offset plus the cap has to stay above the nebula horizon, y 456 of 768, so the
    // panel can never reach the play band, which starts at y 486.
    const topEm = Number(/top: ([\d.]+)em/.exec(panel)?.[1] ?? "0");
    const topFraction = topEm * 0.8 * FONT_RATIO;
    expect(topFraction + 1 / 3).toBeLessThan(456 / 768);
    expect(456 / 768).toBeLessThan(486 / 768);

    // In portrait the type is a fraction of the frame WIDTH, so the panel's top offset
    // shrinks against the frame height rather than growing. The same em value therefore
    // clears the HUD stack by at least as much room, in both orientations.
    const portraitTop = topEm * 0.8 * FONT_RATIO * (380 / 844);
    expect(portraitTop).toBeLessThanOrEqual(topFraction);
    expect(portraitTop + 1 / 3).toBeLessThan(456 / 768);
  });
});

describe("panel fit", () => {
  const css = readFileSync(new URL("../../../src/styles/ui.css", import.meta.url), "utf8");

  /** The body of one top level rule, comments stripped. */
  function rule(selector: string): string {
    const start = css.indexOf(`\n${selector} {`);
    expect(start).toBeGreaterThan(-1);
    const end = css.indexOf("}", start);
    expect(end).toBeGreaterThan(start);
    return css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
  }

  it("never grows wider than its screen, so 9:20 cannot scroll sideways", () => {
    const panel = rule(".cc-panel");
    expect(panel).toContain("max-width: min(34em, 100%)");
    expect(panel).toMatch(/overflow-wrap: anywhere/);
  });

  it("stays inside the frame height and stays reachable when it does not", () => {
    const screen = rule(".cc-screen");
    expect(screen).toContain("overflow: auto");

    const panel = rule(".cc-panel");
    // margin: auto rather than align-items alone: flex centring clips the top edge of an
    // over-tall item in a scroll container, so the button could become unreachable.
    expect(panel).toContain("max-height: 100%");
    expect(panel).toContain("margin: auto");
    expect(panel).toContain("overflow: auto");
  });

  it("keeps the HUD rows and buttons in em, so they track the frame short side", () => {
    // Every HUD offset is in em off --cc-font-size, which the ui layer derives from the
    // letterboxed short side. Nothing may reintroduce a raw pixel or vh offset.
    for (const selector of [".cc-hud-vitals", ".cc-hud-meta", ".cc-hud-actions"]) {
      const body = rule(selector);
      expect(body).not.toMatch(/\d(px|vh|vw)/);
    }
    expect(css).toContain("font-size: var(--cc-font-size, 16px)");
  });
});

describe("formatters", () => {
  it("formats counts and scales, sorted, with an explicit empty case", () => {
    expect(formatCounts({})).toBe("none");
    expect(formatCounts({ human: 0 })).toBe("human 0");
    expect(formatCounts({ snail: 1.4 })).toBe("snail 1");
    expect(formatEntityScales({})).toBe("none");
    expect(formatEntityScales({ b: 2, a: 0.5 })).toBe("a 0.50x\nb 2.00x");
    expect(formatEntityScales({ a: Number.NaN })).toBe("a 1.00x");
  });

  it("reads the kind out of an entity id", () => {
    expect(entityKind("human-3")).toBe("human");
    expect(entityKind("orca-1")).toBe("orca");
    expect(entityKind("player")).toBe("player");
    expect(entityKind("tarantula-12")).toBe("tarantula");
    expect(entityKind("capybara-1")).toBe("capybara");
  });

  it("keeps a kind on one line even when the raw scales differ under the rounding", () => {
    expect(formatEntityScales({ "human-1": 0.35, "human-2": 0.3500004 })).toBe("human 0.35x");
  });
});
