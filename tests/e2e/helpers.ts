// Shared plumbing for the e2e gate. Not a test file itself.
//
// Every spec imports { test, expect } from ./fixtures, never from @playwright/test,
// so the console guard is never bypassed by accident.

import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseManifest } from "../../src/assets/manifest-types";
import type { Manifest } from "../../src/assets/manifest-types";
import { createWorld } from "../../src/sim/world";

const root = fileURLToPath(new URL("../../", import.meta.url));

/** The manifest as it ships, read once per worker. */
export const manifest: Manifest = parseManifest(
  JSON.parse(readFileSync(join(root, "public", "assets", "assets.json"), "utf8")) as unknown,
);

/** The four gameplay keys, in the physical layout the keyboard source reads. */
export const KEYS = {
  up: "KeyW",
  down: "KeyS",
  left: "KeyA",
  right: "KeyD",
} as const;

export type KeyName = keyof typeof KEYS;

/** What window.__cosmic exposes, mirrored here so the spec reads as plain data. */
export interface EntitySnapshot {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly facing: number;
  readonly hp: number;
  readonly state: string;
  readonly anim: string;
  readonly timeScale: number;
  readonly inTimeField: boolean;
}

export interface CosmicSnapshot {
  readonly tick: number;
  readonly seed: number;
  readonly timeMs: number;
  readonly timeScale: number;
  readonly status: string;
  readonly fieldRadius: number;
  readonly fieldX: number;
  readonly fieldY: number;
  readonly entities: readonly EntitySnapshot[];
}

/**
 * A seed where the snail spawns close to the player and the orca spawns far away.
 * Chosen offline with the real spawner so a browser test never has to spend ten
 * seconds driving across the arena, and never gets jumped on while it does.
 */
export const FRIENDLY_SEED: number = (() => {
  let best = 1337;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let seed = 1; seed <= 4000; seed += 1) {
    const world = createWorld(seed);
    const player = world.entities.find((entity) => entity.kind === "player");
    const snail = world.entities.find((entity) => entity.kind === "snail");
    const orca = world.entities.find((entity) => entity.kind === "orca");
    if (player === undefined || snail === undefined || orca === undefined) continue;
    const orcaGap = Math.hypot(orca.x - player.x, orca.y - player.y);
    if (orcaGap < 420) continue;
    const snailGap = Math.hypot(snail.x - player.x, snail.y - player.y);
    if (snailGap < bestGap) {
      bestGap = snailGap;
      best = seed;
    }
  }
  return best;
})();

/** Records every storage write the page attempts, before any game code runs. */
export const STORAGE_SPY = `
window.__storageWrites = [];
const record = (kind, detail) => { window.__storageWrites.push(kind + ":" + detail); };
for (const name of ["localStorage", "sessionStorage"]) {
  const store = window[name];
  for (const method of ["setItem", "removeItem", "clear"]) {
    const original = store[method].bind(store);
    store[method] = (...args) => { record(name + "." + method, String(args[0])); return original(...args); };
  }
}
const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
if (cookieDescriptor && cookieDescriptor.set) {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: cookieDescriptor.get,
    set: (value) => { record("document.cookie", String(value)); return cookieDescriptor.set.call(document, value); },
  });
}
if (window.indexedDB && typeof window.indexedDB.open === "function") {
  const open = window.indexedDB.open.bind(window.indexedDB);
  window.indexedDB.open = (...args) => { record("indexedDB.open", String(args[0])); return open(...args); };
}
`;

/** Shape of the array the storage spy fills in. */
declare global {
  interface Window {
    __storageWrites?: string[];
  }
}

/** Installs the storage spy. Must run before the first navigation. */
export async function installStorageSpy(page: Page): Promise<void> {
  await page.addInitScript(STORAGE_SPY);
}

/** Load the game with the test hooks installed. */
export async function openGame(
  page: Page,
  options: { seed?: number; test?: boolean } = {},
): Promise<void> {
  const params = new URLSearchParams();
  params.set("test", options.test === false ? "0" : "1");
  if (options.seed !== undefined) params.set("seed", String(options.seed));
  await page.goto(`/?${params.toString()}`);
  await page.waitForFunction(() => typeof window.__cosmic === "object" && window.__cosmic !== null);
}

/** The live snapshot. Always a fresh object, so it can never be stale. */
export async function cosmic(page: Page): Promise<CosmicSnapshot> {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__cosmic)) as CosmicSnapshot);
}

export function playerOf(snapshot: CosmicSnapshot): EntitySnapshot {
  const player = snapshot.entities.find((entity) => entity.kind === "player");
  if (player === undefined) throw new Error("no player in the snapshot");
  return player;
}

export function ofKind(snapshot: CosmicSnapshot, kind: string): EntitySnapshot[] {
  return snapshot.entities.filter((entity) => entity.kind === kind);
}

/** Distance between the orca and the player, in arena pixels. */
export function orcaGap(snapshot: CosmicSnapshot): number {
  const orca = ofKind(snapshot, "orca")[0];
  if (orca === undefined) throw new Error("no orca in the snapshot");
  const player = playerOf(snapshot);
  return Math.hypot(orca.x - player.x, orca.y - player.y);
}

/** Press Start on the title screen with the keyboard and wait for the sim to run. */
export async function startWithKeyboard(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start the run" }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator("[data-cc-overlay='screens']")).toBeVisible();
  await expect.poll(async () => (await cosmic(page)).tick, { timeout: 15_000 }).toBeGreaterThan(0);
}

/**
 * Holds exactly the named keys down, releasing whatever was held before. The keyboard
 * source reads a set of physical codes, so this is all a player ever produces.
 */
const heldKeys = new WeakMap<Page, Set<KeyName>>();

export async function holdKeys(page: Page, desired: readonly KeyName[]): Promise<void> {
  const wanted = new Set(desired);
  const held = heldKeys.get(page) ?? new Set<KeyName>();
  for (const key of [...held]) {
    if (wanted.has(key)) continue;
    await page.keyboard.up(KEYS[key]);
    held.delete(key);
  }
  for (const key of wanted) {
    if (held.has(key)) continue;
    await page.keyboard.down(KEYS[key]);
    held.add(key);
  }
  heldKeys.set(page, held);
}

export async function releaseAll(page: Page): Promise<void> {
  await holdKeys(page, []);
}

/** The behaviour state of the first entity of a kind, read straight out of the hook. */
export async function stateOf(page: Page, kind: string): Promise<string> {
  return page.evaluate((wanted) => {
    const snapshot = window.__cosmic;
    return snapshot.entities.find((entity) => entity.kind === wanted)?.state ?? "";
  }, kind);
}

/**
 * Every distinct tick value observed over a run of animation frames. Used to prove a
 * negative: a paused or dead world must report the same tick every frame.
 */
export async function ticksOverFrames(page: Page, frames = 20): Promise<number[]> {
  return page.evaluate(async (count) => {
    const seen = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      seen.add(window.__cosmic.tick);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return [...seen];
  }, frames);
}

/**
 * Steers toward a point in arena coordinates until `done` says the player is close
 * enough or the field has been entered. Keys are re-chosen every pass, so the drive
 * reacts to where the player actually is rather than to a blind timer.
 */
export async function driveToward(
  page: Page,
  target: () => Promise<{ x: number; y: number }>,
  done: (player: EntitySnapshot) => boolean,
  options: { tolerance?: number; timeout?: number } = {},
): Promise<EntitySnapshot> {
  const tolerance = options.tolerance ?? 40;
  const deadline = Date.now() + (options.timeout ?? 30_000);
  let last = playerOf(await cosmic(page));
  await releaseAll(page);
  while (Date.now() < deadline) {
    const snapshot = await cosmic(page);
    const player = playerOf(snapshot);
    last = player;
    if (done(player)) break;
    const goal = await target();
    const keys: KeyName[] = [];
    if (goal.x - player.x > tolerance) keys.push("right");
    else if (goal.x - player.x < -tolerance) keys.push("left");
    if (goal.y - player.y > tolerance) keys.push("down");
    else if (goal.y - player.y < -tolerance) keys.push("up");
    await holdKeys(page, keys);
    await page.waitForFunction(() => window.__cosmic.tick % 4 === 0);
  }
  await releaseAll(page);
  last = playerOf(await cosmic(page));
  return last;
}

/** The preset id the HUD reports for the layout currently applied. */
export async function reportedPreset(page: Page): Promise<string> {
  return (await page.locator("[data-cc-preset]").innerText()).trim();
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The canvas rectangle in CSS pixels, as the browser laid it out. */
export async function canvasBox(page: Page): Promise<Box> {
  const box = await page.locator("#stage").boundingBox();
  if (box === null) throw new Error("the arena canvas has no layout box");
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * A window with exactly the aspect of a preset, never taller than the screen, so a
 * 20:9 or 9:20 preset still produces a sane browser viewport.
 */
export function windowForRatio(ratio: number): ViewportSize {
  const maxWidth = 1600;
  const maxHeight = 900;
  let width = maxWidth;
  let height = Math.round(width / ratio);
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height * ratio);
  }
  return { width, height };
}