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
  premise: [
    "The cosmos assigned the job of correcting you to six very different beings, gave them a coastline, and left.",
    "You have a waterbike, a water cannon, a dodge and a parry. They have a job each.",
  ],
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
  const screen = createPanel(doc, {
    className: "home",
    role: "dialog",
    label: "Cosmic Chaos home",
    kicker: HOME_COPY.kicker,
    headline: HOME_COPY.headline,
    body: HOME_COPY.premise,
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
  const nameField = createNameField(doc, (value) => {
    callbacks.onSetRiderName(value);
  });
  if (panel !== null) {
    const story = el(doc, "cc-story");
    for (const line of BACKGROUND_STORY) {
      const paragraph = el(doc, "cc-copy");
      text(paragraph, line);
      story.append(paragraph);
    }
    panel.append(story, nameField.root);
    appendHint(doc, screen, HOME_COPY.hint);
  }
  return {
    ...screen,
    nameField,
    name: (): string => nameField.value(),
  };
}
