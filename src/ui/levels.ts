// The level picker: every level the game ships, what it asks for, and whether
// it is open yet. Locked levels are rendered as disabled buttons, not hidden, so
// the shape of the campaign is always visible.
import { createButton, el, focusQuietly, formatSeconds, text } from "./dom.js";
import type { ButtonOptions } from "./dom.js";
import { appendHint, createPanel } from "./panels.js";
import type { ScreenHandle } from "./panels.js";
import type { LevelView, ObjectiveView, UiCallbacks } from "./types.js";

export const LEVELS_COPY = {
  kicker: "Levels",
  headline: "Three modes. Five playable chapters.",
  body: [
    "Pick a scene and a goal. The chapters unlock in order, but every mode changes the feel of the run.",
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
  // The list is mounted before the buttons, so Back always sits under the cards
  // rather than between the intro and the first level.
  const list = el(doc, "cc-level-list");

  const screen = createPanel(doc, {
    className: "levels",
    role: "dialog",
    label: "Level select",
    kicker: LEVELS_COPY.kicker,
    headline: LEVELS_COPY.headline,
    body: LEVELS_COPY.body,
    beforeActions: [list],
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
  if (panel !== null) appendHint(doc, screen, LEVELS_COPY.hint);

  let signature = "";
  const cardButtons: HTMLButtonElement[] = [];

  return {
    ...screen,
    // Focusing Back would scroll the panel to its bottom, hiding the first level.
    // The first unlocked card is the thing a player is actually reaching for.
    focusPrimary(): void {
      for (const button of cardButtons) {
        if (button.disabled) continue;
        focusQuietly(button);
        return;
      }
      focusQuietly(screen.primary);
    },
    render(levels: readonly LevelView[]): void {
      // The 60 Hz update must not rebuild the DOM. One string per level list,
      // and the list is only rebuilt when that string actually changes.
      const next = levels
        .map((level) => `${String(level.id)}:${String(level.unlocked)}:${String(level.cleared)}`)
        .join("|");
      if (next === signature) return;
      signature = next;

      while (list.children.length > 0) list.children[0]?.remove();
      cardButtons.length = 0;
      for (const level of levels) {
        const card = buildCard(doc, level, callbacks);
        list.append(card.root);
        cardButtons.push(card.button);
      }
    },
  };
}

function buildCard(
  doc: Document,
  level: LevelView,
  callbacks: UiCallbacks,
): { readonly root: HTMLElement; readonly button: HTMLButtonElement } {
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
  if (level.modeName !== undefined) {
    const mode = el(doc, "cc-level-mode");
    text(
      mode,
      `${level.modeName}${level.backgroundId === undefined ? "" : ` / ${level.backgroundId}`}`,
    );
    card.append(mode);
  }

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
      callbacks.onBrief(level.id);
    },
  };
  const button = createButton(doc, options);
  button.disabled = !level.unlocked;
  card.append(button);
  return { root: card, button };
}
