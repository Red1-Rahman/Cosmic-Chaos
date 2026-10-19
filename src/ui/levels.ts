// The level picker: every level the game ships, what it asks for, and whether
// it is open yet. Locked levels are rendered as disabled buttons, not hidden, so
// the shape of the campaign is always visible.
import { createButton, el, formatSeconds, text } from "./dom.js";
import type { ButtonOptions } from "./dom.js";
import { appendHint, createPanel } from "./panels.js";
import type { ScreenHandle } from "./panels.js";
import type { LevelView, ObjectiveView, UiCallbacks } from "./types.js";

export const LEVELS_COPY = {
  kicker: "Levels",
  headline: "Five corrections, in order.",
  body: [
    "Each one is winnable. Nothing is hidden, nothing is random and nothing is timed against you.",
  ],
  back: "Back",
  hint: "Enter or Space to pick a level, Esc to go back",
} as const;

/** "Collect 4 cores" style summary of one level's objective book. */
export function summarizeObjectives(objectives: readonly ObjectiveView[]): string[] {
  return objectives.map((objective) => {
    const target =
      objective.label.includes("afloat") || objective.id === "survive"
        ? formatSeconds(objective.target)
        : String(objective.target);
    return `${objective.label.replace(/\.$/, "")} (${target})`;
  });
}

export interface LevelsHandle extends ScreenHandle {
  /** Rebuild the cards for the current model. Cheap, and only runs on change. */
  render(levels: readonly LevelView[]): void;
}

export function createLevelsScreen(doc: Document, callbacks: UiCallbacks): LevelsHandle {
  const screen = createPanel(doc, {
    className: "levels",
    role: "dialog",
    label: "Level select",
    kicker: LEVELS_COPY.kicker,
    headline: LEVELS_COPY.headline,
    body: LEVELS_COPY.body,
    actions: [
      {
        action: "close-overlay",
        label: LEVELS_COPY.back,
        className: "cc-btn",
        onClick: (): void => {
          callbacks.onCloseOverlay();
        },
      },
    ],
    primaryIndex: 0,
    panelClass: "cc-panel--wide",
  });

  const panel = screen.root.firstElementChild;
  const list = el(doc, "cc-level-list");
  if (panel !== null) {
    panel.append(list);
    appendHint(doc, screen, LEVELS_COPY.hint);
  }

  let signature = "";

  return {
    ...screen,
    render(levels: readonly LevelView[]): void {
      // The 60 Hz update must not rebuild the DOM. One string per level list,
      // and the list is only rebuilt when that string actually changes.
      const next = levels
        .map((level) => `${String(level.id)}:${String(level.unlocked)}:${String(level.cleared)}`)
        .join("|");
      if (next === signature) return;
      signature = next;

      while (list.children.length > 0) list.children[0]?.remove();
      for (const level of levels) {
        list.append(buildCard(doc, level, callbacks));
      }
    },
  };
}

function buildCard(doc: Document, level: LevelView, callbacks: UiCallbacks): HTMLElement {
  const card = el(doc, "cc-level-card");
  card.setAttribute("data-cc-level", String(level.id));
  card.classList.toggle("cc-level-card--locked", !level.unlocked);
  card.classList.toggle("cc-level-card--current", level.current);

  const heading = el(doc, "cc-level-name");
  const label = level.unlocked
    ? `${String(level.id)}. ${level.name}`
    : `${String(level.id)}. Locked`;
  text(heading, label);
  card.append(heading);

  const subtitle = el(doc, "cc-level-sub");
  text(subtitle, level.unlocked ? level.subtitle : "Clear the level before it to open this one.");
  card.append(subtitle);

  if (level.unlocked) {
    const goals = el(doc, "cc-level-goals");
    for (const line of summarizeObjectives(level.objectives)) {
      const goal = el(doc, "cc-level-goal");
      text(goal, line);
      goals.append(goal);
    }
    card.append(goals);

    if (level.cleared) {
      const cleared = el(doc, "cc-level-flag");
      text(cleared, "Cleared");
      card.append(cleared);
    }
  }

  const options: ButtonOptions = {
    action: "select-level",
    label: level.unlocked
      ? `Play level ${String(level.id)}: ${level.name}`
      : `Level ${String(level.id)} locked`,
    className: "cc-btn cc-level-card-button",
    onClick: (): void => {
      if (!level.unlocked) return;
      callbacks.onStart(level.id);
    },
  };
  const button = createButton(doc, options);
  button.disabled = !level.unlocked;
  card.append(button);
  return card;
}
