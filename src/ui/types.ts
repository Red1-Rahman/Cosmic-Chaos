// The contract between the app layer and the ui layer. The app owns the world, the clock
// and the audio port; this layer only renders what it is handed and calls back.

/** One objective, already formatted for display. */
export interface ObjectiveView {
  id: string;
  label: string;
  count: number;
  target: number;
  done: boolean;
}

/** One level, already resolved for the picker. */
export interface LevelView {
  id: number;
  mode?: "lab" | "candy" | "cosmic";
  modeName?: string;
  backgroundId?: "canvas-01" | "canvas-02" | "canvas-03";
  name: string;
  subtitle: string;
  blurb: string;
  hint: string;
  objectives: readonly ObjectiveView[];
  /** Cleared during this session. Never persisted. */
  cleared: boolean;
  unlocked: boolean;
  current: boolean;
}

/** One line of character speech. */
export interface DialogueView {
  speaker: string;
  line: string;
}

export interface HudModel {
  hp: number; // 0..1
  timeScale: number; // active time scale for the player, 1 outside the snail field
  inTimeField: boolean;
  seed: number;
  tick: number;
  presetId: string; // active viewport preset id, e.g. "16:9" or "9:20"
  muted: boolean;
  paused: boolean;
  status: "playing" | "defeat" | "victory";
  counts: Record<string, number>; // entity kind to count, e.g. {orca: 1, human: 5}
  /** Letterbox rect of the canvas in CSS pixels, from the viewport layout. */
  frame: { x: number; y: number; w: number; h: number };
  /** What the player typed on the home screen. Held in memory only. */
  riderName: string;
  levelId: number;
  levelName: string;
  /** Simulated seconds elapsed in this run. */
  elapsedSec: number;
  objectives: readonly ObjectiveView[];
  /** Readiness of the three rider actions, 0 while cooling down, 1 when ready. */
  dodgeReady: number;
  parryReady: number;
  cannonReady: number;
  dialogue: DialogueView | null;
  /** Every level, for the picker and the briefing screen. */
  levels: readonly LevelView[];
  /** Optional extras for the debug overlay. Absent means the overlay shows "n/a". */
  entityTimeScales?: Record<string, number>;
  canvasScale?: number;
}

export type Screen =
  | "home"
  | "levels"
  | "controls"
  | "license"
  | "briefing"
  | "playing"
  | "paused"
  | "victory"
  | "defeat";

/** Screens that are a full page of menu rather than an overlay on the arena. */
export const MENU_SCREENS: readonly Screen[] = [
  "home",
  "levels",
  "controls",
  "license",
  "briefing",
  "victory",
  "defeat",
];

export interface UiCallbacks {
  /** Begin a level straight away, from the home menu or the briefing's Launch. */
  onStart(levelId: number): void;
  /** Open the briefing for a level, from the picker. Nothing simulates yet. */
  onBrief(levelId: number): void;
  /** Restart the current level, same seed, same level. */
  onRestart(): void;
  /** Leave the run and return to the home menu. */
  onHome(): void;
  onOpenLevels(): void;
  onOpenControls(): void;
  onOpenLicense(): void;
  /** Back out of levels, controls or the licence reader. */
  onCloseOverlay(): void;
  onTogglePause(): void;
  onToggleMute(): void;
  onSetRiderName(name: string): void;
  /** Advance to the level after the one just cleared, if there is one. */
  onNextLevel(): void;
}

export interface Ui {
  mount(host: HTMLElement): void;
  show(screen: Screen): void;
  update(model: HudModel): void;
  destroy(): void;
}
