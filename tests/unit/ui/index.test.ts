import { describe, expect, it, vi } from "vitest";

import { createUi, isDebugRequested, isClosableScreen } from "../../../src/ui/index.js";
import type { HudModel, LevelView, Screen, UiCallbacks } from "../../../src/ui/types.js";
import { asDocument, asHost, FakeDocument, FakeEvent, type FakeElement } from "./fake-dom.js";

const LEVEL_ROWS: readonly LevelView[] = [
  {
    id: 1,
    name: "First Breach",
    subtitle: "The water remembers",
    blurb: "Open water.",
    hint: "Ride over a core.",
    objectives: [{ id: "cores", label: "Collect the cores", count: 0, target: 4, done: false }],
    cleared: false,
    unlocked: true,
    current: true,
  },
  {
    id: 2,
    name: "Warden's Water",
    subtitle: "Return fire",
    blurb: "The Orca hunts.",
    hint: "Spray it.",
    objectives: [{ id: "cores", label: "Collect the cores", count: 0, target: 5, done: false }],
    cleared: false,
    unlocked: false,
    current: false,
  },
];

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
  riderName: "the Capybara",
  levelId: 1,
  levelName: "First Breach",
  elapsedSec: 0,
  objectives: [{ id: "cores", label: "Collect the cores", count: 1, target: 4, done: false }],
  dodgeReady: 1,
  parryReady: 1,
  cannonReady: 1,
  dialogue: null,
  levels: LEVEL_ROWS,
};

function model(overrides: Partial<HudModel> = {}): HudModel {
  return { ...BASE_MODEL, ...overrides };
}

interface Calls {
  start: number[];
  restart: number;
  home: number;
  levels: number;
  controls: number;
  license: number;
  closeOverlay: number;
  pause: number;
  mute: number;
  name: string;
  nextLevel: number;
}

function callbacksFor(calls: Calls): UiCallbacks {
  return {
    onStart: (levelId): void => {
      calls.start.push(levelId);
    },
    onRestart: (): void => {
      calls.restart += 1;
    },
    onHome: (): void => {
      calls.home += 1;
    },
    onOpenLevels: (): void => {
      calls.levels += 1;
    },
    onOpenControls: (): void => {
      calls.controls += 1;
    },
    onOpenLicense: (): void => {
      calls.license += 1;
    },
    onCloseOverlay: (): void => {
      calls.closeOverlay += 1;
    },
    onTogglePause: (): void => {
      calls.pause += 1;
    },
    onToggleMute: (): void => {
      calls.mute += 1;
    },
    onSetRiderName: (name): void => {
      calls.name = name;
    },
    onNextLevel: (): void => {
      calls.nextLevel += 1;
    },
  };
}

function emptyCalls(): Calls {
  return {
    start: [],
    restart: 0,
    home: 0,
    levels: 0,
    controls: 0,
    license: 0,
    closeOverlay: 0,
    pause: 0,
    mute: 0,
    name: "",
    nextLevel: 0,
  };
}

function setup(options: { debug?: boolean } = {}): {
  host: FakeElement;
  doc: FakeDocument;
  ui: ReturnType<typeof createUi>;
  calls: Calls;
} {
  const doc = new FakeDocument();
  const host = doc.createElement("div");
  const calls = emptyCalls();
  const ui = createUi(callbacksFor(calls), options);
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
    // The 9:20 contain-fit of a 390x844 phone.
    ui.update(model({ frame: { x: 5, y: 0, w: 380, h: 844 }, presetId: "9:20" }));

    const root = host.find("data-cc-ui");
    const size = Number((root?.style.getPropertyValue("--cc-font-size") ?? "").replace("px", ""));
    expect(size).toBeCloseTo(Number((380 / 34).toFixed(3)), 6);
    expect(size).toBeGreaterThanOrEqual(11);
    expect(size).toBeLessThanOrEqual(14);

    // The home screen is mounted and its primary action exists, so a tap can start.
    expect(host.findByAttribute("data-cc-action", "play")).not.toBeNull();
  });

  it("buffers update calls made before mount and applies them on mount", () => {
    const doc = new FakeDocument();
    const host = doc.createElement("div");
    const calls = emptyCalls();
    const ui = createUi(callbacksFor(calls));

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
    const playButton = host.findByAttribute("data-cc-action", "play");
    expect(playButton).not.toBeNull();

    ui.destroy();
    expect(host.children.length).toBe(0);
    expect(host.find("data-cc-ui")).toBeNull();

    playButton?.click();
    ui.show("home");
    ui.update(model());
    ui.destroy();
    expect(docKeydownCount(host)).toBe(0);
  });
});

/** The fake document counts keydown listeners, so escape handling is assertable. */
function docKeydownCount(host: FakeElement): number {
  return host.ownerDocument.listenerCount("keydown");
}

describe("home screen", () => {
  it("states the premise and offers the four doors", () => {
    const { host } = setup();
    const text = host.textDump.toLowerCase();

    expect(text).toContain("capybara");
    expect(text).toContain("broke");
    expect(text).toContain("orca");
    expect(text).toContain("snail");
    expect(text).toContain("waterbike");

    for (const action of ["play", "levels", "controls", "license"]) {
      const button = host.findByAttribute("data-cc-action", action);
      expect(button, action).not.toBeNull();
      expect(button?.tagName, action).toBe("button");
      expect(button?.type, action).toBe("button");
    }
  });

  it("does not repeat the wordmark as a big heading", () => {
    const { host } = setup();
    const screen = host.findByClass("cc-screen--home");
    const headline = screen?.findByClass("cc-headline");
    expect(headline?.textContent.length ?? 0).toBeLessThan(80);
    expect(headline?.textContent).not.toContain("Cosmic Chaos");
    const kicker = screen?.findByClass("cc-kicker");
    expect(kicker?.textContent).toBe("Cosmic Chaos");
  });

  it("calls onStart exactly once per click, which is the gesture that unlocks audio", () => {
    const { host, calls } = setup();
    const play = host.findByAttribute("data-cc-action", "play");
    play?.click();
    expect(calls.start).toEqual([1]);
    play?.click();
    expect(calls.start).toEqual([1, 1]);
  });

  it("opens the other three doors", () => {
    const { host, calls } = setup();
    host.findByAttribute("data-cc-action", "levels")?.click();
    host.findByAttribute("data-cc-action", "controls")?.click();
    host.findByAttribute("data-cc-action", "license")?.click();
    expect(calls.levels).toBe(1);
    expect(calls.controls).toBe(1);
    expect(calls.license).toBe(1);
  });

  it("takes a rider name and sanitises it before it leaves", () => {
    const { host, calls } = setup();
    const input = host.find("data-cc-name-input");
    expect(input).not.toBeNull();
    if (input === null) throw new Error("the home screen has no name field");
    // Whatever the player types is trimmed, stripped of control characters and
    // clamped before the app ever sees it.
    input.value = "  Captain Capybara  ";
    input.dispatch(new FakeEvent("input"));
    expect(calls.name).toBe("Captain Capybara");
    expect(host.textDump).toContain("Kept in this tab only");
  });

  it("focuses the start control so a keyboard, gamepad or touch user has one target", () => {
    const { host } = setup();
    const play = host.findByAttribute("data-cc-action", "play");
    expect(play?.focused).toBe(1);
  });

  it("is the default screen and hides the HUD", () => {
    const { host } = setup();
    expect(host.findByAttribute("data-cc-overlay", "screens")).not.toBeNull();
    expect(host.findByClass("cc-screen--home")?.classList.contains("cc-screen-active")).toBe(true);
    expect(host.findByClass("cc-screen--pause")?.subtreeText).toBeDefined();
    expect(host.findByClass("cc-screen--pause")?.classList.contains("cc-screen-active")).toBe(
      false,
    );
    expect(host.findByClass("cc-hud")?.classList.contains("cc-hud-playing")).toBe(false);
  });
});

describe("screens", () => {
  const screens: readonly Screen[] = [
    "home",
    "levels",
    "controls",
    "license",
    "briefing",
    "playing",
    "paused",
    "victory",
    "defeat",
  ];

  it("activates exactly one screen at a time, and none while playing", () => {
    const { host, ui } = setup();
    for (const screen of screens) {
      ui.show(screen);
      const active = host.findAllByClass("cc-screen-active");
      expect(active.length, screen).toBe(screen === "playing" ? 0 : 1);
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

  it("restarts from both the pause and defeat panels", () => {
    const { host, ui, calls } = setup();
    ui.update(model());
    ui.show("paused");
    host.findByAttribute("data-cc-action", "restart")?.click();
    expect(calls.restart).toBe(1);

    ui.show("defeat");
    host.findByAttribute("data-cc-action", "restart")?.click();
    expect(calls.restart).toBe(2);

    // No persistence: the seed the app holds is still the one on screen.
    expect(value(host, "data-cc-seed")).toBe("seed 1337");
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

describe("level picker", () => {
  it("lists every level, locks the closed ones and starts the open one", () => {
    const { host, ui, calls } = setup();
    ui.update(model());
    ui.show("levels");
    expect(host.findAllByClass("cc-level-card")).toHaveLength(2);
    const locked = host.findAllByClass("cc-level-card--locked");
    expect(locked).toHaveLength(1);
    expect(locked[0]?.subtreeText).toContain("Locked");

    const cards = host.findAllByClass("cc-level-card-button");
    cards[1]?.click();
    expect(calls.start).toEqual([]);
    cards[0]?.click();
    expect(calls.start).toEqual([1]);
  });

  it("rebuilds only when the unlocked set actually changes", () => {
    const { host, ui } = setup();
    ui.update(model());
    ui.show("levels");
    const before = host.findAllByClass("cc-level-card").length;
    ui.update(model({ tick: 10 }));
    expect(host.findAllByClass("cc-level-card")).toHaveLength(before);
    ui.update(
      model({
        levels: [{ ...(LEVEL_ROWS[0] as LevelView), cleared: true }, LEVEL_ROWS[1] as LevelView],
      }),
    );
    expect(host.findByClass("cc-screen--levels")?.subtreeText).toContain("Cleared");
  });
});

describe("briefing, controls and the licence reader", () => {
  it("briefing shows the level, its story and its objective targets", () => {
    const { host, ui, calls } = setup();
    ui.update(model());
    ui.show("briefing");
    const briefing = host.findByClass("cc-screen--briefing")?.subtreeText ?? "";
    expect(briefing).toContain("First Breach");
    expect(briefing).toContain("Collect the cores");
    expect(briefing).toContain("0/4");
    expect(briefing).toContain("the Capybara is on the water");
    host.findByAttribute("data-cc-action", "start")?.click();
    expect(calls.start).toEqual([1]);
  });

  it("controls lists every binding", () => {
    const { host, ui } = setup();
    ui.show("controls");
    const table = host.find("data-cc-controls");
    expect(table).not.toBeNull();
    const text = table?.subtreeText ?? "";
    for (const key of ["Dodge", "Parry", "Water cannon", "Hop"]) expect(text).toContain(key);
  });

  it("licence is a black page of scrolling text with a way out", () => {
    const { host, ui } = setup();
    ui.show("license");
    const screen = host.findByClass("cc-screen--license");
    expect(screen).not.toBeNull();
    expect(screen?.classList.contains("cc-screen-active")).toBe(true);
    const text = host.find("data-cc-license-text");
    expect((text?.textContent ?? "").toLowerCase()).toContain("apache license");
    const license = host.findByClass("cc-screen--license");
    expect(license?.findByAttribute("data-cc-action", "close-overlay")?.textContent).toBe("Close");
  });

  it("escape is only meaningful on the three overlay screens", () => {
    expect(isClosableScreen("levels")).toBe(true);
    expect(isClosableScreen("controls")).toBe(true);
    expect(isClosableScreen("license")).toBe(true);
    expect(isClosableScreen("home")).toBe(false);
    expect(isClosableScreen("playing")).toBe(false);
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
    const ui = createUi(callbacksFor(emptyCalls()), { debug: true });

    ui.show("home");
    ui.update(model());
    ui.mount(asHost(host));
    for (const screen of [
      "home",
      "levels",
      "controls",
      "license",
      "briefing",
      "playing",
      "paused",
      "victory",
      "defeat",
    ] as const) {
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

  it("debug overlay visibility", () => {
    const without = setup();
    const overlays = (host: FakeElement): string[] =>
      host
        .findAllByAttribute("data-cc-overlay")
        .map((node) => node.getAttribute("data-cc-overlay") ?? "");
    expect(overlays(without.host)).toEqual(["hud", "screens"]);
    expect(without.host.findByAttribute("data-cc-overlay", "debug")).toBeNull();
    without.ui.destroy();

    const withFlag = setup({ debug: true });
    withFlag.ui.update(model());
    expect(overlays(withFlag.host)).toEqual(["hud", "screens", "debug"]);
    const debug = withFlag.host.findByAttribute("data-cc-overlay", "debug");
    expect(debug?.find("data-cc-debug-tick")?.textContent).toBe("0");
    expect(debug?.find("data-cc-debug-counts")?.textContent).toBe("human 5  orca 1");
    withFlag.ui.destroy();
  });

  it("is driven by the URL when no explicit option is given", () => {
    const globals = globalThis as { location?: { search: string } };
    const previous = globals.location;
    const overlays = (host: FakeElement): string[] =>
      host
        .findAllByAttribute("data-cc-overlay")
        .map((node) => node.getAttribute("data-cc-overlay") ?? "");
    try {
      globals.location = { search: "?test=1&debug=1" };
      const on = setup();
      expect(overlays(on.host)).toContain("debug");
      on.ui.destroy();

      globals.location = { search: "?test=1" };
      const off = setup();
      expect(overlays(off.host)).not.toContain("debug");
      off.ui.destroy();

      globals.location = { search: "" };
      const bare = setup();
      expect(overlays(bare.host)).not.toContain("debug");
      bare.ui.destroy();
    } finally {
      if (previous === undefined) delete globals.location;
      else globals.location = previous;
    }
  });
});

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
      const ui = createUi(callbacksFor(emptyCalls()));
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
      const ui = createUi(callbacksFor(emptyCalls()));
      expect(() => {
        ui.mount({} as HTMLElement);
      }).toThrow(/ownerDocument/);
    } finally {
      if (previous === undefined) delete globals.document;
      else globals.document = previous;
    }
  });
});
