// The cosmic engine hum is continuous, so it is not a scheduled one-shot voice.
// It is described by a spec plus two pure functions that map throttle and time
// scale onto pitch and loudness. The Snail's field lowers timeScale, which is
// what makes the hum pitch down without any node being torn down.

export interface EngineSpec {
  /** Idle pitch of the low drone, in hertz. */
  readonly baseHz: number;
  /** Extra pitch at full throttle, in hertz. */
  readonly throttleHz: number;
  /** Detune between the two oscillators, in cents. */
  readonly detuneCents: number;
  /** Second oscillator plays this fraction of the first. */
  readonly subRatio: number;
  readonly filter: { readonly idleHz: number; readonly fullHz: number; readonly q: number };
  /** Master hum level at idle throttle and at full throttle. */
  readonly idleGain: number;
  readonly fullGain: number;
  /** Time scale is clamped into this range before it touches pitch. */
  readonly timeScale: { readonly min: number; readonly max: number };
}

export const engineSpec: EngineSpec = {
  baseHz: 58,
  throttleHz: 74,
  detuneCents: 7,
  subRatio: 0.5,
  filter: { idleHz: 340, fullHz: 1500, q: 0.9 },
  idleGain: 0.05,
  fullGain: 0.22,
  timeScale: { min: 0.1, max: 2 },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Pitch of the hum for a given throttle and time scale.
 * Below 1 the pitch follows the time scale directly, so inside the field the
 * engine sags with everything else. Above 1 it rises at a third of the rate so
 * fast forwards do not turn the hum into a whistle.
 */
export function engineFrequency(spec: EngineSpec, speed01: number, timeScale: number): number {
  const speed = clamp01(speed01);
  const ts = Math.min(
    Math.max(Number.isFinite(timeScale) ? timeScale : 1, spec.timeScale.min),
    spec.timeScale.max,
  );
  const timeFactor = ts <= 1 ? ts : 1 + (ts - 1) / 3;
  const hz = (spec.baseHz + spec.throttleHz * speed) * timeFactor;
  return Math.round(hz * 1000) / 1000;
}

/** Loudness of the hum. Mute is handled by the master gain, not here. */
export function engineGain(spec: EngineSpec, speed01: number, timeScale: number): number {
  const speed = clamp01(speed01);
  const ts = Math.min(
    Math.max(Number.isFinite(timeScale) ? timeScale : 1, spec.timeScale.min),
    spec.timeScale.max,
  );
  const gain = spec.idleGain + (spec.fullGain - spec.idleGain) * speed;
  // Inside the field the engine is also quieter, which sells the slowdown.
  const factor = ts < 1 ? 0.55 + 0.45 * ts : 1;
  return Math.round(gain * factor * 10000) / 10000;
}

/** Cutoff of the hum's lowpass, in hertz. */
export function engineFilterHz(spec: EngineSpec, speed01: number): number {
  const speed = clamp01(speed01);
  return (
    Math.round((spec.filter.idleHz + (spec.filter.fullHz - spec.filter.idleHz) * speed) * 100) / 100
  );
}
