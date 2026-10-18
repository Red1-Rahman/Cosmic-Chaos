import { describe, expect, it } from "vitest";
import { AUDIO_CUES, VOICES } from "../../../src/audio/voices";

describe("voice specs", () => {
  it("has a spec for every cue", () => {
    expect(Object.keys(VOICES).sort()).toEqual([...AUDIO_CUES].sort());
  });

  it("keeps every spec inside sane bounds", () => {
    for (const cue of AUDIO_CUES) {
      const spec = VOICES[cue];
      expect(spec.cue).toBe(cue);
      expect(spec.durationSec).toBeGreaterThan(0);
      expect(spec.durationSec).toBeLessThanOrEqual(2);
      expect(spec.gain).toBeGreaterThan(0);
      expect(spec.gain).toBeLessThanOrEqual(1);
      expect(spec.minIntervalMs).toBeGreaterThan(0);
      expect(spec.tones.length + (spec.noise ? 1 : 0)).toBeGreaterThan(0);
    }
  });

  it("never exceeds full scale, so stacked voices cannot clip the limiter", () => {
    for (const cue of AUDIO_CUES) {
      const spec = VOICES[cue];
      const envelopes = [
        ...spec.tones.map((t) => t.envelope),
        ...(spec.noise ? [spec.noise.envelope] : []),
      ];
      for (const envelope of envelopes) {
        for (const point of envelope) {
          expect(point.value).toBeGreaterThanOrEqual(0);
          expect(point.value).toBeLessThanOrEqual(1);
          expect(point.t).toBeGreaterThanOrEqual(0);
          expect(point.t).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("starts and ends every envelope at rest", () => {
    for (const cue of AUDIO_CUES) {
      const spec = VOICES[cue];
      const envelopes = [
        ...spec.tones.map((t) => t.envelope),
        ...(spec.noise ? [spec.noise.envelope] : []),
      ];
      for (const envelope of envelopes) {
        expect(envelope[0]?.value).toBe(0);
        expect(envelope[envelope.length - 1]?.value).toBe(0);
      }
    }
  });
});
