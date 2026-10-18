// Debug overlay, created only when the URL asks for it with ?debug=1. It is a plain
// read-out of the model the app already hands the HUD, plus two optional extras.
// Nothing here touches the sim, and nothing is created at all when the flag is absent.
//
// It is anchored to the TOP centre of the letterboxed frame, not the bottom: the arena's
// play band is the lower half (manifest arena.playBand, y 486 to 648 of 768), so a panel
// at the bottom sits on the capybara. Everything above the nebula horizon (y 456) is
// empty sky in every viewport preset.
import type { HudModel } from "./types.js";
import { el, finite, formatCount, formatScale, text } from "./dom.js";

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

/** Entity ids are the kind plus an index: "orca-1", "human-3", "player". */
const INDEXED_ID = /-\d+$/;

/** The kind part of an entity id. A bare id like "player" is its own kind. */
export function entityKind(id: string): string {
  return id.replace(INDEXED_ID, "");
}

/**
 * One line per entity KIND while every entity of that kind shares one time scale, which is
 * the normal case: six humans inside one snail field read as a single "human 0.35x".
 * When a kind does have more than one distinct scale, the whole kind falls back to one line
 * per entity, so the ids of the affected entities stay visible. Newlines, because the
 * value node renders them with white-space: pre-line.
 */
export function formatEntityScales(scales: Readonly<Record<string, number>>): string {
  const ids = Object.keys(scales).sort();
  if (ids.length === 0) return "none";

  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const kind = entityKind(id);
    const members = groups.get(kind);
    if (members === undefined) groups.set(kind, [id]);
    else members.push(id);
  }

  const lines: string[] = [];
  for (const kind of [...groups.keys()].sort()) {
    const members = groups.get(kind) ?? [];
    // Compared as text, so 0.35 and 0.3500004 are one scale, not two.
    const shown = members.map((id): string => formatScale(scales[id] ?? 1));
    if (new Set(shown).size === 1) {
      lines.push(`${kind} ${shown[0]}`);
      continue;
    }
    for (const [index, id] of members.entries()) lines.push(`${id} ${shown[index] ?? ""}`);
  }
  return lines.join("\n");
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
  // One entry per line, so this value is the only row that needs pre-line.
  scales.value.classList.add("cc-debug-list");

  const last: Cached = {
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
