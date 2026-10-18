import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createDebugOverlay,
  entityKind,
  formatCounts,
  formatEntityScales,
} from "../../../src/ui/debug.js";
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
      [
        "human-1 1.00x",
        "human-2 0.35x",
        "human-3 1.00x",
        "orca 0.35x",
        "snail 1.00x",
      ].join("\n"),
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
    return css
      .slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, "");
  }

  const panel = rule(".cc-debug");

  it("anchors the panel to the top centre, never the bottom", () => {
    expect(panel).toContain("position: absolute");
    expect(panel).toMatch(/top: [\d.]+em/);
    expect(panel).not.toContain("bottom:");
    expect(panel).toContain("left: 50%");
    expect(panel).toContain("transform: translateX(-50%)");
  });

  it("sits below the top-left vitals block and clear of the top-right buttons", () => {
    // The panel's em is its own 0.8em font, the HUD blocks are in frame em.
    const topEm = Number(/top: ([\d.]+)em/.exec(panel)?.[1] ?? "0");
    const topFrameEm = topEm * 0.8;
    const meta = rule(".cc-hud-meta");
    const metaOffset = Number(/translateY\(([\d.]+)em\)/.exec(meta)?.[1] ?? "0");

    // Vitals start at 0.8em, the chip row is pushed down by its own translate.
    expect(topFrameEm).toBeGreaterThan(0.8 + metaOffset);

    // The panel is centred and capped at half the frame width, so it cannot reach the
    // right-hand pause and mute row, which is anchored to the frame's right edge.
    expect(panel).toContain("max-width: 50%");
    expect(rule(".cc-hud-actions")).toContain("right: 0.9em");
  });

  it("never grows past a third of the frame height and cannot overflow it", () => {
    const frame = rule(".cc-frame");
    expect(frame).toContain("position: absolute");
    expect(panel).toContain("max-height: 33%");
    expect(panel).toContain("overflow: auto");

    // Top offset plus the cap has to stay above the nebula horizon, y 456 of 768, so the
    // panel can never reach the play band, which starts at y 486.
    const topEm = Number(/top: ([\d.]+)em/.exec(panel)?.[1] ?? "0");
    const fontRatio = 1 / 34; // FONT_RATIO in src/ui/hud.ts
    const topFraction = (topEm * 0.8 * fontRatio);
    expect(topFraction + 1 / 3).toBeLessThan(456 / 768);
    expect(456 / 768).toBeLessThan(486 / 768);
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
