import { describe, expect, it } from "vitest";
import { createAudioPort } from "../../../src/audio/port";
import { createNullBackend } from "../../../src/audio/null-backend";
import { createRecordingBackend } from "../../../src/audio/recording-backend";
import type {
  RecordedEngine,
  RecordedFlag,
  RecordedPlay,
} from "../../../src/audio/recording-backend";
import { AUDIO_CUES, VOICES } from "../../../src/audio/voices";

function fakeClock(start = 0): { now: () => number; advance: (seconds: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (seconds: number) => {
      t += seconds;
    },
  };
}

describe("createAudioPort", () => {
  it("plays every cue through the backend", () => {
    const backend = createRecordingBackend({ clock: fakeClock().now });
    const port = createAudioPort({ backend });
    for (const cue of AUDIO_CUES) port.play(cue);
    expect(backend.played()).toEqual([...AUDIO_CUES]);
  });

  it("is harmless before unlock: nothing throws and nothing plays", () => {
    const backend = createRecordingBackend({ clock: fakeClock().now, ready: false });
    const port = createAudioPort({ backend });
    port.setEngine(0.5, 0.5);
    port.play("laser");
    const plays = backend.entries.filter((e): e is RecordedPlay => e.kind === "play");
    expect(plays).toHaveLength(1);
    expect(plays[0]?.outcome).toBe("locked");
    expect(backend.played()).toHaveLength(0);
  });

  it("rate limits a burst of the same cue", () => {
    const clock = fakeClock();
    const backend = createRecordingBackend({ clock: clock.now });
    const port = createAudioPort({ backend });
    const limit = VOICES.laser.minIntervalMs / 1000;
    for (let i = 0; i < 20; i += 1) {
      port.play("laser");
      clock.advance(0.005);
    }
    const played = backend.played("laser").length;
    expect(played).toBeGreaterThan(0);
    expect(played).toBeLessThan(20);
    const outcomes = backend.entries
      .filter((e): e is RecordedPlay => e.kind === "play")
      .map((e) => e.outcome);
    expect(outcomes.filter((o) => o === "rate-limited").length).toBe(20 - played);
    // Consecutive accepted plays are never closer together than the spec allows.
    const times = backend.entries
      .filter((e): e is RecordedPlay => e.kind === "play" && e.outcome === "played")
      .map((e) => e.at);
    for (let i = 1; i < times.length; i += 1) {
      expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeGreaterThanOrEqual(limit - 1e-9);
    }
  });

  it("lets a different cue through immediately", () => {
    const clock = fakeClock();
    const backend = createRecordingBackend({ clock: clock.now });
    const port = createAudioPort({ backend });
    port.play("laser");
    port.play("ui");
    expect(backend.played("laser")).toHaveLength(1);
    expect(backend.played("ui")).toHaveLength(1);
  });

  it("drops everything while muted and resumes after unmute", () => {
    const clock = fakeClock();
    const backend = createRecordingBackend({ clock: clock.now });
    const port = createAudioPort({ backend });
    port.setMuted(true);
    port.play("hit");
    expect(backend.played("hit")).toHaveLength(0);
    clock.advance(1);
    port.setMuted(false);
    port.play("hit");
    expect(backend.played("hit")).toHaveLength(1);
    const flags = backend.entries.filter(
      (e): e is RecordedFlag => e.kind === "flag" && e.name === "muted",
    );
    expect(flags.map((f) => f.value)).toEqual([true, false]);
  });

  it("honours muted passed in at construction", () => {
    const backend = createRecordingBackend({ clock: fakeClock().now });
    const port = createAudioPort({ backend, muted: true });
    port.play("jump");
    expect(backend.played("jump")).toHaveLength(0);
  });

  it("forwards engine updates and tolerates non-finite values", () => {
    const backend = createRecordingBackend({ clock: fakeClock().now });
    const port = createAudioPort({ backend });
    port.setEngine(0.8, 0.5);
    port.setEngine(Number.NaN, Number.POSITIVE_INFINITY);
    const engines = backend.entries.filter((e): e is RecordedEngine => e.kind === "engine");
    expect(engines).toHaveLength(2);
    expect(engines[0]).toEqual({ kind: "engine", speed01: 0.8, timeScale: 0.5 });
    expect(engines[1]?.speed01).toBe(0);
    expect(engines[1]?.timeScale).toBe(1);
  });

  it("goes quiet after dispose and stays quiet", () => {
    const backend = createRecordingBackend({ clock: fakeClock().now });
    const port = createAudioPort({ backend });
    port.dispose();
    port.dispose();
    port.play("laser");
    port.setEngine(1, 1);
    expect(backend.played()).toHaveLength(0);
    expect(backend.entries.filter((e) => e.kind === "engine")).toHaveLength(0);
    const disposes = backend.entries.filter(
      (e): e is RecordedFlag => e.kind === "flag" && e.name === "dispose",
    );
    expect(disposes).toHaveLength(1);
  });

  it("works against the null backend with no arguments at all", () => {
    const port = createAudioPort({ backend: createNullBackend() });
    expect(() => {
      port.setEngine(0.2, 1);
      port.play("splash");
      port.unlock();
      port.setMuted(true);
      port.dispose();
    }).not.toThrow();
  });
});
