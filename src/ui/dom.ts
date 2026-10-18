// Tiny DOM and formatting helpers shared by the ui modules.
// Everything here is deliberately dumb: create a node, set a CSS custom property,
// clamp a number, format a number for a label. No logic, no state.

/** Create a div with a class name. Text is set separately so it stays assertable. */
export function el(doc: Document, className: string, tag = "div"): HTMLElement {
  const node = doc.createElement(tag);
  node.className = className;
  return node;
}

/** Append text to a node, replacing whatever was there. */
export function text(node: HTMLElement, value: string): void {
  node.textContent = value;
}

/** Set a CSS custom property on a node. Real CSSStyleDeclaration and fakes both take this. */
export function cssVar(node: HTMLElement, name: string, value: string): void {
  node.style.setProperty(name, value);
}

/** Finite fallback, so a malformed model value can never poison a style. */
export function finite(value: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  return value > max ? max : value;
}

/** Fraction of 0..1, safe. */
export function clamp01(value: number): number {
  return clamp(finite(value, 0), 0, 1);
}

/** "72%" for the health meter. */
export function formatPercent(fraction: number): string {
  return `${String(Math.round(clamp01(fraction) * 100))}%`;
}

/** "0.35x" for time scales. Two decimals keeps 0.333 visible as a change. */
export function formatScale(value: number): string {
  return `${finite(value, 1).toFixed(2)}x`;
}

/** "1337" style integer for seed, tick and canvas scale. */
export function formatCount(value: number): string {
  return String(Math.round(finite(value, 0)));
}

/** CSS pixel length with trailing zeros trimmed, same shape as src/render/viewport.ts. */
export function px(value: number): string {
  return `${String(Number(value.toFixed(4)))}px`;
}

/**
 * Only call focus when the element really has it. The hand-written fake DOM does not,
 * and a missing focus method must never break mounting.
 */
export function focusQuietly(node: HTMLElement): void {
  if (typeof node.focus === "function") node.focus();
}

/** Marks every actionable control, so e2e tests and the app can find them by name. */
export const ACTION_ATTRIBUTE = "data-cc-action";

export type ActionId = "start" | "pause" | "mute" | "resume" | "restart";

export interface ButtonOptions {
  action: ActionId;
  label: string;
  className: string;
  onClick: () => void;
}

/** A real <button>, so Enter and Space work without any key handling of our own. */
export function createButton(doc: Document, options: ButtonOptions): HTMLButtonElement {
  const button = el(doc, options.className, "button") as HTMLButtonElement;
  button.type = "button";
  button.setAttribute(ACTION_ATTRIBUTE, options.action);
  button.setAttribute("aria-label", options.label);
  button.textContent = options.label;
  button.addEventListener("click", (): void => {
    options.onClick();
  });
  return button;
}
