// Voice specs are pure data. No Web Audio types appear here, so a spec can be
// imported and asserted on in a node test. src/audio/schedule.ts turns a spec
// into absolute-time parameter events; the backends only render those events.

/** Waveforms. Mirrors the Web Audio oscillator types but is defined locally on purpose. */
export type WaveKind = "sine" | "triangle" | "square" | "sawtooth";

/** Filter shapes. Mirrors the Web Audio biquad types, defined locally for the same reason. */
export type FilterKind = "lowpass" | "highpass" | "bandpass";

/** One keyframe of an envelope. t is normalised position inside the voice duration. */
export interface EnvelopePoint {
  /** Normalised time, 0..1 across the whole voice. */
  readonly t: number;
  readonly value: number;
}

/** A linear frequency ramp from the first value to the second across the duration. */
export interface Ramp {
  readonly from: number;
  readonly to: number;
}

export interface OscillatorPart {
  readonly wave: WaveKind;
  readonly freq: Ramp;
  /** Steady detune in cents, applied at start. */
  readonly detune?: number;
  /** Stepped detune wobble. Values are quantized so schedules stay hashable. */
  readonly vibrato?: { readonly steps: number; readonly cents: number };
  /** Peak-scaled gain envelope. */
  readonly envelope: readonly EnvelopePoint[];
}

export interface NoisePart {
  readonly filter: { readonly kind: FilterKind; readonly freq: Ramp; readonly q: number };
  readonly envelope: readonly EnvelopePoint[];
  readonly playbackRate?: number;
}

export interface VoiceSpec {
  /** Cue name, or "engine" for the continuous hum. */
  readonly cue: string;
  /** Seconds. Ignored by the engine, which is a continuous voice. */
  readonly durationSec: number;
  /** Linear gain of the voice as a whole. */
  readonly gain: number;
  /** Minimum gap between two accepted plays of this cue, in milliseconds. */
  readonly minIntervalMs: number;
  readonly tones: readonly OscillatorPart[];
  readonly noise?: NoisePart;
}

/** Fixed detune wobble pattern, so schedules never need trig. */
export const VIBRATO_PATTERN: readonly number[] = [0, 1, 0, -1];

export function envelope(...points: readonly [number, number][]): readonly EnvelopePoint[] {
  return points.map(([t, value]) => ({ t, value }));
}
