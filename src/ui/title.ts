// The screens that bracket a run: the level briefing, the pause panel, the
// victory panel and the defeat panel. They own text and buttons and nothing else.
//
// Every action calls a callback, never audio, never storage. Restarting reuses
// the seed and the level the app already holds, so a retry is the same run.

import { LEVELS } from "../sim/levels.js";
import { el, formatSeconds, text } from "./dom.js";
import { createPanel } from "./panels.js";
import type { ScreenHandle } from "./panels.js";
import { createControlsScreen, createLicenseScreen } from "./reader.js";
import type { HomeHandle } from "./home.js";
import { createHomeScreen } from "./home.js";
import type { LevelsHandle } from "./levels.js";
import { createLevelsScreen } from "./levels.js";
import type { LevelView, ObjectiveView, UiCallbacks } from "./types.js";

/**
 * Copy for the title screen is kept here so the world tone can be edited in one
 * place, and because the spec gate asserts on it. Logged in docs/decisions.md.
 */
export const TITLE_COPY = {
  kicker: "Cosmic Chaos",
  headline: "The Capybara broke the conservation rule of the universe.",
  premise: [
    "The cosmos is correcting itself through several beings with very different jobs.",
    "The Orca enforces the rule. The Shark collects the damage. The Tarantula oversees the order. The Snail keeps the tempo of time. A few oblivious human pets drift past and take no part in any of it.",
    "You ride the waterbike. Nothing is ever saved: a restart deals the same chaos from the same seed.",
  ],
  start: "Start the run",
  startHint: "Enter, Space or tap to start",
} as const;

export const BRIEFING_COPY = {
  kicker: "Briefing",
  headline: "What has to happen",
  start: "Launch",
  hint: "Enter or Space to launch",
  next: "Next message",
} as const;

export const PAUSE_COPY = {
  title: "Paused",
  body: "The cosmos is holding still for a moment.",
  resume: "Resume",
  restart: "Restart",
  levels: "Levels",
  home: "Home",
} as const;

export const VICTORY_COPY = {
  title: "Correction postponed.",
  kicker: "Cleared",
  body: "Every objective on the board is done. The water is yours for the moment.",
  next: "Next level",
  lastOne: "That was the last one",
  replay: "Run it again",
  home: "Home",
} as const;

export const DEFEAT_COPY = {
  title: "Corrected.",
  kicker: "Down",
  body: "The Warden closed the case on this run. Nothing is lost but the attempt.",
  restart: "Try again",
  home: "Home",
} as const;

/** Progress text for one objective. Survive objectives show a clock, not a count. */
export function objectiveProgressText(objective: ObjectiveView): string {
  if (objective.id === "survive") {
    return `${objective.label}  ${formatSeconds(objective.count)}/${formatSeconds(objective.target)}`;
  }
  const shown = String(Math.min(objective.count, objective.target));
  return `${objective.label}  ${shown}/${String(objective.target)}`;
}

export interface ObjectiveListHandle {
  readonly root: HTMLElement;
  render(objectives: readonly ObjectiveView[]): void;
}

/** The objectives block shared by the briefing and the victory panel. */
export function createObjectiveList(doc: Document): ObjectiveListHandle {
  const root = el(doc, "cc-objectives");
  root.setAttribute("data-cc-objectives", "");
  let signature = "";

  return {
    root,
    render(objectives: readonly ObjectiveView[]): void {
      const next = objectives
        .map((objective) => `${objective.id}:${String(objective.count)}:${String(objective.done)}`)
        .join("|");
      if (next === signature) return;
      signature = next;
      while (root.children.length > 0) root.children[0]?.remove();
      for (const objective of objectives) {
        const row = el(doc, "cc-objective");
        row.setAttribute("data-cc-objective", objective.id);
        row.classList.toggle("cc-objective--done", objective.done);
        const mark = el(doc, "cc-objective-mark");
        text(mark, objective.done ? "[x]" : "[ ]");
        const label = el(doc, "cc-objective-label");
        text(label, objectiveProgressText(objective));
        row.append(mark, label);
        root.append(row);
      }
    },
  };
}

export interface BriefingHandle extends ScreenHandle {
  readonly objectives: ObjectiveListHandle;
  render(level: LevelView | undefined, riderName: string): void;
}

/** The screen between picking a level and riding into it. */
export function createBriefingScreen(doc: Document, callbacks: UiCallbacks): BriefingHandle {
  let currentId = 1;

  const titleNode = el(doc, "cc-briefing-title");
  const avatar = el(doc, "cc-story-avatar", "img") as HTMLImageElement;
  avatar.alt = "Story speaker";
  const story = el(doc, "cc-story");
  const rider = el(doc, "cc-copy cc-briefing-rider");
  const next = el(doc, "cc-btn cc-btn-story-next", "button") as HTMLButtonElement;
  next.type = "button";
  text(next, BRIEFING_COPY.next);
  const objectives = createObjectiveList(doc);
  const hint = el(doc, "cc-hint");
  text(hint, BRIEFING_COPY.hint);

  const screen = createPanel(doc, {
    className: "briefing",
    role: "dialog",
    label: "Level briefing",
    kicker: BRIEFING_COPY.kicker,
    headline: BRIEFING_COPY.headline,
    body: [],
    beforeActions: [titleNode, avatar, story, next, objectives.root, hint],
    actions: [
      {
        action: "start",
        label: BRIEFING_COPY.start,
        className: "cc-btn cc-btn-primary",
        onClick: (): void => {
          callbacks.onStart(currentId);
        },
      },
      {
        action: "levels",
        label: PAUSE_COPY.levels,
        className: "cc-btn",
        onClick: (): void => {
          callbacks.onOpenLevels();
        },
      },
      {
        action: "home",
        label: PAUSE_COPY.home,
        className: "cc-btn",
        onClick: (): void => {
          callbacks.onHome();
        },
      },
    ],
    primaryIndex: 0,
    panelClass: "cc-panel--wide",
  });

  return {
    ...screen,
    objectives,
    render(level: LevelView | undefined, riderName: string): void {
      if (level === undefined) return;
      currentId = level.id;
      const definition = LEVELS.find((entry) => entry.id === level.id);
      text(titleNode, `${String(level.id)}. ${level.name} - ${level.subtitle}`);
      while (story.children.length > 0) story.children[0]?.remove();
      const lines = definition?.brief ?? [];
      let storyIndex = 0;
      const renderStoryLine = (index: number): void => {
        while (story.children.length > 0) story.children[0]?.remove();
        const line = lines[index] ?? lines[0] ?? "";
        const paragraph = el(doc, "cc-copy");
        text(paragraph, line);
        story.append(paragraph);
        story.append(rider);
        const speakers = ["capybara", "orca", "snail", "tarantula", "shark"];
        const speaker = speakers[index % speakers.length] ?? "capybara";
        avatar.src = `/assets/${speaker === "capybara" ? "Capybara-idle.png" : speaker === "orca" ? "Orca-idle.png" : speaker === "snail" ? "Snail-idle-facing-right.png" : speaker === "tarantula" ? "Spider-Idle.png" : "Shark-slide-right-diagonal-slightly-down.png"}`;
        avatar.alt = `${speaker} story speaker`;
        text(next, index >= lines.length - 1 ? "Story complete" : BRIEFING_COPY.next);
      };
      next.onclick = (): void => {
        storyIndex = Math.min(storyIndex + 1, Math.max(0, lines.length - 1));
        renderStoryLine(storyIndex);
      };
      renderStoryLine(0);
      text(rider, `${riderName} is on the water.`);
      objectives.render(level.objectives);
      text(hint, level.hint);
    },
  };
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
      {
        action: "levels",
        label: PAUSE_COPY.levels,
        className: "cc-btn",
        onClick: (): void => {
          callbacks.onOpenLevels();
        },
      },
      {
        action: "home",
        label: PAUSE_COPY.home,
        className: "cc-btn",
        onClick: (): void => {
          callbacks.onHome();
        },
      },
    ],
    primaryIndex: 0,
  });
}

export interface VictoryHandle extends ScreenHandle {
  readonly objectives: ObjectiveListHandle;
  render(level: LevelView | undefined, objectives: readonly ObjectiveView[]): void;
}

export function createVictoryScreen(doc: Document, callbacks: UiCallbacks): VictoryHandle {
  let hasNext = false;
  const story = el(doc, "cc-story");
  const objectives = createObjectiveList(doc);

  const screen = createPanel(doc, {
    className: "victory",
    role: "dialog",
    label: "Level cleared",
    kicker: VICTORY_COPY.kicker,
    headline: VICTORY_COPY.title,
    body: [VICTORY_COPY.body],
    beforeActions: [story, objectives.root],
    actions: [
      {
        action: "next-level",
        label: VICTORY_COPY.next,
        className: "cc-btn cc-btn-primary",
        onClick: (): void => {
          callbacks.onNextLevel();
        },
      },
      {
        action: "restart",
        label: VICTORY_COPY.replay,
        className: "cc-btn",
        onClick: (): void => {
          callbacks.onRestart();
        },
      },
      {
        action: "home",
        label: VICTORY_COPY.home,
        className: "cc-btn",
        onClick: (): void => {
          callbacks.onHome();
        },
      },
    ],
    primaryIndex: 0,
    panelClass: "cc-panel--wide",
  });

  // The panel owns one primary action node; the victory screen keeps a live handle
  // on it so "next level" can grey itself out on the last level.
  const syncNext = (): void => {
    const primary = screen.primary;
    primary.disabled = !hasNext;
    primary.setAttribute("aria-disabled", hasNext ? "false" : "true");
    text(primary, hasNext ? VICTORY_COPY.next : VICTORY_COPY.lastOne);
  };
  syncNext();

  return {
    ...screen,
    objectives,
    render(level: LevelView | undefined, progress: readonly ObjectiveView[]): void {
      if (level === undefined) return;
      hasNext = level.id < LEVELS.length;
      syncNext();
      while (story.children.length > 0) story.children[0]?.remove();
      const definition = LEVELS.find((entry) => entry.id === level.id);
      for (const line of definition?.outro ?? []) {
        const paragraph = el(doc, "cc-copy");
        text(paragraph, line);
        story.append(paragraph);
      }
      objectives.render(progress);
    },
  };
}

export function createDefeatScreen(doc: Document, callbacks: UiCallbacks): ScreenHandle {
  return createPanel(doc, {
    className: "defeat",
    role: "dialog",
    label: "Run over",
    kicker: DEFEAT_COPY.kicker,
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
      {
        action: "levels",
        label: PAUSE_COPY.levels,
        className: "cc-btn",
        onClick: (): void => {
          callbacks.onOpenLevels();
        },
      },
      {
        action: "home",
        label: DEFEAT_COPY.home,
        className: "cc-btn",
        onClick: (): void => {
          callbacks.onHome();
        },
      },
    ],
    primaryIndex: 0,
  });
}

export interface ScreensHandle {
  readonly root: HTMLElement;
  readonly home: HomeHandle;
  readonly levels: LevelsHandle;
  readonly controls: ScreenHandle;
  readonly license: ScreenHandle;
  readonly briefing: BriefingHandle;
  readonly paused: ScreenHandle;
  readonly victory: VictoryHandle;
  readonly defeat: ScreenHandle;
  dispose(): void;
}

/** Build every screen and append them in one place, so show() has one switch. */
export function createScreens(doc: Document, callbacks: UiCallbacks): ScreensHandle {
  const root = el(doc, "cc-screens");
  root.setAttribute("data-cc-overlay", "screens");
  const home = createHomeScreen(doc, callbacks);
  const levels = createLevelsScreen(doc, callbacks);
  const controls = createControlsScreen(doc, callbacks);
  const license = createLicenseScreen(doc, callbacks);
  const briefing = createBriefingScreen(doc, callbacks);
  const paused = createPauseScreen(doc, callbacks);
  const victory = createVictoryScreen(doc, callbacks);
  const defeat = createDefeatScreen(doc, callbacks);
  root.append(
    home.root,
    levels.root,
    controls.root,
    license.root,
    briefing.root,
    paused.root,
    victory.root,
    defeat.root,
  );
  return {
    root,
    home,
    levels,
    controls,
    license,
    briefing,
    paused,
    victory,
    defeat,
    dispose(): void {
      root.remove();
    },
  };
}
