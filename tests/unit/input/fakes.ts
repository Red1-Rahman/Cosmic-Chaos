// Minimal DOM and gamepad fakes. Node has no DOM, so the input tests build just
// enough of one to drive the real modules. Not a browser emulator.

export interface FakeEvent {
  type: string;
  preventDefault(): void;
  readonly defaultPrevented: boolean;
}

interface FakeEventInit {
  pointerId?: number;
  code?: string;
}

export class FakeDomEvent implements FakeEvent {
  readonly type: string;
  defaultPrevented = false;
  readonly pointerId: number | undefined;
  readonly code: string | undefined;

  constructor(type: string, init: FakeEventInit = {}) {
    this.type = type;
    this.pointerId = init.pointerId;
    this.code = init.code;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

type Listener = (event: FakeDomEvent) => void;

export class FakeElement {
  readonly tagName: string;
  className = "";
  type = "";
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  removed = false;
  capturedPointers: number[] = [];
  private readonly classes = new Set<string>();
  private readonly listeners = new Map<string, Listener[]>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  get classList(): {
    add: (name: string) => void;
    remove: (name: string) => void;
    toggle: (name: string, force?: boolean) => boolean;
    contains: (name: string) => boolean;
  } {
    return {
      add: (name: string): void => {
        this.classes.add(name);
      },
      remove: (name: string): void => {
        this.classes.delete(name);
      },
      toggle: (name: string, force?: boolean): boolean => {
        const want = force ?? !this.classes.has(name);
        if (want) {
          this.classes.add(name);
        } else {
          this.classes.delete(name);
        }
        return want;
      },
      contains: (name: string): boolean => this.classes.has(name),
    };
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  append(child: FakeElement): void {
    child.parent = this;
    this.children.push(child);
  }

  remove(): void {
    this.removed = true;
    if (this.parent !== null) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
  }

  setPointerCapture(pointerId: number): void {
    this.capturedPointers.push(pointerId);
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type);
    if (list === undefined) return;
    this.listeners.set(
      type,
      list.filter((entry) => entry !== listener),
    );
  }

  dispatch(event: FakeDomEvent): FakeDomEvent {
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener(event);
    return event;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }
}

export class FakeDocument {
  readonly body = new FakeElement("body");
  readonly visibility = "visible";
  private readonly listeners = new Map<string, Listener[]>();

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type);
    if (list === undefined) return;
    this.listeners.set(
      type,
      list.filter((entry) => entry !== listener),
    );
  }

  dispatch(event: FakeDomEvent): FakeDomEvent {
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener(event);
    return event;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }
}

/** A window stand in: event target plus the bits the input layer reads. */
export class FakeWindow {
  readonly document = new FakeDocument();
  innerWidth = 1280;
  innerHeight = 720;
  coarsePointer = false;
  readonly navigator: { getGamepads?: () => Array<FakeGamepad | null> } = {};
  private readonly listeners = new Map<string, Listener[]>();

  matchMedia(query: string): { matches: boolean; media: string } {
    return { matches: query === "(pointer: coarse)" && this.coarsePointer, media: query };
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type);
    if (list === undefined) return;
    this.listeners.set(
      type,
      list.filter((entry) => entry !== listener),
    );
  }

  dispatch(event: FakeDomEvent): FakeDomEvent {
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener(event);
    return event;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }
}

export interface FakeButton {
  pressed: boolean;
}

export class FakeGamepad {
  connected = true;
  mapping: string | undefined = "standard";
  readonly axes: number[] = [0, 0, 0, 0];
  readonly buttons: FakeButton[] = Array.from({ length: 17 }, () => ({ pressed: false }));

  setAxes(x: number, y: number): void {
    this.axes[0] = x;
    this.axes[1] = y;
  }

  press(index: number): void {
    const button = this.buttons[index];
    if (button !== undefined) button.pressed = true;
  }

  release(index: number): void {
    const button = this.buttons[index];
    if (button !== undefined) button.pressed = false;
  }
}

export interface GamepadHolder {
  navigator: { getGamepads?: () => Array<FakeGamepad | null> };
}

export function setGamepad(host: GamepadHolder, gamepad: FakeGamepad | null): void {
  host.navigator.getGamepads = (): Array<FakeGamepad | null> => [gamepad];
}

/** Window structural typing is only needed at the createInput boundary. */
export function asWindow(fake: FakeWindow): Window {
  return fake as unknown as Window;
}