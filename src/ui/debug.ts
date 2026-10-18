// Debug overlay, created only when the URL asks for it with ?debug=1. It is a plain
// read-out of the model the app already hands the HUD, plus two optional extras.
// Nothing here touches the sim, and nothing is created at all when the flag is absent.
import type { HudModel } from "./types.js";
import { createButton, el, finite, formatCount, formatScale, text } from "./dom.js";

export const DEBUG_OVERLAY_ATTRIBUTE = "data-cc-overlay";

export interface DebugHandle {
  readonly root: HTMLElement;
  update(model: HudModel): void;
}

interface Row {
  readonly node: HTMLElement;
  readonly value: HTMLElement;
}

function createRow(doc: Document, parent: HTMLElement, label: string, attribute?: string): Row {
  const node = el(doc, "cc-debug-row");
  const name = el(doc, "cc-debug-key");
  text(name, label);
  const value = el(doc, "cc-debug-value");
  if (attribute !== undefined) value.setAttribute(attribute, "");
  text(value, "n/a");
  node.append(name, value);
  parent.append(node);
  return { node, value };
}

interface Cached {
  tick: number;
  seed: number;
  presetId: string;
  canvasScale: number;
  counts: string;
  scales: string;
  status: string;
}

/** Stable, sorted "kind 3" pairs, so the read-out never jitters between frames. */
export function formatCounts(counts: Readonly<Record<string, number>>): string {
  const keys = Object.keys(counts).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const count = counts[key];
    if (count === undefined) continue;
    parts.push(`${key} ${formatCount(count)}`);
  }
  return parts.length === 0 ? "none" : parts.join("  ");
}

/** Same shape as formatCounts, for the per-entity time scales. */
export function formatEntityScales(scales: Readonly<Record<string, number>>): string {
  const keys = Object.keys(scales).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const scale = scales[key];
    if (scale === undefined) continue;
    parts.push(`${key} ${formatScale(scale)}`);
  }
  return parts.length === 0 ? "none" : parts.join("  ");
}

export function createDebugOverlay(doc: Document): DebugHandle {
  const root = el(doc, "cc-debug");
  root.setAttribute(DEBUG_OVERLAY_ATTRIBUTE, "debug");
  root.setAttribute("role", "status");
  root.setAttribute("aria-label", "Debug read-out");
  root.setAttribute("aria-live", "off");

  const heading = el(doc, "cc-debug-heading");
  text(heading, "debug");
  root.append(heading);

  const tick = createRow(doc, root, "tick", "data-cc-debug-tick");
  const seed = createRow(doc, root, "seed", "data-cc-debug-seed");
  const preset = createRow(doc, root, "preset", "data-cc-debug-preset");
  const canvas = createRow(doc, root, "canvas scale", "data-cc-debug-scale");
  const status = createRow(doc, root, "status", "data-cc-debug-status");
  const counts = createRow(doc, root, "entities", "data-cc-debug-counts");
  const scales = createRow(doc, root, "time scales", "data-cc-debug-timescales");

  let last: Cached = {
    tick: Number.NaN,
    seed: Number.NaN,
    presetId: "",
    canvasScale: Number.NaN,
    counts: "",
    scales: "",
    status: "",
  };

  return {
    root,
    update(model: HudModel): void {
      const tickValue = finite(model.tick, 0);
      if (tickValue !== last.tick) {
        text(tick.value, formatCount(tickValue));
        last.tick = tickValue;
      }

      const seedValue = finite(model.seed, 0);
      if (seedValue !== last.seed) {
        text(seed.value, formatCount(seedValue));
        last.seed = seedValue;
      }

      if (model.presetId !== last.presetId) {
        text(preset.value, model.presetId === "" ? "n/a" : model.presetId);
        last.presetId = model.presetId;
      }

      const canvasScale = finite(model.canvasScale ?? Number.NaN, Number.NaN);
      if (canvasScale !== last.canvasScale) {
        text(canvas.value, Number.isNaN(canvasScale) ? "n/a" : formatScale(canvasScale));
        last.canvasScale = canvasScale;
      }

      const statusValue = `${model.status}${model.paused ? " / paused" : ""}${model.inTimeField ? " / in field" : ""}`;
      if (statusValue !== last.status) {
        text(status.value, statusValue);
        last.status = statusValue;
      }

      const countsValue = formatCounts(model.counts);
      if (countsValue !== last.counts) {
        text(counts.value, countsValue);
        last.counts = countsValue;
      }

      const scalesValue = formatEntityScales(model.entityTimeScales ?? {});
      if (scalesValue !== last.scales) {
        text(scales.value, scalesValue);
        last.scales = scalesValue;
      }
    },
  };
}