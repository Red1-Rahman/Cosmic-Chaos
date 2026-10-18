// Builds real Web Audio nodes. Everything audible in the game comes from here:
// oscillators, one shared noise buffer filled from the seeded cosmetic RNG, and
// the continuous engine hum. There are no audio files and no elements.
//
// The AudioContext is created inside unlock(), never at module load: browsers
// log a warning for a context built before a user gesture, and a console warning
// fails this project. A missing constructor, the webkit-prefixed name and a
// suspended context are all handled without printing anything.

import type { AudioBackend, PlayOutcome } from "./backend";
import type { AudioCue } from "./port";
import { scheduleEnd, type VoiceSchedule } from "./schedule";
import { createRng } from "../util/rng";
import {
  engineFilterHz,
  engineFrequency,
  engineGain,
  engineSpec,
  type EngineSpec,
} from "./voices/engine";

/** Seconds of noise in the shared buffer. Loops cover every burst we have. */
const NOISE_SECONDS = 2;
/** Default seed for the cosmetic noise stream. */
const DEFAULT_NOISE_SEED = 0x0c05_1de5;
/** Ramp time constant for the master gain when muting. */
const MUTE_TAU = 0.02;
/** Ramp time constant for the engine. Keeps per-frame calls smooth. */
const ENGINE_TAU = 0.06;
/** Small tail so scheduled ends are never cut off mid decay. */
const TAIL_SECONDS = 0.02;

export interface WebAudioBackendOptions {
  /** Overridable so tests can hand in a fake context. */
  readonly contextFactory?: () => AudioContext | null;
  readonly noiseSeed?: number;
  readonly engine?: EngineSpec;
  /** Master level before mute. */
  readonly masterGain?: number;
}

function defaultContextFactory(): AudioContext | null {
  try {
    const scope = globalThis as unknown as {
      AudioContext?: new () => AudioContext;
      webkitAudioContext?: new () => AudioContext;
    };
    const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

export function createWebAudioBackend(options?: WebAudioBackendOptions): AudioBackend {
  const settings = options ?? {};
  const contextFactory = settings.contextFactory ?? defaultContextFactory;
  const engine = settings.engine ?? engineSpec;
  const masterLevel = settings.masterGain ?? 0.85;

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let engineGainNode: GainNode | null = null;
  let engineFilter: BiquadFilterNode | null = null;
  let engineOscA: OscillatorNode | null = null;
  let engineOscB: OscillatorNode | null = null;
  let unavailable = false;
  let muted = false;
  let disposed = false;

  const now = (): number => (ctx ? ctx.currentTime : 0);

  function makeNoiseBuffer(context: AudioContext): AudioBuffer {
    // Cosmetic stream: reproducible noise, independent of the gameplay seed.
    const rng = createRng(settings.noiseSeed ?? DEFAULT_NOISE_SEED).fork("audio:noise");
    const frames = Math.floor(context.sampleRate * NOISE_SECONDS);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) channel[i] = rng.next() * 2 - 1;
    return buffer;
  }

  function applyEvents(
    param: AudioParam,
    events: readonly { at: number; param: string; value: number }[],
    kind: "gain" | "frequency" | "filterFrequency" | "detune",
    voiceGain: number,
  ): void {
    for (const event of events) {
      if (event.param !== kind) continue;
      const value = kind === "gain" ? event.value * voiceGain : event.value;
      param.setValueAtTime(value, Math.max(event.at, ctx ? ctx.currentTime : 0));
    }
  }

  function buildGraph(context: AudioContext): void {
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-10, context.currentTime);
    limiter.knee.setValueAtTime(6, context.currentTime);
    limiter.ratio.setValueAtTime(12, context.currentTime);
    limiter.attack.setValueAtTime(0.003, context.currentTime);
    limiter.release.setValueAtTime(0.18, context.currentTime);
    limiter.connect(context.destination);

    const masterNode = context.createGain();
    masterNode.gain.setValueAtTime(muted ? 0 : masterLevel, context.currentTime);
    masterNode.connect(limiter);
    master = masterNode;
    noiseBuffer = makeNoiseBuffer(context);
    buildEngine(context, masterNode);
  }

  function buildEngine(context: AudioContext, destination: AudioNode): void {
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.setValueAtTime(engine.filter.q, context.currentTime);
    filter.frequency.setValueAtTime(engineFilterHz(engine, 0), context.currentTime);

    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(0, context.currentTime);
    filter.connect(gainNode);
    gainNode.connect(destination);

    const oscA = context.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.setValueAtTime(engine.baseHz, context.currentTime);
    const mixA = context.createGain();
    mixA.gain.setValueAtTime(0.5, context.currentTime);
    oscA.connect(mixA);
    mixA.connect(filter);

    const oscB = context.createOscillator();
    oscB.type = "sine";
    oscB.frequency.setValueAtTime(engine.baseHz * engine.subRatio, context.currentTime);
    oscB.detune.setValueAtTime(engine.detuneCents, context.currentTime);
    const mixB = context.createGain();
    mixB.gain.setValueAtTime(0.5, context.currentTime);
    oscB.connect(mixB);
    mixB.connect(filter);

    oscA.start(context.currentTime);
    oscB.start(context.currentTime);
    engineFilter = filter;
    engineGainNode = gainNode;
    engineOscA = oscA;
    engineOscB = oscB;
  }

  function renderTone(
    context: AudioContext,
    destination: AudioNode,
    schedule: VoiceSchedule,
    part: VoiceSchedule["parts"][number],
    voiceGain: number,
  ): void {
    if (!part.wave) return;
    const osc = context.createOscillator();
    osc.type = part.wave as OscillatorType;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, schedule.startTime);
    applyEvents(osc.frequency, part.events, "frequency", voiceGain);
    applyEvents(osc.detune, part.events, "detune", voiceGain);
    applyEvents(gain.gain, part.events, "gain", voiceGain);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(schedule.startTime);
    osc.stop(scheduleEnd(schedule) + TAIL_SECONDS);
  }

  function renderNoise(
    context: AudioContext,
    destination: AudioNode,
    schedule: VoiceSchedule,
    part: VoiceSchedule["parts"][number],
    voiceGain: number,
  ): void {
    const buffer = noiseBuffer;
    if (!buffer) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.setValueAtTime(part.playbackRate, schedule.startTime);
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.setValueAtTime(1, schedule.startTime);
    applyEvents(filter.frequency, part.events, "filterFrequency", voiceGain);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, schedule.startTime);
    applyEvents(gain.gain, part.events, "gain", voiceGain);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    // Deterministic offset into the buffer: no clock, no randomness.
    const offset = Math.abs(Math.floor(schedule.startTime * 7)) % buffer.duration;
    source.start(schedule.startTime, offset);
    source.stop(scheduleEnd(schedule) + TAIL_SECONDS);
  }

  function render(schedule: VoiceSchedule): void {
    const context = ctx;
    const destination = master;
    if (!context || !destination) return;
    const voiceGain = context.createGain();
    voiceGain.gain.setValueAtTime(schedule.gain, schedule.startTime);
    voiceGain.connect(destination);
    const end = scheduleEnd(schedule) + TAIL_SECONDS;
    for (const part of schedule.parts) {
      if (part.kind === "tone") renderTone(context, voiceGain, schedule, part, schedule.gain);
      else renderNoise(context, voiceGain, schedule, part, schedule.gain);
    }
    // The voice bus only exists for this burst. Ending it frees the nodes.
    voiceGain.gain.setValueAtTime(0, end);
  }

  return {
    name: "web-audio",

    now,

    unlock(): void {
      if (disposed || unavailable || ctx) return;
      const context = contextFactory();
      if (!context) {
        // Nothing to complain about: the game simply runs silent.
        unavailable = true;
        return;
      }
      ctx = context;
      try {
        buildGraph(context);
        if (context.state === "suspended") void context.resume().catch(() => undefined);
      } catch {
        unavailable = true;
        ctx = null;
      }
    },

    isReady(): boolean {
      return ctx !== null && master !== null && !disposed && !unavailable;
    },

    play(_cue: AudioCue, schedule: VoiceSchedule, outcome: PlayOutcome): void {
      if (outcome !== "played") return;
      if (!ctx || disposed) return;
      render(schedule);
    },

    setEngine(speed01: number, timeScale: number): void {
      const context = ctx;
      if (!context || !engineGainNode || !engineFilter || !engineOscA || !engineOscB || disposed)
        return;
      const time = context.currentTime;
      const hz = engineFrequency(engine, speed01, timeScale);
      engineOscA.frequency.setTargetAtTime(hz, time, ENGINE_TAU);
      engineOscB.frequency.setTargetAtTime(hz * engine.subRatio, time, ENGINE_TAU);
      engineFilter.frequency.setTargetAtTime(engineFilterHz(engine, speed01), time, ENGINE_TAU);
      engineGainNode.gain.setTargetAtTime(engineGain(engine, speed01, timeScale), time, ENGINE_TAU);
    },

    setMuted(next: boolean): void {
      muted = next;
      if (!master || !ctx) return;
      master.gain.setTargetAtTime(muted ? 0 : masterLevel, ctx.currentTime, MUTE_TAU);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      const context = ctx;
      const started = [engineOscA, engineOscB].filter(
        (node): node is OscillatorNode => node !== null,
      );
      for (const node of started) {
        try {
          node.stop();
        } catch {
          // Already stopped by the browser, or never started. Nothing to do.
        }
      }
      engineOscA = null;
      engineOscB = null;
      engineGainNode = null;
      engineFilter = null;
      master = null;
      noiseBuffer = null;
      ctx = null;
      if (context) void context.close().catch(() => undefined);
    },
  };
}
