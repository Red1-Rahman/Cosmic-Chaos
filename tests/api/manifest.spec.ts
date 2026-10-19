// HTTP contract of the built bundle, checked against the real preview server.
//
// The manifest is the source of truth here, exactly as it is in the game: the test
// reads public/assets/assets.json out of the repository, asks the server for every file
// the manifest names, and compares the byte count and the content type. A hand written
// list of files would drift the first time a sprite was renamed.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { listAssetReferences } from "../../src/assets/loader";
import { parseManifest } from "../../src/assets/manifest-types";
import type { Manifest } from "../../src/assets/manifest-types";

const root = fileURLToPath(new URL("../../", import.meta.url));
const manifestUrl = "assets/assets.json";
const manifest: Manifest = parseManifest(
  JSON.parse(readFileSync(join(root, "public", "assets", "assets.json"), "utf8")) as unknown,
);

/** Content types vite preview serves for the extensions the manifest may use. */
const CONTENT_TYPES: Readonly<Record<string, readonly string[]>> = {
  ".png": ["image/png"],
  ".jpeg": ["image/jpeg"],
  ".jpg": ["image/jpeg"],
};

function contentTypeFor(file: string): readonly string[] {
  const dot = file.lastIndexOf(".");
  const type = dot < 0 ? undefined : CONTENT_TYPES[file.slice(dot).toLowerCase()];
  if (type === undefined) throw new Error(`no expected content type for ${file}`);
  return type;
}

test.describe("served application", () => {
  test("serves the entry document as HTML with the arena canvas", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    const body = await response.text();
    expect(body).toContain("<canvas");
    expect(body).toContain('id="stage"');
    // A declared favicon, or the browser logs a 404 for it in the e2e gate.
    expect(body).toContain('rel="icon"');
  });

  test("serves a bundle that the document actually references", async ({ request }) => {
    const html = await (await request.get("/")).text();
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1] ?? "");
    const styles = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(
      (match) => match[1] ?? "",
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const href of [...scripts, ...styles]) {
      const response = await request.get(href.startsWith("/") ? href : `/${href}`);
      expect(response.status(), href).toBe(200);
    }
  });

  test("never serves a dev-only module from the built root", async ({ request }) => {
    for (const path of ["/@vite/client", "/src/main.ts", "/tests/unit/rng.test.ts"]) {
      const response = await request.get(path);
      const body = await response.body();
      const html = (response.headers()["content-type"] ?? "").includes("text/html");
      // vite preview falls back to the document for unknown paths. What must never
      // happen is a dev module being reachable at runtime.
      expect(html && body.includes("/src/main.ts"), path).toBe(false);
      expect(body.toString("utf8", 0, 200).includes("import.meta.hot"), path).toBe(false);
    }
  });
});

test.describe("asset manifest", () => {
  test("serves the manifest as JSON and it parses with the shipped parser", async ({ request }) => {
    const response = await request.get(`/${manifestUrl}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    const served = JSON.parse(await response.text()) as unknown;
    expect(() => parseManifest(served)).not.toThrow();
  });

  test("serves byte for byte the manifest committed to the repository", async ({ request }) => {
    const response = await request.get(`/${manifestUrl}`);
    const onDisk = readFileSync(join(root, "public", "assets", "assets.json"));
    expect(Buffer.from(await response.body())).toEqual(onDisk);
  });
});

test.describe("every referenced asset", () => {
  const references = listAssetReferences(manifest);

  test("the manifest names a non trivial number of files", () => {
    expect(references.length).toBe(manifest.sprites.length + manifest.backgrounds.length);
    expect(references.length).toBeGreaterThan(0);
  });

  for (const reference of references) {
    test(`${reference.id} is served as declared`, async ({ request }) => {
      const response = await request.get(`/${reference.url}`);
      expect(response.status()).toBe(200);
      const declared = [...manifest.sprites, ...manifest.backgrounds].find(
        (entry) => entry.id === reference.id,
      );
      expect(declared, reference.id).toBeDefined();
      if (declared === undefined) return;

      const body = await response.body();
      // Byte count first: that is what the browser actually has to decode.
      expect(body.byteLength).toBe(declared.bytes ?? body.byteLength);
      expect(declared.bytes).toBe(body.byteLength);

      const contentType = response.headers()["content-type"] ?? "";
      expect(contentTypeFor(declared.file)).toContain(contentType.split(";")[0] ?? "");

      // And the payload is really the image, not an HTML error page.
      if (declared.file.toLowerCase().endsWith(".png")) {
        expect(body.subarray(0, 8)).toEqual(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );
      } else {
        expect(body.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
      }
    });
  }
});

test.describe("unknown routes", () => {
  test("falls back to the game document, and the fallback is the real document", async ({
    request,
  }) => {
    // vite preview serves the single page app for unknown paths. That is deliberate,
    // and what matters is that the fallback is the game's own document and never a
    // directory listing or a repository file.
    const response = await request.get("/some/unknown/route");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    const body = await response.text();
    expect(body).toContain('id="stage"');
    expect(body).not.toContain("Index of /");
  });

  test("a path traversal attempt cannot read outside the served root", async ({ request }) => {
    for (const path of [
      "/assets/../../package.json",
      "/assets/../../../src/main.ts",
      "/../tech-stack.json",
    ]) {
      const response = await request.get(path);
      const body = await response.text();
      expect(body, path).not.toContain('"name": "cosmic-chaos"');
      expect(body, path).not.toContain('"runtimeDependencies"');
    }
  });
});
