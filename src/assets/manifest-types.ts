// Typed shape of public/assets/assets.json plus a hand written runtime guard.
//
// The manifest is the source of truth. This file never rewrites it: it only
// describes what the loader is allowed to hand to the rest of the game and
// rejects anything that does not fit, with a message a human can act on.
//
// Notes on fidelity to the current manifest:
// - Sprite and background entries carry `"locked": false` and no `size`,
//   `bytes` or `sha256` until a human runs `npm run assets:lock`. Those three
//   fields and `locked` are therefore all optional here and are never required
//   by `parseManifest`.
// - `proceduralProps` is an array of heterogeneous prop descriptions, not an
//   object keyed by id.
// - Backgrounds declare no ratio and no focal point. `pickBackground` in
//   backgrounds.ts handles that: see its own comment.
// - Keyframes declare no easing today. `easing` is accepted and defaults to
//   "linear" so a future authored ease does not need a schema change.

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly w: number;
  readonly h: number;
}

export interface FrameGrid {
  readonly cols: number;
  readonly rows: number;
}

export interface SpriteFrame {
  readonly grid: FrameGrid;
  readonly tile: Size;
}

export type Fit = "contain" | "cover";

export interface SpriteEntry {
  readonly id: string;
  readonly file: string;
  readonly locked?: boolean | undefined;
  readonly character?: string | undefined;
  readonly pose?: string | undefined;
  readonly facing?: string | undefined;
  readonly renderScale: number;
  readonly anchor: Vec2;
  readonly note?: string | undefined;
  readonly frame?: SpriteFrame | undefined;
  readonly size?: Size | undefined;
  readonly bytes?: number | undefined;
  readonly sha256?: string | undefined;
}

export interface BackgroundEntry {
  readonly id: string;
  readonly file: string;
  readonly locked?: boolean | undefined;
  readonly theme?: string | undefined;
  readonly fit: Fit;
  readonly role?: string | undefined;
  readonly note?: string | undefined;
  readonly variantOf?: string | undefined;
  readonly orientation?: string | undefined;
  readonly size?: Size | undefined;
  readonly bytes?: number | undefined;
  readonly sha256?: string | undefined;
}

export interface ProceduralProp {
  readonly id: string;
  readonly character: string | null;
  readonly reason: string;
  readonly rules?: readonly string[] | undefined;
  readonly anchors?: readonly Vec2[] | undefined;
  readonly radius?: number | undefined;
  readonly breathHz?: number | undefined;
  readonly breathAmount?: number | undefined;
  readonly count?: number | undefined;
  readonly lifeMs?: number | undefined;
  readonly size?: number | undefined;
  readonly pulseHz?: number | undefined;
  readonly anchorTo?: string | undefined;
  readonly colors?: readonly string[] | Readonly<Record<string, string>> | undefined;
  readonly shape?: Readonly<Record<string, unknown>> | undefined;
  readonly jets?: Readonly<Record<string, unknown>> | undefined;
  readonly wake?: Readonly<Record<string, unknown>> | undefined;
}

export interface WaterBand {
  readonly horizonY: number;
  readonly shoreY: number;
  readonly note?: string | undefined;
}

export interface PlayBand {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly note?: string | undefined;
}

export interface DepthBand {
  readonly scaleMin: number;
  readonly scaleMax: number;
  readonly tintFar: string;
  readonly tintNear: string;
  readonly note?: string | undefined;
}

/** Normalized [min, max] pair on one axis. */
export type FractionRange = readonly [number, number];

/** Normalized rectangle expressed as per axis ranges. */
export interface FractionBox {
  readonly x: FractionRange;
  readonly y: FractionRange;
}

export interface SpawnConfig {
  readonly seedDefault: number;
  readonly playerFraction: FractionBox;
  readonly enemyFraction: FractionBox;
  readonly ambientFraction: FractionBox;
  readonly spawnMinDistance: number;
  readonly maxAttempts: number;
  readonly note?: string | undefined;
}

export interface ArenaConfig {
  readonly background: string;
  readonly logical: Size;
  readonly origin: string;
  readonly water: WaterBand;
  readonly playBand: PlayBand;
  readonly depth: DepthBand;
  readonly spawn: SpawnConfig;
  readonly fieldRadius: number;
  readonly timeScaleInside: number;
}

export const EASING_NAMES = ["linear", "ease-in", "ease-out", "ease-in-out", "step"] as const;

export type Easing = (typeof EASING_NAMES)[number];

export interface Keyframe {
  /** Normalized time in [0, 1]. Must not decrease across the animation. */
  readonly t: number;
  readonly sprite: string;
  readonly dx: number;
  readonly dy: number;
  readonly rot: number;
  readonly sx: number;
  readonly sy: number;
  readonly alpha: number;
  /** Optional. Defaults to the animation level easing, then "linear". */
  readonly easing?: Easing | undefined;
}

export interface Animation {
  readonly loop: boolean;
  readonly durationMs: number;
  readonly easing?: Easing | undefined;
  readonly keyframes: readonly Keyframe[];
}

export interface CharacterDefinition {
  readonly sprites: readonly string[];
  readonly prop?: string | undefined;
  readonly animations: Readonly<Record<string, Animation>>;
  readonly aliases: Readonly<Record<string, string>>;
}

export interface ViewportPreset {
  readonly id: string;
  readonly ratio: number;
  readonly logical: Size;
  readonly background: string;
}

export interface ViewportConfig {
  readonly imageRendering: string;
  readonly integerScalePreferred: boolean;
  readonly integerScaleMinFill: number;
  readonly select: string;
  readonly presets: readonly ViewportPreset[];
  readonly readme?: string | undefined;
}

export interface Manifest {
  readonly schemaVersion: number;
  readonly sprites: readonly SpriteEntry[];
  readonly backgrounds: readonly BackgroundEntry[];
  readonly proceduralProps: readonly ProceduralProp[];
  readonly arena: ArenaConfig;
  readonly characters: Readonly<Record<string, CharacterDefinition>>;
  readonly viewport: ViewportConfig;
  readonly conventions?: Readonly<Record<string, string>> | undefined;
  readonly readme?: string | undefined;
}

/** Thrown by `parseManifest`. Carries every problem found, not just the first. */
export class ManifestError extends Error {
  readonly code = "manifest-invalid" as const;
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`assets.json is invalid:\n- ${issues.join("\n- ")}`);
    this.name = "ManifestError";
    this.issues = issues;
  }
}

export function isManifestError(value: unknown): value is ManifestError {
  return value instanceof ManifestError;
}

/** Narrowing search over `manifest.sprites`. Throws when the id is unknown. */
export function findSprite(manifest: Manifest, spriteId: string): SpriteEntry {
  const found = manifest.sprites.find((entry) => entry.id === spriteId);
  if (found === undefined) {
    throw new ManifestError([`sprites: no sprite with id "${spriteId}"`]);
  }
  return found;
}

/** Narrowing search over `manifest.backgrounds`. Throws when the id is unknown. */
export function findBackground(manifest: Manifest, backgroundId: string): BackgroundEntry {
  const found = manifest.backgrounds.find((entry) => entry.id === backgroundId);
  if (found === undefined) {
    throw new ManifestError([`backgrounds: no background with id "${backgroundId}"`]);
  }
  return found;
}

/** Narrowing lookup over `manifest.viewport.presets`. Throws when unknown. */
export function findPreset(manifest: Manifest, presetId: string): ViewportPreset {
  const found = manifest.viewport.presets.find((entry) => entry.id === presetId);
  if (found === undefined) {
    throw new ManifestError([`viewport.presets: no preset with id "${presetId}"`]);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Runtime guard
// ---------------------------------------------------------------------------

export type Dict = Record<string, unknown>;

class Guard {
  readonly issues: string[] = [];

  fail(path: string, message: string): void {
    this.issues.push(`${path}: ${message}`);
  }

  require(condition: boolean, path: string, message: string): boolean {
    if (!condition) this.fail(path, message);
    return condition;
  }
}

function asRecord(value: unknown, path: string, g: Guard): Dict | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    g.fail(path, "expected an object");
    return undefined;
  }
  return value as Dict;
}

function asArray(value: unknown, path: string, g: Guard): unknown[] | undefined {
  if (!Array.isArray(value)) {
    g.fail(path, "expected an array");
    return undefined;
  }
  return value as unknown[];
}

function asNumber(value: unknown, path: string, g: Guard): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    g.fail(path, "expected a finite number");
    return undefined;
  }
  return value;
}

function asString(value: unknown, path: string, g: Guard): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    g.fail(path, "expected a non-empty string");
    return undefined;
  }
  return value;
}

function asBoolean(value: unknown, path: string, g: Guard): boolean | undefined {
  if (typeof value !== "boolean") {
    g.fail(path, "expected a boolean");
    return undefined;
  }
  return value;
}

function asOptionalString(value: unknown, path: string, g: Guard): string | undefined {
  if (value === undefined) return undefined;
  return asString(value, path, g);
}

function asOptionalBoolean(value: unknown, path: string, g: Guard): boolean | undefined {
  if (value === undefined) return undefined;
  return asBoolean(value, path, g);
}

function asOptionalNumber(value: unknown, path: string, g: Guard): number | undefined {
  if (value === undefined) return undefined;
  return asNumber(value, path, g);
}

function asStringArray(value: unknown, path: string, g: Guard): string[] | undefined {
  const raw = asArray(value, path, g);
  if (raw === undefined) return undefined;
  const before = g.issues.length;
  const out: string[] = [];
  raw.forEach((item, i) => {
    const parsed = asString(item, `${path}[${String(i)}]`, g);
    if (parsed !== undefined) out.push(parsed);
  });
  return g.issues.length === before ? out : undefined;
}

function asStringMap(value: unknown, path: string, g: Guard): Record<string, string> | undefined {
  const raw = asRecord(value, path, g);
  if (raw === undefined) return undefined;
  const out: Record<string, string> = {};
  let ok = true;
  for (const key of Object.keys(raw)) {
    const parsed = asString(raw[key], `${path}.${key}`, g);
    if (parsed === undefined) ok = false;
    else out[key] = parsed;
  }
  return ok ? out : undefined;
}

function asVec2(value: unknown, path: string, g: Guard): Vec2 | undefined {
  const raw = asRecord(value, path, g);
  if (raw === undefined) return undefined;
  const x = asNumber(raw["x"], `${path}.x`, g);
  const y = asNumber(raw["y"], `${path}.y`, g);
  if (x === undefined || y === undefined) return undefined;
  return { x, y };
}

function asVec2Array(value: unknown, path: string, g: Guard): Vec2[] | undefined {
  const raw = asArray(value, path, g);
  if (raw === undefined) return undefined;
  const before = g.issues.length;
  const out: Vec2[] = [];
  raw.forEach((item, i) => {
    const parsed = asVec2(item, `${path}[${String(i)}]`, g);
    if (parsed !== undefined) out.push(parsed);
  });
  return g.issues.length === before ? out : undefined;
}

function asSize(value: unknown, path: string, g: Guard): Size | undefined {
  const raw = asRecord(value, path, g);
  if (raw === undefined) return undefined;
  const w = asNumber(raw["w"], `${path}.w`, g);
  const h = asNumber(raw["h"], `${path}.h`, g);
  if (w === undefined || h === undefined) return undefined;
  g.require(w > 0 && h > 0, path, "expected positive pixel dimensions");
  return { w, h };
}

function asFractionBox(value: unknown, path: string, g: Guard): FractionBox | undefined {
  const raw = asRecord(value, path, g);
  if (raw === undefined) return undefined;
  const read = (key: keyof FractionBox): FractionRange | undefined => {
    const pair = asArray(raw[key], `${path}.${key}`, g);
    if (pair === undefined || pair.length !== 2) {
      g.fail(`${path}.${key}`, "expected a [min, max] pair");
      return undefined;
    }
    const lo = asNumber(pair[0], `${path}.${key}[0]`, g);
    const hi = asNumber(pair[1], `${path}.${key}[1]`, g);
    if (lo === undefined || hi === undefined) return undefined;
    g.require(lo >= 0 && hi <= 1 && lo <= hi, `${path}.${key}`, "expected 0 <= min <= max <= 1");
    return [lo, hi] as const;
  };
  const x = read("x");
  const y = read("y");
  if (x === undefined || y === undefined) return undefined;
  return { x, y };
}

function asEasing(value: unknown, path: string, g: Guard): Easing | undefined {
  if (typeof value !== "string" || !(EASING_NAMES as readonly string[]).includes(value)) {
    g.fail(path, `expected one of ${EASING_NAMES.join(", ")}`);
    return undefined;
  }
  return value as Easing;
}

function parseSprite(raw: Dict, path: string, g: Guard): SpriteEntry | undefined {
  const id = asString(raw["id"], `${path}.id`, g);
  const file = asString(raw["file"], `${path}.file`, g);
  const anchor = asVec2(raw["anchor"], `${path}.anchor`, g);
  const renderScale = asNumber(raw["renderScale"], `${path}.renderScale`, g);
  if (anchor !== undefined) {
    g.require(
      anchor.x >= 0 && anchor.x <= 1 && anchor.y >= 0 && anchor.y <= 1,
      `${path}.anchor`,
      "anchor is normalized and must stay within [0, 1]",
    );
  }
  g.require(
    renderScale === undefined || renderScale > 0,
    `${path}.renderScale`,
    "expected a positive multiplier",
  );

  let frame: SpriteFrame | undefined;
  if (raw["frame"] !== undefined) {
    const frameRaw = asRecord(raw["frame"], `${path}.frame`, g);
    if (frameRaw !== undefined) {
      const gridRaw = asRecord(frameRaw["grid"], `${path}.frame.grid`, g);
      const tile = asSize(frameRaw["tile"], `${path}.frame.tile`, g);
      if (gridRaw !== undefined && tile !== undefined) {
        const cols = asNumber(gridRaw["cols"], `${path}.frame.grid.cols`, g);
        const rows = asNumber(gridRaw["rows"], `${path}.frame.grid.rows`, g);
        if (cols !== undefined && rows !== undefined) {
          g.require(
            cols >= 1 && rows >= 1 && Number.isInteger(cols) && Number.isInteger(rows),
            `${path}.frame.grid`,
            "expected positive integer columns and rows",
          );
          frame = { grid: { cols, rows }, tile };
        }
      }
    }
  }

  if (id === undefined || file === undefined || anchor === undefined || renderScale === undefined) {
    return undefined;
  }
  return {
    id,
    file,
    locked: asOptionalBoolean(raw["locked"], `${path}.locked`, g),
    character: asOptionalString(raw["character"], `${path}.character`, g),
    pose: asOptionalString(raw["pose"], `${path}.pose`, g),
    facing: asOptionalString(raw["facing"], `${path}.facing`, g),
    renderScale,
    anchor,
    note: asOptionalString(raw["note"], `${path}.note`, g),
    frame,
    size: raw["size"] === undefined ? undefined : asSize(raw["size"], `${path}.size`, g),
    bytes: asOptionalNumber(raw["bytes"], `${path}.bytes`, g),
    sha256: asOptionalString(raw["sha256"], `${path}.sha256`, g),
  };
}

function parseBackground(raw: Dict, path: string, g: Guard): BackgroundEntry | undefined {
  const id = asString(raw["id"], `${path}.id`, g);
  const file = asString(raw["file"], `${path}.file`, g);
  const fitRaw = asString(raw["fit"], `${path}.fit`, g);
  const fit = fitRaw === "contain" || fitRaw === "cover" ? fitRaw : undefined;
  if (fitRaw !== undefined && fit === undefined) {
    g.fail(`${path}.fit`, 'expected "contain" or "cover"');
  }
  if (id === undefined || file === undefined || fit === undefined) return undefined;
  return {
    id,
    file,
    locked: asOptionalBoolean(raw["locked"], `${path}.locked`, g),
    theme: asOptionalString(raw["theme"], `${path}.theme`, g),
    fit,
    role: asOptionalString(raw["role"], `${path}.role`, g),
    note: asOptionalString(raw["note"], `${path}.note`, g),
    variantOf: asOptionalString(raw["variantOf"], `${path}.variantOf`, g),
    orientation: asOptionalString(raw["orientation"], `${path}.orientation`, g),
    size: raw["size"] === undefined ? undefined : asSize(raw["size"], `${path}.size`, g),
    bytes: asOptionalNumber(raw["bytes"], `${path}.bytes`, g),
    sha256: asOptionalString(raw["sha256"], `${path}.sha256`, g),
  };
}

function parseProp(raw: Dict, path: string, g: Guard): ProceduralProp | undefined {
  const id = asString(raw["id"], `${path}.id`, g);
  const reason = asString(raw["reason"], `${path}.reason`, g);
  const character =
    raw["character"] === null ? null : asOptionalString(raw["character"], `${path}.character`, g);
  let colors: ProceduralProp["colors"];
  if (Array.isArray(raw["colors"])) {
    colors = asStringArray(raw["colors"], `${path}.colors`, g);
  } else if (raw["colors"] !== undefined) {
    colors = asStringMap(raw["colors"], `${path}.colors`, g);
  }
  if (id === undefined || reason === undefined || character === undefined) return undefined;
  return {
    id,
    character,
    reason,
    rules: raw["rules"] === undefined ? undefined : asStringArray(raw["rules"], `${path}.rules`, g),
    anchors:
      raw["anchors"] === undefined ? undefined : asVec2Array(raw["anchors"], `${path}.anchors`, g),
    radius: asOptionalNumber(raw["radius"], `${path}.radius`, g),
    breathHz: asOptionalNumber(raw["breathHz"], `${path}.breathHz`, g),
    breathAmount: asOptionalNumber(raw["breathAmount"], `${path}.breathAmount`, g),
    count: asOptionalNumber(raw["count"], `${path}.count`, g),
    lifeMs: asOptionalNumber(raw["lifeMs"], `${path}.lifeMs`, g),
    size: asOptionalNumber(raw["size"], `${path}.size`, g),
    pulseHz: asOptionalNumber(raw["pulseHz"], `${path}.pulseHz`, g),
    anchorTo: asOptionalString(raw["anchorTo"], `${path}.anchorTo`, g),
    colors,
    shape: asOptionalDict(raw["shape"], `${path}.shape`, g),
    jets: asOptionalDict(raw["jets"], `${path}.jets`, g),
    wake: asOptionalDict(raw["wake"], `${path}.wake`, g),
  };
}

function asOptionalDict(
  value: unknown,
  path: string,
  g: Guard,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  return asRecord(value, path, g);
}

function parseKeyframes(raw: unknown, path: string, g: Guard): Keyframe[] | undefined {
  const list = asArray(raw, path, g);
  if (list === undefined) return undefined;
  if (list.length === 0) {
    g.fail(path, "expected at least one keyframe");
    return undefined;
  }
  const out: Keyframe[] = [];
  let previousT = Number.NEGATIVE_INFINITY;
  list.forEach((item, i) => {
    const at = `${path}[${String(i)}]`;
    const raw = asRecord(item, at, g);
    if (raw === undefined) return;
    const t = asNumber(raw["t"], `${at}.t`, g);
    const sprite = asString(raw["sprite"], `${at}.sprite`, g);
    const dx = asNumber(raw["dx"], `${at}.dx`, g);
    const dy = asNumber(raw["dy"], `${at}.dy`, g);
    const rot = asNumber(raw["rot"], `${at}.rot`, g);
    const sx = asNumber(raw["sx"], `${at}.sx`, g);
    const sy = asNumber(raw["sy"], `${at}.sy`, g);
    const alpha = asNumber(raw["alpha"], `${at}.alpha`, g);
    const easing =
      raw["easing"] === undefined ? undefined : asEasing(raw["easing"], `${at}.easing`, g);
    if (t !== undefined) {
      g.require(t >= 0 && t <= 1, `${at}.t`, "expected a value within [0, 1]");
      g.require(t >= previousT, `${at}.t`, "keyframe times must not decrease");
      previousT = t;
      if (i === 0) g.require(t === 0, `${at}.t`, "the first keyframe must sit at t = 0");
    }
    if (alpha !== undefined) {
      g.require(alpha >= 0 && alpha <= 1, `${at}.alpha`, "expected a value within [0, 1]");
    }
    if (
      t === undefined ||
      sprite === undefined ||
      dx === undefined ||
      dy === undefined ||
      rot === undefined ||
      sx === undefined ||
      sy === undefined ||
      alpha === undefined
    ) {
      return;
    }
    out.push({ t, sprite, dx, dy, rot, sx, sy, alpha, easing });
  });
  return out.length === list.length ? out : undefined;
}

function parseAnimations(raw: Dict, path: string, g: Guard): Record<string, Animation> | undefined {
  const out: Record<string, Animation> = {};
  const before = g.issues.length;
  for (const name of Object.keys(raw)) {
    const at = `${path}.${name}`;
    g.require(name.length > 0, at, "animation names must not be empty");
    const entry = asRecord(raw[name], at, g);
    if (entry === undefined) {
      continue;
    }
    const loop = asBoolean(entry["loop"], `${at}.loop`, g);
    const durationMs = asNumber(entry["durationMs"], `${at}.durationMs`, g);
    const easing =
      entry["easing"] === undefined ? undefined : asEasing(entry["easing"], `${at}.easing`, g);
    const keyframes = parseKeyframes(entry["keyframes"], `${at}.keyframes`, g);
    if (durationMs !== undefined) {
      g.require(durationMs > 0, `${at}.durationMs`, "expected a positive duration");
    }
    if (loop === undefined || durationMs === undefined || keyframes === undefined) {
      continue;
    }
    out[name] = { loop, durationMs, easing, keyframes };
  }
  return g.issues.length === before ? out : undefined;
}

function parseCharacters(raw: Dict, g: Guard): Record<string, CharacterDefinition> | undefined {
  const out: Record<string, CharacterDefinition> = {};
  const before = g.issues.length;
  for (const id of Object.keys(raw)) {
    const at = `characters.${id}`;
    const entry = asRecord(raw[id], at, g);
    if (entry === undefined) {
      continue;
    }
    const sprites = asStringArray(entry["sprites"], `${at}.sprites`, g);
    const animationsRaw = asRecord(entry["animations"], `${at}.animations`, g);
    const animations =
      animationsRaw === undefined
        ? undefined
        : parseAnimations(animationsRaw, `${at}.animations`, g);
    const aliasesRaw =
      entry["aliases"] === undefined ? {} : asStringMap(entry["aliases"], `${at}.aliases`, g);
    const prop = asOptionalString(entry["prop"], `${at}.prop`, g);
    if (sprites === undefined || animations === undefined || aliasesRaw === undefined) {
      continue;
    }
    for (const spriteId of sprites) {
      g.require(
        spriteId.startsWith(`${id}-`),
        `${at}.sprites`,
        `sprite "${spriteId}" does not belong to character "${id}"`,
      );
    }
    for (const [alias, target] of Object.entries(aliasesRaw)) {
      g.require(
        animations[alias] === undefined,
        `${at}.aliases.${alias}`,
        "an alias must not shadow a declared animation",
      );
      g.require(
        animations[target] !== undefined || aliasesRaw[target] !== undefined,
        `${at}.aliases.${alias}`,
        `alias target "${target}" is neither an animation nor another alias`,
      );
    }
    out[id] = { sprites, prop, animations, aliases: aliasesRaw };
  }
  return g.issues.length === before ? out : undefined;
}

function parseArena(raw: Dict, g: Guard): ArenaConfig | undefined {
  const at = "arena";
  const background = asString(raw["background"], `${at}.background`, g);
  const logical = asSize(raw["logical"], `${at}.logical`, g);
  const origin = asString(raw["origin"], `${at}.origin`, g);

  const waterRaw = asRecord(raw["water"], `${at}.water`, g);
  const horizonY =
    waterRaw === undefined ? undefined : asNumber(waterRaw["horizonY"], `${at}.water.horizonY`, g);
  const shoreY =
    waterRaw === undefined ? undefined : asNumber(waterRaw["shoreY"], `${at}.water.shoreY`, g);
  const waterNote =
    waterRaw === undefined ? undefined : asOptionalString(waterRaw["note"], `${at}.water.note`, g);

  const playRaw = asRecord(raw["playBand"], `${at}.playBand`, g);
  const minX =
    playRaw === undefined ? undefined : asNumber(playRaw["minX"], `${at}.playBand.minX`, g);
  const maxX =
    playRaw === undefined ? undefined : asNumber(playRaw["maxX"], `${at}.playBand.maxX`, g);
  const minY =
    playRaw === undefined ? undefined : asNumber(playRaw["minY"], `${at}.playBand.minY`, g);
  const maxY =
    playRaw === undefined ? undefined : asNumber(playRaw["maxY"], `${at}.playBand.maxY`, g);
  const playNote =
    playRaw === undefined ? undefined : asOptionalString(playRaw["note"], `${at}.playBand.note`, g);

  const depthRaw = asRecord(raw["depth"], `${at}.depth`, g);
  const scaleMin =
    depthRaw === undefined ? undefined : asNumber(depthRaw["scaleMin"], `${at}.depth.scaleMin`, g);
  const scaleMax =
    depthRaw === undefined ? undefined : asNumber(depthRaw["scaleMax"], `${at}.depth.scaleMax`, g);
  const tintFar =
    depthRaw === undefined ? undefined : asString(depthRaw["tintFar"], `${at}.depth.tintFar`, g);
  const tintNear =
    depthRaw === undefined ? undefined : asString(depthRaw["tintNear"], `${at}.depth.tintNear`, g);
  const depthNote =
    depthRaw === undefined ? undefined : asOptionalString(depthRaw["note"], `${at}.depth.note`, g);

  const spawnRaw = asRecord(raw["spawn"], `${at}.spawn`, g);
  const seedDefault =
    spawnRaw === undefined
      ? undefined
      : asNumber(spawnRaw["seedDefault"], `${at}.spawn.seedDefault`, g);
  const playerFraction =
    spawnRaw === undefined
      ? undefined
      : asFractionBox(spawnRaw["playerFraction"], `${at}.spawn.playerFraction`, g);
  const enemyFraction =
    spawnRaw === undefined
      ? undefined
      : asFractionBox(spawnRaw["enemyFraction"], `${at}.spawn.enemyFraction`, g);
  const ambientFraction =
    spawnRaw === undefined
      ? undefined
      : asFractionBox(spawnRaw["ambientFraction"], `${at}.spawn.ambientFraction`, g);
  const spawnMinDistance =
    spawnRaw === undefined
      ? undefined
      : asNumber(spawnRaw["spawnMinDistance"], `${at}.spawn.spawnMinDistance`, g);
  const maxAttempts =
    spawnRaw === undefined
      ? undefined
      : asNumber(spawnRaw["maxAttempts"], `${at}.spawn.maxAttempts`, g);
  const spawnNote =
    spawnRaw === undefined ? undefined : asOptionalString(spawnRaw["note"], `${at}.spawn.note`, g);

  const fieldRadius = asNumber(raw["fieldRadius"], `${at}.fieldRadius`, g);
  const timeScaleInside = asNumber(raw["timeScaleInside"], `${at}.timeScaleInside`, g);

  if (
    background === undefined ||
    logical === undefined ||
    origin === undefined ||
    horizonY === undefined ||
    shoreY === undefined ||
    minX === undefined ||
    maxX === undefined ||
    minY === undefined ||
    maxY === undefined ||
    scaleMin === undefined ||
    scaleMax === undefined ||
    tintFar === undefined ||
    tintNear === undefined ||
    seedDefault === undefined ||
    playerFraction === undefined ||
    enemyFraction === undefined ||
    ambientFraction === undefined ||
    spawnMinDistance === undefined ||
    maxAttempts === undefined ||
    fieldRadius === undefined ||
    timeScaleInside === undefined
  ) {
    return undefined;
  }
  g.require(minX <= maxX && minY <= maxY, `${at}.playBand`, "expected min <= max on both axes");
  g.require(fieldRadius > 0, `${at}.fieldRadius`, "expected a positive radius");
  g.require(
    timeScaleInside > 0 && timeScaleInside <= 1,
    `${at}.timeScaleInside`,
    "expected a slowdown factor within (0, 1]",
  );
  return {
    background,
    logical,
    origin,
    water: { horizonY, shoreY, note: waterNote },
    playBand: { minX, maxX, minY, maxY, note: playNote },
    depth: { scaleMin, scaleMax, tintFar, tintNear, note: depthNote },
    spawn: {
      seedDefault,
      playerFraction,
      enemyFraction,
      ambientFraction,
      spawnMinDistance,
      maxAttempts,
      note: spawnNote,
    },
    fieldRadius,
    timeScaleInside,
  };
}

function parseViewport(raw: Dict, g: Guard): ViewportConfig | undefined {
  const at = "viewport";
  const imageRendering = asString(raw["imageRendering"], `${at}.imageRendering`, g);
  const integerScalePreferred = asBoolean(
    raw["integerScalePreferred"],
    `${at}.integerScalePreferred`,
    g,
  );
  const integerScaleMinFill = asNumber(raw["integerScaleMinFill"], `${at}.integerScaleMinFill`, g);
  const select = asString(raw["select"], `${at}.select`, g);

  const presets: ViewportPreset[] = [];
  const seen = new Set<string>();
  const list = asArray(raw["presets"], `${at}.presets`, g);
  if (list !== undefined) {
    const before = g.issues.length;
    if (list.length === 0) g.fail(`${at}.presets`, "expected at least one preset");
    list.forEach((item, i) => {
      const p = `${at}.presets[${String(i)}]`;
      const rawPreset = asRecord(item, p, g);
      if (rawPreset === undefined) {
        return;
      }
      const id = asString(rawPreset["id"], `${p}.id`, g);
      const ratio = asNumber(rawPreset["ratio"], `${p}.ratio`, g);
      const logical = asSize(rawPreset["logical"], `${p}.logical`, g);
      const background = asString(rawPreset["background"], `${p}.background`, g);
      if (id !== undefined) {
        g.require(!seen.has(id), `${p}.id`, `duplicate preset id "${id}"`);
        seen.add(id);
      }
      if (ratio !== undefined) g.require(ratio > 0, `${p}.ratio`, "expected a positive ratio");
      if (
        id === undefined ||
        ratio === undefined ||
        logical === undefined ||
        background === undefined
      ) {
        return;
      }
      presets.push({ id, ratio, logical, background });
    });
    if (g.issues.length !== before) return undefined;
  }

  if (
    imageRendering === undefined ||
    integerScalePreferred === undefined ||
    integerScaleMinFill === undefined ||
    select === undefined
  ) {
    return undefined;
  }
  return {
    imageRendering,
    integerScalePreferred,
    integerScaleMinFill,
    select,
    presets,
    readme: asOptionalString(raw["readme"], `${at}.readme`, g),
  };
}

/**
 * Validate untrusted JSON against the manifest schema.
 *
 * Throws `ManifestError` listing every problem found. Unknown fields are left
 * alone on purpose: a human is allowed to extend the manifest and this guard
 * only protects the fields the game reads.
 */
export function parseManifest(value: unknown): Manifest {
  const g = new Guard();
  const root = asRecord(value, "manifest", g);
  if (root === undefined) throw new ManifestError(g.issues);

  const schemaVersion = asNumber(root["schemaVersion"], "manifest.schemaVersion", g);
  g.require(schemaVersion === 1, "manifest.schemaVersion", "only schemaVersion 1 is supported");

  const sprites: SpriteEntry[] = [];
  const spriteIds = new Set<string>();
  const spriteList = asArray(root["sprites"], "sprites", g);
  if (spriteList !== undefined) {
    spriteList.forEach((item, i) => {
      const at = `sprites[${String(i)}]`;
      const raw = asRecord(item, at, g);
      if (raw === undefined) return;
      const sprite = parseSprite(raw, at, g);
      if (sprite === undefined) return;
      if (spriteIds.has(sprite.id)) g.fail(at, `duplicate sprite id "${sprite.id}"`);
      spriteIds.add(sprite.id);
      sprites.push(sprite);
    });
  }

  const backgrounds: BackgroundEntry[] = [];
  const backgroundIds = new Set<string>();
  const backgroundList = asArray(root["backgrounds"], "backgrounds", g);
  if (backgroundList !== undefined) {
    backgroundList.forEach((item, i) => {
      const at = `backgrounds[${String(i)}]`;
      const raw = asRecord(item, at, g);
      if (raw === undefined) return;
      const background = parseBackground(raw, at, g);
      if (background === undefined) return;
      if (backgroundIds.has(background.id))
        g.fail(at, `duplicate background id "${background.id}"`);
      backgroundIds.add(background.id);
      backgrounds.push(background);
    });
  }

  const proceduralProps: ProceduralProp[] = [];
  const propIds = new Set<string>();
  const propList = asArray(root["proceduralProps"], "proceduralProps", g);
  if (propList !== undefined) {
    propList.forEach((item, i) => {
      const at = `proceduralProps[${String(i)}]`;
      const raw = asRecord(item, at, g);
      if (raw === undefined) return;
      const prop = parseProp(raw, at, g);
      if (prop === undefined) return;
      if (propIds.has(prop.id)) g.fail(at, `duplicate procedural prop id "${prop.id}"`);
      propIds.add(prop.id);
      proceduralProps.push(prop);
    });
  }

  const arenaRaw = asRecord(root["arena"], "arena", g);
  const arena = arenaRaw === undefined ? undefined : parseArena(arenaRaw, g);

  const charactersRaw = asRecord(root["characters"], "characters", g);
  const characters = charactersRaw === undefined ? undefined : parseCharacters(charactersRaw, g);

  const viewportRaw = asRecord(root["viewport"], "viewport", g);
  const viewport = viewportRaw === undefined ? undefined : parseViewport(viewportRaw, g);

  // Cross references. These catch a stale id long before anything is drawn.
  if (arena !== undefined) {
    g.require(
      backgroundIds.has(arena.background),
      "arena.background",
      `unknown background id "${arena.background}"`,
    );
  }
  if (characters !== undefined) {
    for (const [id, character] of Object.entries(characters)) {
      for (const spriteId of character.sprites) {
        g.require(
          spriteIds.has(spriteId),
          `characters.${id}.sprites`,
          `unknown sprite id "${spriteId}"`,
        );
      }
      if (character.prop !== undefined) {
        g.require(
          propIds.has(character.prop),
          `characters.${id}.prop`,
          `unknown procedural prop "${character.prop}"`,
        );
      }
      for (const [name, animation] of Object.entries(character.animations)) {
        animation.keyframes.forEach((keyframe, k) => {
          g.require(
            spriteIds.has(keyframe.sprite),
            `characters.${id}.animations.${name}.keyframes[${String(k)}].sprite`,
            `unknown sprite id "${keyframe.sprite}"`,
          );
        });
      }
    }
  }
  for (const prop of proceduralProps) {
    if (prop.character !== null && characters !== undefined) {
      g.require(
        characters[prop.character] !== undefined,
        `proceduralProps.${prop.id}.character`,
        `unknown character id "${prop.character}"`,
      );
    }
  }
  if (viewport !== undefined) {
    for (const preset of viewport.presets) {
      g.require(
        backgroundIds.has(preset.background),
        `viewport.presets.${preset.id}.background`,
        `unknown background id "${preset.background}"`,
      );
    }
  }
  for (const background of backgrounds) {
    if (background.variantOf !== undefined) {
      g.require(
        backgroundIds.has(background.variantOf),
        `backgrounds.${background.id}.variantOf`,
        `unknown background id "${background.variantOf}"`,
      );
    }
  }

  if (
    spriteList === undefined ||
    backgroundList === undefined ||
    propList === undefined ||
    arena === undefined ||
    characters === undefined ||
    viewport === undefined
  ) {
    throw new ManifestError(g.issues);
  }
  if (g.issues.length > 0) throw new ManifestError(g.issues);

  if (g.issues.length > 0) throw new ManifestError(g.issues);

  const conventions =
    root["conventions"] === undefined
      ? undefined
      : asStringMap(root["conventions"], "conventions", g);
  const readme = asOptionalString(root["readme"], "manifest.readme", g);
  if (g.issues.length > 0) throw new ManifestError(g.issues);

  return {
    schemaVersion: 1,
    sprites,
    backgrounds,
    proceduralProps,
    arena,
    characters,
    viewport,
    conventions,
    readme,
  };
}
