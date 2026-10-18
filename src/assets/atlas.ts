// Sprite id to decoded image lookup, plus the per sprite geometry the render
// layer needs: frame grid, tile size, anchor and renderScale.
//
// Every sprite today is a single frame. `frameRect` already honours
// `frame.grid` and `frame.tile` from the manifest so a future sprite sheet only
// needs a manifest change, not a code change.
//
// Nothing here draws. Mirroring, rotation and tinting belong to src/render/ and
// must never write pixels back into these images.

import type { DecodedImage } from "./loader";
import type { FrameGrid, Manifest, Size, SpriteEntry, Vec2 } from "./manifest-types";

export interface AtlasRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface AtlasEntry {
  readonly id: string;
  readonly bitmap: CanvasImageSource;
  /** Intrinsic pixel size of the decoded file. */
  readonly sourceSize: Size;
  readonly grid: FrameGrid;
  readonly tile: Size;
  /** grid.cols * grid.rows. One for every sprite in the manifest today. */
  readonly frameCount: number;
  readonly anchor: Vec2;
  readonly renderScale: number;
  readonly facing: string;
  /** Arena pixels occupied by one frame: tile size multiplied by renderScale. */
  readonly drawSize: Size;
}

/** Lookup table from sprite id to decoded image and geometry. */
export class Atlas {
  readonly entries: ReadonlyMap<string, AtlasEntry>;

  private constructor(entries: ReadonlyMap<string, AtlasEntry>) {
    this.entries = entries;
  }

  /** Build an atlas. Missing images are skipped; use `missing()` to inspect. */
  static create(manifest: Manifest, images: ReadonlyMap<string, DecodedImage>): Atlas {
    const entries = new Map<string, AtlasEntry>();
    for (const sprite of manifest.sprites) {
      const image = images.get(sprite.id);
      if (image === undefined) continue;
      entries.set(sprite.id, buildEntry(sprite, image));
    }
    return new Atlas(entries);
  }

  has(spriteId: string): boolean {
    return this.entries.has(spriteId);
  }

  /** Throws `AtlasError` when the sprite id is unknown or was never loaded. */
  get(spriteId: string): AtlasEntry {
    const entry = this.entries.get(spriteId);
    if (entry === undefined) {
      throw new AtlasError(spriteId, `no loaded sprite for id "${spriteId}"`);
    }
    return entry;
  }

  /** Ids in manifest order, which keeps iteration deterministic. */
  ids(): string[] {
    return [...this.entries.keys()];
  }

  /** Sprite ids in the manifest that have no decoded image. */
  missing(manifest: Manifest): string[] {
    return manifest.sprites
      .filter((sprite) => !this.entries.has(sprite.id))
      .map((sprite) => sprite.id);
  }
}

export class AtlasError extends Error {
  readonly spriteId: string;

  constructor(spriteId: string, message: string) {
    super(message);
    this.name = "AtlasError";
    this.spriteId = spriteId;
  }
}

export function isAtlasError(value: unknown): value is AtlasError {
  return value instanceof AtlasError;
}

function buildEntry(sprite: SpriteEntry, image: DecodedImage): AtlasEntry {
  const sourceSize: Size = { w: image.width, h: image.height };
  const grid: FrameGrid = sprite.frame?.grid ?? { cols: 1, rows: 1 };
  const tile: Size = sprite.frame?.tile ?? sourceSize;
  return {
    id: sprite.id,
    bitmap: image.source,
    sourceSize,
    grid,
    tile,
    frameCount: grid.cols * grid.rows,
    anchor: sprite.anchor,
    renderScale: sprite.renderScale,
    facing: sprite.facing ?? "right",
    drawSize: { w: tile.w * sprite.renderScale, h: tile.h * sprite.renderScale },
  };
}

/**
 * Source rectangle of frame `index` inside the sprite's image.
 *
 * Frames are laid out row major starting at the top left. An out of range
 * index clamps to the last frame so a bad clock cannot draw garbage.
 */
export function frameRect(entry: AtlasEntry, index = 0): AtlasRect {
  const count = entry.frameCount;
  const safeIndex = !Number.isFinite(index)
    ? 0
    : Math.min(Math.max(Math.trunc(index), 0), count - 1);
  const col = safeIndex % entry.grid.cols;
  const row = Math.floor(safeIndex / entry.grid.cols);
  return { x: col * entry.tile.w, y: row * entry.tile.h, w: entry.tile.w, h: entry.tile.h };
}

/** Anchor point in arena pixels, relative to the frame's top left corner. */
export function anchorPoint(entry: AtlasEntry, frame: AtlasRect = frameRect(entry, 0)): Vec2 {
  return { x: frame.x + frame.w * entry.anchor.x, y: frame.y + frame.h * entry.anchor.y };
}
