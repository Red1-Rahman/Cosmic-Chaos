// Public entry point of the ui layer. The app owns the world, the clock and the audio
// port; this module owns the DOM around the arena and nothing else. It never reads real
// time, never randomises, never writes to storage and never plays a sound itself: every
// action leaves through a callback and the app decides what that sounds like.
import "../styles/ui.css";

import { createDebugOverlay, type DebugHandle } from "./debug.js";
import { applyFrame, createHud, type HudHandle } from "./hud.js";
import { createScreens, type ScreensHandle } from "./title.js";
import { el } from "./dom.js";
import { LICENSE_EXIT_KEY } from "./license-text.js";
import type { HudModel, Screen, Ui, UiCallbacks } from "./types.js";

export type { HudModel, LevelView, ObjectiveView, Screen, TutorialView, Ui, UiCallbacks } from "./types.js";
export type { DialogueView } from "./types.js";

export interface UiOptions {
  /** Forces the debug overlay on or off. When omitted it reads ?debug= from the URL. */
  debug?: boolean;
}

const DEBUG_TRUE: readonly string[] = ["1", "true", "on", "yes"];

/** True when a query string asks for the debug overlay, e.g. "?debug=1". */
export function isDebugRequested(search: unknown): boolean {
  if (typeof search !== "string") return false;
  const query = search.startsWith("?") ? search.slice(1) : search;
  if (query === "") return false;
  for (const pair of query.split("&")) {
    if (pair === "") continue;
    const eq = pair.indexOf("=");
    const key = eq === -1 ? pair : pair.slice(0, eq);
    if (key.toLowerCase() !== "debug") continue;
    const raw = eq === -1 ? "" : pair.slice(eq + 1);
    const value = decodeURIComponent(raw).toLowerCase();
    return value === "" || DEBUG_TRUE.includes(value);
  }
  return false;
}

interface LocationLike {
  readonly search?: unknown;
}

/** Location is read through a cast, so nothing binds the global `location` in node. */
function currentSearch(): string {
  const scope = globalThis as unknown as { readonly location?: LocationLike };
  const found = scope.location;
  if (found === undefined) return "";
  const search: unknown = found.search;
  return typeof search === "string" ? search : "";
}

function resolveDebug(options: UiOptions): boolean {
  return options.debug ?? isDebugRequested(currentSearch());
}

interface UiGlobals {
  document?: Document | null;
}

function resolveDocument(host: HTMLElement): Document | undefined {
  // Widened on purpose: a host built by hand may hand back nothing at all.
  const owner = host.ownerDocument as Document | null | undefined;
  if (owner !== null && owner !== undefined) return owner;
  const fallback: Document | null | undefined = (globalThis as UiGlobals).document;
  return fallback ?? undefined;
}

/** Every screen, so `show()` is one lookup rather than a chain of branches. */
const SCREENS: readonly Screen[] = [
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

function handleOf(screens: ScreensHandle, screen: Screen): { root: HTMLElement } | null {
  switch (screen) {
    case "home":
      return screens.home;
    case "levels":
      return screens.levels;
    case "controls":
      return screens.controls;
    case "license":
      return screens.license;
    case "briefing":
      return screens.briefing;
    case "paused":
      return screens.paused;
    case "victory":
      return screens.victory;
    case "defeat":
      return screens.defeat;
    case "playing":
      return null;
    default:
      return null;
  }
}

function focusHost(doc: Document, screen: Screen, screens: ScreensHandle): void {
  const handle = handleOf(screens, screen);
  if (handle !== null) {
    // Every screen handle exposes focusPrimary; the picker needs the same treatment.
    const focusable = handle as unknown as { focusPrimary?: () => void };
    focusable.focusPrimary?.();
    return;
  }
  // Playing: hand focus back to the page so Space does not re-trigger a menu button.
  const active: Element | null = doc.activeElement;
  if (active !== null && typeof (active as HTMLElement).blur === "function") {
    (active as HTMLElement).blur();
  }
}

/** Escape closes the three overlay screens. Nothing else listens for it. */
export function isClosableScreen(screen: Screen): boolean {
  return screen === "levels" || screen === "controls" || screen === "license";
}

/**
 * Build the whole overlay: one root, one letterbox-aligned frame, the HUD, the screens and
 * optionally the debug overlay. Calling show() or update() before mount() is remembered and
 * applied on mount, so the app never has to care about the order.
 */
export function createUi(callbacks: UiCallbacks, options: UiOptions = {}): Ui {
  const debugEnabled = resolveDebug(options);

  let doc: Document | undefined;
  let root: HTMLElement | null = null;
  let hud: HudHandle | null = null;
  let screens: ScreensHandle | null = null;
  let debug: DebugHandle | null = null;
  let current: Screen = "home";
  let pendingModel: HudModel | null = null;
  let onEscape: (() => void) | null = null;

  function show(screen: Screen): void {
    current = screen;
    if (root === null || screens === null || hud === null) return;
    for (const candidate of SCREENS) {
      const handle = handleOf(screens, candidate);
      if (handle === null) continue;
      if (candidate === screen) handle.root.classList.add("cc-screen-active");
      else handle.root.classList.remove("cc-screen-active");
    }
    // The pause and mute buttons only make sense while a run is on screen or held.
    hud.root.classList.toggle("cc-hud-playing", screen === "playing" || screen === "paused");
    if (doc !== undefined) focusHost(doc, screen, screens);
  }

  function update(model: HudModel): void {
    if (root === null || hud === null) {
      pendingModel = model;
      return;
    }
    applyFrame(root, model.frame);
    hud.update(model);
    debug?.update(model);
    if (screens !== null) {
      screens.levels.render(model.levels);
      const active = model.levels.find((level) => level.current);
      screens.briefing.render(active, model.riderName);
      screens.victory.render(active, model.objectives);
    }
  }

  function mount(host: HTMLElement): void {
    if (root !== null) return;
    const ownerDocument = resolveDocument(host);
    if (ownerDocument === undefined) {
      throw new Error("ui: mount needs a host with an ownerDocument.");
    }
    doc = ownerDocument;

    const uiRoot = el(ownerDocument, "cc-ui");
    uiRoot.setAttribute("data-cc-ui", "");
    const frame = el(ownerDocument, "cc-frame");

    hud = createHud(ownerDocument, callbacks);
    screens = createScreens(ownerDocument, callbacks);
    frame.append(hud.root, screens.root);

    if (debugEnabled) {
      debug = createDebugOverlay(ownerDocument);
      frame.append(debug.root);
    }

    uiRoot.append(frame);
    host.append(uiRoot);
    root = uiRoot;

    // Escape closes the overlay screens. It is a document listener rather than a
    // keyboard-source flag, because the app owns the screen stack.
    const onKeyDown = (event: Event): void => {
      const code = (event as KeyboardEvent).code;
      if (code !== LICENSE_EXIT_KEY && code !== "Escape") return;
      if (!isClosableScreen(current)) return;
      event.preventDefault();
      callbacks.onCloseOverlay();
    };
    onEscape = (): void => {
      ownerDocument.removeEventListener("keydown", onKeyDown);
    };
    ownerDocument.addEventListener("keydown", onKeyDown);

    const buffered = pendingModel;
    pendingModel = null;
    show(current);
    if (buffered !== null) update(buffered);
  }

  function destroy(): void {
    hud = null;
    debug = null;
    onEscape?.();
    onEscape = null;
    if (screens !== null) screens.dispose();
    screens = null;
    if (root !== null) root.remove();
    root = null;
    doc = undefined;
    pendingModel = null;
  }

  return { mount, show, update, destroy };
}
