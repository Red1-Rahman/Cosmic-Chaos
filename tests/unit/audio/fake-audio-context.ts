// A hand written AudioContext stand-in for the unit tests. It records what the
// backend asks for so tests can prove that a cue builds real nodes, and it never
// touches Web Audio, so the suite runs in plain node.

export interface FakeParamCall {
  readonly method: "setValueAtTime" | "setTargetAtTime";
  readonly value: number;
  readonly at: number;
  readonly tau?: number;
}

export class FakeParam {
  readonly calls: FakeParamCall[] = [];
  value = 0;

  setValueAtTime(value: number, at: number): void {
    this.calls.push({ method: "setValueAtTime", value, at });
    this.value = value;
  }

  setTargetAtTime(value: number, at: number, tau: number): void {
    this.calls.push({ method: "setTargetAtTime", value, at, tau });
    this.value = value;
  }

  /** Last value written, or 0 if nothing was written. */
  last(): number {
    return this.value;
  }
}

export class FakeNode {
  readonly connections: FakeNode[] = [];
  connect(target: FakeNode): FakeNode {
    this.connections.push(target);
    return target;
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

export class FakeOscillator extends FakeNode {
  type = "sine";
  started = false;
  stopped = false;
  startAt: number | null = null;
  stopAt: number | null = null;
  readonly frequency = new FakeParam();
  readonly detune = new FakeParam();

  constructor(readonly context: FakeAudioContext) {
    super();
  }

  start(at: number): void {
    if (this.started) throw new Error("oscillator started twice");
    this.started = true;
    this.startAt = at;
    this.context.oscillators.push(this);
  }

  stop(at?: number): void {
    if (this.stopped) throw new Error("oscillator stopped twice");
    this.stopped = true;
    this.stopAt = at ?? null;
  }
}

export class FakeBufferSource extends FakeNode {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  started = false;
  stopped = false;
  offset = 0;
  readonly playbackRate = new FakeParam();

  constructor(readonly context: FakeAudioContext) {
    super();
  }

  start(_at: number, offset?: number): void {
    if (this.started) throw new Error("buffer source started twice");
    this.started = true;
    this.offset = offset ?? 0;
    this.context.bufferSources.push(this);
  }

  stop(_at?: number): void {
    this.stopped = true;
  }
}

export class FakeFilter extends FakeNode {
  type = "lowpass";
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
  readonly detune = new FakeParam();
}

export class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
}

export class FakeAudioBuffer {
  readonly data = new Float32Array(1024);
  readonly duration: number;

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.duration = length / sampleRate;
  }

  getChannelData(): Float32Array {
    return this.data;
  }
}

export class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = "running";
  sampleRate = 48000;
  closed = false;
  resumeCalls = 0;
  readonly destination = new FakeNode();
  readonly oscillators: FakeOscillator[] = [];
  readonly bufferSources: FakeBufferSource[] = [];
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];
  readonly compressors: FakeCompressor[] = [];
  readonly buffers: { channels: number; frames: number; sampleRate: number }[] = [];

  createGain(): FakeGain {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }

  createOscillator(): FakeOscillator {
    return new FakeOscillator(this);
  }

  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource(this);
  }

  createBiquadFilter(): FakeFilter {
    const node = new FakeFilter();
    this.filters.push(node);
    return node;
  }

  createDynamicsCompressor(): FakeCompressor {
    const node = new FakeCompressor();
    this.compressors.push(node);
    return node;
  }

  createBuffer(channels: number, frames: number, sampleRate: number): FakeAudioBuffer {
    this.buffers.push({ channels, frames, sampleRate });
    return new FakeAudioBuffer(channels, frames, sampleRate);
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    this.state = "closed";
    return Promise.resolve();
  }
}

/** Cast helper: the backend wants the DOM type, tests bring this shape. */
export function asAudioContext(ctx: FakeAudioContext): AudioContext {
  return ctx as unknown as AudioContext;
}
