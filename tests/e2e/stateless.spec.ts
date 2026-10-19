// Statelessness, checked as an invariant of a played session rather than of the code.
//
// src/ never touches storage, but the milestone rule is that restarting resets
// everything, so the proof has to come from a browser that has actually run the game:
// after a full session including a restart, every store must still be empty and no
// write may ever have been attempted.

import { expect, test } from "./fixtures";
import {
  FRIENDLY_SEED,
  cosmic,
  driveToward,
  holdKeys,
  installStorageSpy,
  openGame,
  playerOf,
  releaseAll,
  startWithKeyboard,
} from "./helpers";

test.describe("the game is stateless", () => {
  test("writes nothing to any storage during a full session", async ({ page, context }) => {
    await installStorageSpy(page);
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);

    // Play: move, hop, fire, pause, resume, restart.
    await holdKeys(page, ["right", "down"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).x, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await page.keyboard.press("Space");
    await page.keyboard.down("KeyJ");
    await page.keyboard.up("KeyJ");
    await releaseAll(page);

    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.locator(".cc-screen--pause")).toHaveClass(/cc-screen-active/);
    await page.getByRole("button", { name: "Restart" }).click();
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 15_000 }).toBeGreaterThan(0);

    const writes = await page.evaluate(() => window.__storageWrites ?? []);
    expect(writes).toEqual([]);

    const stores = await page.evaluate(() => ({
      local: window.localStorage.length,
      session: window.sessionStorage.length,
      cookie: document.cookie,
    }));
    expect(stores.local).toBe(0);
    expect(stores.session).toBe(0);
    expect(stores.cookie).toBe("");

    const databases = await page.evaluate(async () => {
      if (typeof indexedDB.databases !== "function") return [];
      return (await indexedDB.databases()).map((entry) => entry.name ?? "");
    });
    expect(databases).toEqual([]);
    expect(await context.cookies()).toEqual([]);
  });

  test("a reload deals the same opening again, because nothing was kept", async ({ page }) => {
    await installStorageSpy(page);
    await openGame(page, { seed: FRIENDLY_SEED });
    const first = await cosmic(page);
    expect(first.tick).toBe(0);

    await startWithKeyboard(page);
    await holdKeys(page, ["right"]);
    await expect
      .poll(async () => playerOf(await cosmic(page)).x, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await releaseAll(page);
    expect((await cosmic(page)).tick).toBeGreaterThan(0);

    await page.reload();
    await page.waitForFunction(() => window.__cosmic !== undefined);
    const reloaded = await cosmic(page);
    expect(reloaded.tick).toBe(0);
    expect(reloaded.entities.map((entity) => [entity.id, entity.x, entity.y, entity.hp])).toEqual(
      first.entities.map((entity) => [entity.id, entity.x, entity.y, entity.hp]),
    );
    expect(await page.evaluate(() => window.__storageWrites ?? [])).toEqual([]);
  });

  test("holds no state across a restart beyond the seed", async ({ page }) => {
    await installStorageSpy(page);
    await openGame(page, { seed: FRIENDLY_SEED });
    const opening = await cosmic(page);

    await startWithKeyboard(page);
    await driveToward(
      page,
      async () => {
        const snapshot = await cosmic(page);
        return { x: snapshot.fieldX, y: snapshot.fieldY };
      },
      (player) => player.inTimeField,
      { timeout: 20_000 },
    );

    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Restart" }).click();
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 15_000 }).toBeGreaterThan(0);

    // Everything the run changed is gone: the seed is the only thing that carried
    // over, and the arena is the opening arena again down to a frame of drift.
    const after = await cosmic(page);
    expect(after.seed).toBe(opening.seed);
    expect(after.timeScale).toBe(1);
    expect(playerOf(after).timeScale).toBe(1);
    expect(playerOf(after).hp).toBe(1);
    expect(after.entities.map((entity) => entity.id)).toEqual(
      opening.entities.map((entity) => entity.id),
    );
    for (const entity of after.entities) {
      const before = opening.entities.find((other) => other.id === entity.id);
      expect(before, entity.id).toBeDefined();
      if (before === undefined) continue;
      expect(entity.hp, entity.id).toBe(before.hp);
      expect(Math.abs(entity.x - before.x), entity.id).toBeLessThan(40);
      // The Tarantula's depth is pinned to its hover line on its first step, so only
      // its horizontal opening is comparable.
      if (entity.kind !== "tarantula") {
        expect(Math.abs(entity.y - before.y), entity.id).toBeLessThan(40);
      }
    }
    expect(await page.evaluate(() => window.__storageWrites ?? [])).toEqual([]);
  });

  test("sends no network request after the bundle and the art have loaded", async ({ page }) => {
    const late: string[] = [];
    page.on("request", (request) => late.push(request.url()));
    await openGame(page, { seed: FRIENDLY_SEED });
    await startWithKeyboard(page);
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 15_000 }).toBeGreaterThan(30);
    late.length = 0;
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Restart" }).click();
    await expect.poll(async () => (await cosmic(page)).tick, { timeout: 15_000 }).toBeGreaterThan(10);
    expect(late).toEqual([]);
  });
});