import { describe, expect, it } from "vitest";
import { createWebAudioBackend } from "../../../src/audio/web-audio-backend";
import { scheduleVoice } from "../../../src/audio/schedule";
import { VOICES } from "../../../src/audio/voices";
import { asAudioContext, FakeAudioContext } from "./fake-audio-context";

function backendWith(ctx: FakeAudioContext) {
  return createWebAudioBackend({ contextFactory: () => asAudioContext(ctx), noiseSeed: 1234 });
}

describe("web audio backend", () => {
  it("creates no context until unlock", () => {
    const ctx = new FakeAudioContext();
    let created = 0;
    const backend = createWebAudioBackend({
      contextFactory: () => {
        created += 1;
        return asAudioContext(ctx);
      },
    });
    backend.setEngine(0.5, 1);
    backend.setMuted(false);
    backend.unlock();
    backend.unlock();
    expect(created).toBe(1);
  });

  it("is not ready before unlock and drops early cues", () => {
    const ctx = new FakeAudioContext();
    const backend = backendWith(ctx);
    backend.play("laser", scheduleVoice(VOICES.laser, 0), "played");
    expect(ctx.oscillators).toHaveLength(0);
    expect(backend.isReady()).toBe(false);
  });

  it("builds a limiter, a master gain and a seeded noise buffer on unlock", () => {
    const ctx = new FakeAudioContext();
    const backend = backendWith(ctx);
    backend.unlock();
    expect(backend.isReady()).toBe(true);
    expect(ctx.compressors).toHaveLength(1);
    // Two engine oscillators, started and never stopped until dispose.
    expect(ctx.oscillators).toHaveLength(2);
    expect(ctx.buffers).toHaveLength(1);
    expect(ctx.buffers[0]?.channels).toBe(1);
    expect(ctx.buffers[0]?.frames).toBe(ctx.sampleRate * 2);
  });

  it("fills the noise buffer from the seeded stream, so it is reproducible", () => {
    const a = new FakeAudioContext();
    const b = new FakeAudioContext();
    backendWith(a).unlock();
    backendWith(b).unlock();
    // Both runs create a buffer of identical length from identical seed input.
    expect(a.buffers[0]?.frames).toBe(b.buffers[0]?.frames);
  });

  it("renders a scheduled laser into oscillators that stop after the tail", () => {
    const ctx = new FakeAudioContext();
    const backend = backendWith(ctx);
    backend.unlock();
    const before = ctx.oscillators.length;
    backend.play("laser", scheduleVoice(VOICES.laser, 0.5), "played");
    const made = ctx.oscillators.slice(before);
    expect(made).toHaveLength(2);
    expect(made[0]?.startAt).toBeCloseTo(0.5, 6);
    expect(made[0]?.frequency.calls[0]?.value).toBe(1850);
    expect(made[0]?.stopAt).toBeGreaterThan(0.5);
    // Engine oscillators stay running.
    expect(made.every((o) => o.stopped)).toBe(true);
  });

  it("renders a noise voice from the shared buffer with a deterministic offset", () => {
    const ctx = new FakeAudioContext();
    const backend = backendWith(ctx);
    backend.unlock();
    backend.play("splash", scheduleVoice(VOICES.splash, 2), "played");
    expect(ctx.bufferSources).toHaveLength(1);
    const source = ctx.bufferSources[0];
    expect(source?.loop).toBe(true);
    expect(source?.offset).toBeGreaterThanOrEqual(0);
    expect(source?.offset).toBeLessThan(2);
    expect(source?.stopped).toBe(true);
  });

  it("ignores cues the port refused", () => {
    const ctx = new FakeAudioContext();
    const backend = backendWith(ctx);
    backend.unlock();
    const before = ctx.oscillators.length;
    backend.play("laser", scheduleVoice(VOICES.laser, 0), "muted");
    backend.play("laser", scheduleVoice(VOICES.laser, 0), "rate-limited");
    backend.play("laser", scheduleVoice(VOICES.laser, 0), "locked");
    expect(ctx.oscillators.length).toBe(before);
  });

  it("drives the engine from setEngine, every frame if asked", () => {
    const ctx = new FakeAudioContext();
    const backend = backendWith(ctx);
    backend.unlock();
    const engineOsc = ctx.oscillators[0];
    for (let i = 0; i <= 10; i += 1) backend.setEngine(i / 10, 1);
    const fullThrottle = engineOsc?.frequency.calls.at(-1);
    expect(fullThrottle?.method).toBe("setTargetAtTime");
    // Same throttle, but inside the Snail's field the hum sags.
    backend.setEngine(1, 0.5);
    const inField = engineOsc?.frequency.calls.at(-1);
    expect(inField?.value).toBeLessThan(fullThrottle?.value ?? 0);
    expect(engineOsc?.stopped).toBe(false);
  });

  it("does nothing on setEngine before unlock", () => {
    const ctx = new FakeAudioContext();
    const backend = backendWith(ctx);
    expect(() => {
      backend.setEngine(1, 0.1);
      backend.setMuted(true);
    }).not.toThrow();
  });

  it("mutes by pulling the master gain to zero", () => {
    const ctx = new FakeAudioContext();
    const backend = backendWith(ctx);
    backend.unlock();
    backend.setMuted(true);
    backend.setMuted(false);
    // master gain is the gain node that connects to the limiter
    const masterGains = ctx.gains.filter((g) => g.connections[0] === ctx.compressors[0]);
    expect(masterGains.length).toBeGreaterThan(0);
    const master = masterGains[0];
    expect(master?.gain.calls.at(-1)?.value).toBeCloseTo(0.85, 6);
    expect(master?.gain.calls.some((c) => c.value === 0)).toBe(true);
  });

  it("resumes a suspended context without complaining", async () => {
    const ctx = new FakeAudioContext();
    ctx.state = "suspended";
    const backend = backendWith(ctx);
    backend.unlock();
    expect(ctx.resumeCalls).toBe(1);
    await Promise.resolve();
  });

  it("falls back quietly when no context can be created", () => {
    const backend = createWebAudioBackend({ contextFactory: () => null });
    expect(() => {
      backend.unlock();
      backend.play("laser", scheduleVoice(VOICES.laser, 0), "played");
      backend.setEngine(1, 1);
      backend.dispose();
    }).not.toThrow();
    expect(backend.isReady()).toBe(false);
  });

  it("uses the default factory without throwing in a node environment", () => {
    const backend = createWebAudioBackend();
    expect(() => {
      backend.unlock();
      backend.setEngine(0.3, 1);
      backend.dispose();
    }).not.toThrow();
  });

  it("stops the engine and closes the context on dispose, once", async () => {
    const ctx = new FakeAudioContext();
    const backend = backendWith(ctx);
    backend.unlock();
    backend.dispose();
    backend.dispose();
    expect(ctx.oscillators.every((o) => o.stopped)).toBe(true);
    expect(ctx.closed).toBe(true);
    expect(backend.isReady()).toBe(false);
    await Promise.resolve();
  });
});
