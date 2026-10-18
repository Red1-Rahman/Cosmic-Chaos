import type { Clock } from "./clock";

/**
 * Fixed 60 Hz simulation step. The step size never changes: the Snail's time field scales
 * the dt an entity receives, never the step the loop runs at.
 */
export const FIXED_DT = 1 / 60;

/**
 * Longest frame the loop will honour. Without this, a tab that was backgrounded for a minute
 * would try to catch up with 3600 steps in one frame and freeze.
 */
export const MAX_FRAME_MS = 250;

/** Never run more than this many catch-up steps in one frame. */
export const MAX_STEPS_PER_FRAME = 8;

export interface LoopOptions {
  clock: Clock;
  /** Called once per frame before any stepping, so input is sampled for the whole frame. */
  onFrameStart?: () => void;
  onFixedStep: (dt: number) => void;
  /** Interpolation alpha in [0, 1) plus the real frame time in ms. */
  onFrame: (alpha: number, frameMs: number) => void;
  requestFrame: (callback: (timeMs: number) => void) => number;
  cancelFrame: (handle: number) => void;
  fixedDt?: number;
}

export interface LoopHandle {
  start(): void;
  stop(): void;
  dispose(): void;
  /** True while the loop is scheduled. */
  running(): boolean;
  /** Advance one frame manually. Used by tests instead of a real animation frame. */
  tick(): void;
}

/**
 * Accumulator loop. Real time arrives only through the injected clock, so tests drive it
 * by calling `tick()` and a fake clock.
 */
export function createLoop(options: LoopOptions): LoopHandle {
  const fixedDt = options.fixedDt ?? FIXED_DT;
  let accumulator = 0;
  let lastMs: number | undefined;
  let handle: number | undefined;
  let disposed = false;

  const runFrame = (): void => {
    if (disposed) return;
    handle = undefined;
    tick();
    if (!disposed) schedule();
  };

  const schedule = (): void => {
    if (disposed || handle !== undefined) return;
    handle = options.requestFrame(runFrame);
  };

  function tick(): void {
    if (disposed) return;
    const now = options.clock.nowMs();
    const previous = lastMs;
    lastMs = now;
    if (previous === undefined) {
      // The first frame only establishes the baseline, so loading time is never simulated.
      options.onFrame(0, 0);
      return;
    }
    const rawMs = now - previous;
    const frameMs = rawMs > 0 ? (rawMs > MAX_FRAME_MS ? MAX_FRAME_MS : rawMs) : 0;
    accumulator += frameMs / 1000;

    options.onFrameStart?.();

    let steps = 0;
    while (accumulator >= fixedDt && steps < MAX_STEPS_PER_FRAME) {
      accumulator -= fixedDt;
      steps += 1;
      options.onFixedStep(fixedDt);
    }
    if (steps >= MAX_STEPS_PER_FRAME) accumulator = 0;

    options.onFrame(accumulator / fixedDt, frameMs);
  }

  return {
    start(): void {
      if (disposed || handle !== undefined) return;
      lastMs = undefined;
      accumulator = 0;
      schedule();
    },
    stop(): void {
      if (handle !== undefined) {
        options.cancelFrame(handle);
        handle = undefined;
      }
    },
    dispose(): void {
      disposed = true;
      this.stop();
      lastMs = undefined;
      accumulator = 0;
    },
    running(): boolean {
      return handle !== undefined;
    },
    tick,
  };
}