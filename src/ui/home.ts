// The home menu: the first thing anybody sees. It states the premise, takes a
// rider name and offers the four doors into the game.
//
// The name lives in a plain input and in the app's memory. There is no storage
// behind it and there never will be: a reload forgets it, by design.
import { BACKGROUND_STORY } from "../sim/dialogue.js";
import { createNameField, el, text } from "./dom.js";
import type { NameFieldHandle } from "./dom.js";
import { appendHint, createPanel } from "./panels.js";
import type { ScreenHandle } from "./panels.js";
import type { UiCallbacks } from "./types.js";

export const HOME_COPY = {
  kicker: "Cosmic Chaos",
  headline: "You broke a rule of the universe. Ride anyway.",
  /**
   * Two of the four background story paragraphs, picked by index. The full
   * BACKGROUND_STORY runs to nine rendered lines, which on a 720p window pushes the
   * Play button off the bottom of the panel: the panel scrolls, and a player who
   * cannot see the start button does not press it. Paragraph 0 sets up the premise
   * and paragraph 2 introduces the cast, which is the part worth reading.
   */
  storyLines: [0, 2],
  play: "Play",
  levels: "Levels",
  controls: "Controls",
  license: "License",
  hint: "Enter, Space or tap to choose",
} as const;

export interface HomeHandle extends ScreenHandle {
  readonly nameField: NameFieldHandle;
  /** Current, sanitised rider name. */
  name(): string;
}

export function createHomeScreen(doc: Document, callbacks: UiCallbacks): HomeHandle {
  const nameField = createNameField(doc, (value) => {
    callbacks.onSetRiderName(value);
  });
  const story = el(doc, "cc-story");
  for (const index of HOME_COPY.storyLines) {
    const line = BACKGROUND_STORY[index];
    if (line === undefined) continue;
    const paragraph = el(doc, "cc-copy");
    text(paragraph, line);
    story.append(paragraph);
  }

  const screen = createPanel(doc, {
    className: "home",
    role: "dialog",
    label: "Cosmic Chaos home",
    kicker: HOME_COPY.kicker,
    headline: HOME_COPY.headline,
    body: [],
    beforeActions: [story, nameField.root],
    actions: [
      {
        action: "play",
        label: HOME_COPY.play,
        className: "cc-btn cc-btn-primary",
        onClick: (): void => {
          callbacks.onStart(1);
        },
      },
      {
        action: "levels",
        label: HOME_COPY.levels,
        className: "cc-btn",
        onClick: (): void => {
          callbacks.onOpenLevels();
        },
      },
      {
        action: "controls",
        label: HOME_COPY.controls,
        className: "cc-btn",
        onClick: (): void => {
          callbacks.onOpenControls();
        },
      },
      {
        action: "license",
        label: HOME_COPY.license,
        className: "cc-btn",
        onClick: (): void => {
          callbacks.onOpenLicense();
        },
      },
    ],
    primaryIndex: 0,
  });

  const panel = screen.root.firstElementChild;
  if (panel !== null) appendHint(doc, screen, HOME_COPY.hint);
  return {
    ...screen,
    nameField,
    name: (): string => nameField.value(),
  };
}
