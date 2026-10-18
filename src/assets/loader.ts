// The only module in src/ allowed to fetch.
//
// Responsibilities: fetch and validate assets.json, then decode every sprite
// and background image. It reports progress through a callback instead of the
// console, and every failure is a typed `AssetLoadError`.

import { ManifestError, parseManifest } from "./manifest-types";
import type { Manifest } from "./manifest-types";

/** Default location, relative to the document base so any Vite `base` works. */
export const DEFAULT_MANIFEST_URL = "assets/assets.json";

/** A decoded image plus its intrinsic pixel size, ready for `drawImage`. */
export interface DecodedImage {
  /** `ImageBitmap` when the browser can make one, otherwise an `HTMLImageElement`. */
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

export type LoadPhase = "manifest" | "images";

export interface LoadProgress {
  readonly phase: LoadPhase;
  /** Manifest entry id, or the manifest URL during the manifest phase. */
  readonly id: string;
  readonly loaded: number;
  readonly total: number;
}

export interface LoadOptions {
  /** Manifest URL. Defaults to `DEFAULT_MANIFEST_URL`. */
  readonly manifestUrl?: string;
  /** Prefix for sprite and background files. Defaults to the manifest's folder. */
  readonly baseUrl?: string;
  /** Injected for tests. Defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** Injected for tests. Defaults to `createImageBitmap` or `new Image()`. */
  readonly decode?: (url: string, fetchImpl: typeof fetch) => Promise<DecodedImage>;
  readonly onProgress?: (progress: LoadProgress) => void;
}

export type AssetLoadErrorCode =
  | "manifest-request"
  | "manifest-parse"
  | "image-request"
  | "image-decode";

export class AssetLoadError extends Error {
  readonly code: AssetLoadErrorCode;
  readonly id: string;
  readonly cause?: unknown;

  constructor(code: AssetLoadErrorCode, id: string, message: string, cause?: unknown) {
    super(`[${code}] ${id}: ${message}`);
    this.name = "AssetLoadError";
    this.code = code;
    this.id = id;
    if (cause !== undefined) this.cause = cause;
  }
}

export function isAssetLoadError(value: unknown): value is AssetLoadError {
  return value instanceof AssetLoadError;
}

/** Every image the manifest points at, sprites first then backgrounds. */
export interface AssetReference {
  readonly id: string;
  readonly url: string;
}

export function listAssetReferences(manifest: Manifest, baseUrl?: string): AssetReference[] {
  const base = baseUrl ?? folderOf(DEFAULT_MANIFEST_URL);
  const out: AssetReference[] = [];
  for (const sprite of manifest.sprites) out.push({ id: sprite.id, url: `${base}${sprite.file}` });
  for (const background of manifest.backgrounds) {
    out.push({ id: background.id, url: `${base}${background.file}` });
  }
  return out;
}

function folderOf(url: string): string {
  const cut = url.lastIndexOf("/");
  return cut < 0 ? "" : url.slice(0, cut + 1);
}

async function decodeWithBitmap(fetchImpl: typeof fetch, url: string): Promise<DecodedImage> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new AssetLoadError("image-request", url, `request failed with status ${String(response.status)}`);
  }
  const blob = await response.blob();
  const factory = (globalThis as { createImageBitmap?: (b: Blob) => Promise<ImageBitmap> })
    .createImageBitmap;
  if (typeof factory === "function") {
    const bitmap = await factory.call(globalThis, blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  }
  return decodeWithImageElement(url);
}

function decodeWithImageElement(url: string): Promise<DecodedImage> {
  return new Promise<DecodedImage>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener(
      "load",
      () => {
        resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        reject(new AssetLoadError("image-decode", url, "the image could not be decoded"));
      },
      { once: true },
    );
    image.src = url;
  });
}

/**
 * Fetch and validate the manifest.
 *
 * Rethrows a `ManifestError` untouched so callers can tell "the file is wrong"
 * apart from "the file is missing".
 */
export async function loadManifest(options: LoadOptions = {}): Promise<Manifest> {
  const url = options.manifestUrl ?? DEFAULT_MANIFEST_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  options.onProgress?.({ phase: "manifest", id: url, loaded: 0, total: 1 });

  let text: string;
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new AssetLoadError("manifest-request", url, `request failed with status ${String(response.status)}`);
    }
    text = await response.text();
  } catch (error) {
    if (error instanceof AssetLoadError) throw error;
    throw new AssetLoadError("manifest-request", url, "the manifest could not be requested", error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new AssetLoadError("manifest-parse", url, "the manifest is not valid JSON", error);
  }

  const manifest = parseManifest(parsed);
  options.onProgress?.({ phase: "manifest", id: url, loaded: 1, total: 1 });
  return manifest;
}

/**
 * Decode every sprite and background the manifest references.
 *
 * Results are keyed by manifest id and follow manifest order, so the returned
 * `Map` iterates deterministically.
 */
export async function loadImages(
  manifest: Manifest,
  options: LoadOptions = {},
): Promise<Map<string, DecodedImage>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const decode = options.decode ?? ((url: string): Promise<DecodedImage> => decodeWithBitmap(fetchImpl, url));
  const references = listAssetReferences(manifest, options.baseUrl);
  const images = new Map<string, DecodedImage>();
  for (const [index, reference] of references.entries()) {
    try {
      images.set(reference.id, await decode(reference.url, fetchImpl));
    } catch (error) {
      if (error instanceof AssetLoadError || error instanceof ManifestError) throw error;
      throw new AssetLoadError("image-decode", reference.id, "the image could not be decoded", error);
    }
    options.onProgress?.({
      phase: "images",
      id: reference.id,
      loaded: index + 1,
      total: references.length,
    });
  }
  return images;
}

export { ManifestError };