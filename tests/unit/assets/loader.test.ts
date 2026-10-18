import { describe, expect, it, vi } from "vitest";

import rawManifest from "../../../public/assets/assets.json";
import {
  AssetLoadError,
  DEFAULT_MANIFEST_URL,
  isAssetLoadError,
  listAssetReferences,
  loadImages,
  loadManifest,
} from "../../../src/assets/loader";
import type { DecodedImage, LoadProgress } from "../../../src/assets/loader";
import { ManifestError } from "../../../src/assets/manifest-types";
import { manifest } from "./fixtures";

function fakeDecoded(width: number, height: number): DecodedImage {
  return { source: {} as CanvasImageSource, width, height };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: (): Promise<string> => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function fetchReturning(response: Response): typeof fetch {
  return (() => Promise.resolve(response)) as typeof fetch;
}

describe("listAssetReferences", () => {
  it("covers every sprite and every background in manifest order", () => {
    const references = listAssetReferences(manifest, "assets/");
    expect(references).toHaveLength(manifest.sprites.length + manifest.backgrounds.length);
    expect(references[0]).toEqual({ id: "capybara-idle", url: "assets/Capybara-idle.png" });
    expect(references.at(-1)).toEqual({ id: "title", url: "assets/Cosmic Chaos.png" });
  });

  it("defaults the base url to the manifest folder", () => {
    expect(DEFAULT_MANIFEST_URL).toBe("assets/assets.json");
    const references = listAssetReferences(manifest);
    for (const reference of references) {
      expect(reference.url.startsWith("assets/")).toBe(true);
      expect(reference.url).not.toContain("//");
    }
  });

  it("matches every file the manifest declares", () => {
    const referenced = new Set(listAssetReferences(manifest).map((entry) => entry.url.split("/").pop()));
    for (const sprite of manifest.sprites) expect(referenced.has(sprite.file)).toBe(true);
    for (const background of manifest.backgrounds) expect(referenced.has(background.file)).toBe(true);
  });
});

describe("loadManifest", () => {
  it("fetches, parses and validates", async () => {
    const seen: string[] = [];
    const loaded = await loadManifest({
      manifestUrl: "assets/assets.json",
      fetchImpl: ((input: RequestInfo | URL) => {
        seen.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        return Promise.resolve(jsonResponse(rawManifest));
      }) as typeof fetch,
    });
    expect(seen).toEqual(["assets/assets.json"]);
    expect(loaded.sprites).toHaveLength(12);
    expect(loaded.arena.background).toBe("canvas-03");
  });

  it("reports progress through the callback and never touches the console", async () => {
    const spy = vi.spyOn(console, "log");
    const progress: LoadProgress[] = [];
    await loadManifest({
      fetchImpl: fetchReturning(jsonResponse(rawManifest)),
      onProgress: (p) => progress.push(p),
    });
    expect(progress).toEqual([
      { phase: "manifest", id: DEFAULT_MANIFEST_URL, loaded: 0, total: 1 },
      { phase: "manifest", id: DEFAULT_MANIFEST_URL, loaded: 1, total: 1 },
    ]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("throws a typed error when the request fails", async () => {
    let caught: unknown;
    try {
      await loadManifest({ fetchImpl: fetchReturning(jsonResponse({}, false, 404)) });
    } catch (error) {
      caught = error;
    }
    expect(isAssetLoadError(caught)).toBe(true);
    const error = caught as AssetLoadError;
    expect(error.code).toBe("manifest-request");
    expect(error.message).toContain("status 404");
  });

  it("wraps a network failure", async () => {
    let caught: unknown;
    try {
      await loadManifest({
        fetchImpl: (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch,
      });
    } catch (error) {
      caught = error;
    }
    expect((caught as AssetLoadError).code).toBe("manifest-request");
  });

  it("throws a typed error for invalid JSON", async () => {
    const bad = { ok: true, status: 200, text: (): Promise<string> => Promise.resolve("{ nope") } as Response;
    let caught: unknown;
    try {
      await loadManifest({ fetchImpl: fetchReturning(bad) });
    } catch (error) {
      caught = error;
    }
    expect((caught as AssetLoadError).code).toBe("manifest-parse");
  });

  it("lets a ManifestError through untouched", async () => {
    const broken = structuredClone(rawManifest) as unknown as Record<string, unknown>;
    (broken["arena"] as Record<string, unknown>)["background"] = "canvas-99";
    let caught: unknown;
    try {
      await loadManifest({ fetchImpl: fetchReturning(jsonResponse(broken)) });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ManifestError);
  });
});

describe("loadImages", () => {
  it("decodes every reference and reports progress", async () => {
    const requested: string[] = [];
    const progress: LoadProgress[] = [];
    const images = await loadImages(manifest, {
      baseUrl: "assets/",
      decode: (url) => {
        requested.push(url);
        return Promise.resolve(fakeDecoded(64, 64));
      },
      onProgress: (p) => progress.push(p),
    });
    const references = listAssetReferences(manifest, "assets/");
    expect(images.size).toBe(references.length);
    expect(requested).toEqual(references.map((reference) => reference.url));
    expect(progress.at(0)).toEqual({
      phase: "images",
      id: references[0]?.id,
      loaded: 1,
      total: references.length,
    });
    expect(progress.at(-1)?.loaded).toBe(references.length);
    expect([...images.keys()]).toEqual(references.map((reference) => reference.id));
  });

  it("keeps decoded sizes", async () => {
    const images = await loadImages(manifest, {
      decode: (url) => Promise.resolve(fakeDecoded(url.length, 12)),
    });
    const capybara = images.get("capybara-idle");
    expect(capybara?.height).toBe(12);
    expect(capybara?.width).toBe("assets/Capybara-idle.png".length);
  });

  it("names the failing id when a decode throws", async () => {
    let caught: unknown;
    try {
      await loadImages(manifest, {
        decode: (url) =>
          url.includes("orca-swim")
            ? Promise.reject(new Error("corrupt"))
            : Promise.resolve(fakeDecoded(1, 1)),
      });
    } catch (error) {
      caught = error;
    }
    expect(isAssetLoadError(caught)).toBe(true);
    const error = caught as AssetLoadError;
    expect(error.code).toBe("image-decode");
    expect(error.id).toBe("orca-swim");
  });

  it("does not swallow an AssetLoadError raised by the decoder", async () => {
    let caught: unknown;
    try {
      await loadImages(manifest, {
        decode: () => Promise.reject(new AssetLoadError("image-request", "canvas-03", "status 500")),
      });
    } catch (error) {
      caught = error;
    }
    expect((caught as AssetLoadError).code).toBe("image-request");
  });

  it("uses the real decoder path when none is injected", async () => {
    // No network in unit tests, so the default decoder must fail through the
    // typed error path rather than throwing something opaque.
    let caught: unknown;
    try {
      await loadImages(manifest, {
        baseUrl: "assets/",
        fetchImpl: (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch,
      });
    } catch (error) {
      caught = error;
    }
    expect(isAssetLoadError(caught)).toBe(true);
  });
});