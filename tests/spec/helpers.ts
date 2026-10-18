// Shared plumbing for the spec gate. Not a test file itself.
//
// The spec gate is about contracts between the files that are the project's
// sources of truth: assets.json, characters.json, tech-stack.json and the code
// that reads them. Nothing here simulates gameplay; that is the unit, cross-module
// and regression gates. Everything in here is pure node file reading plus the
// project's own parsers.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import rawAssets from "../../public/assets/assets.json";
import rawCharacters from "../../src/data/characters.json";
import rawTechStack from "../../tech-stack.json";
import { parseManifest } from "../../src/assets/manifest-types";
import type { Manifest } from "../../src/assets/manifest-types";

/** Repository root, resolved from this file so nothing depends on the cwd. */
export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const SRC_DIR = join(ROOT, "src");
export const ASSETS_DIR = join(ROOT, "public", "assets");

/** The manifest exactly as it ships, validated by the project's own parser. */
export const manifest: Manifest = parseManifest(rawAssets);

/** The lore file exactly as it ships. */
export const characters: typeof rawCharacters = rawCharacters;

/** The tooling source of truth. */
export const techStack: typeof rawTechStack = rawTechStack;

export function assetPath(file: string): string {
  return join(ASSETS_DIR, file);
}

export function readAsset(file: string): Buffer {
  return readFileSync(assetPath(file));
}

/** sha256 of a shipped asset, lowercase hex, the same shape assets.json records. */
export function sha256Of(file: string): string {
  return createHash("sha256").update(readAsset(file)).digest("hex");
}

export function byteSize(file: string): number {
  return statSync(assetPath(file)).size;
}

export interface SourceFile {
  /** Repository relative path with forward slashes, so messages are portable. */
  readonly path: string;
  readonly absolute: string;
  readonly text: string;
}

/** Every .ts file under a directory, sorted, recursively. */
export function sourceFilesIn(dir: string): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (current: string): void => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      out.push({
        path: relative(ROOT, absolute).split(sep).join("/"),
        absolute,
        text: readFileSync(absolute, "utf8"),
      });
    }
  };
  walk(dir);
  return out;
}

/** Every .ts file in src/. */
export function sourceFiles(): SourceFile[] {
  return sourceFilesIn(SRC_DIR);
}

/** 1-based line number of the first match, or 0 when there is none. */
export function lineOf(text: string, index: number): number {
  if (index < 0) return 0;
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/**
 * Strips comments and string literals so a banned API mentioned in prose or in a
 * message string does not count as a call. Also drops template literal bodies.
 */
export function codeOnly(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === "//") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (two === "/*") {
      i += 2;
      while (i < text.length && text.slice(i, i + 2) !== "*/") i += 1;
      i += 2;
      continue;
    }
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === quote) {
          i += 1;
          break;
        }
        if (quote === "`" && text[i] === "$" && text[i + 1] === "{") {
          // Keep template substitutions: they are real code and can hide a call.
          let depth = 1;
          i += 2;
          while (i < text.length && depth > 0) {
            if (text[i] === "{") depth += 1;
            else if (text[i] === "}") depth -= 1;
            i += 1;
          }
          continue;
        }
        i += 1;
      }
      out += '""';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Reads a repository file by its repo relative path. */
export function readRepoFile(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}