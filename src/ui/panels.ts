// The generic full-screen panel every menu screen is built from.
//
// A panel owns text and buttons and nothing else. Every action leaves through a
// callback: never audio, never storage, never the simulation.
import { createButton, el, focusQuietly, text, type ButtonOptions } from "./dom.js";

export const ACTIVE_CLASS = "cc-screen-active";

export interface ScreenHandle {
  readonly root: HTMLElement;
  /** The action a keyboard, gamepad or touch user hits first. */
  readonly primary: HTMLButtonElement;
  /** Set when this screen is the visible one. */
  activate(): void;
  deactivate(): void;
  focusPrimary(): void;
}

export interface PanelSpec {
  className: string;
  role: string;
  label: string;
  kicker: string | undefined;
  headline: string;
  body: readonly string[];
  actions: readonly ButtonOptions[];
  /** Index into `actions` of the button a keyboard or gamepad user hits first. */
  primaryIndex: number;
  /** Extra class on the panel, so wide layouts can opt out of the narrow one. */
  panelClass?: string;
  /** Nodes appended after the story and before the buttons, e.g. a name field. */
  beforeActions?: readonly HTMLElement[];
}

/** Build one panel from a spec. Throws rather than dropping a screen's only action. */
export function createPanel(doc: Document, spec: PanelSpec): ScreenHandle {
  const root = el(doc, `cc-screen cc-screen--${spec.className}`);
  root.setAttribute("role", spec.role);
  root.setAttribute("aria-label", spec.label);

  const panel = el(doc, spec.panelClass === undefined ? "cc-panel" : `cc-panel ${spec.panelClass}`);
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
  for (const node of spec.beforeActions ?? []) panel.append(node);
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

/** A short hint line appended under a panel's actions. */
export function appendHint(doc: Document, screen: ScreenHandle, hint: string): void {
  const node = el(doc, "cc-hint");
  text(node, hint);
  const panel = screen.root.firstElementChild;
  if (panel !== null) panel.append(node);
}

/** Replace every paragraph of a panel's story block, keeping the block element. */
export function setStoryLines(doc: Document, parent: HTMLElement, lines: readonly string[]): void {
  const story = el(doc, "cc-story");
  for (const line of lines) {
    const paragraph = el(doc, "cc-copy");
    text(paragraph, line);
    story.append(paragraph);
  }
  parent.append(story);
}
