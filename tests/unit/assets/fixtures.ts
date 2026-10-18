import { describe, expect, it } from "vitest";

import rawManifest from "../../../public/assets/assets.json";
import { parseManifest } from "../../../src/assets/manifest-types";
import type { Dict, Manifest } from "../../../src/assets/manifest-types";

/** The real manifest, validated. Throws if the shipped file is malformed. */
export const manifest: Manifest = parseManifest(rawManifest);

/** A mutable deep copy of the real manifest, for malformed-input tests. */
export function draftManifest(): Dict {
  return structuredClone(rawManifest) as unknown as Dict;
}