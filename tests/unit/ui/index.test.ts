import { describe, expect, it, vi } from "vitest";

import { createUi, isDebugRequested, type HudModel, type Screen } from "../../../src/ui/index.js";
import type { UiCallbacks } from "../../../src/ui/types.js";
import { asDocument, asHost, FakeDocument, type FakeElement } from "./fake-dom.js";

const BASE_MODEL: HudModel = {
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
  frame: { x: 0, y: 90, w: 1920, h: 1080 },
};

function model(overrides: Partial<HudModel> = {}): HudModel {
  return { ...BASE_MODEL, ...overrides };
}

interface Calls {
  start: number;
  restart: number;
  pause: number;
  mute: number;
}

function setup(options: { debug?: boolean } = {}): {
  host: FakeElement;
  doc: FakeDocument;
  ui: ReturnType<typeof createUi>;
  calls: Calls;
} {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  const calls: Calls = { start: 0, restart: 0, pause: 0, mute: 0 };
  const callbacks: UiCallbacks = {
    onStart: (): void => {
      calls.start += 1;
    },
    onRestart: (): void => {
      calls.restart += 1;
    },
    onTogglePause: (): void => {
      calls.pause += 1;
    },
    onToggleMute: (): void => {
      calls.mute += 1;
    },
  };
  const ui = createUi(callbacks, options);
  ui.mount(asHost(host));
  return { host, doc, ui, calls };
}

const value = (host: FakeElement, attribute: string): string | null =>
  host.find(attribute)?.textContent ?? null;

describe("createUi mounting", () => {
  it("appends one root to the host and only mounts once", () => {
    const { host, ui } = setup();
    expect(host.children.length).toBe(1);
    expect(host.find("data-cc-ui")).not.toBeNull();

    ui.mount(asHost(host));
    expect(host.children.length).toBe(1);
  });

  it("positions the frame on the letterbox rect from the model", () => {
    const { host, ui } = setup();
    ui.update(model({ frame: { x: 120, y: 45, w: 1600, h: 900 } }));

    const root = host.find("data-cc-ui");
    expect(root?.style.getPropertyValue("--cc-frame-x")).toBe("120px");
    expect(root?.style.getPropertyValue("--cc-frame-y")).toBe("45px");
    expect(root?.style.getPropertyValue("--cc-frame-w")).toBe("1600px");
    expect(root?.style.getPropertyValue("--cc-frame-h")).toBe("900px");
    // Type scales off the arena's SHORT side, clamped so it stays readable.
    expect(root?.style.getPropertyValue("--cc-font-size")).toBe("26px");
  });

  it("survives a degenerate frame without writing junk into a style", () => {
    const { host, ui } = setup();
    ui.update(model({ frame: { x: 0, y: 0, w: 0, h: 0 } }));

    const root = host.find("data-cc-ui");
    expect(root?.style.getPropertyValue("--cc-frame-w")).toBe("0px");
    expect(root?.style.getPropertyValue("--cc-font-size")).toBe("11px");
  });

  it("keeps the type small on a portrait letterbox so the title panel fits", () => {
    const { host, ui } = setup();
    // The 9:20 contain-fit of a 390x844 phone. The old height-driven rule gave about
    // 24.8 px here and pushed the start button off the bottom of the screen.
    ui.update(model({ frame: { x: 5, y: 0, w: 380, h: 844 }, presetId: "9:20" }));

    const root = host.find("data-cc-ui");
    const size = Number((root?.style.getPropertyValue("--cc-font-size") ?? "").replace("px", ""));
    expect(size).toBeCloseTo(Number((380 / 34).toFixed(3)), 6);
    expect(size).toBeGreaterThanOrEqual(11);
    expect(size).toBeLessThanOrEqual(14);

    // The title screen is mounted and its primary action exists, so a click can start it.
    expect(host.findByAttribute("data-cc-action", "start")).not.toBeNull();
  });

  it("buffers update calls made before mount and applies them on mount", () => {
    const doc = new FakeDocument();
    const host = doc.createElement("div");
    const calls: Calls = { start: 0, restart: 0, pause: 0, mute: 0 };
    const ui = createUi({
      onStart: (): void => {
        calls.start += 1;
      },
      onRestart: (): void => {
        calls.restart += 1;
      },
      onTogglePause: (): void => {
        calls.pause += 1;
      },
      onToggleMute: (): void => {
        calls.mute += 1;
      },
    });

    expect(() => {
      ui.show("playing");
      ui.update(model({ hp: 0.5 }));
    }).not.toThrow();

    ui.mount(asHost(host));
    expect(value(host, "data-cc-hp")).toBe("50%");
    expect(doc.activeElement).toBeNull();
  });

  it("removes everything from the host on destroy and stops listening", () => {
    const { host, ui } = setup();
    const startButton = host.findByAttribute("data-cc-action", "start");
    expect(startButton).not.toBeNull();

    ui.destroy();
    expect(host.children.length).toBe(0);
    expect(host.find("data-cc-ui")).toBeNull();

    startButton?.click();
    ui.show("title");
    ui.update(model());
    ui.destroy();
  });
});

describe("title screen", () => {
  it("states the premise and offers one start control", () => {
    const { host } = setup();
    const text = host.textDump.toLowerCase();

    expect(text).toContain("capybara");
    expect(text).toContain("fundamental rule");
    expect(text).toContain("orca");
    expect(text).toContain("snail");
    expect(text).toContain("waterbike");

    const start = host.findByAttribute("data-cc-action", "start");
    expect(start).not.toBeNull();
    expect(start?.tagName).toBe("button");
    expect(start?.type).toBe("button");
    expect(start?.getAttribute("aria-label")).toBe("Start the run");
    expect(host.findAllByClass("cc-panel").length).toBeGreaterThan(0);
  });

  it("does not repeat the wordmark as a big heading", () => {
    const { host } = setup();
    const headline = host.findByClass("cc-headline");
    expect(headline?.textContent.length ?? 0).toBeLessThan(80);
    expect(headline?.textContent).not.toContain("Cosmic Chaos");
    const kicker = host.findByClass("cc-kicker");
    expect(kicker?.textContent).toBe("Cosmic Chaos");
  });

  it("calls onStart exactly once per click, which is the gesture that unlocks audio", () => {
    const { host, calls } = setup();
    const start = host.findByAttribute("data-cc-action", "start");
    start?.click();
    expect(calls.start).toBe(1);
    start?.click();
    expect(calls.start).toBe(2);
    expect(calls.restart).toBe(0);
    expect(calls.pause).toBe(0);
    expect(calls.mute).toBe(0);
  });

  it("focuses the start control so a keyboard, gamepad or touch user has one target", () => {
    const { host } = setup();
    const start = host.findByAttribute("data-cc-action", "start");
    expect(start?.focused).toBe(1);
  });

  it("is the default screen and hides the HUD", () => {
    const { host } = setup();
    expect(host.findByAttribute("data-cc-overlay", "screens")).not.toBeNull();
    expect(host.findByClass("cc-screen--title")?.classList.contains("cc-screen-active")).toBe(true);
    expect(host.findByClass("cc-screen--pause")?.classList.contains("cc-screen-active")).toBe(
      false,
    );
    expect(host.findByClass("cc-hud")?.classList.contains("cc-hud-playing")).toBe(false);
  });
});

describe("screens", () => {
  const screens: readonly Screen[] = ["title", "playing", "paused", "defeat"];

  it("activates exactly one screen at a time, and none while playing", () => {
    const { host, ui } = setup();
    for (const screen of screens) {
      ui.show(screen);
      const active = host.findAllByClass("cc-screen-active");
      expect(active.length).toBe(screen === "playing" ? 0 : 1);
      const names = host
        .findAllByClass("cc-screen-active")
        .map((node) =>
          node.classList.contains("cc-screen--title")
            ? "title"
            : node.classList.contains("cc-screen--pause")
              ? "paused"
              : "defeat",
        );
      expect(names[0] ?? "").toBe(screen === "playing" ? "" : screen);
      expect(host.findByClass("cc-hud")?.classList.contains("cc-hud-playing")).toBe(
        screen === "playing" || screen === "paused",
      );
    }
  });

  it("pause toggles from the pause panel and the HUD button", () => {
    const { host, ui, calls } = setup();
    ui.show("paused");
    host.findByAttribute("data-cc-action", "resume")?.click();
    expect(calls.pause).toBe(1);

    ui.show("playing");
    host.findByAttribute("data-cc-action", "pause")?.click();
    expect(calls.pause).toBe(2);
  });

  it("restarts with the same seed from both the pause and defeat panels", () => {
    const { host, ui, calls } = setup();
    ui.update(model({ seed: 4242 }));

    ui.show("paused");
    host.findByAttribute("data-cc-action", "restart")?.click();
    expect(calls.restart).toBe(1);

    ui.show("defeat");
    host.findByAttribute("data-cc-action", "restart")?.click();
    expect(calls.restart).toBe(2);

    // No persistence: the seed the app holds is still the one on screen.
    expect(value(host, "data-cc-seed")).toBe("seed 4242");
    expect(value(host, "data-cc-debug-seed")).toBeNull();
  });

  it("toggles mute from the HUD and reflects the new state", () => {
    const { host, ui, calls } = setup();
    const mute = host.findByAttribute("data-cc-action", "mute");
    mute?.click();
    expect(calls.mute).toBe(1);

    ui.update(model({ muted: true }));
    expect(mute?.getAttribute("data-cc-muted")).toBe("true");
    expect(mute?.textContent).toBe("Muted");
    ui.update(model({ muted: false }));
    expect(mute?.getAttribute("data-cc-muted")).toBe("false");
    expect(mute?.textContent).toBe("Sound on");
  });
});

describe("isDebugRequested", () => {
  it("accepts the usual truthy spellings", () => {
    expect(isDebugRequested("?debug=1")).toBe(true);
    expect(isDebugRequested("debug=1")).toBe(true);
    expect(isDebugRequested("?a=b&debug=true")).toBe(true);
    expect(isDebugRequested("?debug=ON")).toBe(true);
    expect(isDebugRequested("?debug=")).toBe(true);
    expect(isDebugRequested("?debug")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isDebugRequested("")).toBe(false);
    expect(isDebugRequested("?")).toBe(false);
    expect(isDebugRequested("?debug=0")).toBe(false);
    expect(isDebugRequested("?debug=maybe")).toBe(false);
    expect(isDebugRequested("?nodebug=1")).toBe(false);
    expect(isDebugRequested("?xdebug=1")).toBe(false);
    expect(isDebugRequested(undefined as unknown as string)).toBe(false);
  });
});

describe("console", () => {
  it("stays silent through mount, updates, screens and destroy", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const doc = new FakeDocument();
    const host = doc.createElement("div");
    const ui = createUi(
      {
        onStart: (): void => undefined,
        onRestart: (): void => undefined,
        onTogglePause: (): void => undefined,
        onToggleMute: (): void => undefined,
      },
      { debug: true },
    );

    ui.show("title");
    ui.update(model());
    ui.mount(asHost(host));
    for (const screen of ["title", "playing", "paused", "defeat"] as const) {
      ui.show(screen);
      for (let tick = 0; tick < 5; tick += 1) ui.update(model({ tick, hp: tick / 10 }));
    }
    ui.update(model({ inTimeField: true, timeScale: 0.35, entityTimeScales: { orca: 0.35 } }));
    ui.update(model({ canvasScale: 1.25 }));
    ui.destroy();

    for (const spy of [log, warn, error, info]) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});

describe("debug overlay visibility", () => {
  const overlays = (host: FakeElement): string[] =>
    host
      .findAllByAttribute("data-cc-overlay")
      .map((node) => node.getAttribute("data-cc-overlay") ?? "");

  it("is absent without the flag, down to the DOM node", () => {
    const { host, ui } = setup();
    expect(overlays(host)).toEqual(["hud", "screens"]);
    expect(host.findByAttribute("data-cc-overlay", "debug")).toBeNull();
    ui.update(model({ tick: 10 }));
    expect(host.textDump).not.toContain("tick");
  });

  it("is present with ?debug=1 and reads the same model", () => {
    const { host, ui } = setup({ debug: true });
    ui.update(model());
    expect(overlays(host)).toEqual(["hud", "screens", "debug"]);
    const debug = host.findByAttribute("data-cc-overlay", "debug");
    expect(debug).not.toBeNull();
    expect(debug?.find("data-cc-debug-tick")?.textContent).toBe("0");
    expect(debug?.find("data-cc-debug-counts")?.textContent).toBe("human 5  orca 1");
  });

  it("is driven by the URL when no explicit option is given", () => {
    const globals = globalThis as { location?: { search: string } };
    const previous = globals.location;
    try {
      globals.location = { search: "?test=1&debug=1" };
      expect(host_overlays(setup())).toContain("debug");
      globals.location = { search: "?test=1" };
      expect(host_overlays(setup())).not.toContain("debug");
      globals.location = { search: "" };
      expect(host_overlays(setup())).not.toContain("debug");
    } finally {
      if (previous === undefined) delete globals.location;
      else globals.location = previous;
    }
  });
});

function host_overlays(instance: { host: FakeElement }): string[] {
  return instance.host
    .findAllByAttribute("data-cc-overlay")
    .map((node) => node.getAttribute("data-cc-overlay") ?? "");
}

describe("document handling", () => {
  it("falls back to the global document when the host has no ownerDocument", () => {
    const appended: unknown[] = [];
    const host = {
      append: (child: unknown): void => {
        appended.push(child);
      },
    } as unknown as HTMLElement;
    const globals = globalThis as { document?: Document };
    const previous = globals.document;
    const doc = new FakeDocument();
    globals.document = asDocument(doc);

    try {
      const ui = createUi({
        onStart: (): void => undefined,
        onRestart: (): void => undefined,
        onTogglePause: (): void => undefined,
        onToggleMute: (): void => undefined,
      });
      ui.mount(host);
      expect(appended.length).toBe(1);
      expect(doc.body.children.length).toBe(0);
      ui.destroy();
      expect(appended.length).toBe(1);
    } finally {
      if (previous === undefined) delete globals.document;
      else globals.document = previous;
    }
  });

  it("throws instead of guessing when there is no document at all", () => {
    const globals = globalThis as { document?: Document };
    const previous = globals.document;
    delete globals.document;
    try {
      const ui = createUi({
        onStart: (): void => undefined,
        onRestart: (): void => undefined,
        onTogglePause: (): void => undefined,
        onToggleMute: (): void => undefined,
      });
      expect(() => {
        ui.mount({} as HTMLElement);
      }).toThrow(/ownerDocument/);
    } finally {
      if (previous !== undefined) globals.document = previous;
    }
  });
});
