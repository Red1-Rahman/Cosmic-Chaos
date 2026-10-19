// Shared plumbing for the e2e gate. Not a test file itself.
//
// Every spec imports { test, expect } from ./fixtures, never from @playwright/test,
// so the console guard is never bypassed by accident.

import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "./fixtures";

import { parseManifest } from "../../src/assets/manifest-types";
import type { Manifest } from "../../src/assets/manifest-types";
import { createWorld, step } from "../../src/sim/world";
import type { InputState } from "../../src/sim/types";

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
  readonly reactions: number;
}

export interface CosmicSnapshot {
  readonly tick: number;
  readonly seed: number;
  readonly timeMs: number;
  readonly timeScale: number;
  readonly status: string;
  readonly levelId: number;
  readonly fieldRadius: number;
  readonly fieldX: number;
  readonly fieldY: number;
  readonly coresLeft: number;
  readonly pellets: readonly { readonly x: number; readonly y: number }[];
  readonly objectives: readonly {
    readonly id: string;
    readonly count: number;
    readonly target: number;
    readonly done: boolean;
  }[];
  readonly dialogue: { readonly speaker: string; readonly line: string } | null;
  readonly entities: readonly EntitySnapshot[];
}

/**
 * A seed where the snail spawns a short drive away from the player and the orca
 * spawns as far away as the spawn rules allow, and where the opening stretch of
 * open water is actually open: the steering test drives right and then down, so a
 * reef sitting on the spawn point would wedge it. Chosen offline with the real
 * spawner and the real movement model, so a browser test never has to spend ten
 * seconds driving across the arena, and never gets jumped on while it does: the
 * Orca needs several seconds just to close that gap, which is far longer than any
 * assertion in the suite takes.
 */
export const FRIENDLY_SEED: number = (() => {
  const hold = (patch: Partial<InputState>): InputState => ({
    moveX: 0,
    moveY: 0,
    jump: false,
    action: false,
    dodge: false,
    parry: false,
    ...patch,
  });
  let best = 1337;
  let bestOrcaGap = -1;
  for (let seed = 1; seed <= 4000; seed += 1) {
    const world = createWorld(seed);
    const player = world.entities.find((entity) => entity.kind === "player");
    const snail = world.entities.find((entity) => entity.kind === "snail");
    const orca = world.entities.find((entity) => entity.kind === "orca");
    if (player === undefined || snail === undefined || orca === undefined) continue;
    // Far enough that the snail's own drift cannot walk the player into the field
    // before a test has even looked, near enough that driving into it is quick.
    const snailGap = Math.hypot(snail.x - player.x, snail.y - player.y);
    if (snailGap < 280 || snailGap > 420) continue;
    const orcaGap = Math.hypot(orca.x - player.x, orca.y - player.y);
    if (orcaGap <= bestOrcaGap) continue;
    // Replay the exact opening the steering test performs: right, back left, then
    // down and up. Reefs are solid, so a seed with one on that line would wedge the
    // rider and the test would time out rather than fail.
    for (let i = 0; i < 30; i += 1) step(world, hold({ moveX: 1 }), 1 / 60);
    for (let i = 0; i < 45; i += 1) step(world, hold({ moveX: -1 }), 1 / 60);
    const beforeDown = { x: player.x, y: player.y };
    for (let i = 0; i < 45; i += 1) step(world, hold({ moveY: 1 }), 1 / 60);
    if (player.y < beforeDown.y + 40) continue;
    if (Math.abs(player.x - beforeDown.x) > 45) continue;
    const beforeUp = player.y;
    for (let i = 0; i < 45; i += 1) step(world, hold({ moveY: -1 }), 1 / 60);
    if (player.y > beforeUp - 20) continue;
    bestOrcaGap = orcaGap;
    best = seed;
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
  options: { seed?: number; test?: boolean; tutorial?: boolean } = {},
): Promise<void> {
  const params = new URLSearchParams();
  params.set("test", options.test === false ? "0" : "1");
  if (options.seed !== undefined) params.set("seed", String(options.seed));
  // `?tutorial=1` forces the staged onboarding on even under the test hooks, so a spec
  // can drive it; leaving it out keeps the hooks' usual full-roster, tutorial-off run.
  if (options.tutorial !== undefined) params.set("tutorial", options.tutorial ? "1" : "0");
  await page.goto(`/?${params.toString()}`);
  await page.waitForFunction(() => window.__cosmic !== undefined);
}

/** The live snapshot. Always a fresh object, so it can never be stale. */
export async function cosmic(page: Page): Promise<CosmicSnapshot> {
  return page.evaluate(() => {
    const snapshot = window.__cosmic;
    if (snapshot === undefined) throw new Error("window.__cosmic is not installed");
    // A JSON round trip drops the frozen snapshot and gives node plain data.
    return JSON.parse(JSON.stringify(snapshot)) as CosmicSnapshot;
  });
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

/**
 * Play: the home menu launches level one straight into the water, so the sim starts
 * ticking as soon as the Play button is pressed.
 */
export async function startWithKeyboard(page: Page): Promise<void> {
  await playThroughHome(page);
  await expect.poll(async () => (await cosmic(page)).tick, { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(page.locator(".cc-screen--home")).not.toHaveClass(/cc-screen-active/);
}

/** Press Play on the home menu. */
export async function playThroughHome(page: Page): Promise<void> {
  const play = page.getByRole("button", { name: "Play", exact: true });
  await play.focus();
  await page.keyboard.press("Enter");
  try {
    await expect(page.locator(".cc-screen--home")).not.toHaveClass(/cc-screen-active/, {
      timeout: 3_000,
    });
  } catch {
    await page.keyboard.press("Space");
    await expect(page.locator(".cc-screen--home")).not.toHaveClass(/cc-screen-active/, {
      timeout: 10_000,
    });
  }
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
    if (snapshot === undefined) throw new Error("window.__cosmic is not installed");
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
      const snapshot = window.__cosmic;
      if (snapshot === undefined) throw new Error("window.__cosmic is not installed");
      seen.add(snapshot.tick);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    }
    return [...seen];
  }, frames);
}

/**
 * Every distinct behaviour state an entity of a kind passes through over a run of
 * animation frames. A lunge lasts a few frames, so polling from node can easily miss
 * one; sampling inside the page cannot.
 */
export async function statesOverFrames(page: Page, kind: string, frames = 600): Promise<string[]> {
  return page.evaluate(
    async ({ wanted, count }) => {
      const seen = new Set<string>();
      for (let i = 0; i < count; i += 1) {
        const snapshot = window.__cosmic;
        if (snapshot === undefined) throw new Error("window.__cosmic is not installed");
        const entity = snapshot.entities.find((entry) => entry.kind === wanted);
        if (entity !== undefined) seen.add(entity.state);
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }
      return [...seen];
    },
    { wanted: kind, count: frames },
  );
}

/**
 * Waits a fixed number of animation frames. Pacing a drive on frames rather than on
 * a timer or on a tick value keeps it honest and, unlike a tick modulo, it cannot
 * deadlock when the world has stopped stepping.
 */
export async function waitFrames(page: Page, frames = 4): Promise<void> {
  await page.evaluate(async (count) => {
    for (let i = 0; i < count; i += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    }
  }, frames);
}

/**
 * Steers toward a point in arena coordinates until `done` says the player has arrived
 * or the run is over. Keys are re-chosen every pass, so the drive reacts to where the
 * player actually is rather than to a blind timer.
 */
export async function driveToward(
  page: Page,
  target: () => Promise<{ x: number; y: number }>,
  done: (player: EntitySnapshot) => boolean,
  options: { tolerance?: number; timeout?: number } = {},
): Promise<EntitySnapshot> {
  const tolerance = options.tolerance ?? 40;
  const deadline = Date.now() + (options.timeout ?? 20_000);
  await releaseAll(page);
  let lastGap = Number.POSITIVE_INFINITY;
  let stalledSince = -1;
  let nudgeLeft = 0;
  let nudgeKey: KeyName = "up";
  while (Date.now() < deadline) {
    const snapshot = await cosmic(page);
    const player = playerOf(snapshot);
    // A run that has ended will never move again, so stop instead of driving forever.
    if (snapshot.status !== "playing" || done(player)) {
      await releaseAll(page);
      return player;
    }
    const goal = await target();
    const keys: KeyName[] = [];
    if (goal.x - player.x > tolerance) keys.push("right");
    else if (goal.x - player.x < -tolerance) keys.push("left");
    if (goal.y - player.y > tolerance) keys.push("down");
    else if (goal.y - player.y < -tolerance) keys.push("up");
    // Reefs are solid. If the rider has stopped closing on the goal it is wedged
    // against one, so it adds a short sideways shove on top of the goal keys until
    // it slides clear. The stall is measured in simulated ticks rather than in
    // frames, so a machine running four browsers at once decides the same way.
    const gap = Math.hypot(goal.x - player.x, goal.y - player.y);
    if (gap > lastGap - 1) {
      if (stalledSince < 0) stalledSince = snapshot.tick;
    } else {
      stalledSince = -1;
    }
    lastGap = gap;
    if (stalledSince >= 0 && snapshot.tick - stalledSince > 20 && nudgeLeft <= 0) {
      stalledSince = snapshot.tick;
      nudgeLeft = 14;
      nudgeKey = goal.y >= player.y ? "up" : "down";
    }
    if (nudgeLeft > 0) {
      if (!keys.includes(nudgeKey)) keys.push(nudgeKey);
      nudgeLeft -= 1;
    }
    await holdKeys(page, keys);
    await waitFrames(page);
  }
  await releaseAll(page);
  return playerOf(await cosmic(page));
}

/**
 * How far the fastest thing in the arena travels in one fixed step, in arena pixels.
 * A comparison taken a few ticks into a fresh run has to allow for exactly this much
 * movement per tick, or it would be asserting that time had stopped.
 */
export const FASTEST_PX_PER_TICK = 12;

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
