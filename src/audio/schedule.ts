// Pure: a voice spec plus a start time in, a list of absolute-time parameter
// events out. Nothing here touches Web Audio, the DOM or real time, which is
// what lets the unit tests assert on sound design instead of on node graphs.

import { VIBRATO_PATTERN, type EnvelopePoint, type VoiceSpec } from "./voices/spec";

export type ScheduledParam = "gain" | "frequency" | "filterFrequency" | "detune";

export interface ScheduledEvent {
  /** Seconds, relative to the audio clock, as passed in. */
  readonly at: number;
  readonly param: ScheduledParam;
  readonly value: number;
}

export interface ScheduledPart {
  readonly index: number;
  readonly kind: "tone" | "noise";
  /** Null for noise parts, which read a buffer instead of oscillating. */
  readonly wave: string | null;
  readonly playbackRate: number;
  readonly events: readonly ScheduledEvent[];
}

export interface VoiceSchedule {
  readonly cue: string;
  readonly startTime: number;
  readonly duration: number;
  readonly gain: number;
  readonly parts: readonly ScheduledPart[];
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

// Sort by time, keeping insertion order for ties so schedules stay stable.
function inTimeOrder(events: readonly ScheduledEvent[]): readonly ScheduledEvent[] {
  return [...events].sort((a, b) => a.at - b.at);
}

function envelopeEvents(
  points: readonly EnvelopePoint[],
  startTime: number,
  duration: number,
): readonly ScheduledEvent[] {
  const ordered = [...points].sort((a, b) => a.t - b.t);
  const first = ordered[0];
  if (!first) return [{ at: startTime, param: "gain", value: 0 }];
  const events: ScheduledEvent[] = [];
  if (first.t > 0) events.push({ at: startTime, param: "gain", value: 0 });
  for (const point of ordered) {
    events.push({
      at: round(startTime + point.t * duration),
      param: "gain",
      value: round(point.value),
    });
  }
  return events;
}

function rampEvents(
  from: number,
  to: number,
  startTime: number,
  duration: number,
  param: ScheduledParam,
): readonly ScheduledEvent[] {
  return [
    { at: round(startTime), param, value: round(from) },
    { at: round(startTime + duration), param, value: round(to) },
  ];
}

function vibratoEvents(
  steps: number,
  cents: number,
  startTime: number,
  duration: number,
  detune: number,
): readonly ScheduledEvent[] {
  const count = Math.max(1, Math.min(Math.round(steps), 64));
  const events: ScheduledEvent[] = [
    { at: round(startTime), param: "detune", value: round(detune) },
  ];
  const stepSeconds = duration / count;
  for (let i = 1; i < count; i += 1) {
    const pattern = VIBRATO_PATTERN[i % VIBRATO_PATTERN.length] ?? 0;
    events.push({
      at: round(startTime + i * stepSeconds),
      param: "detune",
      value: round(detune + pattern * cents),
    });
  }
  return events;
}

/** Turns a spec into the events a backend has to apply to its nodes. */
export function scheduleVoice(spec: VoiceSpec, startTime: number): VoiceSchedule {
  const duration = spec.durationSec;
  const parts: ScheduledPart[] = [];
  spec.tones.forEach((tone, index) => {
    const events: readonly ScheduledEvent[] = inTimeOrder([
      ...rampEvents(tone.freq.from, tone.freq.to, startTime, duration, "frequency"),
      ...envelopeEvents(tone.envelope, startTime, duration),
      ...vibratoEvents(
        tone.vibrato?.steps ?? 0,
        tone.vibrato?.cents ?? 0,
        startTime,
        duration,
        tone.detune ?? 0,
      ),
    ]);
    parts.push({
      index,
      kind: "tone",
      wave: tone.wave,
      playbackRate: 1,
      events,
    });
  });
  if (spec.noise) {
    const noise = spec.noise;
    parts.push({
      index: spec.tones.length,
      kind: "noise",
      wave: null,
      playbackRate: noise.playbackRate ?? 1,
      events: inTimeOrder([
        ...rampEvents(
          noise.filter.freq.from,
          noise.filter.freq.to,
          startTime,
          duration,
          "filterFrequency",
        ),
        ...envelopeEvents(noise.envelope, startTime, duration),
      ]),
    });
  }
  return {
    cue: spec.cue,
    startTime: round(startTime),
    duration,
    gain: spec.gain,
    parts,
  };
}

/** When the last event of a schedule lands, in seconds. Backends stop here. */
export function scheduleEnd(schedule: VoiceSchedule): number {
  let end = schedule.startTime + schedule.duration;
  for (const part of schedule.parts) {
    for (const event of part.events) {
      if (event.at > end) end = event.at;
    }
  }
  return round(end);
}

/** All frequency values of a part, in order. Handy in tests. */
export function frequencyTrack(schedule: VoiceSchedule, partIndex: number): readonly number[] {
  const part = schedule.parts[partIndex];
  if (!part) return [];
  return part.events.filter((e) => e.param === "frequency").map((e) => e.value);
}
