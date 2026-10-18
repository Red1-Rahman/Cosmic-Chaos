// The contract between the app layer and the ui layer. The app owns the world, the clock
// and the audio port; this layer only renders what it is handed and calls back.

export interface HudModel {
  hp: number; // 0..1
  timeScale: number; // active time scale for the player, 1 outside the snail field
  inTimeField: boolean;
  seed: number;
  tick: number;
  presetId: string; // active viewport preset id, e.g. "16:9" or "9:20"
  muted: boolean;
  paused: boolean;
  status: "playing" | "defeat";
  counts: Record<string, number>; // entity kind to count, e.g. {orca: 1, human: 5}
  /** Letterbox rect of the canvas in CSS pixels, from the viewport layout. */
  frame: { x: number; y: number; w: number; h: number };
  /** Optional extras for the debug overlay. Absent means the overlay shows "n/a". */
  entityTimeScales?: Record<string, number>;
  canvasScale?: number;
}

export type Screen = "title" | "playing" | "paused" | "defeat";

export interface UiCallbacks {
  onStart(): void;
  onRestart(): void;
  onTogglePause(): void;
  onToggleMute(): void;
}

export interface Ui {
  mount(host: HTMLElement): void;
  show(screen: Screen): void;
  update(model: HudModel): void;
  destroy(): void;
}