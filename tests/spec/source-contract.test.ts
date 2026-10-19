// Content guardrails: the rules AGENTS.md and tech-stack.json state about the code
// itself, checked by reading the shipped source rather than by trusting a lint run.
//
// These are the failures that no unit test can catch, because they are about what
// the code contains rather than what it computes: an unseeded random call, a stray
// storage write, a new sprite name that the art manifest has never heard of, or a
// committed audio file.

import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { AUDIO_CUES, VOICES } from "../../src/audio/voices";
import { listAssetReferences } from "../../src/assets/loader";
import { TOUCH_DATA_ATTRIBUTE } from "../../src/input/touch";
import { TITLE_COPY } from "../../src/ui/title";
import {
  ROOT,
  codeOnly,
  lineOf,
  manifest,
  readRepoFile,
  sourceFiles,
  sourceFilesIn,
  techStack,
} from "./helpers";

const files = sourceFiles();
const clockPath = "src/app/clock.ts";
const loaderPath = "src/assets/loader.ts";

/** Every src file except the two the contract explicitly exempts. */
const exceptExempt = files.filter((file) => file.path !== clockPath && file.path !== loaderPath);

describe("determinism guardrails", () => {
  const banned: ReadonlyArray<readonly [string, RegExp, string]> = [
    [
      "Math.random",
      /\bMath\s*\.\s*random\b/,
      "Use the seeded Mulberry32 streams in src/util/rng.ts.",
    ],
    ["Date.now", /\bDate\s*\.\s*now\b/, "Real time lives in src/app/clock.ts only."],
    ["new Date()", /\bnew\s+Date\b/, "A wall clock reading is banned outside src/app/clock.ts."],
    ["performance.now", /\bperformance\s*\.\s*now\b/, "Real time lives in src/app/clock.ts only."],
    [
      "crypto.getRandomValues",
      /\bcrypto\s*\.\s*getRandomValues\b/,
      "Use the seeded Mulberry32 streams in src/util/rng.ts.",
    ],
    [
      "crypto.randomUUID",
      /\bcrypto\s*\.\s*randomUUID\b/,
      "Use the seeded Mulberry32 streams in src/util/rng.ts.",
    ],
  ];

  for (const [name, pattern, fix] of banned) {
    it(`never calls ${name} outside src/app/clock.ts`, () => {
      const offenders = exceptExempt
        .map((file) => ({ file, code: codeOnly(file.text) }))
        .filter((entry) => pattern.test(entry.code))
        .map(
          (entry) =>
            `${entry.file.path}:${String(lineOf(entry.code, pattern.exec(entry.code)?.index ?? 0))}`,
        );
      expect(offenders, `${name} is banned. ${fix}`).toEqual([]);
    });
  }

  it("keeps the clock the only reader of real time", () => {
    const uses = exceptExempt.filter((file) =>
      /\b(Date|performance)\s*\.\s*now\b|\bnew\s+Date\b/.test(codeOnly(file.text)),
    );
    expect(uses.map((file) => file.path)).toEqual([]);
    expect(files.map((file) => file.path)).toContain(clockPath);
  });

  it("reads time through the clock and not through a global", () => {
    // The app is the only layer allowed to know about a clock at all.
    const appFiles = sourceFilesIn(join(ROOT, "src", "app"));
    expect(appFiles.map((file) => file.path).sort()).toEqual([
      "src/app/boot.ts",
      "src/app/clock.ts",
      "src/app/config.ts",
      "src/app/event-audio.ts",
      "src/app/loop.ts",
      "src/app/test-hooks.ts",
    ]);
  });
});

describe("stateless guardrails", () => {
  const storage: ReadonlyArray<readonly [string, RegExp]> = [
    ["localStorage", /\blocalStorage\b/],
    ["sessionStorage", /\bsessionStorage\b/],
    ["indexedDB", /\bindexedDB\b/],
    ["document.cookie", /\bdocument\s*\.\s*cookie\b/],
    ["WebSocket", /\bnew\s+WebSocket\b/],
    ["EventSource", /\bnew\s+EventSource\b/],
    ["XMLHttpRequest", /\bnew\s+XMLHttpRequest\b/],
  ];

  for (const [name, pattern] of storage) {
    it(`never touches ${name}`, () => {
      const offenders = files
        .map((file) => ({ file, code: codeOnly(file.text) }))
        .filter((entry) => pattern.test(entry.code))
        .map((entry) => entry.file.path);
      expect(offenders, `${name} is banned: the game is stateless.`).toEqual([]);
    });
  }

  it("keeps the runtime dependency list empty", () => {
    expect(techStack.runtime.runtimeDependencies).toEqual([]);
    expect(readRepoFile("index.html")).not.toMatch(/<script[^>]+src\s*=\s*["']https?:/i);
  });
});

describe("asset guardrails", () => {
  it("ships no audio files at all", () => {
    const audioExtensions = new Set([".wav", ".mp3", ".ogg", ".m4a", ".flac", ".aac", ".opus"]);
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const absolute = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(absolute);
          continue;
        }
        const dot = entry.name.lastIndexOf(".");
        if (dot < 0) continue;
        if (audioExtensions.has(entry.name.slice(dot).toLowerCase())) {
          found.push(relative(ROOT, absolute).split(sep).join("/"));
        }
      }
    };
    walk(ROOT);
    expect(found).toEqual([]);
  });

  it("names the audio cues tech-stack.json asks for", () => {
    for (const cue of AUDIO_CUES) {
      const voice = VOICES[cue];
      expect(voice, cue).toBeDefined();
      expect(voice.cue, cue).toBe(cue);
      expect(voice.durationSec, cue).toBeGreaterThan(0);
      expect(voice.gain, cue).toBeGreaterThan(0);
      expect(voice.tones.length + (voice.noise === undefined ? 0 : 1), cue).toBeGreaterThan(0);
      for (const tone of voice.tones) {
        expect(tone.envelope.length, cue).toBeGreaterThan(0);
      }
    }
    expect(new Set(AUDIO_CUES).size).toBe(AUDIO_CUES.length);
    expect(techStack.runtime.audio).toContain("synthesized at runtime");
  });

  it("references only images the manifest declares", () => {
    const urls = new Set(listAssetReferences(manifest).map((entry) => entry.url));
    // assets/loader.ts is the only module that builds a url, and it does it from the
    // manifest. No other module may hard code a file name.
    for (const file of files) {
      if (file.path === loaderPath) continue;
      const code = codeOnly(file.text);
      for (const match of code.matchAll(/["'`](assets\/[^"'`]+\.(?:png|jpeg|jpg|webp))["'`]/g)) {
        expect(urls.has(match[1] ?? ""), `${file.path}: ${match[0]}`).toBe(true);
      }
    }
  });

  it("keeps every touch control attribute the stylesheet styles", () => {
    const css = readRepoFile("src/styles/touch.css");
    for (const control of ["up", "down", "left", "right", "jump", "action"]) {
      expect(css, control).toContain(`cc-touch-${control}`);
      expect(TOUCH_DATA_ATTRIBUTE).toBe("data-cc-control");
    }
  });

  it("keeps the title copy free of anything the brief rules out", () => {
    const copy = Object.values(TITLE_COPY).flat().join(" ");
    expect(copy).toContain("waterbike");
    expect(copy).not.toMatch(/\b(save|persist|account|server|login)\b/i);
  });

  it("never edits an image at runtime", () => {
    // The presentation layer may flip, scale, tint and rotate. It may not draw into
    // the source image, which is why no module ever holds an OffscreenCanvas.
    for (const file of files) {
      expect(file.text, file.path).not.toMatch(/new\s+OffscreenCanvas|createImageBitmap\s*\(/);
    }
  });
});

describe("manifest driven animation names", () => {
  /** Every animation name the sim can put on an entity, read from the source. */
  const emitted = new Map<string, Set<string>>([
    ["player", new Set(["idle", "defeat", "jump", "swim", "walk"])],
    ["orca", new Set(["idle", "swim", "jump"])],
    ["shark", new Set(["idle", "swim"])],
    ["tarantula", new Set(["idle", "jump"])],
    ["snail", new Set(["swim"])],
    ["human", new Set(["walk", "swim"])],
  ]);

  it("matches every anim assignment the behaviour modules make", () => {
    const found = new Map<string, Set<string>>();
    for (const file of sourceFilesIn(join(ROOT, "src", "sim", "behaviours"))) {
      const owner = file.path.replace(/^src\/sim\/behaviours\//, "").replace(/\.ts$/, "");
      const names = new Set<string>();
      // Only `.anim = ...` assignments: `.state = ...` assigns a different vocabulary.
      for (const match of file.text.matchAll(/\.anim\s*=\s*([^;\n]+);/g)) {
        for (const literal of (match[1] ?? "").matchAll(/"([a-z]+)"/g)) {
          names.add(literal[1] ?? "");
        }
      }
      found.set(owner, names);
    }
    for (const [kind, expected] of emitted) {
      const actual = found.get(kind) ?? new Set<string>();
      expect(actual.size, kind).toBeGreaterThan(0);
      expect([...actual].sort(), kind).toEqual([...expected].sort());
    }
  });

  it("resolves every animation name to a real animation or alias", () => {
    for (const [characterId, character] of Object.entries(manifest.characters)) {
      const known = new Set([
        ...Object.keys(character.animations),
        ...Object.keys(character.aliases),
      ]);
      const kind = Object.entries({
        capybara: "player",
        orca: "orca",
        shark: "shark",
        tarantula: "tarantula",
        snail: "snail",
        human: "human",
      }).find(([id]) => id === characterId)?.[1];
      const names = kind === undefined ? [] : (emitted.get(kind) ?? new Set<string>());
      for (const name of names) {
        expect(known.has(name), `${characterId}.${name}`).toBe(true);
      }
    }
  });
});

describe("source of truth files", () => {
  it("keeps AGENTS.md, codebase.txt and tech-stack.json present", () => {
    for (const file of ["AGENTS.md", "codebase.txt", "tech-stack.json", "package.json"]) {
      expect(statSync(join(ROOT, file)).isFile(), file).toBe(true);
    }
  });

  it("keeps the stage order tech-stack.json declares in sync with package.json", () => {
    const pkg = JSON.parse(readRepoFile("package.json")) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    for (const [stage, command] of Object.entries(techStack.ci.stageCommands)) {
      const script = command.replace(/^npm run /, "");
      expect(pkg.scripts[script], `${stage} -> ${command}`).toBeDefined();
      expect(command, stage).toBe(`npm run ${script}`);
    }
    const entryScript = techStack.ci.entry.replace(/^npm run /, "");
    expect(pkg.scripts[entryScript], techStack.ci.entry).toContain("scripts/run-gates.mjs");
  });

  it("keeps every pin exact and shared with tech-stack.json", () => {
    const pkg = JSON.parse(readRepoFile("package.json")) as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies).toEqual(techStack.pins);
  });
});
