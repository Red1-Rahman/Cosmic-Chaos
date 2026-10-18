// The screens that sit on top of the arena: the title screen, the pause panel and the
// defeat panel. They own nothing but text and buttons. Every action calls a callback,
// never audio, never storage. Restarting reuses the seed the app already holds.
import type { UiCallbacks } from "./types.js";
import { el, focusQuietly, text, createButton, type ButtonOptions } from "./dom.js";

/** Copy lives here so the world tone can be edited in one place. Logged in docs/decisions.md. */
export const TITLE_COPY = {
  kicker: "Cosmic Chaos",
  headline: "The Capybara broke a fundamental rule of the universe.",
  premise: [
    "The cosmos is correcting itself through several beings with very different jobs.",
    "The Orca enforces the rule. The Shark collects the damage. The Tarantula oversees the order. The Snail keeps the tempo of time. A few oblivious human pets drift past and take no part in any of it.",
    "You ride the waterbike. Nothing is ever saved: a restart deals the same chaos from the same seed.",
  ],
  start: "Start the run",
  startHint: "Enter, Space or tap to start",
} as const;

export const PAUSE_COPY = {
  title: "Paused",
  body: "The cosmos is holding still for a moment.",
  resume: "Resume",
  restart: "Restart",
} as const;

export const DEFEAT_COPY = {
  title: "Corrected.",
  body: "The Warden closed the case on this seed. Run it again and see whether the chaos holds.",
  restart: "Restart with the same seed",
} as const;

export interface ScreenHandle {
  readonly root: HTMLElement;
  /** The action a keyboard, gamepad or touch user hits first. */
  readonly primary: HTMLButtonElement;
  /** Set when this screen is the visible one. */
  activate(): void;
  deactivate(): void;
  focusPrimary(): void;
}

const ACTIVE_CLASS = "cc-screen-active";

interface ScreenSpec {
  className: string;
  role: string;
  label: string;
  kicker: string | undefined;
  headline: string;
  body: readonly string[];
  actions: readonly ButtonOptions[];
  primaryIndex: number;
}

function createPanel(doc: Document, spec: ScreenSpec): ScreenHandle {
  const root = el(doc, `cc-screen cc-screen--${spec.className}`);
  root.setAttribute("role", spec.role);
  root.setAttribute("aria-label", spec.label);

  const panel = el(doc, "cc-panel");
  root.append(panel);

  if (spec.kicker !== undefined) {
    const kicker = el(doc, "cc-kicker");
    text(kicker, spec.kicker);
    panel.append(kicker);
  }

  const headline = el(doc, "cc-headline");
  text(headline, spec.headline);
  panel.append(headline);

  for (const line of spec.body) {
    const paragraph = el(doc, "cc-copy");
    text(paragraph, line);
    panel.append(paragraph);
  }

  const buttons = el(doc, "cc-actions-row");
  panel.append(buttons);
  const created: HTMLButtonElement[] = [];
  for (const action of spec.actions) {
    const button = createButton(doc, action);
    buttons.append(button);
    created.push(button);
  }
  const primaryButton = created[spec.primaryIndex];
  if (primaryButton === undefined) {
    throw new Error(
      `ui: the ${spec.className} screen needs an action at index ${String(spec.primaryIndex)}.`,
    );
  }

  return {
    root,
    primary: primaryButton,
    activate(): void {
      root.classList.add(ACTIVE_CLASS);
    },
    deactivate(): void {
      root.classList.remove(ACTIVE_CLASS);
    },
    focusPrimary(): void {
      focusQuietly(primaryButton);
    },
  };
}

export function createTitleScreen(doc: Document, callbacks: UiCallbacks): ScreenHandle {
  const spec: ScreenSpec = {
    className: "title",
    role: "dialog",
    label: "Cosmic Chaos title screen",
    kicker: TITLE_COPY.kicker,
    headline: TITLE_COPY.headline,
    body: TITLE_COPY.premise,
    actions: [
      {
        action: "start",
        label: TITLE_COPY.start,
        className: "cc-btn cc-btn-primary",
        onClick: (): void => {
          callbacks.onStart();
        },
      },
    ],
    primaryIndex: 0,
  };
  const screen = createPanel(doc, spec);
  const hint = el(doc, "cc-hint");
  text(hint, TITLE_COPY.startHint);
  const panel = screen.root.firstElementChild;
  if (panel !== null) panel.append(hint);
  return screen;
}

export function createPauseScreen(doc: Document, callbacks: UiCallbacks): ScreenHandle {
  return createPanel(doc, {
    className: "pause",
    role: "dialog",
    label: "Paused",
    kicker: undefined,
    headline: PAUSE_COPY.title,
    body: [PAUSE_COPY.body],
    actions: [
      {
        action: "resume",
        label: PAUSE_COPY.resume,
        className: "cc-btn cc-btn-primary",
        onClick: (): void => {
          callbacks.onTogglePause();
        },
      },
      {
        action: "restart",
        label: PAUSE_COPY.restart,
        className: "cc-btn",
        onClick: (): void => {
          callbacks.onRestart();
        },
      },
    ],
    primaryIndex: 0,
  });
}

export function createDefeatScreen(doc: Document, callbacks: UiCallbacks): ScreenHandle {
  return createPanel(doc, {
    className: "defeat",
    role: "dialog",
    label: "Run over",
    kicker: undefined,
    headline: DEFEAT_COPY.title,
    body: [DEFEAT_COPY.body],
    actions: [
      {
        action: "restart",
        label: DEFEAT_COPY.restart,
        className: "cc-btn cc-btn-primary",
        onClick: (): void => {
          callbacks.onRestart();
        },
      },
    ],
    primaryIndex: 0,
  });
}

export interface ScreensHandle {
  readonly root: HTMLElement;
  readonly title: ScreenHandle;
  readonly paused: ScreenHandle;
  readonly defeat: ScreenHandle;
  dispose(): void;
}

export function createScreens(doc: Document, callbacks: UiCallbacks): ScreensHandle {
  const root = el(doc, "cc-screens");
  root.setAttribute("data-cc-overlay", "screens");
  const title = createTitleScreen(doc, callbacks);
  const paused = createPauseScreen(doc, callbacks);
  const defeat = createDefeatScreen(doc, callbacks);
  root.append(title.root, paused.root, defeat.root);
  return {
    root,
    title,
    paused,
    defeat,
    dispose(): void {
      root.remove();
    },
  };
}