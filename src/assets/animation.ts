// Pure animation sampler. No DOM, no clocks, no randomness.
//
// `sampleAnimation` resolves aliases, walks the keyframes of one animation and
// returns the transform for a point in time. It is deterministic: the same
// manifest and the same `elapsedMs` always produce the same sample.

import type { Animation, Easing, Keyframe, Manifest } from "./manifest-types";

export interface AnimationSample {
  readonly spriteId: string;
  readonly dx: number;
  readonly dy: number;
  readonly rot: number;
  readonly sx: number;
  readonly sy: number;
  readonly alpha: number;
}

export type AnimationErrorCode = "unknown-character" | "unknown-animation" | "alias-cycle" | "no-keyframes";

export class AnimationSampleError extends Error {
  readonly code: AnimationErrorCode;
  readonly characterId: string;
  readonly animationName: string;

  constructor(code: AnimationErrorCode, characterId: string, animationName: string, message: string) {
    super(message);
    this.name = "AnimationSampleError";
    this.code = code;
    this.characterId = characterId;
    this.animationName = animationName;
  }
}

export function isAnimationSampleError(value: unknown): value is AnimationSampleError {
  return value instanceof AnimationSampleError;
}

/** Apply one authored easing curve to a normalized segment position. */
export function ease(value: number, easing: Easing): number {
  switch (easing) {
    case "linear":
      return value;
    case "ease-in":
      return value * value;
    case "ease-out":
      return 1 - (1 - value) * (1 - value);
    case "ease-in-out":
      // Smoothstep, written without Math.pow or trig so the value is stable
      // across engines.
      return value * value * (3 - 2 * value);
    case "step":
      return 0;
  }
}

/** Guards against a manifest that aliases A to B and B back to A. */
const MAX_ALIAS_DEPTH = 8;

interface ResolvedAnimation {
  readonly name: string;
  readonly animation: Animation;
}

/** Follow the alias chain from `name` to a declared animation. */
function resolve(manifest: Manifest, characterId: string, name: string): ResolvedAnimation {
  const character = manifest.characters[characterId];
  if (character === undefined) {
    throw new AnimationSampleError(
      "unknown-character",
      characterId,
      name,
      `no character "${characterId}" in the manifest`,
    );
  }
  let current = name;
  for (let depth = 0; depth <= MAX_ALIAS_DEPTH; depth += 1) {
    const animation = character.animations[current];
    if (animation !== undefined) return { name: current, animation };
    const target = character.aliases[current];
    if (target === undefined) {
      throw new AnimationSampleError(
        "unknown-animation",
        characterId,
        name,
        `character "${characterId}" has no animation or alias named "${name}"`,
      );
    }
    current = target;
  }
  throw new AnimationSampleError(
    "alias-cycle",
    characterId,
    name,
    `animation aliases for "${name}" on "${characterId}" do not resolve within ${String(MAX_ALIAS_DEPTH)} hops`,
  );
}

/**
 * The animation `name` resolves to, after following aliases.
 *
 * Throws `AnimationSampleError` for an unknown character, an unresolvable name
 * and a cycle.
 */
export function resolveAnimation(manifest: Manifest, characterId: string, name: string): Animation {
  return resolve(manifest, characterId, name).animation;
}

/** Name of the animation actually sampled, after alias resolution. */
export function resolveAnimationName(manifest: Manifest, characterId: string, name: string): string {
  return resolve(manifest, characterId, name).name;
}

/** Normalized position inside the animation, wrapped when it loops. */
export function normalizeTime(animation: Animation, elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (animation.loop) {
    const wrapped = elapsedMs % animation.durationMs;
    return wrapped / animation.durationMs;
  }
  return Math.min(elapsedMs / animation.durationMs, 1);
}

function lerp(from: number, to: number, u: number): number {
  return from + (to - from) * u;
}

/** Linear blend of the numeric channels of two keyframes. */
function blend(from: Keyframe, to: Keyframe, u: number): AnimationSample {
  return {
    // A sprite swap is a step, not a blend: hold the outgoing art until the
    // segment is halfway through, then cut.
    spriteId: u < 0.5 ? from.sprite : to.sprite,
    dx: lerp(from.dx, to.dx, u),
    dy: lerp(from.dy, to.dy, u),
    rot: lerp(from.rot, to.rot, u),
    sx: lerp(from.sx, to.sx, u),
    sy: lerp(from.sy, to.sy, u),
    alpha: lerp(from.alpha, to.alpha, u),
  };
}

function sampleKeyframes(
  animation: Animation,
  t: number,
  fallbackEasing: Easing,
): AnimationSample | undefined {
  const keyframes = animation.keyframes;
  const first = keyframes[0];
  if (first === undefined) return undefined;

  // Before the first key or after the last one, hold that keyframe exactly.
  if (t <= first.t) return blend(first, first, 0);
  const last = keyframes[keyframes.length - 1];
  if (last === undefined || t >= last.t) return blend(last, last, 0);

  for (let i = 0; i < keyframes.length - 1; i += 1) {
    const from = keyframes[i];
    const to = keyframes[i + 1];
    if (from === undefined || to === undefined) continue;
    if (t < from.t || t > to.t) continue;
    const span = to.t - from.t;
    const raw = span <= 0 ? 0 : (t - from.t) / span;
    const u = ease(raw, to.easing ?? fallbackEasing);
    return blend(from, to, u);
  }
  return blend(last, last, 0);
}

/**
 * Sample one animation at `elapsedMs`.
 *
 * Looping animations wrap; non looping ones hold the final keyframe once
 * `elapsedMs` passes `durationMs`. Negative and non finite times clamp to the
 * first keyframe.
 */
export function sampleAnimation(
  manifest: Manifest,
  characterId: string,
  name: string,
  elapsedMs: number,
): AnimationSample {
  const animation = resolveAnimation(manifest, characterId, name);
  const sample = sampleKeyframes(animation, normalizeTime(animation, elapsedMs), animation.easing ?? "linear");
  if (sample === undefined) {
    throw new AnimationSampleError(
      "no-keyframes",
      characterId,
      name,
      `animation "${name}" on "${characterId}" has no keyframes`,
    );
  }
  return sample;
}