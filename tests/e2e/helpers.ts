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
// Patch the prototype, never a storage instance: in Firefox and WebKit an
// assignment like localStorage.setItem = fn is itself a named-property storage
// write, which plants the very keys this test counts and leaves the wrapper
// installed nowhere. The prototype is a plain object, so it is safe everywhere.
const storageProto = window.Storage && window.Storage.prototype;
if (storageProto) {
  for (const method of ["setItem", "removeItem", "clear"]) {
    const original = storageProto[method];
    storageProto[method] = function (...args) {
      const kind = this === window.localStorage ? "localStorage" : "sessionStorage";
      record(kind + "." + method, String(args[0]));
      return original.apply(this, args);
    };
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

/**
 * Deal the same opening again after the Warden ends a run mid-read. The
 * defeat dialog restarts the very same level and seed, so a run that ended
 * under a measurement costs only the time it took, not the measurement.
 */
export async function restartRun(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(async () => (await cosmic(page)).status, { timeout: 10_000 }).toBe("playing");
  // A fresh run ticks from zero; wait for the world to actually step rather
  // than trusting the status alone.
  await expect.poll(async () => (await cosmic(page)).tick, { timeout: 10_000 }).toBeGreaterThan(0);
}

/**
 * Fast reflex, page-side. A dash connects within a few hundred milliseconds of
 * its wind-up beginning, and the node loop's cadence is too slow for that when
 * a worker is busy, so the ride is protected where the clock actually lives.
 * The page watches the live snapshot with requestAnimationFrame and presses the
 * dodge once per wind-up, off the simulation's own clock: the wind-up is a
 * fixed 420ms, the dash covers at most another 260ms, so a burst fired 270
 * sim-ms into the wind-up carries 420ms of invulnerability across the whole
 * contact range of every possible lunge. No reaction speed is needed — only
 * that the wind-up is seen, which one frame of latency allows. If a wind-up
 * was never seen (watcher joined mid-wind-up), the committed dash itself
 * triggers the press.
 *
 * The burst rides the keys the ride is holding when it fires, so the ride
 * steers the dodge where it wants to go (see rideAndWatch). The key is held
 * for several frames before the keyup: the input source is a held-key set the
 * game polls once per frame, so a press and a release inside one JavaScript
 * turn would never be seen at all. Each press is mirrored onto
 * `window.__reflexPresses` for diagnostics. The reflex lives for the page's
 * lifetime, and the context closes with the test.
 */
export async function installWardenReflex(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__reflexPresses = { count: 0, marks: "" };
    let code: string | null = null;
    let frames = 0;
    /** Sim time of the wind-up's first sighting; stale from a restarted world. */
    let born = -1;
    /** Sim time of the last dodge, so one wind-up presses once. */
    let lastDodge = -1e9;
    const reflex = (): void => {
      const snapshot = window.__cosmic;
      if (snapshot !== undefined) {
        if (code !== null) {
          frames += 1;
          if (frames >= 6) {
            window.dispatchEvent(new KeyboardEvent("keyup", { code }));
            code = null;
          }
        } else {
          const player = snapshot.entities.find((entity) => entity.kind === "player");
          const orca = snapshot.entities.find((entity) => entity.kind === "orca");
          if (orca !== undefined && player !== undefined && snapshot.status === "playing") {
            if (born > snapshot.timeMs) born = -1; // a restarted world: clocks went back
            let fire = "";
            if (orca.state === "telegraph") {
              if (born < 0) born = snapshot.timeMs;
              if (snapshot.timeMs - born >= 270 && snapshot.timeMs - lastDodge > 900) {
                fire = `t${born.toFixed(0)}`;
              }
            } else {
              born = -1;
              if (orca.state === "lunge" && snapshot.timeMs - lastDodge > 900) {
                fire = `l${snapshot.timeMs.toFixed(0)}`;
              }
            }
            if (fire !== "") {
              lastDodge = snapshot.timeMs;
              code = "KeyK";
              frames = 0;
              window.dispatchEvent(new KeyboardEvent("keydown", { code }));
              window.__reflexPresses.count += 1;
              window.__reflexPresses.marks += `@${fire} `;
            }
          } else {
            born = -1;
          }
        }
      }
      window.requestAnimationFrame(reflex);
    };
    window.requestAnimationFrame(reflex);
  });
}

declare global {
  interface Window {
    /** Diagnostic mirror of the warden reflex presses. */
    __reflexPresses: { count: number; marks: string };
    /** The in-page field phase driver's live state, for node-side polls. */
    __fieldWatch: {
      aim: "centre" | "beyond";
      enterOk: boolean;
      leaveOk: boolean;
      phase: string;
    };
  }
}

export interface FieldWatchOptions {
  /**
   * "invariant" reads the whole lore invariant of the time field on one sample;
   * "release" reads the enter-then-leave phases of the same field.
   */
  profile: "invariant" | "release";
  /** The time scale stamped on anything inside the field. */
  insideScale: number;
  /** How far past the field centre the leave phase steers, in field radii. */
  leave: number;
}

/**
 * The field phases, driven and read in-place. A node-side drive loop costs one
 * to several waits per pass, and on a busy machine those waits are rendered
 * frames apart — the sim runs at a fraction of wall speed while rAF only lands
 * a few times a second, so a node loop is glacial exactly when the world moves
 * fastest. This module lives inside the page instead:
 *
 * - every rendered frame it steers toward the aim (field centre by default,
 *   a point past the rim once the node side flips the aim), using the same
 *   goal keys, tick-measured stall detection and sideways shove the node
 *   driver uses, so reefs stay real obstacles rather than walls;
 * - it holds the invariant the phase needs on the very frames that satisfy
 *   it, latching the verdict so a fast rim crossing can never be missed by a
 *   poll; the latch is honest — it became true because a whole sample agreed;
 * - it does not touch the Warden: the reflex (installWardenReflex) handles
 *   that, riding the move keys this module holds.
 *
 * Synthetic key events reach the input source through the same held-key set a
 * real keyboard does, and the context closes with the test.
 */
export async function installFieldWatch(page: Page, options: FieldWatchOptions): Promise<void> {
  await page.evaluate((cfg) => {
    const tolerance = 40;
    const state: Window["__fieldWatch"] = (window.__fieldWatch = {
      aim: "centre",
      enterOk: false,
      leaveOk: false,
      phase: "boot",
    });
    let held: string[] = [];
    let lastGap = Number.POSITIVE_INFINITY;
    let stalledSince = -1;
    let nudgeLeft = 0;
    let nudgeKey = "KeyW";
    let trail = "";
    let lastLabel = "";
    const note = (label: string, okNow: boolean): void => {
      if (label !== lastLabel) {
        trail = trail === "" ? label : `${trail}→${label}`;
        lastLabel = label;
      }
      state.phase = okNow ? "ok" : trail;
    };
    const settle = (keys: string[]): void => {
      const wanted = new Set(keys);
      for (const code of held) {
        if (!wanted.has(code)) window.dispatchEvent(new KeyboardEvent("keyup", { code }));
      }
      for (const code of keys) {
        if (!held.includes(code)) window.dispatchEvent(new KeyboardEvent("keydown", { code }));
      }
      held = [...keys];
    };
    const watch = (): void => {
      const snapshot = window.__cosmic;
      if (snapshot === undefined) {
        window.requestAnimationFrame(watch);
        return;
      }
      const player = snapshot.entities.find((entity) => entity.kind === "player");
      if (player === undefined || snapshot.status !== "playing") {
        settle([]);
        window.requestAnimationFrame(watch);
        return;
      }
      if (cfg.profile === "invariant") {
        const scaledIn =
          Math.abs(player.timeScale - cfg.insideScale) <= 1e-5 &&
          Math.abs(snapshot.timeScale - cfg.insideScale) <= 1e-5;
        let othersOk = true;
        let outsideCount = 0;
        for (const entity of snapshot.entities) {
          const expected = entity.inTimeField ? cfg.insideScale : 1;
          if (Math.abs(entity.timeScale - expected) > 1e-5) othersOk = false;
          if (!entity.inTimeField) outsideCount += 1;
        }
        const okNow = player.inTimeField && scaledIn && othersOk && outsideCount >= 1;
        state.enterOk = state.enterOk || okNow;
        note(
          !player.inTimeField
            ? "outside"
            : !scaledIn
              ? "entering"
              : !othersOk
                ? "crossing"
                : outsideCount === 0
                  ? "nobody-outside"
                  : "in-settled",
          okNow,
        );
      } else {
        const enterHold =
          player.inTimeField && Math.abs(player.timeScale - cfg.insideScale) <= 1e-5;
        state.enterOk = state.enterOk || enterHold;
        const leaveHold =
          !player.inTimeField &&
          Math.abs(player.timeScale - 1) <= 1e-5 &&
          Math.abs(snapshot.timeScale - 1) <= 1e-5;
        state.leaveOk = state.leaveOk || leaveHold;
        note(
          player.inTimeField
            ? enterHold
              ? "in-settled"
              : "entering"
            : Math.abs(player.timeScale - 1) > 1e-5
              ? "still-slow"
              : leaveHold
                ? "out-settled"
                : "readout",
          state.leaveOk,
        );
      }
      // Steer for the aim point with the same rules as the node driver.
      const goal =
        state.aim === "beyond"
          ? { x: snapshot.fieldX + snapshot.fieldRadius * cfg.leave, y: snapshot.fieldY }
          : { x: snapshot.fieldX, y: snapshot.fieldY };
      const keys: string[] = [];
      if (goal.x - player.x > tolerance) keys.push("KeyD");
      else if (goal.x - player.x < -tolerance) keys.push("KeyA");
      if (goal.y - player.y > tolerance) keys.push("KeyS");
      else if (goal.y - player.y < -tolerance) keys.push("KeyW");
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
        nudgeKey = goal.y >= player.y ? "KeyS" : "KeyW";
      }
      if (nudgeLeft > 0) {
        if (!keys.includes(nudgeKey)) keys.push(nudgeKey);
        nudgeLeft -= 1;
      }
      settle(keys);
      window.requestAnimationFrame(watch);
    };
    window.requestAnimationFrame(watch);
  }, options);
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
 * one; sampling inside the page cannot. When `until` names the states a test needs,
 * the run stops the moment it holds all of them, so a slow frame rate spends only
 * the frames the cycle actually took and never a budget it no longer needs; the
 * `frames` cap still bounds a run that never gets there.
 */
export async function statesOverFrames(
  page: Page,
  kind: string,
  frames = 600,
  until: string[] = [],
): Promise<string[]> {
  return page.evaluate(
    async ({ wanted, count, stopWhen }) => {
      const seen = new Set<string>();
      for (let i = 0; i < count; i += 1) {
        const snapshot = window.__cosmic;
        if (snapshot === undefined) throw new Error("window.__cosmic is not installed");
        const entity = snapshot.entities.find((entry) => entry.kind === wanted);
        if (entity !== undefined) seen.add(entity.state);
        if (stopWhen.length > 0 && stopWhen.every((state) => seen.has(state))) {
          return [...seen];
        }
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }
      return [...seen];
    },
    { wanted: kind, count: frames, stopWhen: until },
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
 * Steers toward a point in arena coordinates until `done` says the phase has
 * landed, or the run is over. Keys are re-chosen every pass, so the drive reacts
 * to where the player actually is rather than to a blind timer. With
 * `restartOnOver`, a run that ended under the phase does not stop the drive:
 * the defeat dialog deals the very same level and seed again and the drive
 * simply resumes from it, so a Warden mauling mid-read costs a ride, not the
 * read.
 */
export async function driveToward(
  page: Page,
  target: () => Promise<{ x: number; y: number }>,
  done: (player: EntitySnapshot, snapshot: CosmicSnapshot) => boolean | Promise<boolean>,
  options: { tolerance?: number; timeout?: number; restartOnOver?: boolean } = {},
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
    if (snapshot.status !== "playing") {
      if (options.restartOnOver ?? false) {
        // A run that has ended will never move again, and a defeated world
        // answers every read the same way forever: nothing moves. Deal the
        // same opening again and keep driving.
        await restartRun(page);
        continue;
      }
      // Default behaviour: a run over means whatever this drive wanted cannot
      // come true here; report and let the caller decide.
      await releaseAll(page);
      return player;
    }
    if (await Promise.resolve(done(player, snapshot))) {
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
      // The shove slides the rider clear of the wedging reef on the band's wide
      // axis, toward the goal's side of the water: a rider pinned to a band
      // edge is nudged back into open water, where a shove into the edge could
      // never clear anything.
      nudgeKey = goal.y >= player.y ? "down" : "up";
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
