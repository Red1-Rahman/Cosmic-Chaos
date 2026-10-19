// The controls reference, and the licence reader.
//
// The licence reader is the one screen with its own visual language: a black
// page, the full Apache 2.0 text scrolling upward at a constant rate, and Escape
// to leave. The scroll is a CSS animation rather than a JavaScript timer, so the
// ui layer still never reads a clock.
import { el, text } from "./dom.js";
import { appendHint, createPanel } from "./panels.js";
import type { ScreenHandle } from "./panels.js";
import { LICENSE_CAPTION, LICENSE_SCROLL_SECONDS, LICENSE_TEXT } from "./license-text.js";
import type { UiCallbacks } from "./types.js";

export const CONTROLS_COPY = {
  kicker: "Controls",
  headline: "Everything you can press.",
  rows: [
    ["Move", "W A S D, or the arrow keys, or the left stick"],
    ["Hop", "Space, or the south gamepad button"],
    ["Water cannon", "J or Shift, or the west gamepad button"],
    ["Dodge", "K, or the north gamepad button"],
    ["Parry", "L or Q, or the east gamepad button"],
    ["Pause", "The pause button in the corner"],
    ["Back", "Esc, from any menu screen"],
  ] as const,
  body: [
    "Spray an enemy three times to topple it. A toppled warden cannot touch you while it recovers.",
    "A dodge is a shove with invulnerability: use it to cross a reef or slip a lunge. A parry turns a lunge around and takes the warden down with it.",
  ],
  back: "Back",
} as const;

export function createControlsScreen(doc: Document, callbacks: UiCallbacks): ScreenHandle {
  const table = el(doc, "cc-controls-table");
  table.setAttribute("data-cc-controls", "");
  for (const [action, keys] of CONTROLS_COPY.rows) {
    const row = el(doc, "cc-controls-row");
    const name = el(doc, "cc-controls-action");
    text(name, action);
    const binding = el(doc, "cc-controls-keys");
    text(binding, keys);
    row.append(name, binding);
    table.append(row);
  }

  const screen = createPanel(doc, {
    className: "controls",
    role: "dialog",
    label: "Controls",
    kicker: CONTROLS_COPY.kicker,
    headline: CONTROLS_COPY.headline,
    body: CONTROLS_COPY.body,
    beforeActions: [table],
    actions: [
      {
        action: "close-overlay",
        label: CONTROLS_COPY.back,
        className: "cc-btn cc-btn-primary",
        onClick: (): void => {
          callbacks.onCloseOverlay();
        },
      },
    ],
    primaryIndex: 0,
  });

  if (screen.root.firstElementChild !== null) appendHint(doc, screen, "Esc also goes back");
  return screen;
}

export const LICENSE_COPY = {
  back: "Close",
  hint: "The text scrolls on its own. Esc leaves at any time.",
} as const;

/**
 * The licence reader. Built by hand rather than through `createPanel` because it
 * has no story block and a scrolling viewport instead.
 */
export function createLicenseScreen(doc: Document, callbacks: UiCallbacks): ScreenHandle {
  const root = el(doc, "cc-screen cc-screen--license");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "License");
  root.classList.add("cc-screen--reader");

  const caption = el(doc, "cc-license-caption");
  text(caption, LICENSE_CAPTION);

  const viewport = el(doc, "cc-license-viewport");
  const scroller = el(doc, "cc-license-scroll");
  scroller.style.setProperty("--cc-license-scroll", `${String(LICENSE_SCROLL_SECONDS)}s`);
  scroller.setAttribute("data-cc-license-text", "");
  scroller.textContent = licenseBody();
  viewport.append(scroller);

  const back = el(doc, "cc-btn cc-btn-primary cc-license-close", "button") as HTMLButtonElement;
  back.type = "button";
  back.setAttribute("data-cc-action", "close-overlay");
  back.setAttribute("aria-label", LICENSE_COPY.back);
  text(back, LICENSE_COPY.back);
  back.addEventListener("click", (): void => {
    callbacks.onCloseOverlay();
  });

  const hint = el(doc, "cc-hint cc-license-hint");
  text(hint, LICENSE_COPY.hint);

  root.append(caption, viewport, back, hint);

  return {
    root,
    primary: back,
    activate(): void {
      root.classList.add("cc-screen-active");
    },
    deactivate(): void {
      root.classList.remove("cc-screen-active");
    },
    focusPrimary(): void {
      if (typeof back.focus === "function") back.focus();
    },
  };
}

function licenseBody(): string {
  // The text itself is imported by src/ui/license-text.ts; this indirection keeps
  // the dependency obvious at the point it is used.
  return LICENSE_TEXT;
}
