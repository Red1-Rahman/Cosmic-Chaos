// A recording CanvasRenderingContext2D stub for Node. No native canvas module, no dependencies.
// The renderer, the viewport handler and the qa-ci brief all assert against the same call log,
// so anything drawn must go through one of the methods below.
//
// Usage:
//   const fake = createFakeCanvas({ width: 1408, height: 792 });
//   applyLayout(fake.canvas, layout);
//   expect(fake.countOf("drawImage")).toBe(1);
//   expect(fake.find("fillRect")?.args).toEqual([0, 0, 10, 10]);

export interface RecordedCall {
  readonly name: string;
  readonly args: readonly unknown[];
}

export type CallLog = RecordedCall[];

export interface FakeGradient {
  readonly kind: "linear" | "radial";
  readonly args: readonly unknown[];
  readonly stops: { offset: number; color: string }[];
  addColorStop(offset: number, color: string): void;
}

export interface FakeCanvasOptions {
  readonly width?: number;
  readonly height?: number;
}

export interface FakeCanvas {
  /** Cast to HTMLCanvasElement by callers that need a DOM-shaped handle. */
  readonly canvas: HTMLCanvasElement;
  /** Same object as ctx, typed as the real interface. */
  readonly ctx: CanvasRenderingContext2D;
  /** Every recorded call, in order. */
  readonly calls: CallLog;
  /** Gradient objects handed out by createLinearGradient / createRadialGradient. */
  readonly gradients: FakeGradient[];
  width: number;
  height: number;
  /** Every method name in order, handy for quick shape assertions. */
  names(): string[];
  countOf(name: string): number;
  find(name: string): RecordedCall | undefined;
  findAll(name: string): RecordedCall[];
  reset(): void;
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

const makeGradient = (kind: "linear" | "radial", args: readonly unknown[]): FakeGradient => {
  const stops: { offset: number; color: string }[] = [];
  return {
    kind,
    args,
    stops,
    addColorStop(offset: number, color: string): void {
      stops.push({ offset, color });
    },
  };
};

export function createFakeCanvas(options: FakeCanvasOptions = {}): FakeCanvas {
  const calls: CallLog = [];
  const gradients: FakeGradient[] = [];

  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push({ name, args });
    };

  const canvas = {
    width: options.width ?? 300,
    height: options.height ?? 150,
    clientWidth: options.width ?? 300,
    clientHeight: options.height ?? 150,
    style: {
      width: "",
      height: "",
      left: "",
      top: "",
      position: "",
    },
    getContext(_id: string): unknown {
      return impl;
    },
  };

  const impl = {
    canvas,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    miterLimit: 10,
    lineDashOffset: 0,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    direction: "inherit",
    filter: "none",
    shadowBlur: 0,
    shadowColor: "rgba(0, 0, 0, 0)",
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low",

    save: record("save"),
    restore: record("restore"),
    reset: record("reset"),
    resetTransform: record("resetTransform"),
    isContextLost: record("isContextLost"),

    translate: record("translate"),
    scale: record("scale"),
    rotate: record("rotate"),
    transform: record("transform"),
    setTransform: record("setTransform"),
    getTransform: record("getTransform"),

    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    rect: record("rect"),
    roundRect: record("roundRect"),
    arc: record("arc"),
    arcTo: record("arcTo"),
    ellipse: record("ellipse"),
    quadraticCurveTo: record("quadraticCurveTo"),
    bezierCurveTo: record("bezierCurveTo"),
    fill: record("fill"),
    stroke: record("stroke"),
    clip: record("clip"),
    isPointInPath: record("isPointInPath"),

    clearRect: record("clearRect"),
    fillRect: record("fillRect"),
    strokeRect: record("strokeRect"),

    fillText: record("fillText"),
    strokeText: record("strokeText"),
    measureText: (text: string): { width: number } => {
      calls.push({ name: "measureText", args: [text] });
      return { width: round(text.length * 6) };
    },

    drawImage: record("drawImage"),

    setLineDash: record("setLineDash"),
    getLineDash: (): number[] => {
      calls.push({ name: "getLineDash", args: [] });
      return [];
    },

    createLinearGradient: (...args: unknown[]): FakeGradient => {
      calls.push({ name: "createLinearGradient", args });
      const gradient = makeGradient("linear", args);
      gradients.push(gradient);
      return gradient;
    },
    createRadialGradient: (...args: unknown[]): FakeGradient => {
      calls.push({ name: "createRadialGradient", args });
      const gradient = makeGradient("radial", args);
      gradients.push(gradient);
      return gradient;
    },
    createPattern: (...args: unknown[]): unknown => {
      calls.push({ name: "createPattern", args });
      return { kind: "pattern", args };
    },
  };

  const target = impl as unknown as CanvasRenderingContext2D;

  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    ctx: target,
    calls,
    gradients,
    get width(): number {
      return canvas.width;
    },
    set width(value: number) {
      canvas.width = value;
    },
    get height(): number {
      return canvas.height;
    },
    set height(value: number) {
      canvas.height = value;
    },
    names: (): string[] => calls.map((call) => call.name),
    countOf: (name: string): number => calls.filter((call) => call.name === name).length,
    find: (name: string): RecordedCall | undefined =>
      calls.find((call) => call.name === name),
    findAll: (name: string): RecordedCall[] => calls.filter((call) => call.name === name),
    reset: (): void => {
      calls.length = 0;
      gradients.length = 0;
    },
  };
}