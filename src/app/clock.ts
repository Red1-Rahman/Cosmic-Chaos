// Real time lives here and nowhere else. Every other module takes a Clock, which is what
// makes the fixed step loop testable without waiting for a real frame.

/** Monotonic millisecond source. */
export interface Clock {
  nowMs(): number;
}

interface PerformanceLike {
  now(): number;
}

interface ClockSource {
  performance?: PerformanceLike;
}

/**
 * Real clock. `performance.now()` is monotonic and unaffected by the wall clock, so a
 * mid-session NTP correction can never make the accumulator jump backwards.
 */
export function createRealClock(source: ClockSource = globalThis as ClockSource): Clock {
  return {
    nowMs(): number {
      const perf = source.performance;
      return perf !== undefined ? perf.now() : 0;
    },
  };
}

export interface FakeClock extends Clock {
  /** Move time forward. */
  advance(ms: number): void;
  /** Jump to an absolute time. Never moves backwards. */
  set(ms: number): void;
}

/** Deterministic clock for unit and cross-module tests. */
export function createFakeClock(startMs = 0): FakeClock {
  let current = startMs;
  return {
    nowMs: () => current,
    advance(ms: number): void {
      current += ms;
    },
    set(ms: number): void {
      if (ms > current) current = ms;
    },
  };
}