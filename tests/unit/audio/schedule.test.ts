import { describe, expect, it } from "vitest";
import { frequencyTrack, scheduleEnd, scheduleVoice } from "../../../src/audio/schedule";
import { AUDIO_CUES, VOICES } from "../../../src/audio/voices";

const at = 2; // a non-zero, awkward start time on purpose

describe("scheduleVoice", () => {
  it("covers every cue without throwing and keeps part counts stable", () => {
    for (const cue of AUDIO_CUES) {
      const schedule = scheduleVoice(VOICES[cue], at);
      expect(schedule.cue).toBe(cue);
      expect(schedule.startTime).toBe(at);
      expect(schedule.duration).toBe(VOICES[cue].durationSec);
      const expectedParts = VOICES[cue].tones.length + (VOICES[cue].noise ? 1 : 0);
      expect(schedule.parts).toHaveLength(expectedParts);
      expect(scheduleEnd(schedule)).toBeGreaterThanOrEqual(at + schedule.duration);
    }
  });

  it("emits events in non-decreasing time order per part", () => {
    for (const cue of AUDIO_CUES) {
      const schedule = scheduleVoice(VOICES[cue], at);
      for (const part of schedule.parts) {
        const times = part.events.map((e) => e.at);
        const sorted = [...times].sort((a, b) => a - b);
        expect(times).toEqual(sorted);
        expect(times.every((t) => t >= at)).toBe(true);
      }
    }
  });

  it("is deterministic", () => {
    const a = scheduleVoice(VOICES.laser, at);
    const b = scheduleVoice(VOICES.laser, at);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("laser ping sweeps down in two parts and decays to rest", () => {
    const schedule = scheduleVoice(VOICES.laser, at);
    expect(schedule.parts).toHaveLength(2);
    expect(schedule.parts[0]?.kind).toBe("tone");
    expect(frequencyTrack(schedule, 0)).toEqual([1850, 520]);
    expect(frequencyTrack(schedule, 1)).toEqual([760, 240]);
    const gains = schedule.parts[0]?.events.filter((e) => e.param === "gain") ?? [];
    expect(gains[0]?.value).toBe(0);
    expect(gains.at(-1)?.value).toBe(0);
    expect(Math.max(...gains.map((g) => g.value))).toBe(1);
    expect(scheduleEnd(schedule)).toBeCloseTo(at + 0.22, 6);
  });

  it("splash is a filtered noise burst with no oscillators", () => {
    const schedule = scheduleVoice(VOICES.splash, at);
    expect(schedule.parts).toHaveLength(1);
    const part = schedule.parts[0];
    expect(part?.kind).toBe("noise");
    expect(part?.wave).toBeNull();
    const filter = part?.events.filter((e) => e.param === "filterFrequency") ?? [];
    expect(filter.map((e) => e.value)).toEqual([2600, 420]);
  });

  it("ui click is short, square and dry", () => {
    const schedule = scheduleVoice(VOICES.ui, at);
    expect(schedule.duration).toBe(0.07);
    expect(schedule.parts[0]?.wave).toBe("square");
    expect(frequencyTrack(schedule, 0)).toEqual([940, 660]);
  });

  it("jump chirps upward", () => {
    const track = frequencyTrack(scheduleVoice(VOICES.jump, at), 0);
    expect(track[1]).toBeGreaterThan(track[0] ?? 0);
  });

  it("hit pairs two tones with a noise scrape", () => {
    const schedule = scheduleVoice(VOICES.hit, at);
    expect(schedule.parts.map((p) => p.kind)).toEqual(["tone", "tone", "noise"]);
    expect(frequencyTrack(schedule, 0)).toEqual([340, 110]);
  });

  it("defeat collapses and carries a quantized wobble", () => {
    const schedule = scheduleVoice(VOICES.defeat, at);
    expect(frequencyTrack(schedule, 0)).toEqual([520, 92]);
    const detune = schedule.parts[0]?.events.filter((e) => e.param === "detune") ?? [];
    expect(detune).toHaveLength(8);
    expect(detune.map((e) => e.value)).toEqual([0, 14, 0, -14, 0, 14, 0, -14]);
  });

  it("time field enter slides down and exit slides back up", () => {
    const enter = frequencyTrack(scheduleVoice(VOICES.timeFieldEnter, at), 0);
    const exit = frequencyTrack(scheduleVoice(VOICES.timeFieldExit, at), 0);
    expect(enter[1]).toBeLessThan(enter[0] ?? 0);
    expect(exit[1]).toBeGreaterThan(exit[0] ?? 0);
  });
});
