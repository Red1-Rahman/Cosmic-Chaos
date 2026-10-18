// Background variant selection. Pure: reads the manifest, returns a decision.
//
// The current manifest does not put a ratio or a focal point on a background
// entry. It picks the variant per viewport preset through
// `viewport.presets[].background`, so that is the primary path here.
//
// The nearest-ratio search from the role brief is kept as the fallback for a
// preset that declares no background. Because no background declares a ratio of
// its own, a candidate's declared ratio is read back from the presets that
// reference it: if `canvas-03-mobile` is the background of the 9:20 and 1:sqrt2
// presets, its declared ratio is the preset ratio closest to the window we are
// fitting. Distance is measured in log space so 1:2 and 2:1 count as equally
// far, which is what a cover fit actually cares about. When no preset
// references any candidate, the base background id wins.
//
// Focal point: no background declares one, so the result is the centered
// default { 0.5, 0.5 }. Cover scaling can read it and get sane behavior today.

import type { BackgroundEntry, Manifest, ViewportPreset } from "./manifest-types";

/** Cover fit centers on this until a background declares its own focal point. */
export const DEFAULT_FOCAL_POINT = { x: 0.5, y: 0.5 } as const;

export type BackgroundErrorCode = "unknown-background" | "unknown-preset";

export class BackgroundError extends Error {
  readonly code: BackgroundErrorCode;
  readonly backgroundId: string;
  readonly presetId: string;

  constructor(code: BackgroundErrorCode, backgroundId: string, presetId: string, message: string) {
    super(message);
    this.name = "BackgroundError";
    this.code = code;
    this.backgroundId = backgroundId;
    this.presetId = presetId;
  }
}

export function isBackgroundError(value: unknown): value is BackgroundError {
  return value instanceof BackgroundError;
}

export type BackgroundSelectionRule = "preset-declared" | "nearest-ratio" | "fallback-base";

export interface BackgroundChoice {
  readonly id: string;
  readonly file: string;
  readonly fit: BackgroundEntry["fit"];
  readonly variantOf: string | null;
  readonly orientation: string | null;
  /** Normalized [0, 1] on both axes. Always centered today. */
  readonly focalX: number;
  readonly focalY: number;
  readonly rule: BackgroundSelectionRule;
  /** Ratio the candidate was measured against, when one could be derived. */
  readonly declaredRatio: number | null;
  /** Log distance to the target ratio. Zero when the rule did not measure. */
  readonly logDistance: number;
}

function toChoice(
  entry: BackgroundEntry,
  rule: BackgroundSelectionRule,
  declaredRatio: number | null,
  logDistance: number,
): BackgroundChoice {
  return {
    id: entry.id,
    file: entry.file,
    fit: entry.fit,
    variantOf: entry.variantOf ?? null,
    orientation: entry.orientation ?? null,
    focalX: DEFAULT_FOCAL_POINT.x,
    focalY: DEFAULT_FOCAL_POINT.y,
    rule,
    declaredRatio,
    logDistance,
  };
}

/** Every background that is the base one or a variant of it, in manifest order. */
export function backgroundFamily(manifest: Manifest, backgroundId: string): BackgroundEntry[] {
  return manifest.backgrounds.filter(
    (entry) => entry.id === backgroundId || entry.variantOf === backgroundId,
  );
}

/** Ratios the viewport presets declare for a given background id. */
export function declaredRatiosFor(manifest: Manifest, backgroundId: string): number[] {
  return manifest.viewport.presets
    .filter((preset: ViewportPreset) => preset.background === backgroundId)
    .map((preset) => preset.ratio);
}

/**
 * Pick the background to draw for a viewport preset.
 *
 * Throws `BackgroundError` for an unknown `backgroundId` or `presetId`.
 */
export function pickBackground(
  manifest: Manifest,
  backgroundId: string,
  presetId: string,
): BackgroundChoice {
  const preset = manifest.viewport.presets.find((entry) => entry.id === presetId);
  if (preset === undefined) {
    throw new BackgroundError(
      "unknown-preset",
      backgroundId,
      presetId,
      `no viewport preset "${presetId}" in the manifest`,
    );
  }
  const family = backgroundFamily(manifest, backgroundId);
  const base = family.find((entry) => entry.id === backgroundId);
  if (base === undefined) {
    throw new BackgroundError(
      "unknown-background",
      backgroundId,
      presetId,
      `no background "${backgroundId}" in the manifest`,
    );
  }

  // Primary path: the preset already names the variant it wants, and that
  // variant has to belong to the family we were asked about.
  const declared = manifest.backgrounds.find((entry) => entry.id === preset.background);
  const declaredIsInFamily =
    declared !== undefined && (declared.id === backgroundId || declared.variantOf === backgroundId);
  if (declaredIsInFamily) {
    return toChoice(declared, "preset-declared", preset.ratio, 0);
  }

  // Fallback: the preset declares no usable background, so measure the family.
  if (family.length === 1) {
    return toChoice(base, "fallback-base", null, 0);
  }
  const target = preset.ratio;
  let best: { entry: BackgroundEntry; ratio: number; distance: number } | undefined;
  for (const entry of family) {
    for (const ratio of declaredRatiosFor(manifest, entry.id)) {
      const distance = Math.abs(Math.log(ratio / target));
      if (best === undefined || distance < best.distance) {
        best = { entry, ratio, distance };
      }
    }
  }
  if (best === undefined) {
    // No preset references any member of the family, so there is nothing to
    // measure. Stay on the base art rather than guessing.
    return toChoice(base, "fallback-base", null, 0);
  }
  return toChoice(best.entry, "nearest-ratio", best.ratio, best.distance);
}
