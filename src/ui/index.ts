// Public entry point of the ui layer. The app owns the world, the clock and the audio
// port; this module owns the DOM around the arena and nothing else. It never reads real
// time, never randomises, never writes to storage and never plays a sound itself: every
// action leaves through a callback and the app decides what that sounds like.
import "../styles/ui.css";

import { createDebugOverlay, type DebugHandle } from "./debug.js";
import { applyFrame, createHud, type HudHandle } from "./hud.js";
import { createScreens, type ScreensHandle } from "./title.js";
import { el } from "./dom.js";
import type { HudModel, Screen, Ui, UiCallbacks } from "./types.js";

export type { HudModel, Screen, Ui, UiCallbacks } from "./types.js";

export interface UiOptions {
  /** Forces the debug overlay on or off. When omitted it reads ?debug= from the URL. */
  debug?: boolean;
}

const DEBUG_TRUE: readonly string[] = ["1", "true", "on", "yes"];

/** True when a query string asks for the debug overlay, e.g. "?debug=1". */
export function isDebugRequested(search: string): boolean {
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

/** Location is read without touching the global `location` binding, so node is fine. */
function currentSearch(): string {
  const location = (globalThis as { location?: { search?: unknown } }).location;
  const search = location?.search;
  return typeof search === "string" ? search : "";
}

function resolveDebug(options: UiOptions): boolean {
  return options.debug ?? isDebugRequested(currentSearch());
}

interface UiGlobals {
  document?: Document;
}

function resolveDocument(host: HTMLElement): Document | undefined {
  const owner = host.ownerDocument;
  if (owner !== undefined && owner !== null) return owner;
  return (globalThis as UiGlobals).document;
}

function focusHost(doc: Document, screen: Screen, screens: ScreensHandle): void {
  if (screen === "title") {
    screens.title.focusPrimary();
    return;
  }
  if (screen === "paused") {
    screens.paused.focusPrimary();
    return;
  }
  if (screen === "defeat") {
    screens.defeat.focusPrimary();
    return;
  }
  // Playing: hand focus back to the page so Space does not re-trigger a menu button.
  const active = doc.activeElement;
  if (active !== null && active !== undefined && typeof active.blur === "function") active.blur();
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
  let current: Screen = "title";
  let pendingModel: HudModel | null = null;

  return {
    mount(host: HTMLElement): void {
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

      const buffered = pendingModel;
      pendingModel = null;
      this.show(current);
      if (buffered !== null) this.update(buffered);
    },

    show(screen: Screen): void {
      current = screen;
      if (root === null || screens === null || hud === null) return;
      if (screen === "title") screens.title.activate();
      else screens.title.deactivate();
      if (screen === "paused") screens.paused.activate();
      else screens.paused.deactivate();
      if (screen === "defeat") screens.defeat.activate();
      else screens.defeat.deactivate();
      // The pause and mute buttons only make sense while a run is on screen.
      hud.root.classList.toggle("cc-hud-playing", screen === "playing");
      if (doc !== undefined) focusHost(doc, screen, screens);
    },

    update(model: HudModel): void {
      if (root === null || hud === null) {
        pendingModel = model;
        return;
      }
      applyFrame(root, model.frame);
      hud.update(model);
      debug?.update(model);
    },

    destroy(): void {
      hud = null;
      debug = null;
      if (screens !== null) screens.dispose();
      screens = null;
      if (root !== null) root.remove();
      root = null;
      doc = undefined;
      pendingModel = null;
    },
  };
}