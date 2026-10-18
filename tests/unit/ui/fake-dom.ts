// A hand-written DOM, just big enough for the ui layer. Node has no DOM and no test
// dependency may be added, so this fakes createElement, the tree, classList, dataset,
// textContent, style custom properties and click dispatch. Not a browser emulator.

export class FakeStyle {
  readonly props = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.props.set(name, value);
  }

  removeProperty(name: string): void {
    this.props.delete(name);
  }

  getPropertyValue(name: string): string {
    return this.props.get(name) ?? "";
  }
}

export class FakeEvent {
  readonly type: string;
  defaultPrevented = false;

  constructor(type: string) {
    this.type = type;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

type Listener = (event: FakeEvent) => void;

export class FakeElement {
  readonly tagName: string;
  get className(): string {
    return [...this.classes].join(" ");
  }

  /** Assigning className replaces the class set, exactly like the real DOM. */
  set className(value: string) {
    this.classes.clear();
    for (const name of value.split(/\s+/)) {
      if (name !== "") this.classes.add(name);
    }
  }
  type = "";
  readonly style = new FakeStyle();
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  removed = false;
  focused = 0;
  blurred = 0;
  readonly ownerDocument: FakeDocument;

  private readonly classes = new Set<string>();
  private readonly listeners = new Map<string, Listener[]>();
  private content = "";

  constructor(tagName: string, ownerDocument: FakeDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
  }

  get textContent(): string {
    return this.content;
  }

  set textContent(value: string) {
    this.content = value;
  }

  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  get parentElement(): FakeElement | null {
    return this.parent;
  }

  readonly classList = {
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

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  remove(): void {
    this.removed = true;
    if (this.parent !== null) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    }
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

  listenerCount(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }

  /** The browser has HTMLElement.focus; this fake records the call instead. */
  focus(): void {
    this.focused += 1;
    this.ownerDocument.activeElement = this;
  }

  blur(): void {
    this.blurred += 1;
    this.ownerDocument.activeElement = null;
  }

  click(): void {
    this.dispatch(new FakeEvent("click"));
  }

  dispatch(event: FakeEvent): FakeEvent {
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener(event);
    return event;
  }

  /** Depth-first walk of this element and its descendants. */
  *walk(): Generator<FakeElement> {
    yield this;
    for (const child of this.children) yield* child.walk();
  }

  /** All descendants with the given attribute, root included. */
  findAllByAttribute(name: string): FakeElement[] {
    return [...this.walk()].filter((node) => node.attributes.has(name));
  }

  /** The single descendant with the attribute value, or null. */
  findByAttribute(name: string, value: string): FakeElement | null {
    return (
      [...this.walk()].find((node) => node.getAttribute(name) === value) ?? null
    );
  }

  /** The first descendant carrying the attribute, or null. */
  find(name: string): FakeElement | null {
    return [...this.walk()].find((node) => node.attributes.has(name)) ?? null;
  }

  findByClass(name: string): FakeElement | null {
    return [...this.walk()].find((node) => node.classList.contains(name)) ?? null;
  }

  /** Every descendant of the given class. */
  findAllByClass(name: string): FakeElement[] {
    return [...this.walk()].filter((node) => node.classList.contains(name));
  }

  /** All text in the tree, joined with newlines. */
  get textDump(): string {
    return [...this.walk()]
      .map((node) => node.textContent)
      .filter((value) => value !== "")
      .join("\n");
  }
}

export class FakeDocument {
  activeElement: FakeElement | null = null;
  readonly body = new FakeElement("body", this);

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

/** Structural typing only: the ui modules take a Document and an HTMLElement. */
export function asDocument(doc: FakeDocument): Document {
  return doc as unknown as Document;
}

export function asHost(host: FakeElement): HTMLElement {
  return host as unknown as HTMLElement;
}