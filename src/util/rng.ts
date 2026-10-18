// Seeded pseudo random numbers. No Math.random anywhere in the project.
//
// A mulberry32 stream is a plain function returning values in [0, 1). createRng
// wraps it with the helpers the codebase needs and can fork named child streams
// so cosmetic randomness (particles, noise buffers) never shifts the gameplay
// stream when a particle count changes.

export type Rng = {
  /** Next float in [0, 1). */
  next(): number;
  /** Next integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Next float in [min, max). */
  range(min: number, max: number): number;
  /** Next element of a non empty list. */
  pick<T>(list: readonly T[]): T;
  /** Independent child stream derived from this seed and a label. */
  fork(label: string): Rng;
};

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a over a string, returned as an unsigned 32 bit integer. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  const rng: Rng = {
    next,
    int(min: number, max: number): number {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    range(min: number, max: number): number {
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      return lo + next() * (hi - lo);
    },
    pick<T>(list: readonly T[]): T {
      const value = list[Math.floor(next() * list.length)];
      // The list is never empty in this project; fail loudly if that changes.
      if (value === undefined) throw new Error("rng.pick: empty list");
      return value;
    },
    fork(label: string): Rng {
      return createRng(hashString(`${String(seed >>> 0)}:${label}`));
    },
  };
  return rng;
}

/** Clamp helper shared by the sim and the presentation layer. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
